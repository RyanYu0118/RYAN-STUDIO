import json
import re

raw = json.load(
    open(r"d:/1panel_data/wiki/demo/流浪世界服务器Wiki.json", encoding="utf-8")
)["content"]["raw"]
blocks = []
for m in re.finditer(r'<div class="html-edited">', raw):
    start = m.end()
    depth = 1
    i = start
    while i < len(raw) and depth:
        o = raw.find("<div", i)
        c = raw.find("</div>", i)
        if c < 0:
            break
        if o != -1 and o < c:
            depth += 1
            i = o + 4
        else:
            depth -= 1
            if depth == 0:
                blocks.append(raw[start:c])
                break
            i = c + 6
for i, b in enumerate(blocks):
    if "wd-smart-card" in b:
        tag = "card"
    elif "nav-quote" in b:
        tag = "nav"
    elif "halo-manual-id" in b:
        tag = "manual-id"
    else:
        tag = "other"
    print(i, tag, len(b))
