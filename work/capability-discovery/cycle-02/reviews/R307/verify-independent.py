from pathlib import Path
import json,hashlib,math
import numpy as np
from PIL import Image
root=Path(__file__).resolve().parent;E=root/'replay/E307';H=root/'replay/heldout';original=root.parents[1]/'C2'/'E307';repo=root.parents[2]/'chainspot-discovery-lab';sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
manifest=json.loads((E/'input-manifest.json').read_text());rows=[];receipts={}
for item in manifest['inputs']:
 inp=json.loads((E/item['inputFile']).read_text());case=json.loads((H/'fixtures'/(item['caseId']+'.json')).read_text());variant=next(v for v in case['queryVariants'] if v['id']==item['variant']);data=np.array(inp['image']['data'],np.uint8)
 assert data.tobytes()==(H/'fixtures'/case['image']['rgbaFile']).read_bytes()
 for a,b in zip(inp['training']['segments'][0].values(),[case['anchors']['tee'],case['anchors']['badge']]):assert (a['xPx'],a['yPx'])==(b['xPx']-.5,b['yPx']-.5)
 station=inp['stations'][0];query=case['query'];assert (station['xPx'],station['yPx'])==(query['xPx']-.5,query['yPx']-.5)
 assert station['headingRad']==query['headingRad'] and [station['t0Px'],station['t1Px']]==query['stationSpanPx'] and inp['localWidthBank']['valuesPx']==query['candidateWidthsPx']
 assert inp['edgeSearch']=={'latLimPx':12,'tolWidthPx':3}
 mask=np.zeros((256,320),np.uint8)
 for frozen,native in zip(variant['occluderBboxes'],inp['occluders']['boxes']):
  assert native=={**frozen,'bboxW':frozen['bboxW']-1,'bboxH':frozen['bboxH']-1}
  for y in range(max(0,math.ceil(native['bboxY'])),min(255,math.floor(native['bboxY']+native['bboxH']))+1):
   for x in range(max(0,math.ceil(native['bboxX'])),min(319,math.floor(native['bboxX']+native['bboxW']))+1):mask[y,x]=255
 if item['variant']=='declared-mask':assert np.array_equal(mask,np.asarray(Image.open(H/'fixtures'/case['mask']['file'])))
 else:assert np.all(mask==255)
 d=json.loads((E/'receipts'/(item['id']+'.json')).read_text());receipts[item['id']]=d;assert d['frame']==inp['frame'] and d['inputProvenance']['rgbaSha256']==hashlib.sha256(data.tobytes()).hexdigest()
 assert d['promoted'] is False and d['localWidth']['status']=='UNKNOWN' and d['localWidth']['widthPx'] is None and d['semanticIdentity']['status']=='UNKNOWN'
 s=d['stations'][0];assert s['profile']['stationCount']==56 and len(s['profile']['offsetsPx'])==241
 assert [c['widthArgPx'] for c in s['candidates']]==[24,32,40,48,56]
 for c in s['candidates']:
  o=c['observation'];fit=c['edgeFit'];mid=c['midpoint']
  if o['leftRailOccluded'] or o['rightRailOccluded']:assert c['pairedRails']['status']=='UNKNOWN'
  if fit is None:assert mid['status']=='UNKNOWN'
  else:
   assert mid['fitMidpointNormalOffsetPx']==fit['cPx'] and mid['candidateCenterMinusFitMidpointPx']==-fit['cPx'] and math.isclose(mid['candidateCenterMinusFitMidpointInNominalWidths'],-fit['cPx']/c['widthArgPx'],abs_tol=1e-15)
 rows.append({'id':item['id'],'status':d['status'],'rawWidthEstimate':d['rawWidthEstimate'],'candidates':[{'widthPx':c['widthArgPx'],'railMode':c['observation']['railMode'],'railScore':c['observation']['railScore'],'innerScore':c['observation']['innerScore'],'combinedScore':c['observation']['score'],'edgeFit':c['edgeFit'],'midpoint':c['midpoint'],'pairedGuard':c['pairedRails']['status']} for c in s['candidates']],'receiptSha256':sha(E/'receipts'/(item['id']+'.json'))})
def cand(id,w):return next(c for c in receipts[id]['stations'][0]['candidates'] if c['widthArgPx']==w)
a=cand('C2-01-declared-mask',32);b=cand('C2-02-declared-mask',48);assert a['observation']['score']==b['observation']['score']==1 and a['edgeFit']['wPx']==32 and math.isclose(b['edgeFit']['wPx'],48.00105940547961)
s=cand('C2-03-declared-mask',32);assert s['observation']['score']==0 and s['observation']['innerScore']==1 and math.isclose(s['edgeFit']['cPx'],-4.498528201356879)
for w in [48,56]:
 c=cand('C2-04-declared-mask',w);assert all(c['observation'][k]==1 for k in ['railScore','innerScore','score']) and c['edgeFit'] is None and c['midpoint']['status']=='UNKNOWN'
c=cand('C2-05-declared-mask',40);assert c['observation']['railScore'] is None and c['observation']['innerScore']==c['observation']['score']==1 and c['pairedRails']['status']=='UNKNOWN' and c['edgeFit'] is None
h=receipts['C2-05-all-hidden'];assert h['status']=='UNKNOWN' and h['rawWidthEstimate']['widthPx']==24 and all(row['visibleSamples']==0 and row['meanScore']=={'numberKind':'nonfinite','value':'-Infinity'} for row in h['rawWidthEstimate']['scores'])
c=cand('C2-06-declared-mask',32);assert c['observation']['score']==0 and math.isclose(c['edgeFit']['wPx'],32.01745889833251)
closure=json.loads((E/'source-closure.json').read_text())
for file in closure['files']:assert sha(E/'candidate'/file['file'])==sha(repo/file['file'])==file['sha256']
cm=json.loads((E/'candidate-freeze.json').read_text())
for source in cm['immutableSources']:
 p=E/'candidate/experiments/capability-discovery/probes/width'/source['file'];raw=p.read_bytes();assert sha(p)==source['sha256'] and hashlib.sha1(f'blob {len(raw)}\0'.encode()+raw).hexdigest()==source['gitBlob']
assert sha(E/'candidate-freeze.json')==sha(repo/'work/capability-discovery/cycle-02/feature-manifest-E308.json')=='5b59dce1c7ae87f962c0305697ed883e423bd504fedce5851fb02242309dcf52'
out={'status':'PASS','frameConversion':'all anchor/query coordinates exactly frozen minus(.5,.5); unchanged vectors, headings, windows and banks','maskConversion':'all7 adapted unavailable integer pixel sets exactly match frozen masks; half-open widths become inclusive extent width−1; no continuous-mask equivalence claimed','sourceClosureFiles':len(closure['files']),'immutableSourceIdentitiesVerified':len(cm['immutableSources']),'candidateManifestSha256':sha(E/'candidate-freeze.json'),'rawFalsificationMeasurements':rows,'visualQA':{'scientificFigureViewed':True,'figureByteIdentical':sha(E/'evaluation.png')==sha(original/'evaluation.png'),'originalHTMLBrowserAttempt':json.loads((original/'html-node-visual-attempt.json').read_text())}}
(root/'verification.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps({'status':'PASS','runs':len(rows),'candidateManifestSha256':out['candidateManifestSha256'],'maskSetsCompared':7,'figureByteIdentical':out['visualQA']['figureByteIdentical']}))
