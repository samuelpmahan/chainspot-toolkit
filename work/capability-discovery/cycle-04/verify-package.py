"""Read-only package/source integrity and receipt-shape audit; no CV or scientific verdict."""
from pathlib import Path
import hashlib,json,subprocess
package=Path(__file__).resolve().parent
repo=package.parents[2]
sha=lambda b:hashlib.sha256(b).hexdigest()
m=json.loads((package/'package-manifest.json').read_text())
for r in m['files']:
    b=(repo/r['path']).read_bytes()
    if len(b)!=r['bytes'] or sha(b)!=r['sha256']: raise SystemExit('Package mismatch: '+r['path'])
capture=json.loads((package/'administration/capture-index.json').read_text())
for r in capture['files']:
    b=(package/r['path']).read_bytes()
    if r.get('codec')=='zstd':
        if len(b)!=r['storedBytes'] or sha(b)!=r['storedSha256']: raise SystemExit('Compressed mismatch: '+r['original'])
        b=subprocess.check_output(['zstd','-q','-d','-c',str(package/r['path'])])
    if len(b)!=r['bytes'] or sha(b)!=r['sha256']: raise SystemExit('Captured mismatch: '+r['original'])
by={r['original']:r for r in capture['files']}
def read(name):
    r=by[name]
    b=subprocess.check_output(['zstd','-q','-d','-c',str(package/r['path'])]) if r.get('codec')=='zstd' else (package/r['path']).read_bytes()
    return json.loads(b)
prior=read('prior-tracked.json')
for r in prior['files']:
    b=(repo/r['path']).read_bytes()
    if len(b)!=r['bytes'] or sha(b)!=r['sha256']: raise SystemExit('Prior changed: '+r['path'])
counts={}
for key in ('P3/E809/receipt.json','P5/E810/receipt.json','P2/E811/receipt-A.json','P2/E811/receipt-B.json'):
    r=read(key);counts[key]={'status':r['status'],'recipeCalls':r.get('execution',{}).get('compositionCalls',0),'hasCrop':'composition'in r,'hasSource':'sourceComposition'in r,'candidateRows':sum(len(s['candidates'])for branch in ('composition','sourceComposition')for s in r.get(branch,{}).get('stations',[]))}
print(json.dumps({'packageFiles':len(m['files']),'capturedOriginals':len(capture['files']),'priorTrackedExact':len(prior['files']),'receiptShapes':counts,'CVCalls':0,'science':'NOT_ASSESSED'},indent=2))
