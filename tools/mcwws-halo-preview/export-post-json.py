#!/usr/bin/env python3
"""从 wiki 混合页生成 Halo 文章 JSON（与 demo/*.json 导入格式一致）。"""
from __future__ import annotations

import argparse
import json
import re
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

from compile import (
    UUID_RE,
    expand_halo_includes,
    find_wiki_root,
    unescape_halo,
)

def rewrite_halo_asset_paths(text: str) -> str:
    return (
        text.replace("demo/upload/", "/upload/")
        .replace("url('demo/upload/", "url('/upload/")
        .replace('url("demo/upload/', 'url("/upload/')
    )


def split_frontmatter(text: str) -> tuple[str, str]:
    if not text.startswith("---"):
        return "", text
    end = text.find("\n---", 3)
    if end == -1:
        return "", text
    fm = text[: end + 4]
    body = text[end + 4 :].lstrip("\n")
    return fm, body


def parse_frontmatter_meta(fm: str) -> dict[str, str]:
    meta: dict[str, str] = {}
    if not fm:
        return meta
    lines = fm.splitlines()
    i = 0
    while i < len(lines):
        line = lines[i]
        if line.strip() in ("---", ""):
            i += 1
            continue
        if not line.strip().endswith(":") and ":" in line:
            key, val = line.split(":", 1)
            key = key.strip()
            val = val.strip().strip("'\"")
            if val == "" and i + 1 < len(lines) and lines[i + 1].startswith("  "):
                i += 1
                continue
            meta[key] = val
        i += 1
    return meta


def md_to_html(text: str) -> str:
    try:
        import markdown  # type: ignore

        return markdown.markdown(
            text,
            extensions=["tables", "nl2br", "fenced_code", "sane_lists"],
        )
    except ImportError as e:
        raise RuntimeError(
            "发布 Wiki 需要 Python 包 markdown：pip install markdown"
        ) from e


def is_mixed_halo_page(body: str) -> bool:
    """含 UUID 分段、MCWWS 嵌入或内联 HTML/脚本 → 走 HTML 编辑块；否则整篇 Markdown。"""
    if "{{MCWWS_" in body or "{{WANDER_" in body:
        return True
    for line in body.splitlines():
        if UUID_RE.match(line.strip()):
            return True
    lower = body.lower()
    for token in (
        "<style",
        "<script",
        "wd-smart-card",
        "wander-smart",
        "wws-wb-",
        "nav-quote-box",
        "<video",
    ):
        if token in lower:
            return True
    return False


def compile_for_halo_publish(body: str, post_name: str) -> tuple[str, str, str]:
    """返回 (rawType, raw, content) 供 Halo draft / content-json。"""
    body = body.strip()
    if is_mixed_halo_page(body):
        html = build_halo_html(body, post_name)
        return "html", html, html
    content = rewrite_wiki_links(md_to_html(body))
    return "markdown", body, content


def wrap_style(css: str) -> str:
    css = css.strip()
    if css.startswith("<style"):
        return css
    return f"<style>\n{css}\n</style>"


def wrap_script(js: str) -> str:
    js = js.strip()
    if js.lower().startswith("<script"):
        return js
    return f"<script>\n{js}\n</script>"


def html_edited(inner: str) -> str:
    return f'<div class="html-edited">{inner}</div>'


def md_href_to_archives(href: str) -> str:
    if href.startswith(("http://", "https://", "/archives/", "/upload/", "#", "mailto:")):
        return href
    path = href.replace("\\", "/")
    for prefix in ("../", "./"):
        while path.startswith(prefix):
            path = path[len(prefix) :]
    if path.endswith(".md"):
        path = path[:-3]
    if path.endswith("/index"):
        path = path[: -len("/index")]
    slug = path.strip("/")
    return f"/archives/{slug}"


def rewrite_wiki_links(text: str) -> str:
    def repl(m: re.Match[str]) -> str:
        return f'href="{md_href_to_archives(m.group(1))}"'

    text = re.sub(r'href="([^"]+)"', repl, text)
    text = re.sub(r"href='([^']+)'", lambda m: f"href='{md_href_to_archives(m.group(1))}'", text)
    return text


def ensure_wander_video(html: str) -> str:
    if "world_preview.mp4" in html or "wd-lazy-video" not in html:
        return html
    return re.sub(
        r'(<video class="wd-lazy-video"[^>]*>)',
        r'\1<source src="/upload/world_preview.mp4" type="video/mp4">',
        html,
        count=1,
    )


