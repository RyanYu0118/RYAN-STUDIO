import re
import zipfile

z = zipfile.ZipFile(r"d:/1panel_data/.tmp-verify.jar")
data = z.read("ui/ui-assets/editor/editor.29a22067.js").decode("utf-8", "replace")

# find link extension toolbar
idx = data.find("getToolbarItems({editor:e})")
while idx >= 0:
    chunk = data[idx : idx + 500]
    if "link" in chunk.lower() or "Link" in chunk or "oq" in chunk or "toggleLink" in chunk:
        with open(r"d:/1panel_data/.tmp-link-toolbar.txt", "a", encoding="utf-8") as f:
            f.write(chunk + "\n\n===\n\n")
    idx = data.find("getToolbarItems({editor:e})", idx + 1)

# also search oq= link mark
for pat in [r"oq=X\.create", r"oq=V\.create\({name:`link`", r"name:`link`", r"toggleLink\(\)", r"add_link"]:
    m = re.search(pat, data)
    if m:
        with open(r"d:/1panel_data/.tmp-link-toolbar.txt", "a", encoding="utf-8") as f:
            f.write(f"PAT {pat}\n{data[m.start():m.start()+800]}\n\n===\n\n")

print("done")
