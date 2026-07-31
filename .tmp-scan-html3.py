import re
import zipfile

z = zipfile.ZipFile(r"d:/1panel_data/.tmp-verify.jar")
files = [
    "ui/ui-assets/editor/editor.29a22067.js",
    "ui/ui-assets/PostEditor-C_8j0i8g.js",
    "ui/ui-assets/components/components.d2b9b421.js",
]
for fname in files:
    data = z.read(fname).decode("utf-8", "replace")
    print("\n====", fname, "len", len(data), "====")
    for pat in [
        "html_block",
        "htmlBlock",
        "HTMLBlock",
        "html-edited",
        "htmlEdited",
        "HtmlBlock",
        "HTML 编辑",
        "HTML编辑",
        "html block",
        "rawHtml",
        "innerHTML",
        "codemirror",
        "cm-editor",
        "cm-content",
        "CodeMirror",
        "node-html",
        "HtmlNode",
    ]:
        for m in re.finditer(re.escape(pat), data, re.I):
            ctx = data[max(0, m.start() - 150) : m.start() + 400].replace("\n", " ")
            print(f"\n[{pat}] @{m.start()}")
            print(ctx[:500])
            break
