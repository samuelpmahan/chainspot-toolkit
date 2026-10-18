"""Read-only hash/scope verification for the exact cycle03 package; no CV execution."""
from pathlib import Path
import hashlib, json
package=Path(__file__).resolve().parent
repo=package.parents[2]
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
manifest_path=package/'package-manifest.json'
manifest=json.loads(manifest_path.read_text())
expected={e['path']:e['sha256'] for e in manifest['files']}
for name,digest in expected.items():
    if sha(repo/name)!=digest:raise SystemExit('Package file mismatch: '+name)
actual={str(p.relative_to(repo)) for folder in [package,repo/'experiments/capability-discovery/source-pixels'] for p in folder.rglob('*') if p.is_file() and p!=manifest_path and '__pycache__' not in p.parts}
if actual!=set(expected):raise SystemExit('Package scope mismatch: '+str(sorted(actual.symmetric_difference(expected))))
prior=json.loads((package/'administration/prior-tracked-preservation.json').read_text())
assert len(prior['files'])==prior['trackedFiles']==1195
for e in prior['files']:
    if sha(repo/e['path'])!=e['sha256']:raise SystemExit('Prior tracked bytes changed: '+e['path'])
candidate=package/'evidence/E506/candidate-freeze.json'
assert sha(candidate)=='d31b7a4312ac1bfc4f76bc96fc278f8acad4f49f4b04283df0faa8e6dce54626'
c=json.loads(candidate.read_text())
for e in c['files']+c['retainedContractHistoryAndEvidence']+[c['acceptedRecipe']]:
    assert sha(repo/e['path'])==e['sha256'],e['path']
legacy=json.loads((repo/c['acceptedRecipe']['path']).read_text())
entries=legacy['files']+[legacy['existingGuard']]+[{'path':'experiments/capability-discovery/probes/width/'+s['file'],'sha256':s['sha256']} for s in legacy['immutableSources']]
assert len(entries)==14
for e in entries:assert sha(repo/e['path'])==e['sha256'],e['path']
print(json.dumps({'schema':'cycle03-package-verification@1','packageManifestSha256':sha(manifest_path),'packageFiles':len(expected),'priorTrackedFilesUnchanged':1195,'candidateFreezeSha256':sha(candidate),'candidateSourceAndHistoryEntries':len(c['files'])+len(c['retainedContractHistoryAndEvidence']),'preservedRecipeEntries':len(entries),'cvExecuted':False,'result':'all exact package hashes/scope and preserved bytes verified'},indent=2))
