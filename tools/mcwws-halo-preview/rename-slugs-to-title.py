#!/usr/bin/env python3
"""将 Halo 文章 spec.slug 改为与 spec.title 一致（trim；/ → _）。"""
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


def mysql_query(sql: str) -> str:
    cmd = MYSQL + ["-N", "-B", "-e", sql]
    return subprocess.check_output(cmd, stderr=subprocess.DEVNULL).decode("utf-8")


def mysql_exec(sql: str) -> None:
    proc = subprocess.run(MYSQL, input=sql.encode("utf-8"), capture_output=True)
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr.decode("utf-8", errors="replace") or proc.stdout.decode())


def parse_json(raw: str) -> dict:
    for attempt in (raw.strip(), raw.strip().replace("\\\\", "\\")):
        try:
            return json.loads(attempt)
        except json.JSONDecodeError:
            continue
    raise ValueError("invalid json")


def load_post(ext_name: str) -> dict:
    raw = mysql_query(f"SELECT data FROM extensions WHERE name='{ext_name}';")
    return parse_json(raw)


def save_post(ext_name: str, post: dict) -> None:
    payload = json.dumps(post, ensure_ascii=False, separators=(",", ":"))
    payload = payload.replace("\\", "\\\\").replace("'", "\\'")
    sql = (
        f"INSERT INTO extensions (name, data, version) VALUES ('{ext_name}', '{payload}', 1) "
        f"ON DUPLICATE KEY UPDATE data=VALUES(data), version=version+1;"
    )
    mysql_exec(sql)


def list_posts() -> list[tuple[str, dict]]:
    raw = mysql_query(
        "SELECT name FROM extensions WHERE name LIKE '/registry/content.halo.run/posts/%';"
    )
    out: list[tuple[str, dict]] = []
    for line in raw.splitlines():
        ext = line.strip()
        if not ext:
            continue
        out.append((ext, load_post(ext)))
    return out


def slug_from_title(title: str) -> str | None:
    s = (title or "").strip()
    if not s or s.lower() == "index":
        return None
    s = s.replace("\\", "/").strip("/").replace("/", "_")
    if len(s) > 180:
        s = s[:180]
    return s


def is_deleted(post: dict) -> bool:
    labels = (post.get("metadata") or {}).get("labels") or {}
    if labels.get("content.halo.run/deleted") == "true":
        return True
    spec = post.get("spec") or {}
    return spec.get("deleted") is True


def ensure_unique(candidate: str, used: set[str], post_name: str) -> str:
    if candidate not in used:
        return candidate
    short = post_name.replace("-", "")[:6]
    for alt in (f"{candidate}_{short}", f"{candidate}_2", f"{candidate}_{uuid.uuid4().hex[:6]}"):
        if alt not in used:
            return alt
    return f"{candidate}_{uuid.uuid4().hex[:8]}"


def main() -> int:
    p = argparse.ArgumentParser(description="Rename post slugs to match titles")
    p.add_argument("--dry-run", action="store_true", help="只打印，不写库")
    p.add_argument("--include-deleted", action="store_true", help="包含已删除文章")
    p.add_argument("--restart-halo", action="store_true", help="完成后 docker restart halo")
    args = p.parse_args()

    posts = list_posts()
    used = {(post.get("spec") or {}).get("slug") for _, post in posts}
    used.discard(None)

    changed = 0
    skipped = 0
    for ext_name, post in posts:
        if not args.include_deleted and is_deleted(post):
            continue
        spec = post.setdefault("spec", {})
        meta = post.setdefault("metadata", {})
        title = spec.get("title") or ""
        old_slug = spec.get("slug") or ""
        new_slug = slug_from_title(title)
        if not new_slug:
            skipped += 1
            continue
        if new_slug == old_slug:
            continue
        post_name = meta.get("name") or ext_name.split("/")[-1]
        new_slug = ensure_unique(new_slug, used, post_name)
        if new_slug == old_slug:
            continue
        print(f"{'would' if args.dry_run else 'OK'}: {old_slug!r} -> {new_slug!r}  ({title!r})")
        if args.dry_run:
            used.discard(old_slug)
            used.add(new_slug)
            changed += 1
            continue
        spec["slug"] = new_slug
        save_post(ext_name, post)
        used.discard(old_slug)
        used.add(new_slug)
        changed += 1

    print(f"\n{'Would change' if args.dry_run else 'Changed'}: {changed}, skipped: {skipped}")
    if args.restart_halo and not args.dry_run and changed:
        subprocess.run(["docker", "restart", "halo"], check=False)
        print("Restarted halo container.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
