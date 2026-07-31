import re
import zipfile

z = zipfile.ZipFile(r"d:/1panel_data/.tmp-hybrid-edit-block.jar")
js = z.read("ui/chunks/994.e620911d.js").decode("utf-8", "replace")
# VButton / button patterns
for pat in ["VButton", "退出分屏", "node-view-wrapper", "NodeViewWrapper", "html_edited", "ProseMirror-selectednode"]:
    idx = js.find(pat)
    print(pat, idx)
    if idx >= 0:
        print(js[max(0, idx - 80) : idx + 200].replace("\n", " ")[:280])
        print("---")
