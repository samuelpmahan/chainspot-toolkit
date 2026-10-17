# python3 measure.py   (writes measure-raw.json)
# Invariant ledger: is each quantity GLOBAL (same across courses AND zoom scales), LOCAL (constant within an image, differs
# between images: measure it per run = free specialization), or VARIABLE? Measured on 6 full courses + 5 zoomed Lenard views.
import json, math, collections, numpy as np
from scipy import ndimage as ndi
ST='/home/user/chainspot-toolkit/attempts/stages'; W=1290; BPD=np.array([0.34,0.73])
IMAGES=[('golden','full','attempt-1792256170903-b68743f9e95c'),('alex','full','attempt-1792263349086-27173a1f38f5'),('lenard','full','attempt-1792256225103-92dacbe97c0f'),
        ('townelake','full','attempt-1792256243822-fb785314ae52'),('heritage','full','attempt-1792256261126-6ee7ff71e848'),('northpark','full','attempt-1792280536732-17ca01ed60ea'),
        ('lenard1','zoom','attempt-1792280475576-d2ac09b8a95e'),('lenard2','zoom','attempt-1792280485821-a43d06513f8a'),('lenard3','zoom','attempt-1792280427142-df55fc0dc44d'),
        ('lenard4','zoom','attempt-1792280454564-4bcfa80a7409'),('lenard5','zoom','attempt-1792280465277-cc8f2983d237')]
samp=lambda I,x,y: ndi.map_coordinates(I,[y,x],order=1,mode='nearest')
def tees_of(A):
    for f in ('s3fix/px.tees.refined.json','s3/px.tees.json'):
        try: return json.load(open(f'{A}/{f}'))['tees'], f.split('/')[0]
        except FileNotFoundError: pass
    return [], None
def rings(A, kj, bj, tj, lum, H):
    m=np.zeros(H*W,bool); m[[p for k in kj for p in k['px']+k['shell']['blackPx']]+[p for b in bj for p in b['px']+b['mute']['px']]+[p for t in tj for p in t['px']]]=True
    SPR=ndi.binary_dilation(ndi.binary_fill_holes(m.reshape(H,W)),iterations=2).astype(float)
    bps=np.array([[k['bbox'][0]+22.5,k['bbox'][1]+71] for k in kj])+BPD; th=np.radians(np.arange(0,360,1.0)); rs=np.arange(8,260,0.25)
    per=[]
    for bx,by in bps:
        prof=[]
        for r in rs:
            X=bx+r*np.cos(th); Y=by+r*np.sin(th); ok=(samp(SPR,X,Y)<0.01)&(X>1)&(X<W-2)&(Y>1)&(Y<H-2)
            prof.append(np.median(samp(lum,X[ok],Y[ok])) if ok.sum()>30 else np.nan)
        per.append(prof)
    prof=np.nanmean(np.array(per,float),0); e=np.nan_to_num(prof-ndi.median_filter(np.nan_to_num(prof,nan=np.nanmean(prof)),size=61),nan=-9)
    best=None
    for i,r in enumerate(rs):
        if r<12 or 2*r>rs[-1]: continue
        j=int(np.argmin(np.abs(rs-2*r))); sc=e[i]+e[j]
        if best is None or sc>best[0]: best=(sc,i,j)
    _,i1,j=best; lo=lambda k:max(0,k-12); hi=lambda k:min(len(rs),k+13)
    i1=lo(i1)+int(np.argmax(e[lo(i1):hi(i1)])); i2=lo(j)+int(np.argmax(e[lo(j):hi(j)]))
    def fwhm(i):
        h=e[i]/2; l=i; r=i
        while l>0 and e[l]>h: l-=1
        while r<len(e)-1 and e[r]>h: r+=1
        return float(rs[r]-rs[l])
    return dict(R1=float(rs[i1]),R2=float(rs[i2]),w1=fwhm(i1),w2=fwhm(i2),n=len(bps))
rows={}
for name,scale,att in IMAGES:
    A=f'{ST}/{att}/fork/stage-output/early/artifacts'
    bj=json.load(open(f'{A}/s1/px.badges.json'))['badges']; kj=json.load(open(f'{A}/s2/px.baskets.json'))['baskets']; tj,src=tees_of(A)
    raw=np.fromfile(f'{A}/s1/badgePx.rgba.bin',dtype=np.uint8); H=raw.size//4//W; lum=raw.reshape(H,W,4)[...,:3].astype(float).mean(-1)
    clean=[b for b in bj if any(p['polarity']=='bright' and p['bbox'][2]>=40 for p in b['findPx']['parts'])]
    rows[name]=dict(scale=scale,
        badgeSizeByLabel={str(b['label']):tuple(b['bbox'][2:]) for b in clean},
        basketSizes=[tuple(k['bbox'][2:]) for k in kj],
        padFramePx=[t['pxCount'] for t in tj] if tj else [], padSource=src,
        rings=rings(A,kj,bj,tj,lum,H) if len(kj)>=2 else None)
    r=rows[name]; print(name,scale,'baskets',collections.Counter(r['basketSizes']),'| pad frame px median',np.median(r['padFramePx']) if r['padFramePx'] else None,'| rings',{k:round(v,2) for k,v in (r['rings'] or {}).items()})
json.dump({k:{**v,'badgeSizeByLabel':{l:list(s) for l,s in v['badgeSizeByLabel'].items()},'basketSizes':[list(s) for s in v['basketSizes']]} for k,v in rows.items()},open('measure-raw.json','w'),indent=1)
