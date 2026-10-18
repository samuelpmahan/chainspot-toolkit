from pathlib import Path
import json,hashlib,subprocess,math,csv,sys
from PIL import Image
D=Path(__file__).resolve().parent;B=D.parents[1];R=B.parent/'chainspot-discovery-lab';E=B/'V2/E511';old=B/'D3/E508';sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();load=lambda p:json.loads(p.read_text());checks=[]
def ck(name,condition):
 assert condition,name
 checks.append(name)
for mname in ['file-manifest.json','pre-run-manifest.json']:
 for x in load(E/mname)['files']:ck(mname+':'+x['path'],sha(E/x['path'])==x['sha256'] and (E/x['path']).stat().st_size==x['bytes'])
ck('result hash',sha(E/'result.json')=='5100f74afc640a9039f49c1a06f5ac15a0bb2b0f325d8cc7ae4f247154695df3')
ck('manifest hash',sha(E/'file-manifest.json')=='1d5d2a52ba18fae92f1d147de660e9ab0a0474ceda1f11c1efee9041cf5a5cbc')
p=load(E/'protocol.json');d=load(E/'request-descriptor.json');prior=load(old/'trial/request-descriptor.json');diff=[]
def delta(a,b,path=''):
 if isinstance(a,dict) and isinstance(b,dict):
  ck('same descriptor keys '+path,a.keys()==b.keys())
  for k in a:delta(a[k],b[k],path+'.'+k if path else k)
 elif a!=b:diff.append(dict(path=path,before=a,after=b))
delta(prior,d)
ck('exact five ROI deltas',diff==p['delta']['changedRequestFields'] and len(diff)==5 and all(x['path'].startswith('roi.')for x in diff))
ck('all other complete descriptor fields unchanged',{k:v for k,v in d.items()if k!='roi'}=={k:v for k,v in prior.items()if k!='roi'})
ck('geometry equals frozen protocol',d['geometry']==p['unchangedGeometry'])
for path,key in [(old/'result.json','resultSha256'),(old/'trial/request-descriptor.json','descriptorSha256'),(old/'trial/receipt.json','receiptSha256'),(B/'D3/protocol.json','protocolSha256')]:ck('original preserved '+str(path.relative_to(B)),sha(path)==p['prior'][key])
ck('R508 result exact',sha(B/'V2/result.json')=='897ad555a5417f7fefb8c1839faf8f66cd36d474b8aaa5c547411d6871ea9dae')
for folder in [old,B/'V2']:
 for entry in load(folder/'file-manifest.json')['files']:
  ck('old packet manifest '+str(folder.relative_to(B))+'/'+entry['path'],sha(folder/entry['path'])==entry['sha256'] and (folder/entry['path']).stat().st_size==entry['bytes'])
