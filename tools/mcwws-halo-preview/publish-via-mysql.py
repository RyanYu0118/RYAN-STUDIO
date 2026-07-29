#!/usr/bin/env python3
"""本地开发：无 PAT 时将 wiki/*.md 写入 Halo MySQL extensions（docker halo-mysql）。"""
from __future__ import annotations

import argparse
import importlib.util
import json
import subprocess
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

_TOOL = Path(__file__).resolve().parent
_spec = importlib.util.spec_from_file_location("exp", _TOOL / "export-post-json.py")
assert _spec and _spec.loader
_exp = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_exp)

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


def now_z() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000000000Z")


def mysql_exec(sql: str) -> None:
    proc = subprocess.run(MYSQL, input=sql.encode("utf-8"), capture_output=True)
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr.decode("utf-8", errors="replace") or proc.stdout.decode())


def load_extension(name: str) -> dict:
    sel = (
        f"SELECT data FROM extensions WHERE name='{name}'"
    )
    cmd = MYSQL + ["-N", "-B", "-e", sel]
    raw = subprocess.check_output(cmd, stderr=subprocess.DEVNULL).decode("utf-8").strip()
    for attempt in (raw, raw.replace("\\\\", "\\")):
        try:
            return json.loads(attempt)
        except json.JSONDecodeError:
            continue
    raise ValueError(f"Cannot parse JSON for {name}")


def upsert_extension(name: str, obj: dict) -> None:
    payload = json.dumps(obj, ensure_ascii=False, separators=(",", ":"))
    payload = payload.replace("\\", "\\\\").replace("'", "\\'")
    sql = (
        f"INSERT INTO extensions (name, data, version) VALUES ('{name}', '{payload}', 1) "
        f"ON DUPLICATE KEY UPDATE data=VALUES(data), version=version+1;"
    )
    mysql_exec(sql)


def compile_article(src: Path, *, rewrite_upload: bool) -> tuple[dict[str, str], str, str, str]:
    raw = src.read_text(encoding="utf-8")
    wiki_root = _exp.find_wiki_root(src)
    fm, body = _exp.split_frontmatter(raw)
    meta = _exp.parse_frontmatter_meta(fm)
    body = _exp.expand_halo_includes(body, wiki_root)
    if rewrite_upload:
        body = _exp.rewrite_halo_asset_paths(body)
    slug = meta.get("slug") or src.stem
    post_name = str(uuid.uuid4())
    html = _exp.build_halo_html(body, post_name)
    md_html = _exp.rewrite_wiki_links(_exp.md_to_html(body))
    return meta, slug, html, md_html


def find_post_by_slug(slug: str) -> tuple[str, dict] | None:
    cmd = MYSQL + [
        "-N",
        "-B",
        "-e",
        f"SELECT name, data FROM extensions WHERE name LIKE '/registry/content.halo.run/posts/%' "
        f"AND data LIKE '%\"slug\":\"{slug}\"%' LIMIT 1;",
    ]
    out = subprocess.check_output(cmd, stderr=subprocess.DEVNULL).decode("utf-8").strip()
    if not out:
        return None
    name, data = out.split("\t", 1)
    for attempt in (data, data.replace("\\\\", "\\")):
        try:
            return name, json.loads(attempt)
        except json.JSONDecodeError:
            continue
    return None


