from pathlib import Path
import json,hashlib,shutil,subprocess
W=Path('/workspace/scratch/8528bb251845');O=W/'discovery-cycle03/V3';D=W/'discovery-cycle03/D4';E=D/'E509';sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
out={'schema':'R509-independent-raw-audit@1','scoresSource':'Exact replay receipt fields only; no image score/fitting recomputation. Arithmetic midpoint deltas only.','courses':[]}
for n in ['NorthPark-full','TowneLake-full']:
 r=json.loads((O/(n+'.receipt.json')).read_text());src=r['sourceComposition'];rows=[]
 for s in src['stations']:
  for c in s['candidates']:
   rows.append({'stationId':s['id'],**c})
 shifts=[]
 for a,b in zip(src['stations'][0]['candidates'],src['stations'][1]['candidates']):
  valid=all(c['midpoint']['status']=='OBSERVED_CHANNELS' for c in [a,b]);delta=b['midpoint']['candidateCenterMinusFitMidpointPx']-a['midpoint']['candidateCenterMinusFitMidpointPx'] if valid else None
  shifts.append({'widthArgPx':a['widthArgPx'],'expectedConditionalSameEdgesDeltaPx':12,'rawObservedDeltaPx':delta,'rawResidualPx':None if delta is None else delta-12})
 rec={'imageId':n,'receiptSha256':sha(O/(n+'.receipt.json')),'rawLearner':src['rawWidthEstimate'],'allNineRawRows':rows,'matchedControlDeltas':shifts,'localWidth':r['localWidth'],'semanticIdentity':r['semanticIdentity'],'equivalence':r['equivalence']}
 out['courses'].append(rec)
 print(n,'learner',src['rawWidthEstimate']['widthPx'],'scores',[(x['widthPx'],x['meanScore']) for x in src['rawWidthEstimate']['scores']]);print('shifts',shifts)
 if n=='NorthPark-full':
  assert all(x['meanScore']==0 for x in src['rawWidthEstimate']['scores']);assert src['rawWidthEstimate']['widthPx']==32
  assert all(x['observation']['score']==0 for s in src['stations'][:2] for x in s['candidates']);assert all(x['edgeFit'] is not None for x in src['stations'][2]['candidates'])
  assert shifts[0]['rawObservedDeltaPx'] is None;assert abs(shifts[1]['rawObservedDeltaPx']-12)<1e-9;assert abs(shifts[2]['rawObservedDeltaPx']-2.637145864441105)<1e-6
 else:
  top=max(src['stations'][0]['candidates'],key=lambda x:x['observation']['score']);assert top['widthArgPx']==37 and abs(top['observation']['score']-.765926)<1e-6;assert abs(top['edgeFit']['wPx']-36.8165)<.001
  assert all(x['observation']['score']==0 and x['edgeFit'] is not None for x in src['stations'][1]['candidates']);assert all(x['edgeFit'] is None and x['midpoint']['status']=='UNKNOWN' for x in src['stations'][2]['candidates'])
(O/'independent-raw-audit.json').write_text(json.dumps(out,indent=2)+'\n')
# Retained renderer replay: same code and receipts, own output paths only.
p=O/'renderer-replay';q=p/'E509';q.mkdir(parents=True,exist_ok=True)
for f in ['protocol.json','NorthPark-full.source-crop.png','TowneLake-full.source-crop.png']:shutil.copyfile(D/f,p/f)
for f in ['analyze-render.py','NorthPark-full.receipt.json','TowneLake-full.receipt.json','NorthPark-full.run-sidecar.json','TowneLake-full.run-sidecar.json','NorthPark-full.request-descriptor.json','TowneLake-full.request-descriptor.json']:shutil.copyfile(E/f,q/f)
subprocess.run(['python',str(q/'analyze-render.py')],check=True)
checks=[]
for f in ['analysis.json','NorthPark-full.actual-scientific.png','TowneLake-full.actual-scientific.png']:
 checks.append({'path':f,'retainedSha256':sha(E/f),'replaySha256':sha(q/f),'exactBytes':(E/f).read_bytes()==(q/f).read_bytes()})
 assert checks[-1]['exactBytes'],f
(O/'renderer-replay.json').write_text(json.dumps({'rendererSha256':sha(q/'analyze-render.py'),'noCvRecompute':True,'checks':checks},indent=2)+'\n')
print('Independent18 raw rows and exact renderer outputs verified')
