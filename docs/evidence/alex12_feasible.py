import json, math, numpy as np
from PIL import Image, ImageDraw, ImageFont
A='/home/user/chainspot-toolkit/attempts/stages/attempt-1792229563197-375c3b48964b/fork/stage-output/early/artifacts'
raw=np.fromfile(f'{A}/s1/badgePx.rgba.bin',dtype=np.uint8); W=1290; H=raw.size//4//W; rgb=raw.reshape(H,W,4)[...,:3]; lum=rgb.astype(float).mean(-1)
m=json.load(open(f'{A}/s3fix/px.tees.family-refined.json'))['model']; L,Wd=m['major']['median'],m['minor']['median']
badges=json.load(open(f'{A}/s1/px.badges.json'))['badges']; b=[x for x in badges if str(x['label'])=='12'][0]; bx,by,bw,bh=b['bbox']; bc=np.array([bx+(bw-1)/2,by+(bh-1)/2])
baskets=json.load(open(f'{A}/s2/px.baskets.json'))['baskets']; k=baskets[0]; kx,ky,kw,kh=k['bbox']
own=np.zeros((H,W),bool)
for x in baskets: own.flat[np.array(x['px'])]=True
for x in badges: own.flat[np.array(x['mute']['px'])]=True
occ=np.zeros((H,W),bool); occ.flat[np.array(k['px'])]=True
for _ in range(2):
    d=occ.copy(); d[1:]|=occ[:-1]; d[:-1]|=occ[1:]; d[:,1:]|=occ[:,:-1]; d[:,:-1]|=occ[:,1:]; occ=d
# --- ribbon centreline between basket 0 and badge 12, from perpendicular brightness profiles
kc=np.array([kx+(kw-1)/2,ky+(kh-1)/2]); u=(kc-bc)/np.linalg.norm(kc-bc); n=np.array([-u[1],u[0]])
pts=[]
for t in np.arange(30,np.linalg.norm(kc-bc)-40,2.0):
    p=bc+u*t; offs=np.arange(-35,35.5,0.5); vals=[]
    for o in offs:
        q=p+n*o; xi,yi=int(round(q[0])),int(round(q[1]))
        vals.append(np.nan if own[yi,xi] else lum[yi,xi])
    v=np.array(vals)
    if np.isnan(v).mean()>0.3: continue
    v=np.nan_to_num(v,nan=np.nanmedian(v)); vs=np.convolve(v,np.ones(9)/9,'same'); base=np.median(vs)
    w=np.clip(vs-base,0,None)
    if w.sum()<1: continue
    pts.append(p+n*(offs*w).sum()/w.sum())
P_=np.array(pts); c0=P_.mean(0); _,_,vt=np.linalg.svd(P_-c0); dirv=vt[0]
if dirv@u<0: dirv=-dirv
resid=np.abs((P_-c0)@np.array([-dirv[1],dirv[0]])); ribbon_th=math.degrees(math.atan2(-dirv[1],-dirv[0]))  # pad->badge direction
print('ribbon samples',len(P_),'centreline residual median px',np.median(resid).round(2),'direction pad->badge deg',round(ribbon_th,2))
def line_off(cx,cy): q=np.array([cx,cy])-c0; return abs(q@np.array([-dirv[1],dirv[0]]))
feas=[];feasR=[]
for cy in np.arange(ky-4,ky+kh+4,0.5):
  for cx in np.arange(kx-4,kx+kw+4,0.5):
    ray=math.degrees(math.atan2(bc[1]-cy,bc[0]-cx))
    for dth in np.arange(-6.5,6.51,0.5):
      thd=ray+dth; th=math.radians(thd); c,s=math.cos(th),math.sin(th); r=int(math.ceil(max(L,Wd)/2+1)); ok=True
      for yy in range(int(cy)-r,int(cy)+r+2):
        for xx in range(int(cx)-r,int(cx)+r+2):
          dx,dy=xx-cx,yy-cy
          if abs(dx*c+dy*s)<=L/2 and abs(-dx*s+dy*c)<=Wd/2 and not occ[yy,xx]: ok=False; break
        if not ok: break
      if ok:
        feas.append((cx,cy,thd))
        dang=abs((thd-ribbon_th+180)%360-180)
        if line_off(cx,cy)<=2.0 and min(dang,180-dang)<=3.0: feasR.append((cx,cy,thd))
