from pathlib import Path
from PIL import Image
import json,hashlib,subprocess,math
root=Path('/workspace/scratch/8528bb251845');p=root/'discovery-cycle03/D3';out=root/'discovery-cycle03/D4/review-R503';h=lambda b:hashlib.sha256(b).hexdigest()
d=json.loads((p/'protocol.json').read_text());m=json.loads((p/'freeze-manifest.json').read_text());results={}
results['protocolSha256']=h((p/'protocol.json').read_bytes());assert results['protocolSha256']=='112693cce17cf30035191a6cded1829482a589bc19c3f6bbbb3320718c2c0ba2'
results['manifestEntries']=[]
for e in m['files']:
 b=(p/e['path']).read_bytes();ok=len(b)==e['bytes'] and h(b)==e['sha256'];results['manifestEntries'].append(dict(path=e['path'],ok=ok,sha256=h(b)));assert ok
pin=d['source'];original=subprocess.check_output(['git','-C',str(root/'chainspot-discovery-lab'),'show',pin['ref']+':'+pin['path']]);stored=(p/'source/Lenard-full.png').read_bytes()
assert original==stored and h(original)==pin['pngSha256'];assert hashlib.sha1(b'blob '+str(len(original)).encode()+b'\0'+original).hexdigest()==pin['gitBlob']
results['pinnedPngExactByteEquality']=True;results['pinnedGitBlob']=pin['gitBlob'];results['pinnedPngSha256']=h(original)
im=Image.open(p/'source/Lenard-full.png').convert('RGBA');crop=Image.open(p/'Lenard-source-crop.png').convert('RGBA');c=d['crop'];bx,by,w,hh=(c[k] for k in ['xPx','yPx','widthPx','heightPx']);expected=im.crop((bx,by,bx+w,by+hh));assert expected.tobytes()==crop.tobytes() and crop.size==(w,hh);assert h(im.tobytes())==pin['rgbaSha256']
results['sourceRgbaSha256']=h(im.tobytes());results['cropExactRgbaByteEquality']=True;results['cropRgbaSha256']=h(crop.tobytes())
frames=[d['training']['frame'],d['localWidthBank']['frame'],d['occluders']['frame']]+[s['frame'] for s in d['stations']];assert all(f==d['frame'] for f in frames)
s,t=d['stations'][:2];head=s['headingRad'];delta=(t['xPx']-s['xPx'],t['yPx']-s['yPx']);un=(math.cos(head),math.sin(head));normal=(-un[1],un[0]);err=math.hypot(delta[0]-16*normal[0],delta[1]-16*normal[1]);assert err<1e-10 and s['headingRad']==t['headingRad'] and s['t0Px']==t['t0Px'] and s['t1Px']==t['t1Px'];assert d['localWidthBank']['scope']=='LOCAL' and d['localWidthBank']['valuesPx']==[29,37,45] and d['edgeSearch']==dict(latLimPx=4,tolWidthPx=3,declarationBasis=d['edgeSearch']['declarationBasis'])
results['frameAndMatchedPoseChecks']=dict(allFramesMatch=True,normalOffsetPx=16,tangentOffsetPx=delta[0]*un[0]+delta[1]*un[1],offsetErrorPx=err,headingWindowMatched=True,bankScope='LOCAL',bankPx=[29,37,45],latLimPx=4,tolWidthPx=3)
# Pure geometry enumeration of every sampler support in pinned source; no RGB read, recipe import, observer, learner, profile or edge call.
def bands(width):
 lane=width/3;offsets=[-2*width/3,2*width/3]
 for x in (-width/6,width/6):offsets.extend([x-lane/3,x,x+lane/3])
 for x in (-width/2,width/2):offsets.extend([x-2.5,x+2.5])
 return offsets
