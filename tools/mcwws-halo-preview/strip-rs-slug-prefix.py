#!/usr/bin/env python3
"""Strip legacy rs_ prefix from Halo post slugs (mcwws_ untouched)."""
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

RS_PREFIX = "rs_"
POST_EXT = re.compile(r"^/registry/content\.halo\.run/posts/([0-9a-f-]{36})$", re.I)


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


def strip_rs_slug(slug: str) -> str | None:
    if not slug.startswith(RS_PREFIX):
        return None
    rest = slug[len(RS_PREFIX) :]
    return rest if rest else None


def ensure_unique(candidate: str, used: set[str], post_name: str) -> str:
    if candidate not in used:
        return candidate
    short = post_name.replace("-", "")[:6]
    for alt in (f"{candidate}_{short}", f"{candidate}_2", f"{candidate}_{uuid.uuid4().hex[:6]}"):
        if alt not in used:
            return alt
    return f"{candidate}_{uuid.uuid4().hex[:8]}"


def main() -> int:
    p = argparse.ArgumentParser(description="Remove rs_ prefix from post slugs")
    p.add_argument("--dry-run", action="store_true")
    p.add_argument("--restart-halo", action="store_true")
    args = p.parse_args()

    posts = list_posts()
    used = {(post.get("spec") or {}).get("slug") for _, post in posts}
    used.discard(None)

    changed = 0
    for ext_name, post in posts:
        spec = post.setdefault("spec", {})
        meta = post.setdefault("metadata", {})
        old_slug = spec.get("slug") or ""
        new_base = strip_rs_slug(old_slug)
        if not new_base:
            continue
        post_name = meta.get("name") or ext_name.split("/")[-1]
        new_slug = ensure_unique(new_base, used, post_name)
        if new_slug == old_slug:
            continue
        title = spec.get("title") or old_slug
        print(f"{'would' if args.dry_run else 'OK'}: {old_slug} -> {new_slug}  ({title})")
        if args.dry_run:
            used.discard(old_slug)
            used.add(new_slug)
            changed += 1
            continue
        spec["slug"] = new_slug
        post.setdefault("status", {})["permalink"] = f"/archives/{new_slug}"
        ann = meta.setdefault("annotations", {})
        lt = ann.get("rs.wiki/redlink-target-slug")
        if lt and lt == old_slug:
            ann["rs.wiki/redlink-target-slug"] = new_slug
        elif lt and strip_rs_slug(lt) == new_slug:
            ann["rs.wiki/redlink-target-slug"] = new_slug
        save_post(ext_name, post)
        used.discard(old_slug)
        used.add(new_slug)
        changed += 1

    print(f"done changed={changed}")
    if changed and args.restart_halo and not args.dry_run:
        subprocess.run(["docker", "restart", "halo"], check=True)
        print("halo restarted")
    elif changed and not args.dry_run:
        print("hint: docker restart halo if /archives/ 404")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
