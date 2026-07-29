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
    p.add_argument("--no-halo", action="store_true", help="仅扫描 Git wiki，不请求 Halo API")
    args = p.parse_args()
    wiki_root = args.wiki_root.resolve()
    git_slugs = collect_wiki_slugs(wiki_root)
    halo_slugs: set[str] = set()
    if not args.no_halo:
        try:
            halo_slugs = fetch_halo_slugs(args.halo_url)
        except Exception as e:
            print(f"warn: Halo API 未合并 ({e})，仅使用 Git slug")
    all_slugs = sorted(git_slugs | halo_slugs)
    payload = {
        "updated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "sources": {
            "git": len(git_slugs),
            "halo": len(halo_slugs),
        },
        "slugs": all_slugs,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"OK {len(all_slugs)} slugs -> {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
