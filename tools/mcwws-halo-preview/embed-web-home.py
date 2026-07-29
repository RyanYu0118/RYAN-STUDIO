#!/usr/bin/env python3
"""Copy web/public/home.html to wiki/demo with inlined CSS/JS for Halo tests."""
from __future__ import annotations

import re
import sys
from pathlib import Path

# Halo html-edited import can break on emoji; map known UI glyphs to plain text.
_HALO_EMOJI_REPLACEMENTS = (
    ("🏗️", "建"),
    ("🗺️", "图"),
    ("⚙️", "管"),
    ("☀️", "日"),
    ("🛒", "购"),
    ("🏗", "建"),
    ("🗺", "图"),
    ("⚙", "管"),
    ("🌙", "月"),
    ("☀", "日"),
)

_EMOJI_RE = re.compile(
    "["
    "\U0001F600-\U0001F64F"
    "\U0001F300-\U0001F5FF"
    "\U0001F680-\U0001F6FF"
    "\U0001F1E0-\U0001F1FF"
    "\U00002702-\U000027B0"
    "\U0001F900-\U0001F9FF"
    "\U0001FA00-\U0001FA6F"
    "\U0001FA70-\U0001FAFF"
    "\U00002600-\U000026FF"
    "]+",
    flags=re.UNICODE,
)


def halo_safe_text(text: str) -> str:
    for old, new in _HALO_EMOJI_REPLACEMENTS:
        text = text.replace(old, new)
    text = _EMOJI_RE.sub("", text)
    return text.replace("\ufe0f", "").replace("\u200d", "")


