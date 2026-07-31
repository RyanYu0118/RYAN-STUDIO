import json

raw = json.load(open(r"d:/1panel_data/wiki/demo/流浪世界服务器Wiki.json", encoding="utf-8"))["content"]["raw"]
marker = "wd-smart-card"
idx = raw.find(marker)
print("full raw len", len(raw))
print("idx of wd-smart-card", idx)
# find third html-edited block start
parts = raw.split('<div class="html-edited">')
for i, p in enumerate(parts):
    if "wd-smart-card" in p:
        print("block index", i, "part len", len(p))
        cut = p.find("aspect-ratio: 2.35 / 1;")
        if cut >= 0:
            print("chars to aspect-ratio end", cut + len("aspect-ratio: 2.35 / 1;"))
        break
