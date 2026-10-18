"""Restore exact archived names and separately labelled path-only companions; never run CV."""
from pathlib import Path
import argparse, hashlib, json, shutil, subprocess
p=argparse.ArgumentParser(description=__doc__)
p.add_argument('--out',type=Path,required=True)
p.add_argument('--with-bulk',action='store_true',help='Reconstruct omitted pixel JSON from exact source pixels; no CV')
a=p.parse_args()
package=Path(__file__).resolve().parent
repo=package.parents[2]
out=a.out.resolve()
if out.exists() or out==repo or repo in out.parents: raise SystemExit('Use a fresh directory outside checkout')
sha=lambda b:hashlib.sha256(b).hexdigest()
index=json.loads((package/'administration/capture-index.json').read_text())
out.mkdir(parents=True)
(out/'chainspot-discovery-lab').symlink_to(repo,target_is_directory=True)
cycle=out/'discovery-cycle04'; cycle.mkdir()
entries=[]
old_cycle='/workspace/scratch/8528bb251845/discovery-cycle04'
old_repo='/workspace/scratch/8528bb251845/chainspot-discovery-lab'
def put(path,data):
    path.parent.mkdir(parents=True,exist_ok=True)
    with path.open('xb') as f: f.write(data)
def captured(r):
    stored=(package/r['path']).read_bytes()
    if r.get('codec')=='zstd':
        if sha(stored)!=r['storedSha256'] or len(stored)!=r['storedBytes']: raise SystemExit('Compressed storage integrity')
        return subprocess.check_output(['zstd','-q','-d','-c',str(package/r['path'])])
    return stored
for r in index['files']:
    raw=captured(r)
    if len(raw)!=r['bytes'] or sha(raw)!=r['sha256']: raise SystemExit('Capture integrity: '+r['original'])
    dest=cycle/r['original']; put(dest,raw)
    entry={'original':r['original'],'sha256':sha(raw),'staged':str(dest.relative_to(out))}
    if dest.suffix in ('.mjs','.py','.sh'):
        relocated=raw.decode().replace(old_cycle,str(cycle)).replace(old_repo,str(repo)).encode()
        if relocated!=raw:
            companion=dest.with_name(dest.stem+'-portable'+dest.suffix);put(companion,relocated)
            entry.update(portable=str(companion.relative_to(out)),portableSha256=sha(relocated),adaptation='separate path-only companion; original remains exact; not execution-equivalent provenance')
    entries.append(entry)
if a.with_bulk:
    # Exact pixel recovery only. Original declarations/receipts are not rewritten and no caller is executed.
    from PIL import Image
    sources=json.loads((package/'source-manifest.json').read_text())['sourceImages']
    pixels={}
    for s in sources:
        raw=subprocess.check_output(['git','cat-file','blob',s['gitBlob']],cwd=repo)
        if sha(raw)!=s['pngSha256']: raise SystemExit('Source PNG integrity: '+s['imageId'])
        png=out/('source-'+s['gitBlob']+'.png');put(png,raw)
        with Image.open(png) as image:
            if image.mode not in ('RGB','RGBA'): raise SystemExit('Unsupported source mode')
            rgba=image.convert('RGBA').tobytes()
        if sha(rgba)!=s['rgbaSha256']: raise SystemExit('Decoder RGBA mismatch: '+s['imageId'])
        pixels[s['rgbaSha256']]=rgba
        for r in index['omitted']:
            if r['sha256']==s['pngSha256']: put(cycle/r['original'],raw)
    for png in cycle.glob('P*/E811/uniform-gray100.png'):
        with Image.open(png) as image: rgba=image.convert('RGBA').tobytes()
        pixels[sha(rgba)]=rgba
    fixture=cycle/'P5/fixtures.mjs'
    if fixture.exists():
        for case in ('intact','localized-upper-rail-loss','organic-capsule','crossing'):
            script="import{makeFixture}from"+json.dumps(fixture.as_uri())+";process.stdout.write(makeFixture("+json.dumps(case)+").image.data);"
            rgba=subprocess.check_output(['node','--input-type=module','-e',script])
            pixels[sha(rgba)]=rgba
    templates={}
    for r in index['omitted']:
        if not r.get('descriptor'): continue
        d=json.loads((package/r['descriptor']).read_text())
        rgba=pixels.get(d['rgbaSha256'])
        if rgba is None: raise SystemExit('Exact RGBA unavailable: '+r['original'])
        if len(rgba)!=d['length']: raise SystemExit('RGBA length mismatch')
        if r['sha256'] not in templates:
            array=d['arrayPrefix']+d['separator'].join(map(str,rgba))+d['arraySuffix']
            rebuilt=(d['prefix']+array+d['suffix']).encode()
            if len(rebuilt)!=r['bytes'] or sha(rebuilt)!=r['sha256']: raise SystemExit('Reconstruction not exact: '+r['original'])
            templates[r['sha256']]=rebuilt
        put(cycle/r['original'],templates[r['sha256']])
        entries.append({'original':r['original'],'sha256':r['sha256'],'reconstruction':'exact prefix/suffix and raw pixel array; no CV'})
receipt={'schema':'cycle04-portable-stage@1','files':entries,'bulkReconstructed':a.with_bulk,'executed':'No CV, producers, renderers, solver, Git fetch/commit/push or scientific reruns. Synthetic generator and optional exact PNG decoder recover pixels only.','limits':['Original raw evidence remains exact; portable companion path changes have separate digests and do not inherit original caller execution authentication.','Historical state is not live dispatch authority. One-shot callers retain original output guards; stage does not authorize a rerun.']}
put(out/'stage-receipt.json',(json.dumps(receipt,indent=2)+'\n').encode())
print(cycle)
