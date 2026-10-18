from pathlib import Path
import json,hashlib,subprocess,sys
from PIL import Image
W=Path('/workspace/scratch/8528bb251845'); O=W/'discovery-cycle03/V3'; R=W/'chainspot-discovery-lab'; D=W/'discovery-cycle03/D4'; E=D/'E509'
sha=lambda b:hashlib.sha256(b).hexdigest()
load=lambda p:json.loads(p.read_text())
checks=[]
def check(name,ok,**details):
 checks.append(dict(check=name,passed=bool(ok),**details)); assert ok,name
phase=sys.argv[1]
check('E509 result immutable',sha((E/'result.json').read_bytes())=='31ccf9d738033c8a113246bb16bdf2922488e5e85d068aa9b6b160b52f7ed041')
check('artifact manifest immutable',sha((E/'artifact-manifest.json').read_bytes())=='c2a68be74c3040adc17628f35eee180523b4918a7f9526620bbbf70d30dbca43')
check('protocol immutable',sha((D/'protocol.json').read_bytes())=='56fdd556f4ed53599de93cadb35c85d453df4edde26f0d00a087d4d4282c65f2')
freeze=R/'work/capability-discovery/cycle-03/evidence/E506/candidate-freeze.json';m=load(freeze)
check('candidate freeze immutable',sha(freeze.read_bytes())=='d31b7a4312ac1bfc4f76bc96fc278f8acad4f49f4b04283df0faa8e6dce54626')
lp=R/m['acceptedRecipe']['path'];check('legacy manifest immutable',sha(lp.read_bytes())==m['acceptedRecipe']['sha256']);l=load(lp)
candidate=m['files']+m['retainedContractHistoryAndEvidence'];legacy=l['files']+[l['existingGuard']]+[dict(path='experiments/capability-discovery/probes/width/'+x['file'],sha256=x['sha256']) for x in l['immutableSources']]
check('closure counts',len(candidate)==23 and len(legacy)==14)
for e in candidate+legacy:check('frozen closure '+e['path'],sha((R/e['path']).read_bytes())==e['sha256'],sha256=e['sha256'])
for e in load(E/'artifact-manifest.json')['files']:check('retained artifact '+e['path'],sha((E/e['path']).read_bytes())==e['sha256'] and (E/e['path']).stat().st_size==e['bytes'],sha256=e['sha256'])
check('technical R506 accepted',load(W/'discovery-cycle03/D5/review-R506/result.json')['decision']=='accepted')
for c in load(D/'protocol.json')['cases']:
 n=c['imageId'];s=c['source'];png=(D/(n+'.png')).read_bytes();original=subprocess.check_output(['git','-C',str(R),'show',s['gitRef']+':'+s['path']]);blob=subprocess.check_output(['git','-C',str(R),'rev-parse',s['gitRef']+':'+s['path']],text=True).strip()
 check(n+' original platform git PNG bytes',png==original and sha(png)==s['pngSha256'] and blob==s['gitBlob'],sha256=sha(png),gitBlob=blob)
 image=Image.open(D/(n+'.png')).convert('RGBA');raw=image.tobytes();roi=c['sourceCrop'];box=(roi['xPx'],roi['yPx'],roi['xPx']+roi['widthPx'],roi['yPx']+roi['heightPx']);crop=image.crop(box).tobytes();retainedcrop=Image.open(D/(n+'.source-crop.png')).convert('RGBA').tobytes()
 check(n+' exact full RGBA bytes',sha(raw)==s['rgbaSha256'],sha256=sha(raw));check(n+' exact crop RGBA bytes',crop==retainedcrop and sha(crop)==roi['rgbaSha256'],sha256=sha(crop))
 g={'frame':c['frame'],'geometrySource':json.dumps(c['geometryProvenance'],sort_keys=True),'training':{'frame':c['training']['frame'],'segments':[{'tee':x['tee'],'badge':x['badge']} for x in c['training']['segments']]},'stations':[{k:x[k] for k in ['id','frame','xPx','yPx','headingRad','t0Px','t1Px']} for x in c['stations']],'localWidthBank':{k:c['localWidthBank'][k] for k in ['frame','scope','valuesPx']},'occluders':{'frame':c['occluders']['frame'],'boxes':c['occluders']['boxes']},'edgeSearch':c['edgeSearch']}
 expected={'enabled':True,'roi':{**{k:roi[k] for k in ['xPx','yPx','widthPx','heightPx']},'frame':c['frame']+':frozen-integer-roi'},'geometry':g}
 check(n+' exact declaration mapping no tuning',load(E/(n+'.request-descriptor.json'))==expected)
 if phase=='after':
  old=(E/(n+'.receipt.json')).read_bytes();new=(O/(n+'.receipt.json')).read_bytes();a=load(E/(n+'.receipt.json'));b=load(O/(n+'.receipt.json'))
  check(n+' replay receipt exact bytes',old==new,expectedSha256=sha(old),actualSha256=sha(new));check(n+' full parsed raw receipts equal',a==b)
  check(n+' staged source exact bytes',(E/(n+'.staged-source.json')).read_bytes()==(O/(n+'.staged-source.json')).read_bytes(),sha256=sha((O/(n+'.staged-source.json')).read_bytes()))
  check(n+' two unchanged composition calls',b['execution']=={'compositionCalls':2,'order':['crop','original-source-frame'],'cropOperationCount':33,'sourceOperationCount':33})
  check(n+' fixed numeric equivalence only',b['equivalence']['status']=='MATCHED_DECLARED_CONTROL' and b['equivalence']['absoluteTolerance']==1e-9 and b['equivalence']['differences']==[])
  check(n+' UNKNOWN identities calibration',b['semanticIdentity']['status']=='UNKNOWN' and b['localWidth']['status']=='UNKNOWN' and b['promoted']==False)
  for channel in ['composition','sourceComposition']:
   check(n+' '+channel+' all9 raw rows',len(b[channel]['stations'])==3 and all(len(x['candidates'])==3 for x in b[channel]['stations']))
   check(n+' '+channel+' full visibility',all(x['profile']['stationCount']==36 and set(x['profile']['visibleStationCounts'])=={36} for x in b[channel]['stations']))
(O/('audit-'+phase+'.json')).write_text(json.dumps({'phase':phase,'checks':checks,'allPassed':all(x['passed'] for x in checks)},indent=2)+'\n')
print(phase,len(checks),'checks passed')
