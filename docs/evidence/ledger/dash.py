# python3 dash.py   (after measure.py; writes dash-raw.json)
# C2D dash period along the arc (px of arc length): per basket, sample luminance on the C2 circle (R2 from ledger-raw.json)
# every 0.25 px of arc, sprites masked, high-passed; pooled sinusoid power over periods 8-80 px. Also C1 (solid) as control.
import json, numpy as np
from scipy import ndimage as ndi
exec(open('measure.py').read().split('rows={}')[0])   # IMAGES, ST, W, BPD, samp, tees_of
raw=json.load(open('measure-raw.json')); out={}
P=np.arange(8,80,0.25)
def power(seqs):
    tot=np.zeros(len(P)); n=0
    for s,ok in seqs:
        x=np.arange(len(s))*0.25
        if ok.sum()<200: continue
        y=s-ndi.uniform_filter1d(s,int(120/0.25)); y=y[ok]; xx=x[ok]; y=y-y.mean(); n+=1
        for i,p in enumerate(P):
            c=np.cos(2*np.pi*xx/p); d=np.sin(2*np.pi*xx/p); tot[i]+=(c@y)**2/(c@c)+(d@y)**2/(d@d)
    return tot/max(n,1), n
for name,scale,att in IMAGES:
    A=f'{ST}/{att}/fork/stage-output/early/artifacts'
    bj=json.load(open(f'{A}/s1/px.badges.json'))['badges']; kj=json.load(open(f'{A}/s2/px.baskets.json'))['baskets']; tj,_=tees_of(A)
    rgb=np.fromfile(f'{A}/s1/badgePx.rgba.bin',dtype=np.uint8); H=rgb.size//4//W; lum=rgb.reshape(H,W,4)[...,:3].astype(float).mean(-1)
    m=np.zeros(H*W,bool); m[[p for k in kj for p in k['px']+k['shell']['blackPx']]+[p for b in bj for p in b['px']+b['mute']['px']]+[p for t in tj for p in t['px']]]=True
    SPR=ndi.binary_dilation(ndi.binary_fill_holes(m.reshape(H,W)),iterations=3).astype(float)
    bps=np.array([[k['bbox'][0]+22.5,k['bbox'][1]+71] for k in kj])+BPD; r=raw[name]['rings']
    res={}
    for ring,R in (('C2D',r['R2']),('C1S',r['R1'])):
        seqs=[]
        for bx,by in bps:
            th=np.arange(0,2*np.pi*R,0.25)/R; X=bx+R*np.cos(th); Y=by+R*np.sin(th)
            ok=(samp(SPR,X,Y)<0.01)&(X>1)&(X<W-2)&(Y>1)&(Y<H-2)
            # other baskets' rings cross this one: mask within 4 px of any other ring
            for ox,oy in bps:
                if (ox,oy)==(bx,by): continue
                d=np.hypot(X-ox,Y-oy); ok&=(np.abs(d-r['R1'])>4)&(np.abs(d-r['R2'])>5)
            seqs.append((samp(lum,X,Y),ok))
        pw,n=power(seqs); i=int(np.argmax(pw)); res[ring]=dict(periodPx=float(P[i]),peakOverMedian=round(float(pw[i]/np.median(pw)),1),baskets=n)
    out[name]=dict(scale=scale,R2=r['R2'],**res); print(name,scale,res)
json.dump(out,open('dash-raw.json','w'),indent=1)
