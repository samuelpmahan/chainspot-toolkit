"""Frozen input conversion only; candidate outputs are never consulted."""
from pathlib import Path
import json,hashlib,shutil
import numpy as np
from PIL import Image
R=Path(__file__).resolve().parent
H=R.parent/'heldout';F=H/'fixtures'
REPO=Path('/workspace/scratch/8528bb251845/chainspot-discovery-lab')
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
manifest=REPO/'work/capability-discovery/cycle-02/feature-manifest-E308.json'
assert sha(manifest)=='5b59dce1c7ae87f962c0305697ed883e423bd504fedce5851fb02242309dcf52'
m=json.loads(manifest.read_text())
for e in m['files']+[m['existingGuard']]:assert sha(REPO/e['path'])==e['sha256']
freeze=json.loads((H/'freeze-manifest.json').read_text())
for e in freeze['files']:assert sha(H/e['file'])==e['sha256']
# Minimal unmodified dependency closure, kept beneath E307.
for rel in ['experiments/capability-discovery/composition/recipe.mjs','experiments/capability-discovery/composition/cli.mjs','experiments/capability-discovery/composition/README.md','experiments/capability-discovery/probes/width/recipe.mjs','experiments/capability-discovery/probes/width/provenance.json']:
 p=R/'candidate'/rel;p.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(REPO/rel,p)
for s in m['immutableSources']:
 rel='experiments/capability-discovery/probes/width/'+s['file'];assert sha(REPO/rel)==s['sha256'];p=R/'candidate'/rel;p.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(REPO/rel,p)
shutil.copyfile(manifest,R/'candidate-freeze.json')
FRAME='C2-E307-native-array-index-pixels; x-right y-down; integer centers; frozen-center-frame minus (0.5,0.5)'
def nativepoint(p):return {'xPx':p['xPx']-.5,'yPx':p['yPx']-.5}
def boxes(bs):
 # Exact integer unavailable pixel set: half-open raster bbox -> inclusive native pixel-center bbox.
 assert all(all(float(b[k]).is_integer() for k in ['bboxX','bboxY','bboxW','bboxH']) and b['bboxW']>=1 and b['bboxH']>=1 for b in bs)
 return [{'bboxX':b['bboxX'],'bboxY':b['bboxY'],'bboxW':b['bboxW']-1,'bboxH':b['bboxH']-1} for b in bs]
inputs=[]
for spec in json.loads((F/'cases.json').read_text())['cases']:
 c=json.loads((F/spec['file']).read_text());q=c['query'];im=c['image'];raw=(F/im['rgbaFile']).read_bytes();assert len(raw)==im['width']*im['height']*4
 for variant in c['queryVariants']:
  ident=c['id']+'-'+variant['id'];bs=boxes(variant['occluderBboxes']);mask=np.zeros((im['height'],im['width']),np.uint8)
  for b in bs:mask[b['bboxY']:b['bboxY']+b['bboxH']+1,b['bboxX']:b['bboxX']+b['bboxW']+1]=255
  if variant['id']=='declared-mask':assert np.array_equal(mask,np.asarray(Image.open(F/c['mask']['file'])))
  else:assert (mask==255).all()
  inp={'enabled':True,'frame':FRAME,'image':{'width':im['width'],'height':im['height'],'data':list(raw),'frame':FRAME},'provenance':{'imageId':ident,'rgbaSha256':hashlib.sha256(raw).hexdigest(),'geometrySource':'frozen C2 construction '+sha(F/spec['file'])+'; geometry native=frozen−(0.5,0.5); known-mask integer pixels preserved; source continuous box sampling semantics retained'},'training':{'frame':FRAME,'segments':[{'tee':nativepoint(c['anchors']['tee']),'badge':nativepoint(c['anchors']['badge'])}]},'stations':[{'id':c['id']+'-frozen-query','frame':FRAME,**nativepoint(q),'headingRad':q['headingRad'],'t0Px':q['stationSpanPx'][0],'t1Px':q['stationSpanPx'][1]}],'localWidthBank':{'frame':FRAME,'scope':'LOCAL','valuesPx':q['candidateWidthsPx']},'occluders':{'frame':FRAME,'boxes':bs},'edgeSearch':{'latLimPx':12,'tolWidthPx':3}}
  p=R/'inputs'/(ident+'.json');p.parent.mkdir(exist_ok=True);p.write_text(json.dumps(inp,separators=(',',':'))+'\n')
  inputs.append({'id':ident,'caseId':c['id'],'class':c['class'],'variant':variant['id'],'inputFile':str(p.relative_to(R)),'inputSha256':sha(p),'rgbaSha256':hashlib.sha256(raw).hexdigest(),'frozenCaseSha256':sha(F/spec['file']),'originalGeometryFrame':c['frame'],'nativeFrame':FRAME,'maskIntegerPixelsPreserved':True})
(R/'input-manifest.json').write_text(json.dumps({'schema':'E307-adapted-frozen-inputs@1','inputs':inputs,'coordinateConversion':'Subtract0.5 from each x/y anchor and query; lengths/headings/windows unchanged. Half-open known-mask bbox -> inclusive integer-center bbox (same unavailable raster pixels). Source box-majority/continuous sampling semantics are not a new ground-truth mask claim.','edgeArguments':'latLim12,tolWidth3 are original edgePairOf source defaults, explicitly supplied; not calibrated thresholds.','noCandidateFeedback':True},indent=2)+'\n')
closure=[{'file':str(p.relative_to(R/'candidate')),'sha256':sha(p)} for p in sorted((R/'candidate').rglob('*')) if p.is_file()]
(R/'source-closure.json').write_text(json.dumps({'candidateManifestSha256':sha(manifest),'files':closure},indent=2)+'\n')
print(json.dumps({'caseCount':6,'actualCLIRunsPlanned':len(inputs),'sourceClosureFiles':len(closure),'heldoutUnchanged':True}))