F=np.array(feas); R=np.array(feasR)
print('entailment-only',len(F),'+ribbon',len(R))
if len(R): print('ribbon-constrained: x',R[:,0].min(),R[:,0].max(),'y',R[:,1].min(),R[:,1].max(),'theta',R[:,2].min().round(1),R[:,2].max().round(1),'mean',R[:,:2].mean(0).round(2),R[:,2].mean().round(2))
Z=6; pad=30; x0=max(0,kx-pad); y0=max(0,ky-pad); x1=min(W,kx+kw+pad); y1=min(H,int(bc[1])+30)
crop=Image.fromarray(rgb[y0:y1,x0:x1]).resize(((x1-x0)*Z,(y1-y0)*Z),Image.NEAREST).convert('RGBA'); ov=Image.new('RGBA',crop.size,(0,0,0,0)); d=ImageDraw.Draw(ov)
P=lambda x,y:((x-x0+0.5)*Z,(y-y0+0.5)*Z)
for yy,xx in zip(*np.nonzero(occ[y0:y1,x0:x1])): d.rectangle([xx*Z,yy*Z,xx*Z+Z-1,yy*Z+Z-1],fill=(0,120,255,40))
def corners(cx,cy,thd):
  t=math.radians(thd); c,s=math.cos(t),math.sin(t); return [P(cx+a*c-bb*s,cy+a*s+bb*c) for a,bb in ((-L/2,-Wd/2),(L/2,-Wd/2),(L/2,Wd/2),(-L/2,Wd/2))]
for f in F[::max(1,len(F)//120)]: d.polygon(corners(*f),outline=(255,255,255,35))
for xx,yy,_ in F[::7]: d.point(P(xx,yy),fill=(255,230,0,160))
for p in P_: d.ellipse([P(*p)[0]-3,P(*p)[1]-3,P(*p)[0]+3,P(*p)[1]+3],fill=(255,120,0,255))
a=c0+dirv*80; bb=c0-dirv*140; d.line([P(*a),P(*bb)],fill=(255,120,0,200),width=2)
if len(R):
  for f in R[::max(1,len(R)//60)]: d.polygon(corners(*f),outline=(0,255,90,110))
  mc=R[:,:2].mean(0); mt=R[:,2].mean(); d.polygon(corners(mc[0],mc[1],mt),outline=(0,255,90,255),width=3)
d.rectangle([P(bx,by)[0]-Z/2,P(bx,by)[1]-Z/2,P(bx+bw-1,by+bh-1)[0]+Z/2,P(bx+bw-1,by+bh-1)[1]+Z/2],outline=(255,0,255,255),width=3)
crop=Image.alpha_composite(crop,ov).convert('RGB')
FT=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',15); FS=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',13)
out=Image.new('RGB',(max(crop.width,760),crop.height+110),(18,18,18)); out.paste(crop,(0,110)); o=ImageDraw.Draw(out)
o.text((8,4),'AlexClark tee 12 — hidden under S2 basket 0 (hole 11): feasible range',fill=(255,255,255),font=FT)
o.text((8,26),f'pad {L:.1f} x {Wd:.1f} px; long axis -> badge 12 (magenta) within ±6.5 deg; all pad px under basket 0 (+2 px, blue)',fill=(220,220,220),font=FS)
o.text((8,46),f'entailment only: {len(F)} poses (yellow centres, faint white pads): x {F[:,0].min():.1f}..{F[:,0].max():.1f} px, y {F[:,1].min():.1f}..{F[:,1].max():.1f} px',fill=(255,230,0),font=FS)
if len(R): o.text((8,66),f'+ on path centreline (orange, ±2 px, ±3 deg): {len(R)} poses (green): x {R[:,0].min():.1f}..{R[:,0].max():.1f} px, y {R[:,1].min():.1f}..{R[:,1].max():.1f} px, theta {R[:,2].min():.1f}..{R[:,2].max():.1f} deg',fill=(0,255,90),font=FS)
o.text((8,86),f'path centreline measured from the ribbon brightness ({len(P_)} profiles, median residual {np.median(resid):.2f} px)',fill=(255,150,60),font=FS)
out.save('alex12-feasible.png')
