import re
import zipfile

z = zipfile.ZipFile(r"d:/1panel_data/.tmp-verify.jar")
for name in sorted(z.namelist()):
    if not name.endswith(".js"):
        continue
    data = z.read(name).decode("utf-8", "replace")
    if "html-edited" in data:
        print("html-edited in", name)
    if "HTML 编辑" in data or "HTML编辑" in data:
        print("HTML编辑 in", name)
    if re.search(r"name:\s*['\"]html['\"]", data, re.I):
        print("name html in", name)
    if "HtmlCode" in data or "htmlCode" in data or "RawHtml" in data or "rawHtml" in data:
        print("raw html in", name, [x for x in ["HtmlCode","htmlCode","RawHtml","rawHtml"] if x in data])

# Search all js for cm-editor class (CodeMirror 6)
print("\n=== cm-editor files ===")
for name in sorted(z.namelist()):
    if not name.endswith(".js"):
        continue
    data = z.read(name).decode("utf-8", "replace")
    if "cm-editor" in data or "cm-scroller" in data:
        print(name, "cm-editor" if "cm-editor" in data else "", "cm-scroller" if "cm-scroller" in data else "")
