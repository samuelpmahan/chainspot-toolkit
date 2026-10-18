"""Restore exact cycle05 captured bytes/names and separate path-only companions. Never execute them."""
from pathlib import Path
import argparse,hashlib,json,subprocess
p=argparse.ArgumentParser(description=__doc__)
p.add_argument('--out',type=Path,required=True)
p.add_argument('--phase',choices=('initial','final'))
a=p.parse_args()
package=Path(__file__).resolve().parent
repo=package.parents[2]
out=a.out.resolve()
if out.exists() or out==repo or out.is_relative_to(repo):raise SystemExit('Fresh directory outside repository required')
phase=a.phase or ('final' if (package/'administration/capture-index-final.json').exists() else 'initial')
index=json.loads((package/('administration/capture-index-'+phase+'.json')).read_bytes())
sha=lambda b:hashlib.sha256(b).hexdigest()
def safe(base,name):
    target=(base/name).resolve()
    if target==base or not target.is_relative_to(base):raise SystemExit('Unsafe indexed path: '+name)
    return target
def put(path,raw):
    path.parent.mkdir(parents=True,exist_ok=True)
    with path.open('xb') as f:f.write(raw)
out.mkdir(parents=True)
(out/'chainspot-discovery-lab').symlink_to(repo,target_is_directory=True)
cycle=out/'discovery-cycle05';cycle.mkdir()
cache={};entries=[]
old_cycle='/workspace/scratch/8528bb251845/discovery-cycle05'
old_repo='/workspace/scratch/8528bb251845/chainspot-discovery-lab'
for r in index['files']:
    stored=safe(package,r['path']).read_bytes()
    if len(stored)!=r['storedBytes'] or sha(stored)!=r['storedSha256']:raise SystemExit('Stored integrity mismatch: '+r['original'])
    if r.get('codec') not in (None,'zstd'):raise SystemExit('Unsupported codec: '+r['original'])
    key=(r['storedSha256'],r.get('codec'))
    if key not in cache:
        raw=subprocess.check_output(['zstd','-q','-d','-c',str(safe(package,r['path']))]) if r.get('codec')=='zstd' else stored
        if len(raw)!=r['bytes'] or sha(raw)!=r['sha256']:raise SystemExit('Original integrity mismatch: '+r['original'])
        cache[key]=raw
    raw=cache[key]
    if len(raw)!=r['bytes'] or sha(raw)!=r['sha256']:raise SystemExit('Original integrity mismatch: '+r['original'])
    dest=safe(cycle,r['original']);put(dest,raw)
    entry={'original':r['original'],'sha256':sha(raw),'bytes':len(raw),'staged':str(dest.relative_to(out))}
    executable=dest.suffix in ('.mjs','.py','.sh')
    disk_manifest=False
    if dest.suffix=='.json':
        try:disk_manifest=json.loads(raw).get('schema')=='cycle05-station-files@1'
        except (ValueError,AttributeError):pass
    if executable or disk_manifest:
        changed=raw.decode('utf-8').replace(old_cycle,str(cycle)).replace(old_repo,str(repo)).encode('utf-8')
        if changed!=raw:
            companion=dest.with_name(dest.stem+'-portable'+dest.suffix);put(companion,changed)
            entry.update(portable=str(companion.relative_to(out)),portableSha256=sha(changed),adaptation='separate path-only base replacement; original untouched; no inherited execution/equality claim')
    entries.append(entry)
receipt={'schema':'cycle05-portable-stage@1','phase':phase,'files':entries,'omitted':index['omitted'],'deferred':index['deferred'],'executed':'Only byte reads/zstd decompression/own file writes/symlink creation. No CV, producer, renderer, codec, PNG decode, fixture generator, solver, Git operation or scientific rerun.','limits':['Large Lenard original PNG/RGBA bodies are not package contents and are not reconstructed. Original-image proposal remains unexecuted/deferred.','Original exact manifests retain old absolute paths; use separately named portable manifest explicitly if a later producer is separately admitted. Portable scripts do not implicitly retarget references to portable manifests.','Historical state/registry is not current dispatch authority; one-shot output guards remain. Path changes have distinct hashes and do not preserve original execution-byte equality.']}
put(out/'stage-receipt.json',(json.dumps(receipt,indent=2)+'\n').encode())
print(json.dumps({'out':str(out),'cycle':str(cycle),'phase':phase,'restored':len(entries),'portableCompanions':sum('portable'in r for r in entries),'omitted':len(index['omitted']),'CVCalls':0},indent=2))
