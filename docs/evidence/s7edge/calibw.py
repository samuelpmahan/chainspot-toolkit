# Per-course ribbon width from the first 90 px off every visible pad (both senses tried; best edges win).
import sys, math, json, numpy as np
from course import Course
from track import fit_free
name=sys.argv[1]; C=Course(name); rows=[]
for p in C.pads:
    c=np.array([p['cx'],p['cy']]); best=None
    for sense in (0,180):
        phi=math.radians(p['thDeg']+sense)
        f=fit_free(C,c,phi,C.L/2+4,C.L/2+70,Wexp=1.35*C.L,span=2.0,tolW=0.35*C.L,lat_lim=6.0)
        if f and (best is None or f['score']>best[1]['score']): best=(sense,f)
    if best: rows.append(dict(label=p.get('label',p.get('tee')),sense=best[0],w=best[1]['w'],c=best[1]['c'],axisDeg=math.degrees(best[1]['phi'])-p['thDeg']-best[0],score=best[1]['score']))
W=np.array([r['w'] for r in rows]); good=np.abs(W-np.median(W))<2
print(name,'ribbon width px: median %.2f, IQR %.2f..%.2f, n %d/%d, centre off median |%.2f| px, L %.2f px -> width/L %.3f'%(np.median(W[good]),*np.percentile(W[good],[25,75]),good.sum(),len(W),np.median(np.abs([r['c'] for r in rows])),C.L,np.median(W[good])/C.L))
json.dump(dict(width=float(np.median(W[good])),rows=rows),open(f'width-{name}.json','w'),indent=1)
