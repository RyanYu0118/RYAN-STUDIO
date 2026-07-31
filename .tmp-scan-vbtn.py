import re
import zipfile

z = zipfile.ZipFile(r"d:/1panel_data/.tmp-hybrid-edit-block.jar")
js = z.read("ui/chunks/994.e620911d.js").decode("utf-8", "replace")
for m in re.finditer(r"VButton[^}]{0,200}", js):
    print(m.group()[:180])
    print("---")