def build_new_post(meta: dict[str, str], post_name: str, snap_name: str) -> dict:
    slug = meta["slug"]
    title = meta.get("title", slug)
    excerpt = meta.get("description") or meta.get("excerpt") or ""
    t = now_z()
    return {
        "apiVersion": "content.halo.run/v1alpha1",
        "kind": "Post",
        "metadata": {
            "finalizers": ["post-protection"],
            "name": post_name,
            "labels": {
                "content.halo.run/published": "true",
                "content.halo.run/deleted": "false",
                "content.halo.run/owner": "ryanyu",
                "content.halo.run/visible": "PUBLIC",
                "content.halo.run/archive-year": t[0:4],
                "content.halo.run/archive-month": t[5:7],
                "content.halo.run/archive-day": t[8:10],
            },
            "annotations": {
                "content.halo.run/permalink-pattern": "/archives/{slug}",
                "content.halo.run/last-released-snapshot": snap_name,
                "content.halo.run/preferred-editor": "default",
            },
            "version": 1,
            "creationTimestamp": t,
        },
        "spec": {
            "title": title,
            "slug": slug,
            "releaseSnapshot": snap_name,
            "headSnapshot": snap_name,
            "baseSnapshot": snap_name,
            "owner": "ryanyu",
            "template": "",
            "cover": "",
            "deleted": False,
            "publish": True,
            "publishTime": t,
            "pinned": False,
            "allowComment": True,
            "visible": "PUBLIC",
            "priority": 0,
            "excerpt": {"autoGenerate": False, "raw": excerpt},
            "categories": ["category-1g9f80go", "category-f8bm8yzr"],
            "tags": ["tag-yeh3x4kw", "tag-ipxxaufr"],
            "htmlMetas": [],
        },
        "status": {
            "phase": "PUBLISHED",
            "conditions": [
                {
                    "type": "PUBLISHED",
                    "status": "TRUE",
                    "lastTransitionTime": t,
                    "message": "Post published successfully.",
                    "reason": "Published",
                }
            ],
            "permalink": f"/archives/{slug}",
            "excerpt": excerpt,
            "inProgress": False,
            "contributors": ["ryanyu"],
            "hideFromList": False,
            "lastModifyTime": t,
            "observedVersion": 1,
        },
    }


def build_snapshot(post_name: str, snap_name: str, html: str, md_html: str) -> dict:
    t = now_z()
    return {
        "apiVersion": "content.halo.run/v1alpha1",
        "kind": "Snapshot",
        "metadata": {
            "name": snap_name,
            "annotations": {"content.halo.run/keep-raw": "true"},
            "creationTimestamp": t,
        },
        "spec": {
            "subjectRef": {
                "group": "content.halo.run",
                "version": "v1alpha1",
                "kind": "Post",
                "name": post_name,
            },
            "rawType": "HTML",
            "rawPatch": html,
            "contentPatch": html,
            "lastModifyTime": t,
            "owner": "ryanyu",
            "contributors": ["ryanyu"],
        },
    }


def update_existing_post(post: dict, snap_name: str, html: str) -> None:
    t = now_z()
    post["spec"]["releaseSnapshot"] = snap_name
    post["spec"]["headSnapshot"] = snap_name
    post["spec"]["deleted"] = False
    post["spec"]["publish"] = True
    post["spec"]["publishTime"] = t
    post.setdefault("metadata", {}).setdefault("labels", {})["content.halo.run/published"] = "true"
    post["metadata"]["labels"]["content.halo.run/deleted"] = "false"
    post.setdefault("status", {})["phase"] = "PUBLISHED"
    post["status"]["permalink"] = f"/archives/{post['spec']['slug']}"
    post["status"]["lastModifyTime"] = t
    post["metadata"].setdefault("annotations", {})[
        "content.halo.run/last-released-snapshot"
    ] = snap_name


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("input", type=Path)
    p.add_argument("--rewrite-upload", action="store_true")
    args = p.parse_args()
    src = args.input.resolve()
    meta, slug, html, _md_html = compile_article(src, rewrite_upload=args.rewrite_upload)

    existing = find_post_by_slug(slug)
    snap_name = str(uuid.uuid4())
    if existing:
        post_path, post = existing
        post_name = post["metadata"]["name"]
        update_existing_post(post, snap_name, html)
    else:
        post_name = str(uuid.uuid4())
        post_path = f"/registry/content.halo.run/posts/{post_name}"
        post = build_new_post(meta, post_name, snap_name)

    snap_path = f"/registry/content.halo.run/snapshots/{snap_name}"
    snap = build_snapshot(post_name, snap_name, html, _md_html)

    upsert_extension(post_path, post)
    upsert_extension(snap_path, snap)

    print(f"OK slug={slug}")
    print(f"  http://localhost:8090/archives/{slug}")
    print(f"  post={post_name} snapshot={snap_name}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
