import re
import zipfile

z = zipfile.ZipFile(r"d:/1panel_data/.tmp-hybrid-edit-block.jar")
css = z.read("ui/style.css").decode("utf-8", "replace")
print("=== style.css ===")
print(css)
js = z.read("ui/chunks/994.e620911d.js").decode("utf-8", "replace")
print("\n=== js len", len(js), "===\n")
for m in re.finditer(r"[\u4e00-\u9fff]{1,8}编辑[\u4e00-\u9fff]{0,8}", js):
    print("CN", m.group())
for m in re.finditer(r"preview[A-Za-z_-]{0,30}", js):
    s = m.group()
    if len(s) > 6:
        print("preview token", s[:40])

# extract template-ish strings
for m in re.finditer(r"`[^`]{20,200}`", js):
    g = m.group()
    if any(x in g.lower() for x in ["preview", "split", "editor", "html", "cm-"]):
        print("str", g[:160])
