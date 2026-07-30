import re
import zipfile

z = zipfile.ZipFile(r"d:/1panel_data/.tmp-verify.jar")
data = z.read("ui/ui-assets/editor/editor.29a22067.js").decode("utf-8", "replace")

patterns = [
    r"add_link",
    r"toggleLink",
    r"setLink",
    r"LinkIcon",
    r"link-icon",
    r"name:\"link\"",
    r'name:"link"',
    r"extension.*link",
    r"ToolbarItem",
    r"RichTextEditor",
]

out = open(r"d:/1panel_data/.tmp-link-scan.txt", "w", encoding="utf-8")
for pat in patterns:
    out.write(f"\n=== {pat} ===\n")
    for i, m in enumerate(re.finditer(pat, data, re.I)):
        if i >= 8:
            break
        s = data[max(0, m.start() - 120) : m.start() + 280].replace("\n", " ")
        out.write(s + "\n---\n")
out.close()
print("written")
