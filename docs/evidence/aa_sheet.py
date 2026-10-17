import json, os, numpy as np
from PIL import Image, ImageDraw, ImageFont
ST='/home/user/chainspot-toolkit/attempts/stages'
COURSES=[('golden','attempt-1792256170903-b68743f9e95c'),('lenard','attempt-1792256225103-92dacbe97c0f'),
         ('townelake','attempt-1792256243822-fb785314ae52'),('heritage','attempt-1792256261126-6ee7ff71e848'),('alex','attempt-1792229563197-375c3b48964b')]
F=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',16); FS=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',13)
Z=6; TILE=(390,560)
def dilate(m,k):
    for _ in range(k):
        d=m.copy(); d[1:]|=m[:-1]; d[:-1]|=m[1:]; d[:,1:]|=m[:,:-1]; d[:,:-1]|=m[:,1:]; m=d
    return m
def nbr(arr,mask,fn,k=2):  # min/max of arr over owned neighbours within k (chebyshev)
    out=np.full(arr.shape, np.nan)
    H,W=arr.shape
    for dy in range(-k,k+1):
        for dx in range(-k,k+1):
            sh=np.full(arr.shape,np.nan); m=np.where(mask,arr,np.nan)
            ys=slice(max(dy,0),H+min(dy,0)); yd=slice(max(-dy,0),H+min(-dy,0)); xs=slice(max(dx,0),W+min(dx,0)); xd=slice(max(-dx,0),W+min(-dx,0))
            sh[ys,xs]=m[yd,xd]; out=fn(out,sh)
    return out
def tile(rgb,W,ownedIdx,muteIdx,bbox,label,pad=8):
    x,y,w,h=[int(v) for v in bbox[:4]]; x0,y0=max(0,x-pad),max(0,y-pad); x1,y1=min(W,x+w+pad),min(rgb.shape[0],y+h+pad)
    c=rgb[y0:y1,x0:x1].astype(float); lum=c.max(-1); hh,ww=lum.shape
    own=np.zeros((hh,ww),bool); mute=np.zeros((hh,ww),bool)
    for i in ownedIdx:
        yy,xx=divmod(i,W); yy-=y0; xx-=x0
        if 0<=yy<hh and 0<=xx<ww: own[yy,xx]=True
    for i in muteIdx:
        yy,xx=divmod(i,W); yy-=y0; xx-=x0
        if 0<=yy<hh and 0<=xx<ww: mute[yy,xx]=True
    near=dilate(own,2)&~own; ring=dilate(own,7)&~dilate(own,4)
    bg=np.median(lum[ring]) if ring.any() else np.median(lum[~own])
    lo=np.fmin(nbr(lum,own,np.fmin),bg); hi=np.fmax(nbr(lum,own,np.fmax),bg)
    aa=near&(lum>lo+8)&(lum<hi-8)
    im=Image.fromarray(c.astype(np.uint8)).resize((ww*Z,hh*Z),Image.NEAREST).convert('RGBA'); ov=Image.new('RGBA',im.size,(0,0,0,0)); d=ImageDraw.Draw(ov)
    edge=own&~(np.roll(own,1,0)&np.roll(own,-1,0)&np.roll(own,1,1)&np.roll(own,-1,1))
    for yy,xx in zip(*np.nonzero(edge)): d.rectangle([xx*Z,yy*Z,xx*Z+Z-1,yy*Z+Z-1],outline=(0,255,90,230),width=1)
    for yy,xx in zip(*np.nonzero(mute&~own)): d.rectangle([xx*Z+1,yy*Z+1,xx*Z+Z-2,yy*Z+Z-2],outline=(0,200,255,220),width=1)
    for yy,xx in zip(*np.nonzero(aa)): d.rectangle([xx*Z+1,yy*Z+1,xx*Z+Z-2,yy*Z+Z-2],fill=(255,210,0,170))
    im=Image.alpha_composite(im,ov).convert('RGB'); im.thumbnail((TILE[0],TILE[1]-30))
    t=Image.new('RGB',TILE,(18,18,18)); t.paste(im,((TILE[0]-im.width)//2,30)); td=ImageDraw.Draw(t)
    td.text((4,2),label,fill=(255,255,255),font=F)
    outside=int((aa&~mute).sum()) if muteIdx else int(aa.sum())
    td.text((4,19),f'own {int(own.sum())} px  AA {int(aa.sum())} px'+(f'  AA outside mute {outside} px' if muteIdx else ''),fill=(230,230,230),font=FS)
    return t, int(own.sum()), int(aa.sum()), outside
sheets={'badges':[],'baskets':[],'tees':[]}; tot={k:[0,0,0] for k in sheets}
for course,att in COURSES:
    A=f'{ST}/{att}/fork/stage-output/early/artifacts'
    raw=np.fromfile(f'{A}/s1/badgePx.rgba.bin',dtype=np.uint8); W=1290; rgb=raw.reshape(raw.size//4//W,W,4)[...,:3]
    for b in sorted(json.load(open(f'{A}/s1/px.badges.json'))['badges'],key=lambda b:int(b['label'] or 0)):
        t,o,a,out=tile(rgb,W,b['px'],b['mute']['px'],b['bbox'],f'{course} badge {b["label"]}'); sheets['badges'].append(t); tot['badges'][0]+=o; tot['badges'][1]+=a; tot['badges'][2]+=out
    for i,k in enumerate(json.load(open(f'{A}/s2/px.baskets.json'))['baskets']):
        t,o,a,_=tile(rgb,W,k['px'],[],k['bbox'],f'{course} basket {i}'); sheets['baskets'].append(t); tot['baskets'][0]+=o; tot['baskets'][1]+=a
    rp=f'{A}/s3fix/px.tees.refined.json'; tees=json.load(open(rp))['tees'] if os.path.exists(rp) else json.load(open(f'{A}/s3/px.tees.json'))['tees']
    if 'px' not in tees[0]: tees=json.load(open(f'{A}/s3/px.tees.json'))['tees']
    for i,tt in enumerate(tees):
        t,o,a,_=tile(rgb,W,tt['px'],[],tt['bbox'],f'{course} tee {i}'); sheets['tees'].append(t); tot['tees'][0]+=o; tot['tees'][1]+=a
for name,tiles in sheets.items():
    cols=8; rows=(len(tiles)+cols-1)//cols; hdr=48
    sh=Image.new('RGB',(cols*(TILE[0]+4),hdr+rows*(TILE[1]+4)),(40,40,40)); d=ImageDraw.Draw(sh)
    o,a,out=tot[name]
    d.text((8,6),f'{name.upper()} — {len(tiles)} sprites over 5 courses (golden, lenard, townelake, heritage, alex) · 6x · NOT muted',fill=(255,255,255),font=F)
    msg=f'green = boundary of what the stage Part owns ({o} px)   yellow = AA blend, unowned ({a} px)'+(f'   cyan = existing S1 2-px mute (AA outside mute: {out} px)' if name=='badges' else '')
    d.text((8,26),msg,fill=(230,230,230),font=FS)
    for i,t in enumerate(tiles): sh.paste(t,((i%cols)*(TILE[0]+4),hdr+(i//cols)*(TILE[1]+4)))
    sh.save(f'aa-{name}.png'); print(name,len(tiles),sh.size,tot[name])
