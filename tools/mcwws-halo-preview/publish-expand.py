#!/usr/bin/env python3
"""展开 wiki 混合页中的 {{MCWWS_*}} 占位符，生成可粘贴到 Halo 的正文备份。"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

from compile import expand_halo_includes, find_wiki_root


def split_frontmatter(text: str) -> tuple[str, str]:
    if not text.startswith("---"):
        return "", text
    end = text.find("\n---", 3)
    if end == -1:
        return "", text
    fm = text[: end + 4]
    body = text[end + 4 :].lstrip("\n")
    return fm, body


def rewrite_halo_asset_paths(text: str) -> str:
    """Git 内相对资源路径 → Halo 常见的 /upload/ 前缀（附件需在站内同名存在）。"""
    return (
        text.replace("demo/upload/", "/upload/")
        .replace("url('demo/upload/", "url('/upload/")
        .replace('url("demo/upload/', 'url("/upload/')
    )


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Expand Halo include tokens for paste/export")
    p.add_argument("input", type=Path, help="Source .md path (e.g. wiki/home.md)")
    p.add_argument(
        "-o",
        "--output",
        type=Path,
        help="Output path (default: wiki/_publish/<name>.halo-paste.md)",
    )
    p.add_argument(
        "--rewrite-upload",
        action="store_true",
        help="Rewrite demo/upload/ to /upload/ for Halo attachments",
    )
    return p.parse_args()


def main() -> int:
    args = parse_args()
    src: Path = args.input.resolve()
    if not src.is_file():
        print(f"Missing input: {src}", file=sys.stderr)
        return 1

    raw = src.read_text(encoding="utf-8")
    wiki_root = find_wiki_root(src)
    fm, body = split_frontmatter(raw)
    body = expand_halo_includes(body, wiki_root)
    if args.rewrite_upload:
        body = rewrite_halo_asset_paths(body)

    if args.output:
        out = args.output.resolve()
    else:
        publish_dir = wiki_root / "_publish"
        out = publish_dir / f"{src.stem}.halo-paste.md"

    out.parent.mkdir(parents=True, exist_ok=True)
    content = (fm + "\n\n" + body) if fm else body
    header = (
        "<!-- MCWWS: Git 为准 · 由 publish-expand 生成，勿在仓库手改；"
        " 请改源文件后重新运行脚本 -->\n\n"
    )
    out.write_text(header + content, encoding="utf-8")
    print(out)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
