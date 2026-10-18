"""Read-only cycle05 byte/source/capture verification; no producer, CV, codec or renderer import."""
from pathlib import Path
import argparse, hashlib, json, subprocess
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--phase',choices=('initial','final'))
args=parser.parse_args()
package=Path(__file__).resolve().parent
repo=package.parents[2]
sha=lambda b:hashlib.sha256(b).hexdigest()
def safe(base,name):
    p=(base/name).resolve()
    if p==base or not p.is_relative_to(base):raise SystemExit('Unsafe indexed path: '+name)
    return p
phase=args.phase or ('final' if (package/'administration/capture-index-final.json').exists() else 'initial')
index=json.loads((package/('administration/capture-index-'+phase+'.json')).read_bytes())
cache={}
def original(r):
    p=safe(package,r['path']);stored=p.read_bytes()
    if len(stored)!=r['storedBytes'] or sha(stored)!=r['storedSha256']:raise SystemExit('Stored mismatch: '+r['original'])
    if r.get('codec') not in (None,'zstd'):raise SystemExit('Unsupported codec: '+r['original'])
    key=(r['storedSha256'],r.get('codec'))
    raw=cache.get(key)
    if raw is None:raw=subprocess.check_output(['zstd','-q','-d','-c',str(p)]) if r.get('codec')=='zstd' else stored
    if len(raw)!=r['bytes'] or sha(raw)!=r['sha256']:raise SystemExit('Original mismatch: '+r['original'])
    cache[key]=raw;return raw
by={r['original']:r for r in index['files']}
for r in index['files']:original(r)
prior=json.loads(original(by['F6/E1106/inventory.json']))
source=json.loads(original(by['F6/E1111/source-freeze.json']))
for r in prior['entries']+source['files']:
    b=safe(repo,r['path']).read_bytes()
    if len(b)!=r['bytes'] or sha(b)!=r['sha256']:raise SystemExit('Prior/source changed: '+r['path'])
payload=package/'package-manifest.json'
payload_count=None
if payload.exists():
    manifest=json.loads(payload.read_bytes())
    for r in manifest['files']:
        b=safe(repo,r['path']).read_bytes()
        if len(b)!=r['bytes'] or sha(b)!=r['sha256']:raise SystemExit('Payload mismatch: '+r['path'])
    payload_count=len(manifest['files'])
print(json.dumps({'phase':phase,'payloadFiles':payload_count,'capturedOriginals':len(index['files']),'uniqueOriginalIdentitiesVerified':len(cache),'omitted':len(index['omitted']),'deferred':len(index['deferred']),'priorTrackedExact':len(prior['entries']),'frozenSourceExact':len(source['files']),'CVCalls':0,'producerCalls':0,'rendererCalls':0,'science':'NOT_ASSESSED','note':'Hash identity only; no execution authentication, schema/scientific acceptance or source rerun.'},indent=2))