oldr=load(old/'trial/receipt.json');olda=load(old/'analysis.json')
ck('old support UNKNOWN zero operations',oldr['status']=='UNKNOWN' and oldr['operationsExecuted']==[] and 'composition'not in oldr)
ck('old nine NOT_EXECUTED rows',len(olda['allRequestedRows'])==9 and all(x['status']=='NOT_EXECUTED_SUPPORT_UNKNOWN' and x['rawEdgeFitPresent']is False for x in olda['allRequestedRows']))
# Directly check pinned closure, independently of caller-provided identity reports.
m=load(R/'work/capability-discovery/cycle-03/evidence/E506/candidate-freeze.json');candidate=m['files']+m['retainedContractHistoryAndEvidence'];lm=load(R/m['acceptedRecipe']['path']);legacy=lm['files']+[lm['existingGuard']]+[dict(path='experiments/capability-discovery/probes/width/'+x['file'],sha256=x['sha256'])for x in lm['immutableSources']]
ck('candidate count23',len(candidate)==23);ck('legacy count14',len(legacy)==14)
for x in candidate+[m['acceptedRecipe']]+legacy:ck('closure '+x['path'],sha(R/x['path'])==x['sha256'])
for x in ['identity-before.json','identity-after.json','input-binding.json','run-binding.json','receipt.json']:ck('byte-identical replay '+x,(D/'replay'/x).read_bytes()==(E/'trial'/x).read_bytes())
ck('pre/post identity exact',(D/'replay/identity-before.json').read_bytes()==(D/'replay/identity-after.json').read_bytes())
s=load(D/'staged-original-source.json');ck('staged exact hash',sha(D/'staged-original-source.json')==d['source']['stagedJsonSha256']);ck('staged original bytes exact',(D/'staged-original-source.json').read_bytes()==(B/'V2/replay/staged-original-source.json').read_bytes())
ck('PNG byte binding',sha(D/'Lenard-full.png')==d['source']['pngSha256']);commit='49255331791b1245cf0f9cd699816175f94e70f2';blob=subprocess.check_output(['git','-C',str(R),'rev-parse',commit+':specimens/dev/Lenard-full.png']).decode().strip();ck('Git source blob',blob=='6bb6db0704ba1697056afccb4c0a4ada0dbfa34e');ck('Git source bytes',subprocess.check_output(['git','-C',str(R),'cat-file','blob',blob])==(D/'Lenard-full.png').read_bytes())
im=Image.open(D/'Lenard-full.png');ck('native RGB dimensions',im.mode=='RGB' and im.size==(1290,2796));full=im.convert('RGBA').tobytes();ck('every full RGBA byte',full==bytes(s['image']['data']));ck('fullRGBA binding',hashlib.sha256(full).hexdigest()==d['source']['fullRgbaSha256']);ck('alpha255',all(full[x]==255 for x in range(3,len(full),4)))
context=Image.open(B/'D3/Lenard-source-crop.png').convert('RGBA');rows=b''.join(full[((1795+y)*1290+180)*4:((1795+y)*1290+390)*4]for y in range(215));ck('display crop exact native rows',context.size==(210,215)and context.tobytes()==rows)
r=load(D/'replay/receipt.json');a=load(D/'analysis.json');oa=load(E/'analysis.json');ck('analysis scientific fields exact',{k:v for k,v in a.items()if k!='resources'}=={k:v for k,v in oa.items()if k!='resources'});ck('CSV exact',(D/'all-nine-candidates.csv').read_bytes()==(E/'all-nine-candidates.csv').read_bytes());ck('figure exact',(D/'Lenard-E511-actual.png').read_bytes()==(E/'Lenard-E511-actual.png').read_bytes())
ck('two compositions66ops',r['execution']==dict(compositionCalls=2,order=['crop','original-source-frame'],cropOperationCount=33,sourceOperationCount=33)and len(r['operationsExecuted'])==66)
ck('supported',r['support']['status']=='SUPPORTED_CONSERVATIVE_ENVELOPE');ck('zero transform',r['provenance']['transform']['originalToCrop']==dict(xPx=0,yPx=0));ck('full crop sameRGBA',r['provenance']['fullRgbaSha256']==r['provenance']['cropRgbaSha256']==d['source']['fullRgbaSha256']);ck('fixed numeric control',r['equivalence']['status']=='MATCHED_DECLARED_CONTROL'and r['equivalence']['absoluteTolerance']==1e-9 and r['equivalence']['differences']==[])
for x in [r,r['composition'],r['sourceComposition']]:ck('UNKNOWN and no promotion '+x['schema'],x['localWidth']['status']=='UNKNOWN'and x['semanticIdentity']['status']=='UNKNOWN'and x['promoted']is False)
flat=[]
for c,ss in zip(r['composition']['stations'],r['sourceComposition']['stations']):
 ck('source/crop station raw fields exact excluding declared frame '+c['id'],{k:v for k,v in c.items()if k!='frame'}=={k:v for k,v in ss.items()if k!='frame'});ck('profile offsets/counts '+c['id'],len(c['profile']['offsetsPx'])==241 and c['profile']['stationCount']==24 and all(x==24 for x in c['profile']['visibleStationCounts']))
 ck('exact bank '+c['id'],[x['widthArgPx']for x in c['candidates']]==[29,37,45])
 for x in c['candidates']:
  ck('same receipt row '+c['id']+str(x['widthArgPx']),dict(stationId=c['id'],**x)==a['allRequestedRows'][len(flat)])
  ck('finite fit or explicit null '+str(len(flat)),x['edgeFit']is None or all(math.isfinite(x['edgeFit'][k])for k in ['lPx','rPx','cPx','wPx','score','gl','gr']))
  flat.append(dict(stationId=c['id'],widthArgPx=x['widthArgPx'],combined=x['observation']['score'],edgeFit=x['edgeFit'],midpoint=x['midpoint']))
