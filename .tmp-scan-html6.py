import re
import zipfile

z = zipfile.ZipFile(r"d:/1panel_data/.tmp-verify.jar")
for name in sorted(z.namelist()):
    if not name.endswith(".js"):
        continue
    data = z.read(name).decode("utf-8", "replace")
    if "Codemirror" in name or "codemirror" in name.lower():
        continue
    if "cm-editor" in data or "CodeMirror" in data or "codemirror" in data.lower():
        print("refs codemirror:", name)

print("\n=== HTML chinese labels ===")
for name in sorted(z.namelist()):
    if not name.endswith(".js"):
        continue
    data = z.read(name).decode("utf-8", "replace")
    for m in re.finditer(r"[\u4e00-\u9fff]{0,6}HTML[\u4e00-\u9fff]{0,8}", data):
        print(name, m.group())

print("\n=== search htmlEdited / html edited block ===")
for name in sorted(z.namelist()):
    if not name.endswith(".js"):
        continue
    data = z.read(name).decode("utf-8", "replace")
    for pat in ["htmlEdited", "html_edited", "HtmlEdited", "HTML_EDITED", "editedHtml", "EditedHtml"]:
        if pat in data:
            print(name, pat)
