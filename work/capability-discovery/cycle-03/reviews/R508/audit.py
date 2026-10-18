from pathlib import Path
import json, hashlib, math, subprocess
from PIL import Image
B=Path('/workspace/scratch/8528bb251845'); R=B/'chainspot-discovery-lab'; D=B/'discovery-cycle03/D3'; P=D/'E508'; O=B/'discovery-cycle03/V2'
sha=lambda b:hashlib.sha256(b).hexdigest()
load=lambda p:json.loads(p.read_text())
checks=[]
def check(name,actual,expected=True):
 ok=actual==expected
 checks.append({'name':name,'passed':ok,'actual':actual,'expected':expected})
 if not ok: raise AssertionError(name)
def h(p):return sha(p.read_bytes())
p=load(D/'protocol.json');res=load(P/'result.json'); cpath=R/'work/capability-discovery/cycle-03/evidence/E506/candidate-freeze.json';c=load(cpath)
check('reviewed E508 result SHA256',h(P/'result.json'),'fe72e28f57e94930a3d0385ed97608a4e7f97635857accaee73888b6c9881322')
check('candidate SHA256',h(cpath),'d31b7a4312ac1bfc4f76bc96fc278f8acad4f49f4b04283df0faa8e6dce54626')
check('protocol SHA256',h(D/'protocol.json'),'112693cce17cf30035191a6cded1829482a589bc19c3f6bbbb3320718c2c0ba2')
check('included frozen protocol byte identity',(D/'protocol.json').read_bytes()==(P/'frozen-protocol.json').read_bytes())
entries=c['files']+c['retainedContractHistoryAndEvidence'];check('adapter/history closure count',len(entries),23)
for e in entries:check('source/history closure: '+e['path'],h(R/e['path']),e['sha256'])
check('accepted recipe manifest hash',h(R/c['acceptedRecipe']['path']),c['acceptedRecipe']['sha256'])
recipe=load(R/c['acceptedRecipe']['path']); ee=recipe['files']+[recipe['existingGuard']]+[dict(path='experiments/capability-discovery/probes/width/'+e['file'],sha256=e['sha256']) for e in recipe['immutableSources']]
check('recipe closure count',len(ee),14)
for e in ee:check('recipe closure: '+e['path'],h(R/e['path']),e['sha256'])
for e in load(P/'file-manifest.json')['files']:
 check('packet hash: '+e['path'],h(P/e['path']),e['sha256']);check('packet size: '+e['path'],(P/e['path']).stat().st_size,e['bytes'])
source=D/'source/Lenard-full.png'; blob=subprocess.check_output(['git','-C',str(R),'show',p['source']['ref']+':'+p['source']['path']]);check('source bytes equal pinned platform git object',source.read_bytes()==blob)
gitblob=subprocess.check_output(['git','-C',str(R),'rev-parse',p['source']['ref']+':'+p['source']['path']],text=True).strip();check('source git blob',gitblob,p['source']['gitBlob'])
check('encoded source PNG hash',h(source),p['source']['pngSha256'])
im=Image.open(source).convert('RGBA'); check('full RGBA dimensions',list(im.size),[1290,2796]);check('full RGBA hash',sha(im.tobytes()),p['source']['rgbaSha256'])
roi=p['crop']; crop=im.crop((roi['xPx'],roi['yPx'],roi['exclusiveRightPx'],roi['exclusiveBottomPx']));native=Image.open(D/'Lenard-source-crop.png').convert('RGBA'); check('native declaration crop dimensions',list(native.size),[210,215]);check('crop native row bytes',crop.tobytes()==native.tobytes());check('crop RGBA hash',sha(crop.tobytes()),'c5a0a7061293db69fcf76844fc7c7c867bb6cd531a05e2bd2ca91597c3b58f5d')
rowchecks=[]
for y in range(215):rowchecks.append(crop.tobytes()[y*840:(y+1)*840]==im.tobytes()[((1795+y)*1290+180)*4:((1795+y)*1290+390)*4])
check('all 215 original RGBA rows equal native crop',all(rowchecks)); check('explicit no resize declaration',roi['resize'],False)
d=load(P/'trial/request-descriptor.json');g=d['geometry'];f=p['frame'];check('enabled caller request',d['enabled']);check('source frame',d['source']['frame'],f)
check('request ROI',d['roi'],dict(xPx=180,yPx=1795,widthPx=210,heightPx=215,frame=f+'.roi-180-1795-210-215'))
check('request geometry frame',g['frame'],f);check('geometry testimony',g['geometrySource'],p['geometrySource'])
check('training exact coordinates',g['training'],dict(frame=f,segments=[dict(tee=s['tee'],badge=s['badge']) for s in p['training']['segments']]))
check('stations exact supported fields',g['stations'],[{k:s[k] for k in ['id','frame','xPx','yPx','headingRad','t0Px','t1Px']} for s in p['stations']])
check('LOCAL bank exact',g['localWidthBank'],{k:p['localWidthBank'][k] for k in ['frame','scope','valuesPx']});check('empty mask unchanged',g['occluders'],dict(frame=f,boxes=[]));check('edge settings exact',g['edgeSearch'],dict(latLimPx=4,tolWidthPx=3))
for rel in ['staged-original-source.json','receipt.json','request-descriptor.json','identity-before.json','identity-after.json','run-binding.json']:
 check('fresh replay exact bytes: '+rel,(O/'replay'/rel).read_bytes()==(P/'trial'/rel).read_bytes())
