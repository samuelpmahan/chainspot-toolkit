# Structure of C1S (solid ring) and C2D (dashed ring) per course, measured from every basket at once.
# Radial luminance profile around every BasketPoint (opaque sprites masked), relative to the local median -> ring peaks;
# FWHM -> stroke width; angular profile on C2 -> dash period and duty; stroke colour from pixels on the ring.
import json, math, sys, numpy as np
from scipy import ndimage as ndi
ST='/home/user/chainspot-toolkit/attempts/stages'; W=1290; BPD=np.array([0.34,0.73])
C={'golden':'attempt-1792256170903-b68743f9e95c','lenard':'attempt-1792256225103-92dacbe97c0f','townelake':'attempt-1792256243822-fb785314ae52','heritage':'attempt-1792256261126-6ee7ff71e848','alex':'attempt-1792263349086-27173a1f38f5'}
samp=lambda I,x,y: ndi.map_coordinates(I,[y,x],order=1,mode='nearest')
def fit(name):
    A=f'{ST}/{C[name]}/fork/stage-output/early/artifacts'
    raw=np.fromfile(f'{A}/s1/badgePx.rgba.bin',dtype=np.uint8); H=raw.size//4//W; rgb=raw.reshape(H,W,4)[...,:3].astype(float); lum=rgb.mean(-1)
    kj=json.load(open(f'{A}/s2/px.baskets.json'))['baskets']; bj=json.load(open(f'{A}/s1/px.badges.json'))['badges']
    tj=json.load(open(f'{A}/s3fix/px.tees.refined.json'))['tees']
    m=np.zeros(H*W,bool); m[[p for k in kj for p in k['px']+k['shell']['blackPx']]+[p for b in bj for p in b['px']+b['mute']['px']]+[p for t in tj for p in t['px']]]=True
    SPR=ndi.binary_dilation(ndi.binary_fill_holes(m.reshape(H,W)),iterations=2).astype(float)
    bps=np.array([[k['bbox'][0]+22.5,k['bbox'][1]+71] for k in kj])+BPD
    th=np.radians(np.arange(0,360,0.5)); rs=np.arange(6,140,0.25)
    prof=[];cnt=[]
    for r in rs:
        vals=[]
        for bx,by in bps:
            X=bx+r*np.cos(th); Y=by+r*np.sin(th); ok=(samp(SPR,X,Y)<0.01)&(X>1)&(X<W-2)&(Y>1)&(Y<H-2)
            if ok.sum()>40: vals.append(np.median(samp(lum,X[ok],Y[ok])))
        prof.append(np.mean(vals) if vals else np.nan)
    prof=np.array(prof); base=ndi.median_filter(np.nan_to_num(prof,nan=np.nanmean(prof)),size=41); e=prof-base
    # C1: strongest positive peak; C2: strongest peak near 2*R1 (searched, not assumed)
    # Structure, not the strongest peak: C2 = 2 x C1 (Sam). Score every R by e(R) + e(2R); on small-scale courses C1 sits
    # mostly under the basket sprite, so its own peak is weak and the lone strongest peak is C2.
    E=np.nan_to_num(e,nan=-9); best=None
    for i,r in enumerate(rs):
        if r<12 or 2*r>rs[-1]: continue
        j=int(np.argmin(np.abs(rs-2*r))); sc=E[i]+E[j]
        if best is None or sc>best[0]: best=(sc,i,j)
    _,i1,j=best
    # refine each ring to its own local peak (+-3 px) so the 2x ratio is measured, not imposed
    lo=lambda k: max(0,k-12); hi=lambda k: min(len(rs),k+13)
    i1=lo(i1)+int(np.argmax(E[lo(i1):hi(i1)])); i2=lo(j)+int(np.argmax(E[lo(j):hi(j)]))
    R1=float(rs[i1]); R2=float(rs[i2])
    def fwhm(i):
        h=e[i]/2; l=i; r=i
        while l>0 and e[l]>h: l-=1
        while r<len(e)-1 and e[r]>h: r+=1
        return float(rs[r]-rs[l])
    # dash structure on C2: angular luminance at R2 per basket, autocorrelation period in px of arc
    periods=[];duties=[];cols1=[];cols2=[]
    for bx,by in bps:
        X=bx+R2*np.cos(th); Y=by+R2*np.sin(th); ok=(samp(SPR,X,Y)<0.01)
        if ok.mean()<0.8: continue
        v=samp(lum,X,Y); v=v-ndi.uniform_filter1d(v,61,mode='wrap')
        ac=np.array([np.mean(v*np.roll(v,k)) for k in range(1,240)]); arc=np.arange(1,240)*np.radians(0.5)*R2
        pk=[k for k in range(2,len(ac)-1) if ac[k]>ac[k-1] and ac[k]>=ac[k+1] and ac[k]>0]
        if pk: periods.append(float(arc[pk[0]])); duties.append(float((v>0).mean()))
        for R,cl in ((R1,cols1),(R2,cols2)):
            X=bx+R*np.cos(th); Y=by+R*np.sin(th); ok=(samp(SPR,X,Y)<0.01); onr=np.stack([samp(rgb[...,c],X[ok],Y[ok]) for c in range(3)],1); cl.append(np.percentile(onr,90,axis=0))
    return dict(course=name,baskets=len(bps),C1S=dict(radiusPx=round(R1,2),strokeFwhmPx=round(fwhm(i1),2),peakLumAboveBase=round(float(e[i1]),1),colourRgbP90=np.median(cols1,0).round(0).tolist()),
                C2D=dict(radiusPx=round(R2,2),ratioToC1=round(R2/R1,3),strokeFwhmPx=round(fwhm(i2),2),peakLumAboveBase=round(float(e[i2]),1),dashPeriodPx=round(float(np.median(periods)),2) if periods else None,
                         dashPeriodIQR=[round(float(np.percentile(periods,q)),2) for q in (25,75)] if periods else None,litFraction=round(float(np.median(duties)),2) if duties else None,colourRgbP90=np.median(cols2,0).round(0).tolist(),basketsMeasured=len(periods)),
                profile=dict(rPx=rs[::4].round(2).tolist(),excessLum=np.nan_to_num(e[::4]).round(2).tolist()))
out={n:fit(n) for n in (sys.argv[1:] or C)}
json.dump(out,open('rings.json','w'),indent=1)
for n,r in out.items(): print(n,'C1S',r['C1S'],'| C2D',{k:v for k,v in r['C2D'].items()})
