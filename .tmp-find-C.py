import zipfile, re
d = zipfile.ZipFile(r'd:/1panel_data/.tmp-halo-live.jar').read('ui/ui-assets/editor/editor.29a22067.js').decode('utf-8', 'replace')

# Find component C - search markRaw)(C) and trace back
# Look for defineComponent assigned to C or var C=
for pat in [r'var C=\(', r',C=\(', r'C=\(0,t.defineComponent']:
    idx = d.find(pat)
    print(pat, idx)
    if idx >= 0:
        print(d[idx:idx+2000])
        print('---')

# search 普通链接 in entire jar more broadly
z = zipfile.ZipFile(r'd:/1panel_data/.tmp-halo-live.jar')
for name in z.namelist():
    if not (name.endswith('.js') or name.endswith('.json') or name.endswith('.yaml')):
        continue
    try:
        data = z.read(name).decode('utf-8', 'replace')
    except:
        continue
    if '普通链接' in data:
        print('FOUND in', name)
        for m in re.finditer(r'.{0,100}普通链接.{0,100}', data):
            print(m.group(0))

# search link type i18n patterns
for m in re.finditer(r'editor[^"]*link[^"]*":\{t:0,b:\{t:2,i:\[\{t:3\}\],s:`[^`]+`\}', d):
    s = m.group(0)
    if '普通' in s or 'normal' in s.lower() or 'type' in s.lower():
        print(s)
