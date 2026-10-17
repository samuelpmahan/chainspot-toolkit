# Path-ribbon centreline measurement for AlexClark. Calibrates "path starts on the tee's centre line" on visible pads.
import json, math, os, numpy as np
from scipy import ndimage as ndi
S='/tmp/claude-0/-home-user/73d91f40-13de-5bef-9b81-7de266a5102a/scratchpad'
A='/home/user/chainspot-toolkit/attempts/stages/attempt-1792263349086-27173a1f38f5/fork/stage-output/early/artifacts'
raw=np.fromfile(f'{A}/s1/badgePx.rgba.bin',dtype=np.uint8); W=1290; H=raw.size//4//W
rgb=raw.reshape(H,W,4)[...,:3].astype(float); lum=rgb.mean(-1)
fit=json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)),'alex-pads.json'))); L,Wd=fit['template']['L'],fit['template']['W']
bj=json.load(open(f'{A}/s1/px.badges.json'))['badges']; kj=json.load(open(f'{A}/s2/px.baskets.json'))['baskets']
tees=json.load(open(f'{A}/s3fix/px.tees.refined.json'))['tees']
def mk(p):
    m=np.zeros(H*W,bool); m[np.asarray(p,dtype=np.int64)]=True; return m.reshape(H,W)
spr=mk([p for b in bj for p in b['px']+b['mute']['px']]+[p for b in kj for p in b['px']+b['shell']['blackPx']]+[p for t in tees for p in t['px']])
spr=ndi.binary_dilation(ndi.binary_fill_holes(spr),iterations=3)
samp=lambda I,x,y: ndi.map_coordinates(I,[np.atleast_1d(y),np.atleast_1d(x)],order=1,mode='nearest')
SPR=spr.astype(float)
def profile_pts(p0,u,t0,t1,half=22,step=1.0):
    """lateral brightness-excess centroid of the ribbon at stations t0..t1 along u from p0; sprite px masked."""
    n=np.array([-u[1],u[0]]); offs=np.arange(-half,half+0.01,0.5); out=[]
    for t in np.arange(t0,t1,step):
        q=p0+u*t; X=q[0]+n[0]*offs; Y=q[1]+n[1]*offs
        bad=samp(SPR,X,Y)>0.01
        if bad.mean()>0.25: continue
        v=samp(lum,X,Y); v=np.where(bad,np.nan,v); v=np.where(np.isnan(v),np.nanmedian(v),v)
        vs=np.convolve(v,np.ones(7)/7,'same'); e=vs-np.median(vs[np.r_[0:8,-8:0]]); w=np.clip(e,0,None)
        if w.sum()<20: continue
        # restrict to the main bright lobe around the max
        k=int(np.argmax(vs)); lo=k; hi=k
        while lo>0 and w[lo-1]>0.2*w[k]: lo-=1
        while hi<len(w)-1 and w[hi+1]>0.2*w[k]: hi+=1
        ww=w[lo:hi+1]; c=(offs[lo:hi+1]*ww).sum()/ww.sum()
        out.append((t,c,(offs[hi]-offs[lo])))
    return np.array(out)
def line_fit(p0,u,pts):
    n=np.array([-u[1],u[0]]); P=p0[None]+np.outer(pts[:,0],u)+np.outer(pts[:,1],n)
    m=P.mean(0); _,_,vt=np.linalg.svd(P-m); d=vt[0]
    if d@u<0: d=-d
    r=(P-m)@np.array([-d[1],d[0]])
    return m,d,P,r
if __name__=='__main__':
    rows=[]
    for r in fit['rows']:
        c=np.array([r['cx'],r['cy']]); best=None
        for a in np.arange(0,360,1.0):
            u=np.array([math.cos(math.radians(a)),math.sin(math.radians(a))]); n=np.array([-u[1],u[0]])
            ts=np.arange(20,70,2.0); tot=0; cnt=0
            for t in ts:
                q=c+u*t
                on=samp(lum,q[0]+n[0]*np.arange(-4,4.1,2),q[1]+n[1]*np.arange(-4,4.1,2)); sd=samp(lum,q[0]+n[0]*np.r_[-16,-14,14,16],q[1]+n[1]*np.r_[-16,-14,14,16])
                b=samp(SPR,q[0]+n[0]*np.r_[-16,0,16],q[1]+n[1]*np.r_[-16,0,16])
                if b.max()>0.01: continue
                tot+=on.mean()-sd.mean(); cnt+=1
            if cnt>=8 and (best is None or tot/cnt>best[1]): best=(a,tot/cnt)
        u=np.array([math.cos(math.radians(best[0])),math.sin(math.radians(best[0]))])
        pts=profile_pts(c,u,16,80)
        if len(pts)<8: rows.append(dict(tee=r['tee'],ok=False)); continue
        m,d,P,res=line_fit(c,u,pts)
        lat=float((c-m)@np.array([-d[1],d[0]])); pathDeg=math.degrees(math.atan2(d[1],d[0]))
        axis=abs((pathDeg-r['thDeg']+90)%180-90)
        rows.append(dict(tee=r['tee'],ok=True,pathDeg=round(pathDeg,2),padDeg=round(r['thDeg'],2),pathVsAxisDeg=round(axis,2),
             teeCentreOffLinePx=round(lat,2),lineResidMedPx=round(float(np.median(np.abs(res))),2),widthMedPx=round(float(np.median(pts[:,2])),1),n=len(pts),contrast=round(best[1],1)))
        print(rows[-1])
    json.dump(rows,open('calib.json','w'),indent=1)
