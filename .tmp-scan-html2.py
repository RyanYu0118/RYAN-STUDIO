import re
import zipfile

z = zipfile.ZipFile(r"d:/1panel_data/.tmp-verify.jar")
needles = ["html-edited", "htmlEdited", "HtmlBlock", "htmlBlock", "HTML 编辑", "html edit"]
for name in z.namelist():
    if not name.endswith(".js"):
        continue
    data = z.read(name).decode("utf-8", "replace")
    for n in needles:
        if n in data:
            print("HIT", n, "in", name)
    if "html" in data.lower() and ("block" in data.lower() or "edited" in data.lower()):
        for m in re.finditer(r".{0,40}html.{0,40}block.{0,40}", data, re.I):
            print(name, m.group()[:120])
            break
