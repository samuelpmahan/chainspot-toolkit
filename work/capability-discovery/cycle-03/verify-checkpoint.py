"""Read-only combined audited-package plus labelled post-review inventory verification."""
from pathlib import Path
import hashlib,json
package=Path(__file__).resolve().parent
repo=package.parents[2]
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
original=package/'package-manifest.json'
assert sha(original)=='ee6eec4517fad81de22fbf23b2691f4ac7138f2139d4b731e9e83f1d85787e7d'
base=json.loads(original.read_text());post_path=package/'post-review-manifest.json';post=json.loads(post_path.read_text())
assert post['auditedPackage']['sha256']==sha(original)
for e in base['files']+post['files']:assert sha(repo/e['path'])==e['sha256'],e['path']
expected={e['path']for e in base['files']+post['files']}|{str(original.relative_to(repo)),str(post_path.relative_to(repo))}
actual={str(p.relative_to(repo))for folder in [package,repo/'experiments/capability-discovery/source-pixels']for p in folder.rglob('*')if p.is_file()and'__pycache__'not in p.parts}
assert actual==expected,sorted(actual.symmetric_difference(expected))
prior=json.loads((package/'administration/prior-tracked-preservation.json').read_text());assert len(prior['files'])==1195
for e in prior['files']:assert sha(repo/e['path'])==e['sha256'],e['path']
candidate=json.loads((package/'evidence/E506/candidate-freeze.json').read_text())
for e in candidate['files']+candidate['retainedContractHistoryAndEvidence']+[candidate['acceptedRecipe']]:assert sha(repo/e['path'])==e['sha256'],e['path']
legacy=json.loads((repo/candidate['acceptedRecipe']['path']).read_text());entries=legacy['files']+[legacy['existingGuard']]+[{'path':'experiments/capability-discovery/probes/width/'+s['file'],'sha256':s['sha256']}for s in legacy['immutableSources']]
assert len(entries)==14
for e in entries:assert sha(repo/e['path'])==e['sha256'],e['path']
print(json.dumps({'schema':'cycle03-checkpoint-inventory-verification@1','auditedManifestSha256':sha(original),'auditedFiles':len(base['files']),'postReviewManifestSha256':sha(post_path),'separateAdministrativeFiles':len(post['files']),'totalNewCheckpointFilesIncludingManifests':len(expected),'priorTrackedFilesUnchanged':1195,'sourceHistoryEntriesUnchanged':23,'legacyEntriesUnchanged':14,'cvExecuted':False,'result':'combined exact inventories and preserved bytes verified'},indent=2))
