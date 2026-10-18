import json,subprocess,hashlib,struct
from pathlib import Path
D=Path('/workspace/scratch/8528bb251845/discovery-cycle03/D2/review-R501'); root=D.parents[2];repo=root/'chainspot-discovery-lab';target=root/'discovery-cycle03/D1'
def git(*args):return subprocess.check_output(['git','-C',str(repo),*args],stderr=subprocess.DEVNULL)
def sha(b):return hashlib.sha256(b).hexdigest()
s=json.loads((target/'source-inventory.json').read_text());t=json.loads((target/'testimony-coordinate-inventory.json').read_text());res=json.loads((target/'result.json').read_text());checks=[]
def ck(label,actual,expected):
 checks.append({'probe':label,'actual':actual,'expected':expected,'pass':actual==expected});assert actual==expected,label
for f in ['source-inventory.json','testimony-coordinate-inventory.json']:
 key={'source-inventory.json':'sourceInventory','testimony-coordinate-inventory.json':'testimonyCoordinateInventory'}[f];ck('result file binding '+f,sha((target/f).read_bytes()),res[key]['sha256'])
for row in s['identities']:
 for rec in [row,row.get('algorithmReferenceIdentity')]:
  if not isinstance(rec,dict):continue
  if 'ref'in rec:
   data=git('show',rec['ref']+':'+rec['path']);blob=git('rev-parse',rec['ref']+':'+rec['path']).decode().strip()
   ck('source sha '+rec['ref'][:7]+':'+rec['path'],sha(data),rec['sha256']);ck('source blob '+rec['ref'][:7]+':'+rec['path'],blob,rec['gitBlob'])
  else:
   ck('local sha '+rec['path'],sha((repo/rec['path']).read_bytes()),rec['sha256'])
for row in t['records']:
 rec=row['source'];data=git('show',rec['ref']+':'+rec['path']);ann=json.loads(data)
 ck('annotation sha '+rec['path'],sha(data),rec['sha256']);ck('annotation blob '+rec['path'],git('rev-parse',rec['ref']+':'+rec['path']).decode().strip(),rec['gitBlob']);ck('annotation dimensions/hash '+rec['path'],ann['sourceImage'],row['annotationSourceImage']);ck('annotation holes exact '+rec['path'],ann['holes'],row['holes'])
 ck('annotation does not provide badge centres '+rec['path'],all('badge' not in h for h in ann['holes']),True)
ref='49255331791b1245cf0f9cd699816175f94e70f2'
for course in ['heritage','lenard','townelake']:
 path='testimony/'+course+'/README.md';readme=git('show',ref+':'+path).decode();(D/(course+'-readme.txt')).write_text(readme)
# Verify just full image fixture identities and PNG IHDR; no CV decode or producer.
fix=json.loads((root/'discovery-cycle02/C2/fixture-availability.json').read_text())
ck('fixture manifest binding',sha((root/'discovery-cycle02/C2/fixture-availability.json').read_bytes()),s['fixtureInventorySource']['sha256'])
for rec in fix['records']:
 if not rec['path'].endswith('-full.png'):continue
 data=git('show',rec['ref']+':'+rec['path']);ck('PNG file hash '+rec['path'],sha(data),rec['sha256']);ck('PNG dimensions '+rec['path'],list(struct.unpack('>II',data[16:24])),rec['imageDimensionsPx'])
# Only two important historical references sampled, without execution.
for rec in [z['source']for z in s['historicalAlreadyExecutedActualImageEvidence'] if z['course']=='lenard']:
 data=git('show',rec['ref']+':'+rec['path']);ck('historical Lenard hash '+rec['path'],sha(data),rec['sha256'])
paths=git('ls-tree','-r','--name-only',ref).decode().splitlines()
ck('NorthPark testimony absence',any(p.startswith('testimony/north') for p in paths),False)
ck('Lenard zoom testimony absence',any(p.startswith('testimony/lenard/') and any('/Lenard-'+str(i) in p for i in range(1,6))for p in paths),False)
algorithm=res['exactReferences']['algorithm'];ck('algorithm corrected Heritage absence',subprocess.run(['git','-C',str(repo),'cat-file','-e',algorithm+':testimony/heritage/HeritagePark-full.corrected-2026-10-18.annotation.json'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode!=0,True)
# A coordinator supplied publication binding is labelled, never silently asserted locally proven.
available=subprocess.run(['git','-C',str(repo),'cat-file','-e',res['exactReferences']['labPublishedCoordinatorBinding']+'^{tree}'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode==0
report={'schema':'R501-audit-probes@1','checks':checks,'checkCount':len(checks),'allPass':all(c['pass']for c in checks),'publishedLabTreeLocallyAvailable':available,'algorithmExecutions':[],'notes':['Git byte/hash/ref and metadata reads only. No measurement producer or CV function executed.','Source identities checked only for listed inventory; not a re-mine. Four full PNG hashes/IHDRs and two historical Lenard receipts sampled.']}
(D/'probes.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({'allPass':report['allPass'],'checkCount':len(checks),'publishedTreeAvailable':available,'auditedFiles':{f:sha((target/f).read_bytes())for f in ['result.json','source-inventory.json','testimony-coordinate-inventory.json']},'probeSha256':sha((D/'probes.json').read_bytes())},indent=2))
