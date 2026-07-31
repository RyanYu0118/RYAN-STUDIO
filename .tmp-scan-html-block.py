import re
import zipfile

z = zipfile.ZipFile(r"d:/1panel_data/.tmp-verify.jar")
data = z.read("ui/ui-assets/editor/editor.29a22067.js").decode("utf-8", "replace")
patterns = [
    "html-edited",
    "htmlEdited",
    "HtmlEdited",
    'name:"html"',
    "HTML_EDIT",
    "rawType",
    "rawHtml",
    "htmlContent",
    "HtmlExtension",
    "HtmlBlock",
    "htmlBlock",
    "HTML block",
    "html block",
    "codemirror",
    "CodeMirror",
    "nodeView",
    "NodeView",
]
for pat in patterns:
    m = re.search(re.escape(pat), data, re.I)
    print(pat, "->", "yes" if m else "no")
    if m:
        s = data[max(0, m.start() - 120) : m.start() + 320].replace("\n", " ")
        print(s[:420])
        print("---")
