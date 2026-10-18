from pathlib import Path
import json,hashlib,shutil,subprocess
root=Path(__file__).resolve().parent;work=root/'replay';C2=root.parents[1]/'C2';original=C2/'E307';repo=root.parents[2]/'chainspot-discovery-lab';sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
held=C2/'heldout';freeze=json.loads((held/'freeze-manifest.json').read_text());candidate=repo/'work/capability-discovery/cycle-02/feature-manifest-E308.json'
assert len(freeze['files'])==31 and sha(held/'freeze-manifest.json')=='ca6049549ab188fd879c5913d6df5cc5f9f299eb83ca6c9afe09b31a61130ac0'
assert sha(candidate)=='5b59dce1c7ae87f962c0305697ed883e423bd504fedce5851fb02242309dcf52'
cm=json.loads(candidate.read_text())
for e in cm['files']+[cm['existingGuard']]:assert sha(repo/e['path'])==e['sha256']
for e in freeze['files']:
 assert sha(held/e['file'])==e['sha256'];dest=work/'heldout'/e['file'];dest.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(held/e['file'],dest)
shutil.copyfile(held/'freeze-manifest.json',work/'heldout/freeze-manifest.json')
E=work/'E307';E.mkdir(exist_ok=True)
for f in ['adapter.py','report.py','execution-protocol.json']:shutil.copyfile(original/f,E/f)
ep=json.loads((E/'execution-protocol.json').read_text());assert sha(E/'adapter.py')==ep['adapterSha256'];assert sha(work/'heldout/protocol.json')==ep['frozenProtocolSha256']
logs=[]
def run(argv):
 p=subprocess.run(argv,capture_output=True,text=True);logs.append({'argv':list(map(str,argv)),'exitCode':p.returncode,'stdout':p.stdout,'stderr':p.stderr});assert p.returncode==0,p.stderr
run(['python',str(work/'heldout/generate.py'),str(work/'heldout/fixtures')])
for e in freeze['files']:assert sha(work/'heldout'/e['file'])==e['sha256']
run(['python',str(E/'adapter.py')])
for f in ['input-manifest.json','source-closure.json','candidate-freeze.json']:assert sha(E/f)==sha(original/f)
inputs=json.loads((E/'input-manifest.json').read_text())['inputs'];assert len(inputs)==7
for e in inputs:
 assert sha(E/e['inputFile'])==sha(original/e['inputFile'])==e['inputSha256']
 run(['node',str(E/'candidate/experiments/capability-discovery/composition/cli.mjs'),'--input',str(E/e['inputFile']),'--out',str(E/'receipts'/(e['id']+'.json')),'--inspect',str(E/'html'/(e['id']+'.html'))])
 for d,suffix in [('receipts','.json'),('html','.html')]:assert sha(E/d/(e['id']+suffix))==sha(original/d/(e['id']+suffix))
run(['python',str(E/'report.py')])
for f in ['measurements.json','evaluation.png','html-inspection.json']:assert sha(E/f)==sha(original/f)
for e in freeze['files']:assert sha(held/e['file'])==sha(work/'heldout'/e['file'])==e['sha256']
assert sha(candidate)==ep['candidateManifestSha256']
(root/'replay-execution.json').write_text(json.dumps({'status':'PASS','frozenEntriesVerified':31,'regeneratedFixtureFiles':27,'candidateManifestSha256':sha(candidate),'adapterHash':sha(E/'adapter.py'),'runs':logs,'byteIdentity':['all31frozen entries after generator','all7 adapted inputs','input-manifest.json','source-closure.json','candidate-freeze.json','all7receipt JSON','all7HTML','measurements.json','evaluation.png','html-inspection.json']},indent=2)+'\n')
print(json.dumps({'status':'PASS','actualCLIExecutions':7,'fixtureFilesRegenerated':27,'frozenEntriesVerified':31,'rawReceiptsByteIdentical':7,'htmlByteIdentical':7,'measurementsAndFigureByteIdentical':True}))
