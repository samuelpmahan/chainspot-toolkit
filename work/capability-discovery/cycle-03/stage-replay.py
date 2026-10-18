"""Recreate historical worker paths in fresh scratch; path-only edits, no CV execution."""
from pathlib import Path
import argparse, hashlib, json, shutil, subprocess
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--out', type=Path, required=True)
parser.add_argument('--with-source-images', action='store_true', help='Extract exact pinned Git blobs into scratch; never fetch')
args=parser.parse_args()
package=Path(__file__).resolve().parent
repo=package.parents[2]
out=args.out.resolve()
if out.exists() or out==repo or repo in out.parents:
    raise SystemExit('Use a fresh scratch directory outside the checkout')
sha=lambda b:hashlib.sha256(b).hexdigest()
records={}
for manifest in sorted((package/'administration').glob('capture-manifest-*.json')):
    for record in json.loads(manifest.read_text())['files']:
        key=record['original']
        if key in records and records[key]['sha256']!=record['sha256']:
            raise SystemExit('Conflicting exact historical copies: '+key)
        records[key]=record
out.mkdir(parents=True)
(out/'chainspot-discovery-lab').symlink_to(repo, target_is_directory=True)
cycle=out/'discovery-cycle03'
cycle.mkdir()
old_cycle='/workspace/scratch/8528bb251845/discovery-cycle03'
old_repo='/workspace/scratch/8528bb251845/chainspot-discovery-lab'
adaptations=[]
for name,record in sorted(records.items()):
    source=repo/record['path']
    original=source.read_bytes()
    if sha(original)!=record['sha256']:
        raise SystemExit('Captured artifact mismatch: '+record['path'])
    target=cycle/name
    target.parent.mkdir(parents=True,exist_ok=True)
    data=original
    # Only executable callers and a renderer's path pin get path relocation.
    # Declaration/protocol/manifests and measured receipts remain exact bytes.
    if target.suffix in ('.py','.mjs','.sh') or name=='seam-figure-input.json':
        relocated=original.decode().replace(old_cycle,str(cycle)).replace(old_repo,str(repo))
        if target.suffix in ('.py','.mjs','.sh'):
            relocated=relocated.replace(str(cycle)+'/seam-figure-input.json',str(cycle)+'/seam-figure-input-portable.json')
        data=relocated.encode()
    # Keep each hashed original at its original filename, including frozen helper code.
    target.write_bytes(original)
    entry={'original':record['path'],'staged':str(target.relative_to(out)),
           'originalSha256':sha(original),'stagedSha256':sha(original),'adaptation':'none; exact bytes'}
    if data!=original or name=='seam-figure-input.json':
        portable=target.with_name(target.stem+'-portable'+target.suffix)
        portable.write_bytes(data)
        entry.update({'portablePath':str(portable.relative_to(out)),'portableSha256':sha(data),
                      'adaptation':'original preserved; separate companion changes path literals only'})
    adaptations.append(entry)
if args.with_source_images:
    for item in json.loads((package/'source-manifest.json').read_text())['sourceImages']:
        try:
            encoded=subprocess.check_output(['git','cat-file','blob',item['gitBlob']],cwd=repo)
        except subprocess.CalledProcessError as error:
            raise SystemExit('Pinned source object unavailable locally; obtain exact platform source object through authorized route: '+item['gitBlob']) from error
        if sha(encoded)!=item['pngSha256']:
            raise SystemExit('Pinned source PNG integrity mismatch: '+item['imageId'])
        target=cycle/item['scratchRelativePath']
        target.parent.mkdir(parents=True,exist_ok=True)
        target.write_bytes(encoded)
        adaptations.append({'staged':str(target.relative_to(out)),'sha256':sha(encoded),'gitBlob':item['gitBlob'],'adaptation':'exact external platform blob materialized to scratch only'})
receipt={'schema':'cycle03-portable-scratch-stage@1','repo':str(repo),'scratch':str(out),
         'files':adaptations,'executed':'No producers, CV, renderers, native solver, Git fetch/commit/push or scientific reruns executed.',
         'limits':['Frozen declarations, geometry, parameters, sources and receipts remain unchanged; only caller path strings relocated in scratch.',
                   'Use the separately named portable companion when recorded; frozen originals keep exact hashes and closure checks. Relocated caller hashes remain separately identified.',
                   'Wall time, process resources, output argv paths and run timestamps change; compare actual channel/support/provenance and exact hashes at their stated scope.',
                   'Captured native state is historical; stage does not start or reconcile any allocator.']}
(out/'stage-receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(cycle)
