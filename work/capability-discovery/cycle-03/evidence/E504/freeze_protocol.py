from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
import json,hashlib,math,datetime
p=Path(__file__).parent
sha=lambda b:hashlib.sha256(b).hexdigest()
platform='49255331791b1245cf0f9cd699816175f94e70f2'
font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',15)
small=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',12)
cases=[dict(name='NorthPark-full',blob='4209f4057c5dacdcd2e895b5ded8e5e5e42f999a',training=[(665,2078),(770,2073)],center=(717.5,2075.5),terrain=(724,1833),crop=(600,1740,260,420),bank=[32,40,48],testimony='No NorthPark testimony directory exists in pinned testimony tree. Both endpoints are supplied from direct visual inspection in original full screenshot; no tee/badge/hole identity is asserted.',terrain_note='Bright tan sports-field patch, visually outside the rendered ribbons. Surface/organic identity is unverified; this is a bright non-path hypothesis.'),dict(name='TowneLake-full',blob='b25f5e74fb1ee18255e148c332f2cd430399cf9a',training=[(369,1725),(305,1835)],center=(320,1804),terrain=(900,2130),crop=(250,1660,720,540),bank=[29,37,45],testimony='Pinned annotation is available but targets absent 1290x2012 historical app crop SHA256 de12c697e0afce02c428df17ccc0ddb99849956387096a6555a64d0967dc1eca. README gives annotation-to-canonical y-1 only; original full screenshot translation is unestablished. Abstain from annotation projection. Both training endpoints are newly supplied visual original-source pixels, not mapped Sam testimony; API tee/badge fields have no semantic identity claim.',terrain_note='Open grass/irregular terrain patch between drawn ribbons, visually inspected as a bright non-path hypothesis. No independent terrain segmentation or semantic truth.')]
protocol={'schema':'chainspot.source-pixel-control-protocol@1','job_id':'E504','worker':'D4','freezeStage':'pre-measurement','frozenAtUTC':datetime.datetime.now(datetime.timezone.utc).isoformat(),'sourceRecipeFreezeSha256':'5b59dce1c7ae87f962c0305697ed883e423bd504fedce5851fb02242309dcf52','sourceCheckoutCommit':'3a5d37f5881fa0745de096293139daba18d8efc2','scope':'Exploratory source-pixel comparisons with caller-selected visual controls; no route ground truth or semantic acceptance. All selected regions are exposed.','coordinateConvention':'Original PNG integer pixel-center coordinates; x right, y down, heading from +x toward +y; normal=(-sin heading,cos heading). Integer crop translation only, no resize or S0 canonical conversion.','sampling':'Retain full RGBA unchanged; no AA muting, masking, normalization or filtering. All occluder boxes empty: manual windows intentionally avoid sprites where possible; texture/ring overlap may remain.','measurementsExecuted':False,'cases':[]}
for c in cases:
 name=c['name']; im=Image.open(p/(name+'.png')).convert('RGBA'); frame=name+':original-1290x2796'
 a,b=c['training']; h=math.atan2(b[1]-a[1],b[0]-a[0]); n=(-math.sin(h),math.cos(h));x,y=c['center']; ox,oy=x+12*n[0],y+12*n[1]
 def station(id,pt,role):return dict(id=id,frame=frame,xPx=pt[0],yPx=pt[1],headingRad=h,t0Px=-18,t1Px=18,role=role)
 stations=[station(name+'-ribbon',c['center'],'proposed visually straight ribbon'),station(name+'-offset12',(ox,oy),'matched +12 px normal translation; heading/window unchanged'),station(name+'-bright-nonpath',c['terrain'],'bright non-path visual control')]
 bx,by,bw,bh=c['crop']; crop=im.crop((bx,by,bx+bw,by+bh)); crop_path=p/(name+'.source-crop.png');crop.save(crop_path)
 record=dict(imageId=name,frame=frame,source=dict(gitRef=platform,path='specimens/dev/'+name+'.png',gitBlob=c['blob'],pngSha256=sha((p/(name+'.png')).read_bytes()),rgbaSha256=sha(im.tobytes()),widthPx=im.width,heightPx=im.height),geometryProvenance=dict(kind='explicit-caller-visual-testimony',author='D4',originalPixelEndpointInspection=True,semanticIdentity='UNKNOWN',annotationAuthority=c['testimony'],brightControl=c['terrain_note']),training=dict(frame=frame,segments=[dict(tee=dict(xPx=a[0],yPx=a[1]),badge=dict(xPx=b[0],yPx=b[1]))],apiFieldWarning='tee and badge are API endpoint names only; visual endpoints do not identify sprites or holes'),stations=stations,localWidthBank=dict(frame=frame,scope='LOCAL',valuesPx=c['bank'],chosenBeforeMeasurements=True,meaning='Explicit candidate widths only; no measured width or physical scale'),occluders=dict(frame=frame,boxes=[]),edgeSearch=dict(latLimPx=20,tolWidthPx=2),sourceCrop=dict(xPx=bx,yPx=by,widthPx=bw,heightPx=bh,translationToCrop=dict(dxPx=-bx,dyPx=-by),resize=False,rawPngFile=crop_path.name,pngSha256=sha(crop_path.read_bytes()),rgbaSha256=sha(crop.tobytes()),requiredSamplingMarginPx=32,marginReason='Profile normal offsets +/-30 px plus 2 px reserve; sensor widths max<=48/2, delta2.5 and tangent +/-4 are covered by 32px margin. All declared training endpoints also >=32px from crop bounds.'),predeclaredExpectedObservation=dict(ribbon='Some bank widths may return finite paired geometry on the visually straight band; all missing/weak/boundary fits remain literal raw diagnostics.',matchedOffset='If both poses fit the same physical edges at the same bank width, candidateCenterMinusFitMidpoint(offset)-candidateCenterMinusFitMidpoint(ribbon) should be about +12 source px. No recenter/rerun or parameter adjustment is authorized. Fixed-pose sensor score may decrease; it is not calibrated.',brightNonpath='Bright non-path may produce positive lanes or paired geometry. Such agreement is a counterexample to semantic path identity, never a false-positive count against independent truth.'),predeclaredFalsifier=dict(geometry='Missing baseline pairs, different fitted edge structures, or failure of the signed +12px midpoint difference weakens/falsifies the proposed same-edge translation observation. Retain outcomes at every width without selecting a winning row.',semantics='Any bright non-path pair or high channel score defeats using these local channels alone as semantic ribbon identification. Negative non-path output would only show this one region did not match.',protocol='Any changed source bytes, resizing, undocumented coordinate translation, insufficient sampling margins, producer execution before release, or output-driven pose/bank adjustment invalidates this freeze.'),acceptance='UNKNOWN; no hard score threshold, calibration, path classification or route association.')
 if name=='TowneLake-full':record['availableTestimony']=[dict(path='testimony/townelake/TowneLake-full.annotation.json',gitBlob='84e8236792ff32c8c38b0b53dd65906aedd4951d',sha256=sha((p/'TowneLake-full.annotation.json').read_bytes()),usedForGeometry=False),dict(path='testimony/townelake/README.md',gitBlob='b8d573dbe279d8af13c0be91f15015bc9193cb99',sha256=sha((p/'TowneLake-testimony-README.md').read_bytes()))]
 # Geometry-only bounds check; never reads RGB values or calls a CV/profile operation.
 pts=[a,b]
 for s in stations:
  for t in (s['t0Px']-4,s['t1Px']+4):
   for z in (-32,32):pts.append((s['xPx']+t*math.cos(h)+z*n[0],s['yPx']+t*math.sin(h)+z*n[1]))
 assert all(bx<=xx<bx+bw and by<=yy<by+bh for xx,yy in pts)
 assert all(min(xx-bx,bx+bw-1-xx,yy-by,by+bh-1-yy)>=32 for xx,yy in (a,b))
 record['sourceCrop']['geometryBoundsCheck']='All profile/sample envelope corner points remain strictly within integer crop; no RGB/edge measurement used.'
 protocol['cases'].append(record)
 # Annotate exact source crop at native pixel size, with title/legend outside raster.
 canvas=Image.new('RGB',(max(bw,760),bh+155),'white');canvas.paste(crop.convert('RGB'),(0,100));d=ImageDraw.Draw(canvas)
 d.text((10,8),name+' | original PNG pixel-center controls | PRE-MEASUREMENT',fill='black',font=font)
 d.text((10,30),f'Native source crop x={bx}, y={by}, width={bw}, height={bh}; no resize',fill='black',font=small)
 d.text((10,49),'Blue: visual training endpoints   Green: proposed ribbon   Red: +12px normal',fill='black',font=small)
 d.text((10,67),'Orange: bright non-path hypothesis. Lines: t[-18,18]; crossbar: normal +/-30px.',fill='black',font=small)
 def cv(pt):return (pt[0]-bx,pt[1]-by+100)
 d.line([cv(a),cv(b)],fill='#00aaff',width=2)
 for pt in (a,b):xx,yy=cv(pt);d.ellipse((xx-3,yy-3,xx+3,yy+3),outline='#00aaff',width=2)
 for s,color,label in zip(stations,['#00bb40','#ff2040','#ffae00'],['R','O','N']):
  sx,sy=s['xPx'],s['yPx'];d.line([cv((sx-18*math.cos(h),sy-18*math.sin(h))),cv((sx+18*math.cos(h),sy+18*math.sin(h)))],fill=color,width=2)
  d.line([cv((sx-30*n[0],sy-30*n[1])),cv((sx+30*n[0],sy+30*n[1]))],fill=color,width=1)
  xx,yy=cv((sx,sy));d.ellipse((xx-3,yy-3,xx+3,yy+3),outline=color,width=2);d.text((xx+5,yy+3),label,fill=color,font=small)
 d.text((10,bh+113),'Caller visual testimony only; Sam annotation mapping unestablished for TowneLake.',fill='black',font=small)
 d.text((10,bh+131),'Source identities and exact source-pixel poses are frozen in protocol.json.',fill='black',font=small)
 canvas.save(p/(name+'.scientific-source.png'))
(p/'protocol.json').write_text(json.dumps(protocol,indent=2)+'\n')
print('protocol created; no recipe, learner, profile, sensor or edge operations executed')
print('protocol SHA256',sha((p/'protocol.json').read_bytes()))
