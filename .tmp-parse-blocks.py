import json
import re

d = json.load(open(r"d:/1panel_data/wiki/demo/流浪世界服务器Wiki.json", encoding="utf-8"))
raw = d["post"]["spec"]["raw"]
chunks = raw.split('<div class="html-edited">')[1:]
print("blocks", len(chunks))
for i, c in enumerate(chunks[:6]):
    print(
        i + 1,
        "len",
        len(c),
        "script",
        "<script" in c.lower(),
        "wd-smart",
        "wd-smart" in c,
    )
