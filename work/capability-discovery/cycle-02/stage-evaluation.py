"""Stage released C2 evaluation; path-only adapter binding, no candidate/fixture changes."""
from pathlib import Path
import argparse,hashlib,json,shutil
p=argparse.ArgumentParser();p.add_argument('--out',type=Path,required=True);a=p.parse_args()
package=Path(__file__).resolve().parent;repo=package.parents[2];out=a.out.resolve();sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
if out==repo or repo in out.parents or out.exists():raise SystemExit('Use a new scratch child directory outside checkout')
held=out/'discovery-cycle02/C2/heldout';run=out/'discovery-cycle02/C2/E307';held.mkdir(parents=True);run.mkdir(parents=True)
for name in ['generate.py','protocol.json','freeze-manifest.json','validation.json','inspection.json']:
 shutil.copyfile(package/'evidence/E305/heldout'/name,held/name)
for name in ['adapter.py','candidate-freeze.json','execution-protocol.json','report.py']:
 shutil.copyfile(package/'evidence/E307'/name,run/name)
expected=run/'expected';expected.mkdir()
for name in ['input-manifest.json','source-closure.json']:
 shutil.copyfile(package/'evidence/E307'/name,expected/name)
shutil.copytree(package/'evidence/E307/receipts',expected/'receipts')
manifest=package/'feature-manifest-E308.json'
assert sha(manifest)=='5b59dce1c7ae87f962c0305697ed883e423bd504fedce5851fb02242309dcf52'
m=json.loads(manifest.read_text());closure=json.loads((expected/'source-closure.json').read_text())
files={r['path']:r['sha256'] for r in m['files']+[m['existingGuard']]}
files.update({r['file']:r['sha256'] for r in closure['files']})
files['work/capability-discovery/cycle-02/feature-manifest-E308.json']=sha(manifest)
mirror=out/'checkout'
for rel,hash_ in files.items():
 source=package/'evidence/E307/source-docs/composition-README.md' if rel=='experiments/capability-discovery/composition/README.md' else repo/rel
 assert sha(source)==hash_,f'frozen source mismatch: {rel}'
 target=mirror/rel;target.parent.mkdir(parents=True,exist_ok=True);target.symlink_to(source)
original=run/'adapter.py';text=original.read_text();old="REPO=Path('/workspace/scratch/8528bb251845/chainspot-discovery-lab')"
assert text.count(old)==1;portable=run/'adapter-portable.py';portable.write_text(text.replace(old,'REPO=Path('+repr(str(mirror))+')'))
receipt={'schema':'released-evaluation-scratch-stage@1','directory':str(run),'candidateManifestSha256':sha(manifest),'originalAdapterSha256':sha(original),'portableAdapterSha256':sha(portable),'adaptation':'one REPO path literal only; portable adapter explicitly has a different source hash; no candidate, fixture, geometry, masking or measurement edits','sourceMirror':'exact frozen source symlinks plus exact E307 README snapshot; no provider/vendor duplicate','next':['python heldout/generate.py','python E307/adapter-portable.py','compare regenerated31frozenentries, input-manifest and source-closure','execute unchanged CLI per regenerated input-manifest; compare retained raw receipts'],'exposure':'all released C2 cases are exposed for future work'}
(out/'stage-receipt.json').write_text(json.dumps(receipt,indent=2)+'\n');print(run)
