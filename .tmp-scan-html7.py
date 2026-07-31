import re
import zipfile

z = zipfile.ZipFile(r"d:/1panel_data/.tmp-verify.jar")
files = [
    "ui/ui-assets/Codemirror-BduyYEqJ.js",
    "ui/ui-assets/vendor~index~index~index-DRrlSVnz.js",
    "ui/ui-assets/vendor~index~index~index-BS6YruB-.js",
    "ui/ui-assets/vendor~index~index-BQV-2kSJ.js",
]
for fname in files:
    data = z.read(fname).decode("utf-8", "replace")
    print("\n====", fname, "====")
    for pat in ["html", "HTML", "编辑", "preview", "Preview", "render", "height", "minHeight", "maxHeight", "cm-editor", "cm-scroller"]:
        if pat.lower() in data.lower():
            print(" has", pat)
    for m in re.finditer(r"[\u4e00-\u9fff]{1,20}HTML[\u4e00-\u9fff]{1,20}", data):
        print("CN:", m.group())
    for m in re.finditer(r"data-type.{0,20}html.{0,20}", data, re.I):
        print("data-type:", m.group()[:80])

# editor bundle: search for html block node
ed = z.read("ui/ui-assets/editor/editor.29a22067.js").decode("utf-8", "replace")
for m in re.finditer(r"[\u4e00-\u9fff]{1,20}HTML[\u4e00-\u9fff]{1,20}", ed):
    s = m.group()
    if "编辑" in s or "块" in s or "代码" in s:
        print("editor CN:", s)

for m in re.finditer(r"data-type=\"html[^\"]*\"", ed):
    print("editor data-type:", m.group())

for m in re.finditer(r"name:\"([^\"]*html[^\"]*)\"", ed, re.I):
    print("editor ext:", m.group(1))
