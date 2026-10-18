#!/usr/bin/env python3
"""Independent deterministic construction fixtures; never imports candidate code."""
from pathlib import Path
import hashlib,json,math,sys
import numpy as np
from PIL import Image,ImageDraw

ROOT=Path(__file__).resolve().parent
OUT=Path(sys.argv[1]) if len(sys.argv)>1 else ROOT/'fixtures'
OUT.mkdir(parents=True,exist_ok=True)
SEED=30520261018
W,H,SS=320,256,4
FRAME='C2-synthetic-source-image-pixels; x-right y-down; pixel centers at integer+0.5'
SPECS=[
 {'id':'C2-01','kind':'straight-corridor','center':[160,128],'headingRad':0.0,'fullWidthPx':32.0,'lengthPx':280.0,'queryNormalOffsetPx':0.0},
 {'id':'C2-02','kind':'rotated-scaled-corridor','center':[160,128],'headingRad':0.47,'fullWidthPx':48.0,'lengthPx':272.0,'queryNormalOffsetPx':0.0},
 {'id':'C2-03','kind':'shifted-valid-corridor','center':[160,128],'headingRad':-0.13,'fullWidthPx':32.0,'lengthPx':278.0,'queryNormalOffsetPx':4.5},
 {'id':'C2-04','kind':'bright-organic-negative','center':[160,128],'headingRad':-0.17,'semiAxesPx':[147.0,26.0],'queryNormalOffsetPx':0.0},
 {'id':'C2-05','kind':'partial-rail-mask-interior-only','center':[160,128],'headingRad':0.0,'fullWidthPx':40.0,'lengthPx':280.0,'queryNormalOffsetPx':0.0},
 {'id':'C2-06','kind':'crossing-ambiguous-edges','center':[160,128],'headingRad':0.0,'fullWidthPx':32.0,'lengthPx':280.0,'queryNormalOffsetPx':0.0,'crossingHeadingRad':0.86,'crossingWidthPx':40.0},
]
def point(spec,s,n=0):
 a=spec['headingRad']; c=spec['center']; return [c[0]+s*math.cos(a)-n*math.sin(a),c[1]+s*math.sin(a)+n*math.cos(a)]
def coords(spec,x,y,heading=None):
 a=spec['headingRad'] if heading is None else heading;c=spec['center'];dx=x-c[0];dy=y-c[1]
 return dx*math.cos(a)+dy*math.sin(a),-dx*math.sin(a)+dy*math.cos(a)
