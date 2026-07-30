import zipfile, re
d = zipfile.ZipFile(r'd:/1panel_data/.tmp-halo-live.jar').read('ui/ui-assets/editor/editor.29a22067.js').decode('utf-8', 'replace')

# all show-more-indicator usages
for m in re.finditer(r'.{0,400}show-more-indicator.{0,400}', d):
    s = m.group(0)
    if 'link' in s.lower() or 'Link' in s or 'href' in s.lower():
        print('=== LINK RELATED ===')
        print(s)
        print()

# search text: in bubble link context  
for m in re.finditer(r'text:.*?global\.t\(`editor[^`]+link[^`]*`\)', d):
    print(m.group(0)[:200])

# find C component used in bubble menu priority 20
idx = d.find('priority:20,component:(0,t.markRaw)(C)')
print('\npriority 20 C at', idx)
print(d[idx-100:idx+500])

# find what C is
# search backwards for defineComponent with name that maps to C
# simpler: search BubbleItemLinkType or link types in mY extension
idx2 = d.find('mY=VJ.extend')
print('\nmY at', idx2)
print(d[idx2:idx2+4000])
