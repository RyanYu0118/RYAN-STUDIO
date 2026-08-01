#!/usr/bin/env python3
"""Repair Halo posts stuck in deleting state (local dev, docker halo-mysql).

Common stuck pattern: spec.deleted=true while labels still show published=true,
so the admin UI shows 已发布 + 删除中 forever.
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys

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


def load_post(post_id: str) -> tuple[str, dict]:
    name = f"/registry/content.halo.run/posts/{post_id}"
    raw = mysql_query(f"SELECT data FROM extensions WHERE name='{name}';")
    if not raw.strip():
        raise SystemExit(f"post not found: {post_id}")
    return name, parse_json(raw)


def save_post(name: str, post: dict) -> None:
    payload = json.dumps(post, ensure_ascii=False, separators=(",", ":"))
    payload = payload.replace("\\", "\\\\").replace("'", "\\'")
    sql = (
        f"INSERT INTO extensions (name, data, version) VALUES ('{name}', '{payload}', 1) "
        f"ON DUPLICATE KEY UPDATE data=VALUES(data), version=version+1;"
    )
    mysql_exec(sql)


def list_post_ids() -> list[str]:
    raw = mysql_query(
        "SELECT name FROM extensions WHERE name LIKE '/registry/content.halo.run/posts/%';"
    )
    out: list[str] = []
    for line in raw.splitlines():
        m = POST_EXT.match(line.strip())
        if m:
            out.append(m.group(1))
    return out


def is_stuck_deleting(post: dict) -> bool:
    spec = post.get("spec") or {}
    meta = post.get("metadata") or {}
    labels = meta.get("labels") or {}
    if spec.get("deleted") is not True:
        return False
    if labels.get("content.halo.run/deleted") == "true":
        return True
    if labels.get("content.halo.run/published") == "true":
        return True
    if (post.get("status") or {}).get("phase") == "PUBLISHED":
        return True
    return True


def describe(post_id: str, post: dict) -> None:
    spec = post.get("spec") or {}
    meta = post.get("metadata") or {}
    labels = meta.get("labels") or {}
    status = post.get("status") or {}
    print(f"{post_id}")
    print(f"  title: {spec.get('title')}")
    print(f"  slug: {spec.get('slug')}")
    print(f"  deleted label: {labels.get('content.halo.run/deleted')}")
    print(f"  published label: {labels.get('content.halo.run/published')}")
    print(f"  spec.deleted: {spec.get('deleted')}")
    print(f"  phase: {status.get('phase')}")


def find_related_extensions(post_id: str, slug: str | None) -> list[str]:
    names = set()
    for line in mysql_query(
        f"SELECT name FROM extensions WHERE data LIKE '%{post_id}%';"
    ).splitlines():
        name = line.strip()
        if name:
            names.add(name)
    if slug:
        esc = slug.replace("\\", "\\\\").replace("'", "\\'")
        for line in mysql_query(
            f"SELECT name FROM extensions WHERE data LIKE '%{esc}%';"
        ).splitlines():
            name = line.strip()
            if name and ("sitepush.halo.run/pushUniques/" in name or "posts/" in name or "snapshots/" in name):
                names.add(name)
    return sorted(names)


def restore_post(post_id: str) -> None:
    name, post = load_post(post_id)
    spec = post.setdefault("spec", {})
    meta = post.setdefault("metadata", {})
    labels = meta.setdefault("labels", {})
    status = post.setdefault("status", {})
    spec["deleted"] = False
    labels["content.halo.run/deleted"] = "false"
    status["inProgress"] = False
    if labels.get("content.halo.run/published") == "true" or spec.get("publish") is True:
        spec["publish"] = True
        status["phase"] = "PUBLISHED"
    else:
        spec["publish"] = False
        status["phase"] = "DRAFT"
    save_post(name, post)
    print(f"restored {post_id}")


def purge_post(post_id: str, dry_run: bool = False) -> None:
    name, post = load_post(post_id)
    slug = (post.get("spec") or {}).get("slug")
    related = find_related_extensions(post_id, slug if isinstance(slug, str) else None)
    print(f"purge {post_id} ({(post.get('spec') or {}).get('title')!r}, slug={slug!r})")
    for ext in related:
        print(f"  - {ext}")
    if dry_run:
        print("(dry run, no changes)")
        return
    for ext in related:
        mysql_exec(f"DELETE FROM extensions WHERE name='{ext}';")
    print(f"purged {len(related)} extension(s)")


def main() -> int:
    p = argparse.ArgumentParser(description="Inspect / restore / purge stuck deleting Halo posts")
    p.add_argument("command", choices=["list", "show", "restore", "purge"])
    p.add_argument("post_id", nargs="?", help="Post metadata.name UUID")
    p.add_argument("--all-stuck", action="store_true", help="With purge: all stuck deleting posts")
    p.add_argument("--needle", help="With list: filter title/slug contains")
    p.add_argument("--dry-run", action="store_true")
    args = p.parse_args()

    if args.command == "list":
        found = 0
        for post_id in list_post_ids():
            _, post = load_post(post_id)
            needle = args.needle or ""
            spec = post.get("spec") or {}
            title = spec.get("title") or ""
            slug = spec.get("slug") or ""
            if needle and needle not in title and needle not in slug and needle not in post_id:
                continue
            if not needle and not is_stuck_deleting(post):
                continue
            describe(post_id, post)
            found += 1
        return 0 if found else 1

    if args.command == "show":
        if not args.post_id:
            p.error("show requires post_id")
        describe(args.post_id, load_post(args.post_id)[1])
        return 0

    if args.command == "restore":
        if not args.post_id:
            p.error("restore requires post_id")
        restore_post(args.post_id)
        return 0

    if args.command == "purge":
        ids: list[str] = []
        if args.all_stuck:
            for post_id in list_post_ids():
                if is_stuck_deleting(load_post(post_id)[1]):
                    ids.append(post_id)
        elif args.post_id:
            ids = [args.post_id]
        else:
            p.error("purge requires post_id or --all-stuck")
        for post_id in ids:
            purge_post(post_id, dry_run=args.dry_run)
        return 0

    return 1


if __name__ == "__main__":
    raise SystemExit(main())
