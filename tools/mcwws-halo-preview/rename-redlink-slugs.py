#!/usr/bin/env python3
"""将红链占位文章的 spec.slug 改为 mcwws_ + 英文路径（优先 redlink-target-slug）。"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import uuid

MYSQL = [
    "docker",
    "exec",
    "-i",
    "halo-mysql",
    "mysql",
    "-uroot",
    "-phalo_root_local_change_me",
    "halo_h6jyni",
]

RELINK_ANN = "rs.wiki/redlink-target-slug"
UUID_SLUG = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
    re.I,
)
NON_ASCII = re.compile(r"[^\x00-\x7F]")


def mysql_query(sql: str) -> str:
    cmd = MYSQL + ["-N", "-B", "-e", sql]
    return subprocess.check_output(cmd, stderr=subprocess.DEVNULL).decode("utf-8")


def mysql_exec(sql: str) -> None:
    proc = subprocess.run(MYSQL, input=sql.encode("utf-8"), capture_output=True)
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr.decode("utf-8", errors="replace") or proc.stdout.decode())


def parse_json(raw: str) -> dict:
    for attempt in (raw, raw.replace("\\\\", "\\")):
        try:
            return json.loads(attempt)
        except json.JSONDecodeError:
            continue
    raise ValueError("invalid json")


def load_extension(name: str) -> dict:
    raw = mysql_query(f"SELECT data FROM extensions WHERE name='{name}';")
    return parse_json(raw.strip())


def save_extension(name: str, obj: dict) -> None:
    payload = json.dumps(obj, ensure_ascii=False, separators=(",", ":"))
    payload = payload.replace("\\", "\\\\").replace("'", "\\'")
    sql = (
        f"INSERT INTO extensions (name, data, version) VALUES ('{name}', '{payload}', 1) "
        f"ON DUPLICATE KEY UPDATE data=VALUES(data), version=version+1;"
    )
    mysql_exec(sql)


def list_post_extensions() -> list[str]:
    raw = mysql_query(
        "SELECT name FROM extensions WHERE name LIKE '/registry/content.halo.run/posts/%';"
    )
    return [line.strip() for line in raw.splitlines() if line.strip()]


def slug_from_link_target(link_target: str, prefix: str = "mcwws_") -> str | None:
    if not link_target:
        return None
    base = link_target.strip().strip("/").replace("\\", "/")
    if base.lower() == "index":
        return None
    base = re.sub(r"[^\w/\-]+", "", base)
    base = base.replace("/", "_").replace("-", "_")
    base = re.sub(r"_+", "_", base).strip("_").lower()
    if not base:
        return None
    return prefix + base


def slug_from_title_ascii(title: str, prefix: str = "mcwws_") -> str:
    s = (title or "").strip()
    s = re.sub(
        r"[\s\u00a0·•，,。！？!?：:；;/\\|（）()\[\]【】《》「」『』\"'""''\-]+",
        "_",
        s,
    )
    s = re.sub(r"[^\w]+", "", s, flags=re.ASCII)
    s = re.sub(r"_+", "_", s).strip("_").lower()
    if not s:
        s = "untitled"
    return (prefix + s)[:180].rstrip("_")


def resolve_redlink_slug(post: dict, prefix: str = "mcwws_") -> str:
    meta = post.get("metadata") or {}
    spec = post.get("spec") or {}
    ann = meta.get("annotations") or {}
    link_target = ann.get(RELINK_ANN) or ""
    from_target = slug_from_link_target(link_target, prefix)
    if from_target:
        return from_target
    return slug_from_title_ascii(spec.get("title") or "", prefix)


def collect_slugs() -> set[str]:
    slugs: set[str] = set()
    for name in list_post_extensions():
        post = load_extension(name)
        slug = (post.get("spec") or {}).get("slug")
        if slug:
            slugs.add(slug)
    return slugs


def ensure_unique(candidate: str, used: set[str], post_name: str) -> str:
    if candidate not in used:
        return candidate
    short = post_name.replace("-", "")[:6]
    alt = f"{candidate}_{short}"
    if alt not in used:
        return alt
    for i in range(2, 20):
        alt2 = f"{candidate}_{i}"
        if alt2 not in used:
            return alt2
    return f"{candidate}_{uuid.uuid4().hex[:8]}"


def is_redlink_candidate(post: dict) -> bool:
    meta = post.get("metadata") or {}
    spec = post.get("spec") or {}
    ann = meta.get("annotations") or {}
    slug = spec.get("slug") or ""
    name = meta.get("name") or ""
    if ann.get(RELINK_ANN):
        return True
    if slug and name and slug.lower() == name.lower():
        return True
    if UUID_SLUG.match(slug or ""):
        return True
    return False


def slug_needs_english_fix(slug: str, prefix: str) -> bool:
    if not slug.startswith(prefix):
        return True
    rest = slug[len(prefix) :]
    return bool(NON_ASCII.search(rest))


def update_permalink(post: dict) -> None:
    slug = (post.get("spec") or {}).get("slug") or ""
    post.setdefault("status", {})["permalink"] = f"/archives/{slug}"


def restart_halo_container() -> None:
    print("restarting halo container to rebuild slug index...")
    proc = subprocess.run(["docker", "restart", "halo"], capture_output=True, text=True)
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr or proc.stdout or "docker restart halo failed")
    print("halo restarted — wait ~30s before opening /archives/ URLs")


def main() -> int:
    p = argparse.ArgumentParser(description="Rename redlink stub slugs to mcwws_<english_path>")
    p.add_argument("--prefix", default="mcwws_")
    p.add_argument("--dry-run", action="store_true")
    p.add_argument("--all-uuid", action="store_true")
    p.add_argument("--force-english", action="store_true", help="重命名已有 mcwws_ 中文 slug")
    p.add_argument("--slug", default="", help="仅处理当前 spec.slug")
    p.add_argument(
        "--restart-halo",
        action="store_true",
        help="改 slug 后重启 halo 容器，刷新 /archives/ 路由索引（本地 Docker）",
    )
    args = p.parse_args()

    used = collect_slugs()
    changed = 0
    skipped = 0

    for ext_name in list_post_extensions():
        post = load_extension(ext_name)
        meta = post.get("metadata") or {}
        spec = post.get("spec") or {}
        old_slug = spec.get("slug") or ""
        title = spec.get("title") or old_slug
        post_name = meta.get("name") or ""

        if args.slug and old_slug != args.slug:
            continue
        if not args.all_uuid and not is_redlink_candidate(post):
            skipped += 1
            continue
        if (
            old_slug.startswith(args.prefix)
            and not UUID_SLUG.match(old_slug)
            and not args.force_english
            and not slug_needs_english_fix(old_slug, args.prefix)
        ):
            skipped += 1
            continue

        new_slug = ensure_unique(resolve_redlink_slug(post, args.prefix), used, post_name)
        if new_slug == old_slug:
            skipped += 1
            continue

        link_target = (meta.get("annotations") or {}).get(RELINK_ANN, "")
        print(f"{'would' if args.dry_run else 'OK'}: {old_slug} -> {new_slug}  ({title})")
        if link_target:
            print(f"     redlink-target: {link_target}")

        if args.dry_run:
            changed += 1
            used.add(new_slug)
            continue

        spec["slug"] = new_slug
        update_permalink(post)
        save_extension(ext_name, post)
        used.discard(old_slug)
        used.add(new_slug)
        changed += 1

    print(f"done changed={changed} skipped={skipped}")
    if changed > 0 and args.restart_halo and not args.dry_run:
        restart_halo_container()
    elif changed > 0 and not args.dry_run:
        print("hint: 若 /archives/ 新 slug 仍 404，请执行: docker restart halo")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