check('copied caller exact',h(O/'caller/run-trial.mjs'),h(P/'run-trial.mjs'));check('copied shell exact',h(O/'caller/run.sh'),h(P/'run.sh'))
r=load(O/'replay/receipt.json');check('raw UNKNOWN',r['status'],'UNKNOWN');check('raw reason',r['reason'],'complete required sampling support absent in declared ROI');check('no CV operations',r['operationsExecuted'],[])
for key in ['composition','sourceComposition','equivalence','rawWidthEstimate','stations','execution']:check('absent measurement/control field '+key,key in r,False)
check('sensor radius',r['support']['sensorRadiusPx'],34);check('whole request has two training failures',r['support']['failures'],[dict(label='training[0].tee',minX=48,minY=-2,maxX=116,maxY=66),dict(label='training[0].badge',minX=11,minY=156,maxX=79,maxY=224)])
envs=[]
def add(label,x,y,radius):envs.append(dict(label=label,minX=x-180-radius,minY=y-1795-radius,maxX=x-180+radius,maxY=y-1795+radius))
radius=max(max(2*w/3,w/2+2.5)+4 for w in g['localWidthBank']['valuesPx'])
for j,s in enumerate(g['training']['segments']):
 for name in ['tee','badge']:add(f'training[{j}].{name}',s[name]['xPx'],s[name]['yPx'],radius)
for s in g['stations']:
 add('station:'+s['id']+':sensor',s['xPx'],s['yPx'],radius)
 for t in [s['t0Px'],s['t1Px']]:add('station:'+s['id']+':profile-window-end',s['xPx']+t*math.cos(s['headingRad']),s['yPx']+t*math.sin(s['headingRad']),30)
