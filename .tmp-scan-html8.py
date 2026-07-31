import re
import zipfile

z = zipfile.ZipFile(r"d:/1panel_data/.tmp-verify.jar")
data = z.read("ui/ui-assets/Codemirror-BduyYEqJ.js").decode("utf-8", "replace")
print("len", len(data))
for m in re.finditer(r".{0,100}height.{0,100}", data, re.I):
    s = m.group()
    if "cm" in s.lower() or "editor" in s.lower() or "html" in s.lower():
        print(s[:220])
        print("---")

ed = z.read("ui/ui-assets/editor/editor.29a22067.js").decode("utf-8", "replace")
# find html block extension - search for group block + html
for m in re.finditer(r"addNodeView\(\)\{return GE\([^)]{1,80}\)", ed):
    s = m.group()
    if "html" in s.lower() or "HTML" in s:
        print("nodeview:", s)

# Search htmlBlock or similar in editor - look for attrs content html
for pat in ["htmlBlock", "HtmlBlock", "HTML_BLOCK", "html_block", "rawHtmlBlock", "HtmlCodeBlock"]:
    idx = ed.find(pat)
    if idx >= 0:
        print(pat, ed[idx-200:idx+400])

# Search for class names in node views
for m in re.finditer(r"class=\"[^\"]{5,80}html[^\"]{0,40}\"", ed, re.I):
    print("class", m.group())

for m in re.finditer(r"`[^`]{3,60}html[^`]{0,40}`", ed, re.I):
    g = m.group()
    if "block" in g.lower() or "edit" in g.lower() or "code" in g.lower():
        print("backtick", g[:80])
