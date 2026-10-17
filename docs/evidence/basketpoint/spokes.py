# Free-line spoke fits per basket; where does each spoke cross the stem's bottom edge?
import json, math, numpy as np
from scipy import ndimage as ndi
ST='/home/user/chainspot-toolkit/attempts/stages'; W=1290
C=[('golden','attempt-1792256170903-b68743f9e95c'),('lenard','attempt-1792256225103-92dacbe97c0f'),('townelake','attempt-1792256243822-fb785314ae52'),('heritage','attempt-1792256261126-6ee7ff71e848'),('alex','attempt-1792263349086-27173a1f38f5')]
samp=lambda I,x,y: ndi.map_coordinates(I,[np.atleast_1d(y),np.atleast_1d(x)],order=1,mode='nearest')
out={}
for c,att in C:
    A=f'{ST}/{att}/fork/stage-output/early/artifacts'
    raw=np.fromfile(f'{A}/s1/badgePx.rgba.bin',dtype=np.uint8); H=raw.size//4//W; rgb=raw.reshape(H,W,4)[...,:3].astype(float); lum=rgb.mean(-1)
    kj=json.load(open(f'{A}/s2/px.baskets.json'))['baskets']; bj=json.load(open(f'{A}/s1/px.badges.json'))['badges']
    try: tj=json.load(open(f'{A}/s3fix/px.tees.refined.json'))['tees']
    except Exception: tj=[]
    spr=np.zeros(H*W,bool); spr[[p for k in kj for p in k['px']+k['shell']['blackPx']]+[p for b in bj for p in b['px']+b['mute']['px']]+[p for t in tj for p in t['px']]]=True
    SPR=ndi.binary_dilation(ndi.binary_fill_holes(spr.reshape(H,W)),iterations=2).astype(float)
    rows=[]
    for i,k in enumerate(kj):
        x,y,w,h=k['bbox']; tip=np.array([x+(w-1)/2,y+h-1])
        # C1 radius: brightest thin ring 20..90 px around the tip estimate
        th=np.radians(np.arange(0,360,2)); best=None
        for r in np.arange(18,90,0.5):
            X=tip[0]+r*np.cos(th); Y=tip[1]+r*np.sin(th); ok=samp(SPR,X,Y)<0.01
            if ok.mean()<0.4: continue
            v=samp(lum,X,Y)[ok].mean()-0.5*(samp(lum,tip[0]+(r-4)*np.cos(th),tip[1]+(r-4)*np.sin(th))[ok].mean()+samp(lum,tip[0]+(r+4)*np.cos(th),tip[1]+(r+4)*np.sin(th))[ok].mean())
            if best is None or v>best[0]: best=(v,r)
        R1=best[1]
        # angular ridge scan inside C1 (6..R1-4) and C1..C2 (R1+4..2R1-5)
        ths=np.radians(np.arange(0,360,0.5)); rs=np.concatenate([np.arange(6,R1-4,0.75),np.arange(R1+4,2*R1-5,0.75)])
        Rr=rs[:,None]; X=tip[0]+Rr*np.cos(ths); Y=tip[1]+Rr*np.sin(ths); nx,ny=-np.sin(ths)[None],np.cos(ths)[None]
        on=samp(lum,X.ravel(),Y.ravel()).reshape(X.shape); side=np.maximum(samp(lum,(X+3.5*nx).ravel(),(Y+3.5*ny).ravel()),samp(lum,(X-3.5*nx).ravel(),(Y-3.5*ny).ravel())).reshape(X.shape)
        bad=samp(SPR,X.ravel(),Y.ravel()).reshape(X.shape)>0.01
        sc=np.where(~bad,np.clip(on-side,-5,15),0).sum(0)/np.maximum((~bad).sum(0),1); sc=np.where((~bad).mean(0)>0.3,sc,-9)
        j=int(np.argmax(sc)); t0=ths[j]
        pts=[]
        for r in rs:
            cx,cy=tip[0]+r*math.cos(t0),tip[1]+r*math.sin(t0); lat=np.arange(-4,4.01,0.1)
            px_=cx-lat*math.sin(t0); py_=cy+lat*math.cos(t0)
            if samp(SPR,px_,py_).max()>0.01: continue
            v=samp(lum,px_,py_); q=int(np.argmax(v))
            if 5<=q<=len(lat)-6 and v[q]-max(v[0],v[-1])>4:
                # parabolic subpixel
                a,b_,cc=v[q-1],v[q],v[q+1]; dd=a-2*b_+cc; o=lat[q]+(0.5*(a-cc)/dd*0.1 if dd!=0 else 0)
                pts.append((cx-o*math.sin(t0),cy+o*math.cos(t0),r))
        if len(pts)<8: rows.append(dict(i=i,ok=False)); continue
        P=np.array(pts)[:,:2]; m=P.mean(0); _,_,vt=np.linalg.svd(P-m); d=vt[0]
        if d@np.array([math.cos(t0),math.sin(t0)])<0: d=-d
        res=np.abs((P-m)@np.array([-d[1],d[0]]))
        # offset of the free line from the tip estimate, and where it crosses the stem bottom edge rows
        lat_tip=float((tip-m)@np.array([-d[1],d[0]]))
        cross={}
        for yb in (y+h-1, y+h-0.5, y+h):
            if abs(d[1])>0.2: tpar=(yb-m[1])/d[1]; cross[str(yb-y)]=round(float(m[0]+tpar*d[0]-tip[0]),2)
        rows.append(dict(i=i,ok=True,R1=float(R1),spokeDeg=round(math.degrees(math.atan2(d[1],d[0])),2),n=len(P),resMed=round(float(np.median(res)),2),tipLatPx=round(lat_tip,2),crossDx=cross,peak=round(float(sc[j]),1)))
    out[c]=rows
    ok=[r for r in rows if r['ok']]
    lt=np.array([r['tipLatPx'] for r in ok])
    print(f'{c}: spokes {len(ok)}/{len(rows)}  R1 med {np.median([r["R1"] for r in ok]):.1f} px  line-to-tip offset median {np.median(lt):+.2f}, |.| median {np.median(np.abs(lt)):.2f}, max {np.abs(lt).max():.2f} px')
    for r in ok: print('   b%-2d spoke %7.2f deg n %2d resid %.2f  tip-offset %+.2f px  cross bottom-edge dx %s'%(r['i'],r['spokeDeg'],r['n'],r['resMed'],r['tipLatPx'],r['crossDx']))
json.dump(out,open('spokes.json','w'),indent=1)
