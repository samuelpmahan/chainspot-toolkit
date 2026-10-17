import json, math, numpy as np
from PIL import Image, ImageDraw, ImageFont
ST='/home/user/chainspot-toolkit/attempts/stages'; W=1290
BP=json.load(open('basketpoint.json')); d=np.array(BP['delta'])
C=dict([('golden','attempt-1792256170903-b68743f9e95c'),('lenard','attempt-1792256225103-92dacbe97c0f'),('townelake','attempt-1792256243822-fb785314ae52'),('heritage','attempt-1792256261126-6ee7ff71e848'),('alex','attempt-1792263349086-27173a1f38f5')])
COL={'golden':(255,210,0),'lenard':(0,220,255),'townelake':(255,90,200),'heritage':(120,255,90),'alex':(255,140,40)}
# stack of basket sprites (all courses), window around the stem bottom: sprite x 8..38, y 50..90 (tip at x 22.5, y 71)
x0s,x1s,y0s,y1s=4,41,48,96; patches=[]
for c,att in C.items():
    A=f'{ST}/{att}/fork/stage-output/early/artifacts'; raw=np.fromfile(f'{A}/s1/badgePx.rgba.bin',dtype=np.uint8); H=raw.size//4//W; rgb=raw.reshape(H,W,4)[...,:3].astype(float)
    for k in json.load(open(f'{A}/s2/px.baskets.json'))['baskets']:
        x,y,w,h=k['bbox']
        if y+y1s<=H: patches.append(rgb[y+y0s:y+y1s,x+x0s:x+x1s])
M=np.mean(patches,0)
Z=24; im=Image.fromarray(M.clip(0,255).astype(np.uint8)).resize(((x1s-x0s)*Z,(y1s-y0s)*Z),Image.NEAREST).convert('RGBA'); ov=Image.new('RGBA',im.size,(0,0,0,0)); dr=ImageDraw.Draw(ov)
P=lambda sx,sy:((sx-x0s+0.5)*Z,(sy-y0s+0.5)*Z)   # sprite-frame px index -> canvas (pixel centre convention)
tip=np.array([22.5,71.0])
for r in BP['rows']:
    t=math.radians(r['spokeDeg']); u=np.array([math.cos(t),math.sin(t)]); n=np.array([-u[1],u[0]])
    q=tip-n*r['tipLatPx']      # the spoke line passes at signed lateral offset tipLat from the tip
    a=q-u*40; b=q+u*40; dr.line([P(*a),P(*b)],fill=COL[r['course']]+(150,),width=2)
bp=tip+d; R=10
dr.ellipse([P(*bp)[0]-R,P(*bp)[1]-R,P(*bp)[0]+R,P(*bp)[1]+R],outline=(255,255,255,255),width=4)
dr.line([P(x0s-0.5,71.5)[0],P(0,71.5)[1],P(x1s-0.5,71.5)[0],P(0,71.5)[1]],fill=(255,255,255,120),width=1)
dr.ellipse([P(*tip)[0]-5,P(*tip)[1]-5,P(*tip)[0]+5,P(*tip)[1]+5],fill=(255,0,0,255))
im=Image.alpha_composite(im,ov).convert('RGB')
FT=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',17); FS=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',14)
hdr=120; out=Image.new('RGB',(im.width,im.height+hdr),(18,18,18)); out.paste(im,(0,hdr)); o=ImageDraw.Draw(out)
o.text((8,6),'BasketPoint: 59 C1 spokes from 5 courses, drawn in the basket sprite frame',fill=(255,255,255),font=FT)
o.text((8,32),f'background = mean of {len(patches)} basket sprites (stem bottom).  red dot = bbox tip (x+22.5, y+71).  white ring = least-squares common point',fill=(220,220,220),font=FS)
o.text((8,54),f'BasketPoint = tip + ({d[0]:+.2f}, {d[1]:+.2f}) px  (bootstrap 95%: x +0.06..+0.61, y +0.38..+1.02 px); spoke residual median 0.38 px',fill=(255,255,255),font=FS)
o.text((8,76),'faint white line = the stem\'s bottom pixel edge (y + 71.5): the spokes cross it at the point',fill=(220,220,220),font=FS)
xx=8
for c,col in COL.items(): o.text((xx,98),c,fill=col,font=FS); xx+=110
out.save('basketpoint.png'); print(out.size,len(patches))
