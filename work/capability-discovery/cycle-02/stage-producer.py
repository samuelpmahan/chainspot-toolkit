"""Stage exact retained producers in scratch; never rewrite preserved source/evidence."""
from pathlib import Path
import argparse,hashlib,json,shutil
p=argparse.ArgumentParser();p.add_argument('--job',choices=['E301','E302','E303','E304','E309'],required=True);p.add_argument('--out',type=Path,required=True);p.add_argument('--source-jpeg',type=Path);a=p.parse_args()
package=Path(__file__).resolve().parent;repo=package.parents[2];out=a.out.resolve();sha=lambda b:hashlib.sha256(b).hexdigest()
if out==repo or repo in out.parents:raise SystemExit('Use a fresh scratch directory outside the checkout')
if out.exists():raise SystemExit('Output must not exist; use a new scratch child directory')
worker={'E301':'C1','E302':'C3','E303':'C5','E304':'C4','E309':'C1/E309'}[a.job];dest=out/'discovery-cycle02'/worker;dest.mkdir(parents=True)
files={'E301':['counterfactual.mjs','protocol.json','s5-row.json','render.py'],'E302':['probe.mjs','protocol.json','provenance.json','render.py'],'E303':['probe.mjs','protocol.json','verify.mjs','source/provenance.json'],'E304':['prepare.py','probe.mjs','protocol.json','protocol.sha256','render.py'],'E309':['probe.mjs','protocol.json','summarize.py','original-provenance.json']}[a.job]
records=[]
for name in files:
 source=package/'evidence'/a.job/name;target=dest/name;target.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(source,target)
 records.append({'file':name,'sha256':sha(target.read_bytes()),'adaptation':'none; producer/protocol bytes identical'})
width=repo/'experiments/capability-discovery/probes/width'
if a.job=='E301':
 if not a.source_jpeg or not a.source_jpeg.is_file():raise SystemExit('E301 requires --source-jpeg PATH for exact original IMG_5641.jpg; see REPRODUCE.md')
 if sha(a.source_jpeg.read_bytes())!='e6616738640eee1d05d8cc2b59dd657f24b4a5a01dc2f68571b7e44c6f372b8a':raise SystemExit('Original JPEG SHA256 mismatch')
 provider=dest/'provider';provider.mkdir()
 for source in sorted((repo/'source/provider').rglob('*')):
  if source.is_file():
   target=provider/source.relative_to(repo/'source/provider');target.parent.mkdir(parents=True,exist_ok=True);target.symlink_to(source)
 target=provider/'artifacts/replay/source/IMG_5641.jpg';target.parent.mkdir(parents=True,exist_ok=True)
 if target.exists() or target.is_symlink():target.unlink()
 target.symlink_to(a.source_jpeg.resolve())
 prior=out/'discovery-swarm/W2';prior.mkdir(parents=True)
 for name in ['baseline-native.json','heading-native.json']:shutil.copyfile(repo/'experiments/capability-discovery/evidence/replay/input'/name,prior/name)
elif a.job in ['E302','E309']:(dest/'vendor').symlink_to(width/'vendor',target_is_directory=True)
elif a.job=='E303':(dest/'source/vendor').symlink_to(width/'vendor',target_is_directory=True)
else:
 for source in json.loads((dest/'protocol.json').read_text())['sources']:
  original=repo/source['sourcePath']
  if sha(original.read_bytes())!=source['sha256']:raise SystemExit('Frozen E304 source hash mismatch')
  target=dest/source['file'];target.parent.mkdir(parents=True,exist_ok=True);target.symlink_to(original)
expected=dest/'expected';expected.mkdir()
name={'E301':'native-receipt.json','E302':'receipt.json','E303':'measurements.json','E304':'measurements.json','E309':'receipt.json'}[a.job]
shutil.copyfile(package/'evidence'/a.job/name,expected/name)
receipt={'schema':'exact-producer-scratch-stage@1','job':a.job,'producerDirectory':str(dest),'files':records,'sourceMapping':'absolute symlinks to exact existing checkout sources; no producer path/string adaptations','expectedOutput':name,'limits':'C1 executionUtc may change; Node/runtime/decoder dependencies remain external prerequisites. Staging is not replay verification.'}
(out/'stage-receipt.json').write_text(json.dumps(receipt,indent=2)+'\n');print(dest)
