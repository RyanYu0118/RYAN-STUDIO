import zipfile, re
d = zipfile.ZipFile(r'd:/1panel_data/.tmp-halo-live.jar').read('ui/ui-assets/editor/editor.29a22067.js').decode('utf-8', 'replace')

keys = sorted(set(re.findall(r'"(editor\.extensions\.link\.[^"]+)"', d)))
print('link i18n keys:')
for k in keys:
    print(' ', k)

# dY component near uY
j = d.find('uY={class')
print('\nuY context at', j)
print(d[j:j+3500])

# search for 链接 in zh i18n
for m in re.finditer(r'"editor[^"]*":\{t:0,b:\{t:2,i:\[\{t:3\}\],s:`[^`]*链接[^`]*`\}', d):
    print('\nzh key:', m.group(0)[:120])

# PZ bubble item button
j2 = d.find('__name:`BubbleItem`')
if j2 < 0:
    j2 = d.find('BubbleItem`,props')
print('\nBubbleItem at', j2)
if j2 >= 0:
    print(d[j2:j2+1500])