# Full-bleed inside Halo / Fluid post column (scoped via html.mcwws-web-public-home-page).
_HALO_FULL_WIDTH_CSS = """
/* === MCWWS Halo full-width + hide TOC (Fluid / common Halo) === */
html.mcwws-web-public-home-page,
html:has(.mcwws-web-public-home-root) {
  overflow-x: clip;
}

html.mcwws-web-public-home-page body,
html:has(.mcwws-web-public-home-root) body {
  overflow-x: clip;
}

html.mcwws-web-public-home-page .mcwws-web-public-home-root,
html:has(.mcwws-web-public-home-root) .mcwws-web-public-home-root {
  width: 100vw;
  max-width: 100vw;
  margin-inline: calc(50% - 50vw);
  padding-inline: 0;
  box-sizing: border-box;
  position: relative;
  left: 0;
  z-index: 1;
}

html.mcwws-web-public-home-page #board-ctn,
html.mcwws-web-public-home-page #board,
html.mcwws-web-public-home-page .container,
html.mcwws-web-public-home-page .container-fluid,
html:has(.mcwws-web-public-home-root) #board-ctn,
html:has(.mcwws-web-public-home-root) #board,
html:has(.mcwws-web-public-home-root) .container,
html:has(.mcwws-web-public-home-root) .container-fluid {
  max-width: none !important;
  width: 100% !important;
  padding-left: 0 !important;
  padding-right: 0 !important;
  margin-left: 0 !important;
  margin-right: 0 !important;
}

html.mcwws-web-public-home-page #board,
html:has(.mcwws-web-public-home-root) #board {
  border-radius: 0 !important;
  margin-top: 0 !important;
  box-shadow: none !important;
  padding-top: 0 !important;
  padding-bottom: 0 !important;
}

html.mcwws-web-public-home-page .row,
html:has(.mcwws-web-public-home-root) .row {
  margin-left: 0 !important;
  margin-right: 0 !important;
}

html.mcwws-web-public-home-page .col-lg-8,
html.mcwws-web-public-home-page .col-lg-9,
html.mcwws-web-public-home-page .col-xl-8,
html.mcwws-web-public-home-page .col-xl-9,
html.mcwws-web-public-home-page .nopadding-x-md,
html:has(.mcwws-web-public-home-root) .col-lg-8,
html:has(.mcwws-web-public-home-root) .col-lg-9,
html:has(.mcwws-web-public-home-root) .col-xl-8,
html:has(.mcwws-web-public-home-root) .col-xl-9,
html:has(.mcwws-web-public-home-root) .nopadding-x-md {
  flex: 0 0 100% !important;
  max-width: 100% !important;
  width: 100% !important;
  padding-left: 0 !important;
  padding-right: 0 !important;
}

html.mcwws-web-public-home-page #toc,
html.mcwws-web-public-home-page #toc-body,
html.mcwws-web-public-home-page .toc,
html.mcwws-web-public-home-page .toc-header,
html.mcwws-web-public-home-page .toc-body,
html.mcwws-web-public-home-page .tocbot,
html.mcwws-web-public-home-page .col-lg-4:has(#toc),
html.mcwws-web-public-home-page .col-xl-3:has(#toc),
html:has(.mcwws-web-public-home-root) #toc,
html:has(.mcwws-web-public-home-root) #toc-body,
html:has(.mcwws-web-public-home-root) .toc,
html:has(.mcwws-web-public-home-root) .toc-header,
html:has(.mcwws-web-public-home-root) .toc-body,
html:has(.mcwws-web-public-home-root) .tocbot,
html:has(.mcwws-web-public-home-root) .col-lg-4:has(#toc),
html:has(.mcwws-web-public-home-root) .col-xl-3:has(#toc) {
  display: none !important;
  visibility: hidden !important;
  width: 0 !important;
  max-width: 0 !important;
  height: 0 !important;
  overflow: hidden !important;
  pointer-events: none !important;
  margin: 0 !important;
  padding: 0 !important;
}

html.mcwws-web-public-home-page .markdown-body,
html.mcwws-web-public-home-page .post-content,
html.mcwws-web-public-home-page .post-page,
html.mcwws-web-public-home-page .post-page__main,
html.mcwws-web-public-home-page .post-page__content,
html.mcwws-web-public-home-page .n-post-content,
html.mcwws-web-public-home-page article.post,
html.mcwws-web-public-home-page .halo-post-content,
html.mcwws-web-public-home-page .single-content,
html:has(.mcwws-web-public-home-root) .markdown-body,
html:has(.mcwws-web-public-home-root) .post-content,
html:has(.mcwws-web-public-home-root) .post-page,
html:has(.mcwws-web-public-home-root) .post-page__main,
html:has(.mcwws-web-public-home-root) .post-page__content,
html:has(.mcwws-web-public-home-root) .n-post-content,
html:has(.mcwws-web-public-home-root) article.post,
html:has(.mcwws-web-public-home-root) .halo-post-content,
html:has(.mcwws-web-public-home-root) .single-content {
  max-width: none !important;
  width: 100% !important;
  padding-left: 0 !important;
  padding-right: 0 !important;
  margin-left: 0 !important;
  margin-right: 0 !important;
}

html.mcwws-web-public-home-page .html-edited.mcwws-web-public-home-root,
html:has(.mcwws-web-public-home-root) .html-edited.mcwws-web-public-home-root {
  max-width: none !important;
  width: 100% !important;
  padding-left: 0 !important;
  padding-right: 0 !important;
  margin-left: 0 !important;
  margin-right: 0 !important;
}

.mcwws-web-public-home-root .services-hub-page {
  width: 100%;
  min-height: 100vh;
  box-sizing: border-box;
}

.mcwws-web-public-home-root .services-hub-main.container {
  max-width: none !important;
  width: 100% !important;
  margin-inline: 0;
  padding-inline: clamp(1rem, 4vw, 2.5rem);
  box-sizing: border-box;
}

.mcwws-web-public-home-root .services-module-grid {
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 280px), 1fr));
}

.mcwws-web-public-home-root .services-hub-hero,
.mcwws-web-public-home-root .services-hub-footer {
  width: 100%;
  box-sizing: border-box;
  padding-inline: clamp(1rem, 4vw, 2.5rem);
}
"""

