#!/usr/bin/env python3
"""将 Halo / RYAN STUDIO 导出的混合 Markdown 编译为可在浏览器打开的 HTML。"""
from __future__ import annotations

import argparse
import html
import json
import re
import sys
from pathlib import Path

UUID_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\s*$",
    re.I,
)


def unescape_halo(text: str) -> str:
    return (
        text.replace("\\/", "/")
        .replace("\\[", "[")
        .replace("\\]", "]")
        .replace("\\*", "*")
        .replace("\\_", "_")
        .replace("\\(", "(")
        .replace("\\)", ")")
    )


def is_style_block(block: str) -> bool:
    s = block.strip()
    if not s:
        return False
    if s.startswith("/*") or s.startswith("/\\*"):
        return True
    if ".wd-" in s or ".nav-quote" in s or ".wander-" in s or ".mcwws-" in s or "@keyframes" in s or "@media" in s:
        if "{" in s and "}" in s:
            return True
    return False


def is_script_block(block: str) -> bool:
    s = block.strip()
    return s.startswith("(function") or s.startswith("!function") or "<script" in s.lower()


def is_html_block(block: str) -> bool:
    s = block.strip()
    return s.startswith("<") and ">" in s


def split_blocks(body: str) -> list[str]:
    parts = re.split(r"\n\s*\n", body.strip())
    return [p.strip() for p in parts if p.strip()]


def strip_frontmatter(text: str) -> str:
    if text.startswith("---"):
        end = text.find("\n---", 3)
        if end != -1:
            return text[end + 4 :].lstrip("\n")
    return text


def expand_halo_includes(raw: str, wiki_root: Path) -> str:
    halo = wiki_root / "_halo"
    out = raw
    if "{{MCWWS_HALO_CSS}}" in out:
        css_path = halo / "mcwws-wiki.css"
        css = css_path.read_text(encoding="utf-8") if css_path.is_file() else ""
        out = out.replace("{{MCWWS_HALO_CSS}}", css)
    if "{{MCWWS_HALO_JS}}" in out:
        js_path = halo / "mcwws-wiki.js"
        js = js_path.read_text(encoding="utf-8") if js_path.is_file() else ""
        out = out.replace("{{MCWWS_HALO_JS}}", js)
    pairs = {
        "{{WANDER_DEMO_NAV_CSS}}": "wander-demo-nav.css",
        "{{WANDER_DEMO_CARD_CSS}}": "wander-demo-card.css",
        "{{WANDER_DEMO_CARD_JS}}": "wander-demo-card.js",
    }
    for token, name in pairs.items():
        if token in out:
            p = halo / name
            text = p.read_text(encoding="utf-8") if p.is_file() else ""
            out = out.replace(token, text)
    return out


def find_wiki_root(start: Path) -> Path:
    p = start.parent if start.is_file() else start
    for _ in range(8):
        if (p / "_halo" / "mcwws-wiki.css").is_file():
            return p
        if p.parent == p:
            break
        p = p.parent
    return start.parent


def rewrite_upload_urls(md: str) -> str:
    return re.sub(
        r"(\]\(|src=\"|href=\")/upload/",
        r"\1upload/",
        md,
    )


def inject_wander_card_if_needed(html_parts: list[str], scripts: list[str]) -> None:
    script_joined = " ".join(scripts)
    if "wanderCard" not in script_joined:
        return
    if any("wanderCard" in h for h in html_parts):
        return
    html_parts.insert(
        0,
        """
<div class="wander-smart-container font-cn">
  <a class="wd-smart-card font-en" id="wanderCard" href="#preview">
    <div class="wd-rainbow-border"></div>
    <div class="wd-inner-mask">
      <div class="wd-static-bg"></div>
      <video class="wd-lazy-video" muted loop playsinline></video>
      <div class="wd-content">
        <div class="wd-title font-cn">进入流浪的世界</div>
        <div class="wd-meta-bar font-en">
          <span>WORLD BUILDING</span><span class="wd-divider"></span><span>预览占位</span>
        </div>
      </div>
    </div>
  </a>
</div>
""".strip(),
    )


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Compile Halo hybrid markdown to HTML")
    p.add_argument("input", type=Path, help="Source .md path")
    p.add_argument(
        "-o",
        "--output",
        type=Path,
        help="Output .html (default: wiki/demo/_preview/<name>.html)",
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
    raw = strip_frontmatter(raw)
    raw = expand_halo_includes(raw, wiki_root)
    lines = raw.splitlines()
    if lines and UUID_RE.match(lines[0].strip()):
        lines = lines[1:]
    body = unescape_halo("\n".join(lines))

    styles: list[str] = []
    scripts: list[str] = []
    html_chunks: list[str] = []
    md_chunks: list[str] = []

    for block in split_blocks(body):
        if is_style_block(block):
            styles.append(unescape_halo(block))
        elif is_script_block(block):
            scripts.append(unescape_halo(block))
        elif is_html_block(block):
            html_chunks.append(block)
        else:
            md_chunks.append(block)

    inject_wander_card_if_needed(html_chunks, scripts)

    md = rewrite_upload_urls("\n\n".join(md_chunks))
    html_inline = "\n".join(html_chunks)

    if args.output:
        out = args.output.resolve()
    else:
        out = src.parent / "_preview" / (src.stem + ".html")
    out.parent.mkdir(parents=True, exist_ok=True)

    base_href = src.parent.as_uri() + "/"
    style_text = "\n\n".join(styles)
    script_text = "\n\n".join(scripts)

    page = f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <base href="{html.escape(base_href)}" />
  <title>{html.escape(src.stem)} · Halo 本地预览</title>
  <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
  <style>
    body {{
      margin: 0;
      font-family: system-ui, "Segoe UI", sans-serif;
      background: #0f1419;
      color: #e5e7eb;
      line-height: 1.65;
    }}
    .mcwws-preview-banner {{
      position: sticky; top: 0; z-index: 9999;
      padding: 8px 16px; font-size: 13px;
      background: #1e3a5f; color: #dbeafe;
      border-bottom: 1px solid #2563eb;
    }}
    .mcwws-preview-body {{
      max-width: 920px;
      margin: 0 auto;
      padding: 24px 20px 64px;
    }}
    .mcwws-preview-body img {{ max-width: 100%; height: auto; }}
    .mcwws-preview-body a {{ color: #7dd3fc; }}
    .mcwws-preview-body blockquote {{
      border-left: 4px solid #64748b;
      margin: 1em 0; padding-left: 1em; color: #cbd5e1;
    }}
    .mcwws-preview-html {{ margin-bottom: 1.5rem; }}
    {style_text}
  </style>
</head>
<body>
  <div class="mcwws-preview-banner">MCWWS Halo 本地预览（与站内 100% 一致不保证；图片路径相对 demo/upload）</div>
  <div class="mcwws-preview-body">
    <div class="mcwws-preview-html">{html_inline}</div>
    <div id="md-root"></div>
  </div>
  <script>
    const md = {json.dumps(md)};
    document.getElementById("md-root").innerHTML = marked.parse(md, {{ breaks: true, gfm: true }});
  </script>
  <script>
{script_text}
  </script>
</body>
</html>
"""

    out.write_text(page, encoding="utf-8")
    print(out)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
