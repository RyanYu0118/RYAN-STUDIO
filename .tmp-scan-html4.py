import re
import zipfile

z = zipfile.ZipFile(r"d:/1panel_data/.tmp-verify.jar")
data = z.read("ui/ui-assets/editor/editor.29a22067.js").decode("utf-8", "replace")

# Chinese UI strings related to HTML
for pat in ["HTML", "html", "编辑块", "代码", "源码", "预览"]:
    pass

# Find extension name patterns with html
for m in re.finditer(r'name:"([^"]{2,40})"', data):
    n = m.group(1)
    if "html" in n.lower():
        print("ext name:", n)

print("--- cm-editor ---")
for m in re.finditer(r".{0,80}cm-editor.{0,120}", data):
    print(m.group()[:200])
    break

print("--- cm-content ---")
for m in re.finditer(r".{0,80}cm-content.{0,120}", data):
    print(m.group()[:200])
    break

print("--- textarea height ---")
for m in re.finditer(r".{0,60}textarea.{0,100}", data, re.I):
    s = m.group()
    if "height" in s.lower() or "minHeight" in s or "maxHeight" in s:
        print(s[:200])

print("--- search html node extension ---")
for m in re.finditer(r".{0,30}html.{0,30}Node.{0,30}", data, re.I):
    print(m.group()[:120])

# broader: HTML edit block label
for label in ["HTML 编辑", "HTML编辑", "HTML Block", "HtmlBlock", "htmlBlock", "html-node", "htmlNode"]:
    i = data.find(label)
    print(label, i)