_HALO_LAYOUT_BOOTSTRAP_JS = """
(function () {
  var root = document.querySelector('.mcwws-web-public-home-root');
  if (!root) return;
  document.documentElement.classList.add('mcwws-web-public-home-page');
  ['toc', 'toc-body'].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.style.setProperty('display', 'none', 'important');
  });
  ['#board-ctn', '#board', '.markdown-body'].forEach(function (sel) {
    var el = document.querySelector(sel);
    if (!el) return;
    el.style.setProperty('max-width', 'none', 'important');
    el.style.setProperty('width', '100%', 'important');
  });
  document.querySelectorAll('#toc').forEach(function (toc) {
    toc.style.setProperty('display', 'none', 'important');
    var col = toc.closest('.col-lg-4, .col-xl-3, .col-md-4');
    if (col) col.style.setProperty('display', 'none', 'important');
  });
})();
"""


def main() -> int:
    repo = Path(__file__).resolve().parents[2]
    pub = repo / "plugins" / "Skript" / "scripts" / "web" / "public"
    out = repo / "wiki" / "demo" / "web-public-home.html"

    style = (pub / "style.css").read_text(encoding="utf-8")
    themes = (pub / "themes.css").read_text(encoding="utf-8")
    theme_js = (pub / "mcwws-theme.js").read_text(encoding="utf-8")
    transition_js = (pub / "mcwws-page-transition.js").read_text(encoding="utf-8")
    config_js = (pub / "services-config.js").read_text(encoding="utf-8")

    style = re.sub(
        r"@font-face\s*\{[^}]*\}",
        "/* MinecraftFont @font-face omitted in Halo embed */",
        style,
        count=1,
        flags=re.DOTALL,
    )

    if ".container {" not in style and ".container\n" not in style:
        style += "\n.container { width: 100%; max-width: 1100px; margin: 0 auto; }\n"

    body_html = (pub / "home.html").read_text(encoding="utf-8")
    # Extract body inner (between <body...> and </body>)
    m = re.search(r"<body[^>]*>(.*)</body>", body_html, re.DOTALL | re.I)
    if not m:
        print("Could not parse home.html body", file=sys.stderr)
        return 1
    body_inner = m.group(1).strip()
    # Drop external script tags; JS inlined below
    body_inner = re.sub(r'\s*<script[^>]+src="[^"]+"[^>]*></script>\s*', "\n", body_inner)
    # Absolute links for Halo (same host as shop web)
    base = "https://www.ryanstudio.work"
    body_inner = body_inner.replace('href="items.html"', f'href="{base}/items.html" target="_blank" rel="noopener"')
    body_inner = body_inner.replace('href="build.html"', f'href="{base}/build.html" target="_blank" rel="noopener"')
    body_inner = body_inner.replace('href="map.html"', f'href="{base}/map.html" target="_blank" rel="noopener"')
    body_inner = body_inner.replace(
        'href="manage/shop-locations.html"',
        f'href="{base}/manage/shop-locations.html" target="_blank" rel="noopener"',
    )

    page = f"""<!--
  MCWWS: copy of plugins/Skript/scripts/web/public/home.html
  Inlined style.css + themes.css (+ JS) for Halo HTML / JSON import test.
  Emoji stripped / replaced for Halo html-edited import compatibility.
  Regenerate: python tools/mcwws-halo-preview/embed-web-home.py
-->
<div class="html-edited mcwws-web-public-home-root">
<script>
/* Halo: mark page + hide TOC + widen board (when post CSS cannot use :has) */
{_HALO_LAYOUT_BOOTSTRAP_JS}
</script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
<style>
/* === style.css (inlined) === */
{style}
</style>
<style>
/* === themes.css (inlined) === */
{themes}
</style>
<style>
{_HALO_FULL_WIDTH_CSS}
</style>
<div class="services-hub-page" style="min-height:auto;">
{body_inner}
</div>
<script>
/* mcwws-theme.js */
{theme_js}
</script>
<script>
/* mcwws-page-transition.js */
{transition_js}
</script>
<script>
/* services-config.js */
{config_js}
</script>
</div>
"""

    page = halo_safe_text(page)
    out.write_text(page, encoding="utf-8")
    print(out)
    print(f"{out.stat().st_size} bytes")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
