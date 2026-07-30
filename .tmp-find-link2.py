import zipfile, re
d = zipfile.ZipFile(r'd:/1panel_data/.tmp-halo-live.jar').read('ui/ui-assets/editor/editor.29a22067.js').decode('utf-8', 'replace')

# find link-related bubble components
for m in re.finditer(r'__name:`BubbleItem[^`]*`', d):
    name = m.group(0)
    pos = m.start()
    snippet = d[pos:pos+800]
    if 'link' in snippet.lower() or 'Link' in snippet:
        print('===', name, 'at', pos)
        print(snippet[:700])
        print()

# search bk component definition
j = d.find('__name:`BubbleButton`')
if j < 0:
    j = d.find('show-more-indicator')
print('show-more-indicator first at', j)
print(d[j-200:j+1200])

# search for link type items array like dY but for links
for pat in ['BubbleItemLink', 'linkType', 'link_type', '普通', 'normal_link', 'regular_link']:
    idx = d.find(pat)
    print(pat, idx)