def save_json(path,x):path.write_text(json.dumps(x,indent=2,allow_nan=False)+'\n')
images=[];manifest=[]
for k,spec in enumerate(SPECS):
 # Integer modular background: exact deterministic seed, no PRNG/library-version dependence.
 yy,xx=np.mgrid[0:H,0:W]; background=96+((xx*17+yy*31+SEED)%7-3)
 occupancy=np.zeros((H,W),dtype=np.float64)
 for sy in range(SS):
  for sx in range(SS):
   x=xx+(sx+.5)/SS;y=yy+(sy+.5)/SS;s,n=coords(spec,x,y)
   if 'semiAxesPx' in spec:
    a,b=spec['semiAxesPx'];inside=(s/a)**2+(n/b)**2<=1
   else:inside=(np.abs(n)<=spec['fullWidthPx']/2)&(np.abs(s)<=spec['lengthPx']/2)
   if spec['kind']=='crossing-ambiguous-edges':
    s2,n2=coords(spec,x,y,spec['crossingHeadingRad']);inside|=(np.abs(n2)<=spec['crossingWidthPx']/2)&(np.abs(s2)<=140)
   occupancy+=inside
 occupancy/=SS*SS
 lum=np.floor(background*(1-occupancy)+151*occupancy+.5).astype(np.uint8)
 rgba=np.empty((H,W,4),dtype=np.uint8);rgba[:,:,:3]=lum[:,:,None];rgba[:,:,3]=255
 masks=[]
 if spec['kind']=='partial-rail-mask-interior-only':
  # Explicit source-frame bboxes hide each side rail, leaving center interior visible.
  masks=[{'bboxX':0,'bboxY':101,'bboxW':W,'bboxH':14},{'bboxX':0,'bboxY':141,'bboxW':W,'bboxH':14}]
 known=np.zeros((H,W),dtype=np.uint8)
 for b in masks:known[b['bboxY']:b['bboxY']+b['bboxH'],b['bboxX']:b['bboxX']+b['bboxW']]=255
 query=point(spec,0,spec['queryNormalOffsetPx']);tee=point(spec,-112);badge=point(spec,-42)
 width_bank=[24,32,40,48,56]
 case={'schema':'C2-heldout-construction-case@1','id':spec['id'],'class':spec['kind'],'seed':SEED,'frame':FRAME,
       'image':{'width':W,'height':H,'rgbaFile':spec['id']+'.rgba','pngFile':spec['id']+'.png','channels':'RGBA8; opaque; luminance R=G=B; no alpha masking'},
       'construction':spec,'anchors':{'tee':{'xPx':tee[0],'yPx':tee[1]},'badge':{'xPx':badge[0],'yPx':badge[1]},'meaning':'construction points only; no rendered tee/badge sprites or endpoint identity'},
       'query':{'xPx':query[0],'yPx':query[1],'headingRad':spec['headingRad'],'candidateWidthsPx':width_bank,'stationSpanPx':[-28,28]},
       'knownOccluderBboxes':masks,'mask':{'file':spec['id']+'-mask.png','meaning':'255 = unavailable, 0 = visible; source pixels remain unmodified'},
       'queryVariants':[{'id':'declared-mask','occluderBboxes':masks}],
       'labelsAre':'analytic construction labels only, never human truth or real course accuracy'}
 if spec['kind']=='partial-rail-mask-interior-only':case['queryVariants'].append({'id':'all-hidden','occluderBboxes':[{'bboxX':0,'bboxY':0,'bboxW':W,'bboxH':H}]})
 (OUT/(spec['id']+'.rgba')).write_bytes(rgba.tobytes());Image.fromarray(rgba).save(OUT/(spec['id']+'.png'));Image.fromarray(known).save(OUT/(spec['id']+'-mask.png'));save_json(OUT/(spec['id']+'.json'),case)
 preview=Image.fromarray(rgba).convert('RGB');d=ImageDraw.Draw(preview)
 # Preview marks only: never injected into evaluation raster.
 d.line([tuple(tee),tuple(badge)],fill=(30,210,255),width=2);d.ellipse((query[0]-3,query[1]-3,query[0]+3,query[1]+3),outline=(255,50,50),width=2)
 for b in masks:d.rectangle((b['bboxX'],b['bboxY'],b['bboxX']+b['bboxW']-1,b['bboxY']+b['bboxH']-1),outline=(255,170,20),width=2)
 label=Image.new('RGB',(W,H+36),(248,248,248));label.paste(preview,(0,36));ImageDraw.Draw(label).text((5,5),spec['id']+' '+spec['kind'],fill=(0,0,0));images.append(label)
 manifest.append({'id':spec['id'],'class':spec['kind'],'file':spec['id']+'.json'})
contact=Image.new('RGB',(W*2,(H+36)*3),(255,255,255))
for i,im in enumerate(images):contact.paste(im,((i%2)*W,(i//2)*(H+36)))
contact.save(OUT/'contactsheet.png')
save_json(OUT/'cases.json',{'schema':'C2-heldout-cases@1','seed':SEED,'supersamplePerAxis':SS,'cases':manifest,'candidateCodeInspected':False,'candidateCodeExecuted':False})
files=sorted(p for p in OUT.iterdir() if p.is_file() and p.name!='manifest.json')
entries=[{'file':p.name,'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in files]
save_json(OUT/'manifest.json',{'schema':'C2-heldout-byte-manifest@1','files':entries})
print(json.dumps({'caseCount':len(SPECS),'fileCount':len(entries),'manifestSha256':hashlib.sha256((OUT/'manifest.json').read_bytes()).hexdigest()}))
