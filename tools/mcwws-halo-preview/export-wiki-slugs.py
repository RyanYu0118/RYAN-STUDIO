#!/usr/bin/env python3
"""从 wiki 源稿 frontmatter 导出 slug 列表，供前台红链检测（wiki-data/wiki-slugs.json）。"""
from __future__ import annotations

import argparse
import json
import re
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

_SLUG_LINE = re.compile(r"^slug:\s*(.+)\s*$", re.MULTILINE)


def slug_from_frontmatter(text: str, path: Path) -> str:
    if text.startswith("---"):
        end = text.find("\n---", 3)
        if end != -1:
            fm = text[: end + 4]
            m = _SLUG_LINE.search(fm)
            if m:
                return m.group(1).strip().strip("'\"")
    rel = path.as_posix().replace("\\", "/")
    if rel.endswith(".md"):
        rel = rel[:-3]
    if rel.endswith("/index"):
        rel = rel[: -len("/index")]
    return rel.strip("/")


def collect_wiki_slugs(wiki_root: Path) -> set[str]:
    slugs: set[str] = set()
    for md in wiki_root.rglob("*.md"):
        if md.name.startswith("."):
            continue
        rel = md.relative_to(wiki_root)
        if rel.parts and rel.parts[0] in ("_publish", "_preview", "demo", "_halo"):
            continue
        try:
            text = md.read_text(encoding="utf-8")
        except OSError:
            continue
        slugs.add(slug_from_frontmatter(text, md.relative_to(wiki_root)))
    slugs.discard("")
    return slugs


def fetch_halo_slugs(base_url: str) -> set[str]:
    slugs: set[str] = set()
    page = 1
    size = 100
    while True:
        url = (
            f"{base_url.rstrip('/')}/apis/api.content.halo.run/v1alpha1/posts"
            f"?page={page}&size={size}"
        )
        req = urllib.request.Request(url, headers={"Accept": "application/json"})
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        for item in data.get("items") or []:
            spec = item.get("spec") or {}
            s = spec.get("slug")
            if s:
                slugs.add(s)
        if not data.get("hasNext"):
            break
        page += 1
    return slugs


def is_halo_post_published(item: dict) -> bool:
    labels = (item.get("metadata") or {}).get("labels") or {}
    if labels.get("content.halo.run/published") == "true":
        return True
    spec = item.get("spec") or {}
    status = item.get("status") or {}
    return spec.get("publish") is True and status.get("phase") == "PUBLISHED"


def fetch_halo_redlink_targets(base_url: str) -> set[str]:
    """已发布且带 rs.wiki/redlink-target-slug 的文章：链接目标视为已「占位」发布。"""
    targets: set[str] = set()
    page = 1
    size = 100
    ann_key = "rs.wiki/redlink-target-slug"
    while True:
        url = (
            f"{base_url.rstrip('/')}/apis/api.content.halo.run/v1alpha1/posts"
            f"?page={page}&size={size}"
        )
        req = urllib.request.Request(url, headers={"Accept": "application/json"})
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        for item in data.get("items") or []:
            if not is_halo_post_published(item):
                continue
            meta = item.get("metadata") or {}
            ann = meta.get("annotations") or {}
            t = ann.get(ann_key)
            if t and isinstance(t, str):
                targets.add(t.strip())
        if not data.get("hasNext"):
            break
        page += 1
    return targets


def main() -> int:
    p = argparse.ArgumentParser(description="Export wiki slug index for red links")
    p.add_argument(
        "--wiki-root",
        type=Path,
        default=Path(__file__).resolve().parents[2] / "wiki",
    )
    p.add_argument(
        "-o",
        "--output",
        type=Path,
        default=Path(__file__).resolve().parents[2]
        / "1panel/apps/halo/halo/data/attachments/upload/wiki-data/wiki-slugs.json",
    )
    p.add_argument(
        "--halo-url",
        default="http://localhost:8090",
        help="合并 Halo 已发布文章 slug（可选）",
    )
    p.add_argument(
        "--include-git",
        action="store_true",
        help="将 Git 源稿 slug 并入 slugs（旧行为；会导致未发布的 md 显示为蓝链）",
    )
    p.add_argument("--no-halo", action="store_true", help="不请求 Halo API（slugs 为空或仅 --include-git）")
    args = p.parse_args()
    wiki_root = args.wiki_root.resolve()
    git_slugs = collect_wiki_slugs(wiki_root)
    halo_slugs: set[str] = set()
    redlink_targets: set[str] = set()
    if not args.no_halo:
        try:
            halo_slugs = fetch_halo_slugs(args.halo_url)
            redlink_targets = fetch_halo_redlink_targets(args.halo_url)
        except Exception as e:
            print(f"warn: Halo API 未合并 ({e})，slugs 将为空（前台靠 API 逐条校验）")
    if args.include_git:
        published = sorted(git_slugs | halo_slugs)
    else:
        published = sorted(halo_slugs)
    payload = {
        "updated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "sources": {
            "git": len(git_slugs),
            "halo": len(halo_slugs),
        },
        "slugs": published,
        "redlinkTargets": sorted(redlink_targets),
        "gitSlugs": sorted(git_slugs),
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"OK published={len(published)} git={len(git_slugs)} -> {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