check('independent support envelope coordinates',envs,r['support']['envelopes']);check('strict envelope failures', [e for e in envs if not(e['minX']>1 and e['minY']>1 and e['maxX']<208 and e['maxY']<213)],r['support']['failures'])
resources=load(O/'replay/resources.json');check('fresh replay adapter count',resources['adapterCalls'],1);check('fresh replay composition count',resources['compositionCalls'],0);check('fresh replay CV count',resources['operationsExecuted'],0)
a=load(P/'analysis.json');expected=[(s['id'],w) for s in g['stations'] for w in g['localWidthBank']['valuesPx']];check('all 9 requested row identities',[(x['stationId'],x['widthArgPx']) for x in a['allRequestedRows']],expected);check('all requested rows nonexecuted',all(x['status']=='NOT_EXECUTED_SUPPORT_UNKNOWN' and all(x[k] is False for k in ['rawProfilePresent','rawObservationPresent','rawEdgeFitPresent','rawMidpointPresent']) for x in a['allRequestedRows']))
check('raw control absent treated as UNKNOWN',a['matchedOriginalCropControl']['status'],'UNKNOWN');check('analysis binds receipt',a['receiptSha256'],h(O/'replay/receipt.json'))
# Geometry-only possible read positions; no image values, learner, sensor, profile or fit operation is invoked.
nearest=[]
centers=[(s['xPx'],s['yPx'],s['headingRad']) for s in g['stations']]
s=g['training']['segments'][0];dx=s['badge']['xPx']-s['tee']['xPx'];dy=s['badge']['yPx']-s['tee']['yPx'];th=math.atan2(dy,dx)
centers += [(s['tee']['xPx']+dx*f,s['tee']['yPx']+dy*f,th) for f in [.2,.35,.5,.65,.78]]
for w in g['localWidthBank']['valuesPx']:
 offsets=[-2*w/3,2*w/3]+[sign*w/6+sub for sign in [-1,1] for sub in [-w/9,0,w/9]]+[-w/2+2.5,-w/2-2.5,w/2-2.5,w/2+2.5]
 for x,y,theta in centers:
  for n in offsets:
   for t in [-4,-2,0,2,4]:
    xx=x-math.sin(theta)*n+math.cos(theta)*t; yy=y+math.cos(theta)*n+math.sin(theta)*t
    nearest.append([math.floor(xx-180+.5),math.floor(yy-1795+.5)])
check('geometry-only nearest read reference count',len(nearest),1440);check('exact nearest geometry inside ROI',all(0<=x<210 and 0<=y<215 for x,y in nearest))
profile=[]
for s in g['stations']:
 for t in range(-12,12):
  for j in range(241):
   n=-30+j*.25; theta=s['headingRad'];xx=s['xPx']-180+t*math.cos(theta)-n*math.sin(theta);yy=s['yPx']-1795+t*math.sin(theta)+n*math.cos(theta)
   profile.append([xx,yy])
check('geometry-only profile reference count',len(profile),17352);check('exact profile geometry strict interior',all(1<x<208 and 1<y<213 for x,y in profile));check('profile bilinear taps inside ROI',all(0<=math.floor(x) and math.floor(x)+1<210 and 0<=math.floor(y) and math.floor(y)+1<215 for x,y in profile))
check('exposure note unchanged',h(P/'exposure-note.json'),h(D/'exposure-note.json'));check('exposure explicitly acknowledges prefreeze geometry', 'Before adapter candidate freeze' in load(P/'exposure-note.json')['disclosure'])
report=dict(schema='R508-independent-audit@1',job_id='R508',worker='V2',checks=checks,checkCount=len(checks),allPassed=all(c['passed'] for c in checks),replayResources=resources,geometryOnly=dict(nearestReferences=len(nearest),profileReferences=len(profile),nearestBounds=[min(p[0] for p in nearest),min(p[1] for p in nearest),max(p[0] for p in nearest),max(p[1] for p in nearest)],profileBounds=[min(p[0] for p in profile),min(p[1] for p in profile),max(p[0] for p in profile),max(p[1] for p in profile)],meaning='Static coordinate enumeration does not measure image values. Actual fixed sensor/learner/profile geometry can remain in-bounds while accepted isotropic endpoint envelope rejects. This does not override adapter abstention or execute any measurement.'),limits=['One independent unchanged adapter replay; no original output modified.','No crop enlargement, geometry/settings changes, full-source diagnostic, or direct CV invocation.','Crop byte checks independently derive the declared integer source crop; adapter itself returns before construction of crop.','No measurement, null-fit result, equivalence, width calibration, scientific acceptance or semantic identity is inferred.','Caller-selected exploratory declaration; prefreeze geometry disclosure retained.'])
(O/'audit.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(dict(checkCount=len(checks),allPassed=report['allPassed'],auditSha256=h(O/'audit.json'),receiptSha256=h(O/'replay/receipt.json'),geometryOnly=report['geometryOnly']),indent=2))