checks=[]
def sensor(name,x,y,heading,width):
 u=(math.cos(heading),math.sin(heading));n=(-u[1],u[0]);samples=[]
 for z in bands(width):
  for along in [-4,-2,0,2,4]:
   xx=x+z*n[0]+along*u[0];yy=y+z*n[1]+along*u[1]
   # Exact Math.round convention, positive source coordinates.
   samples.append((math.floor(xx+0.5),math.floor(yy+0.5)))
 assert all(bx<=xx<bx+w and by<=yy<by+hh for xx,yy in samples)
 checks.append(dict(kind=name,widthPx=width,nearestReadCount=len(samples),pixelBounds=[min(q[0] for q in samples),min(q[1] for q in samples),max(q[0] for q in samples),max(q[1] for q in samples)],allReadsInsideCrop=True))
profile=[]
for st in d['stations']:
 u=(math.cos(st['headingRad']),math.sin(st['headingRad']));n=(-u[1],u[0]);pixels=[];coords=[]
 for along in range(int(st['t0Px']),int(st['t1Px'])):
  for j in range(241):
   z=-30+j*.25;xx=st['xPx']+along*u[0]+z*n[0];yy=st['yPx']+along*u[1]+z*n[1];cx,cy=xx-bx,yy-by
   assert cx>1 and cx<w-2 and cy>1 and cy<hh-2
   coords.append((xx,yy))
   for x0 in (math.floor(xx),math.floor(xx)+1):
    for y0 in (math.floor(yy),math.floor(yy)+1):pixels.append((x0,y0))
 assert all(bx<=xx<bx+w and by<=yy<by+hh for xx,yy in pixels)
 profile.append(dict(stationId=st['id'],normalOffsets=241,longitudinalSamples=24,bilinearPoints=len(coords),cornerReadReferences=len(pixels),pixelBounds=[min(q[0] for q in pixels),min(q[1] for q in pixels),max(q[0] for q in pixels),max(q[1] for q in pixels)],minimumMaskBoundaryMarginPx=min(min(x-bx,y-by,bx+w-1-x,by+hh-1-y) for x,y in coords),allReadsInsideCrop=True,allPassGeometryMaskBoundary=True))
 for width in d['localWidthBank']['valuesPx']:sensor('station:'+st['id'],st['xPx'],st['yPx'],st['headingRad'],width)
for seg in d['training']['segments']:
 a,b=seg['tee'],seg['badge'];heading=math.atan2(b['yPx']-a['yPx'],b['xPx']-a['xPx'])
 for f in [.2,.35,.5,.65,.78]:
  x=a['xPx']+(b['xPx']-a['xPx'])*f;y=a['yPx']+(b['yPx']-a['yPx'])*f
  for width in d['localWidthBank']['valuesPx']:sensor('learner-fraction:'+str(f),x,y,heading,width)
results['exactSamplingReach']=dict(method='Geometry-only enumeration based on direct source read: Dev72 nearest round reads at guards +/-2W/3, inner offsets +/-W/6 plus {-W/9,0,W/9}, rails +/-W/2 +/-2.5, tangent {-4,-2,0,2,4}; learner f={.2,.35,.5,.65,.78}; JS t=-12..11, normal=-30..30 step.25, all four bilinear integer neighbors and maskedAt boundary.',profile=profile,sensorAndTraining=checks,nearestReadReferences=sum(x['nearestReadCount'] for x in checks),bilinearPointCount=sum(x['bilinearPoints'] for x in profile),allReadsInsideCrop=True,edgeSearchNoAdditionalRasterReads=True,fullSamplerBoundaryPreserved=True)
results['annotationMapping']='UNKNOWN correctly retained: absent historical crop original-source translation not inferred from canonical y-2.'
results['producerExecution']=False
(out/'probes.json').write_text(json.dumps(results,indent=2)+'\n');print(json.dumps({'protocol':results['protocolSha256'],'manifestEntriesChecked':len(results['manifestEntries']),'sourceExact':True,'cropExact':True,'matchedOffsetErrorPx':err,'nearestReadReferences':results['exactSamplingReach']['nearestReadReferences'],'bilinearPoints':results['exactSamplingReach']['bilinearPointCount'],'allSamplerReadsInside':True},indent=2))