ck('six fits three nulls',sum(x['edgeFit']is not None for x in flat)==6 and sum(x['edgeFit']is None for x in flat)==3)
ck('bright patch37/45 fits combined0',all(x['edgeFit']is not None and x['combined']==0 for x in flat if x['stationId']=='bright-patch'and x['widthArgPx']in [37,45]))
contrast=next(x for x in a['midpointContrasts']if x['widthArgPx']==37);ck('37 same edge+16 expectation fails',contrast['offsetMinusPrimaryCandidateCenterMinusFitMidpointPx']==-1.2444566538696602)
ck('all learner rows exact',a['rawLearner']==r['composition']['rawWidthEstimate']==r['sourceComposition']['rawWidthEstimate']and a['rawLearner']['widthPx']==37 and len(a['rawLearner']['scores'])==3)
nonfinite=[]
def walk(x,path='root'):
 if isinstance(x,dict):
  if x.get('numberKind')=='nonfinite':nonfinite.append(dict(path=path,value=x['value']))
  for k,v in x.items():walk(v,path+'.'+k)
 elif isinstance(x,list):
  for i,v in enumerate(x):walk(v,path+'['+str(i)+']')
walk(r)
files=[E/'run.sh',E/'run-diagnostic.mjs',E/'analyze-render.py',R/'experiments/capability-discovery/source-pixels/stage-png.py',R/'experiments/capability-discovery/source-pixels/adapter.mjs',R/'experiments/capability-discovery/composition/recipe.mjs']
report=dict(schema='R511-independent-audit@1',checks=checks,checkCount=len(checks),passed=True,exactFiveChanges=diff,allNineRows=flat,rawLearner=a['rawLearner'],midpoint37Contrast=contrast,nonfiniteEncodings=nonfinite,receiptSha256=sha(D/'replay/receipt.json'),completeRequestJsonSha256=load(D/'replay/run-binding.json')['completeRequestJsonSha256'],sourceStagedSha256=sha(D/'staged-original-source.json'),sourcePngSha256=sha(D/'Lenard-full.png'),fullRgbaSha256=hashlib.sha256(full).hexdigest(),figureSha256=sha(D/'Lenard-E511-actual.png'),codeHashes=[dict(path=str(x),sha256=sha(x))for x in files],resourceFieldsExcludedFromDeterministicEquality=True,administrativeTypos='Pre-freeze helper source-path typo is producer testimony only; raw traceback not retained. Root independently confirmed absence. Retained render-initial-error.log shows duplicate score-key TypeError outside CV.',reviewerStagingCorrection='Initial reviewer staging used a guessed imageId and produced staged SHA eedaaf96ef70a96aa76c33ee699a8115d49487ad35b71e9d5c5bbb93e736feef. Detected before any adapter call; retained as initial-staging-wrong-image-id.json, restaged with exact Lenard-full imageId. One adapter replay only.')
(D/'audit.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(dict(checkCount=len(checks),passed=True,receiptSha256=report['receiptSha256'],completeRequestJsonSha256=report['completeRequestJsonSha256'],nonfiniteCount=len(nonfinite)),indent=2))