def split_halo_sections(body: str) -> list[str]:
    """按 Halo UUID 分段，避免 CSS 文件内空行被拆成数百块。"""
    lines = body.splitlines()
    sections: list[str] = []
    current: list[str] = []
    for line in lines:
        if UUID_RE.match(line.strip()):
            if current:
                sections.append("\n".join(current).strip())
                current = []
            continue
        current.append(line)
    if current:
        sections.append("\n".join(current).strip())
    return [s for s in sections if s]


def section_to_html_edited(section: str) -> str:
    section = section.strip()
    if not section:
        return ""

    if section.startswith("(function") or section.startswith("!function"):
        return html_edited(wrap_script(section))

    script = ""
    for marker in ("(function", "!function", "<script"):
        idx = section.find(marker)
        if idx != -1:
            script = wrap_script(section[idx:].strip())
            section = section[:idx].strip()
            break

    html = ""
    tag_idx = section.find("<")
    css = section
    if tag_idx >= 0:
        css = section[:tag_idx].strip()
        html = section[tag_idx:].strip()

    inner = ""
    if css and ("{" in css or css.startswith("/*")):
        inner += wrap_style(css)
    elif css and not html:
        inner += md_to_html(css)
    if html:
        inner += html
    if script:
        inner += script
    if not inner:
        return ""
    return html_edited(rewrite_wiki_links(ensure_wander_video(inner)))


def build_halo_html(body: str, manual_id: str) -> str:
    body = unescape_halo(body)
    parts: list[str] = [
        html_edited(f'<div id="halo-manual-id" style="display:none;">{manual_id}</div>')
    ]
    for section in split_halo_sections(body):
        block = section_to_html_edited(section)
        if block:
            parts.append(block)
    return "".join(parts)


def build_post(meta: dict[str, str], post_name: str, *, draft: bool) -> dict:
    slug = meta.get("slug", "home")
    title = meta.get("title", "Untitled")
    excerpt = meta.get("excerpt") or meta.get("description") or ""
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000000000Z")
    return {
        "apiVersion": "content.halo.run/v1alpha1",
        "kind": "Post",
        "metadata": {
            "name": post_name,
            "annotations": {
                "content.halo.run/preferred-editor": "default",
                "content.halo.run/permalink-pattern": "/archives/{slug}",
                "checksum/config": "",
                "checksum/content": "",
            },
            "labels": {
                "content.halo.run/published": "false" if draft else "true",
                "content.halo.run/deleted": "false",
                "content.halo.run/visible": "PUBLIC",
            },
        },
        "spec": {
            "allowComment": True,
            "categories": [],
            "deleted": False,
            "excerpt": {"autoGenerate": not bool(excerpt), "raw": excerpt},
            "htmlMetas": [],
            "owner": "",
            "pinned": False,
            "priority": 0,
            "publish": not draft,
            "publishTime": now,
            "slug": slug,
            "tags": [],
            "template": "",
            "title": title,
            "visible": "PUBLIC",
        },
        "status": {
            "hideFromList": False,
            "permalink": f"/archives/{slug}",
            "phase": "DRAFT" if draft else "PUBLISHED",
        },
    }


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Export wiki page to Halo post JSON")
    p.add_argument("input", type=Path, help="Source .md (e.g. wiki/home.md)")
    p.add_argument(
        "-o",
        "--output",
        type=Path,
        help="Output .json (default: wiki/demo/<stem>.halo-import.json)",
    )
    p.add_argument(
        "--rewrite-upload",
        action="store_true",
        help="Rewrite demo/upload/ to /upload/",
    )
    p.add_argument(
        "--publish",
        action="store_true",
        help="Mark post as published in export (default: draft)",
    )
    p.add_argument(
        "--post-name",
        type=str,
        default="",
        help="metadata.name UUID (default: new random)",
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
    meta = parse_frontmatter_meta(fm)
    body = expand_halo_includes(body, wiki_root)
    if args.rewrite_upload:
        body = rewrite_halo_asset_paths(body)

    post_name = args.post_name.strip() or str(uuid.uuid4())
    manual_id = post_name
    html_body = build_halo_html(body, manual_id)

    payload = {
        "post": build_post(meta, post_name, draft=not args.publish),
        "content": {
            "raw": html_body,
            "content": html_body,
            "rawType": "html",
        },
    }

    if args.output:
        out = args.output.resolve()
    else:
        out = wiki_root / "demo" / f"{src.stem}.halo-import.json"

    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(out)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
