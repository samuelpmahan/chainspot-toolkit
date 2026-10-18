from pathlib import Path
import json,hashlib,sys
repo=Path(sys.argv[1]);proto=Path(sys.argv[2]);out=Path(sys.argv[3]);sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
manifest=repo/'work/capability-discovery/cycle-03/evidence/E506/candidate-freeze.json';assert sha(manifest)=='d31b7a4312ac1bfc4f76bc96fc278f8acad4f49f4b04283df0faa8e6dce54626';assert sha(proto)=='ee4ac0852dfe1838c3d637ff967b65918ca9bb077ab9f1a6b2df9763ec3e916a'
m=json.loads(manifest.read_text());entries=m['files']+m['retainedContractHistoryAndEvidence'];rec=[]
for x in entries:actual=sha(repo/x['path']);assert actual==x['sha256'],x['path'];rec.append({'path':x['path'],'sha256':actual})
legacy=repo/'work/capability-discovery/cycle-02/feature-manifest-E308.json';assert sha(legacy)=='5b59dce1c7ae87f962c0305697ed883e423bd504fedce5851fb02242309dcf52';l=json.loads(legacy.read_text());le=l['files']+[l['existingGuard']]+[{'path':'experiments/capability-discovery/probes/width/'+x['file'],'sha256':x['sha256']}for x in l['immutableSources']]
for x in le:assert sha(repo/x['path'])==x['sha256'],x['path']
out.write_text(json.dumps({'candidateManifestSha256':sha(manifest),'protocolSha256':sha(proto),'candidateEntriesVerified':rec,'legacyManifestSha256':sha(legacy),'legacyEntriesVerified':le},indent=2)+'\n');print(json.dumps({'candidateEntries':len(rec),'legacyEntries':len(le),'receiptSha256':sha(out)}))
