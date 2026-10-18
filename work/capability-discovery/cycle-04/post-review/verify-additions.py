import hashlib,json,pathlib,subprocess
p=pathlib.Path(__file__).resolve().parent
h=lambda b:hashlib.sha256(b).hexdigest()
m=json.loads((p/'additions-manifest.json').read_bytes())
for r in m['files']:
 b=(p.parent/r['path']).read_bytes()
 assert len(b)==r['bytes'] and h(b)==r['sha256'],r['path']
i=json.loads((p/'capture-index.json').read_bytes())
for r in i['files']:
 b=(p.parent/r['path']).read_bytes()
 if r['codec']=='zstd': b=subprocess.check_output(['zstd','-q','-d','-c'],input=b)
 assert len(b)==r['originalBytes'] and h(b)==r['originalSha256'],r['original']
print('Post-review stored additions and exact captured originals verified; no CV execution')
