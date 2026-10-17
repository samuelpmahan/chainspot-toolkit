# Truth-blind ribbon width per course: pass fraction of the fixed-centreline edge test along every visible pad's axis, scanned over W.
import sys, json, math, numpy as np, warnings; warnings.filterwarnings('ignore')
from course import Course
from contrast import station_contrast
name=sys.argv[1]; C=Course(name); Ws=np.arange(max(14,0.8*C.R1),2.2*C.R1,0.5); M=np.zeros(len(Ws))
for p in C.pads:
    c=np.array([p['cx'],p['cy']]); best=np.zeros(len(Ws))
    for sense in (0,180):
        phi=math.radians(p['thDeg']+sense); row=[]
        for W in Ws:
            ts=np.arange(C.L/2+W*0.5,C.L/2+W*0.5+60,1.0); cl,cr,okl,okr=station_contrast(C,c,phi,ts,W); v=okl&okr
            row.append(float((np.minimum(cl,cr)[v]>8).mean()) if v.sum()>=15 else 0)
        best=np.maximum(best,row)
    M+=best
M/=len(C.pads); top=M.max(); plateau=Ws[M>=0.95*top]
W=float(plateau.mean())
print(f'{name}: W {W:.2f} px (plateau {plateau.min():.1f}..{plateau.max():.1f}, peak pass {top:.2f}, {len(C.pads)} pads; R1 {C.R1:.1f} px, W/R1 {W/C.R1:.2f})')
json.dump(dict(width=W,plateau=[float(plateau.min()),float(plateau.max())],peak=float(top)),open(f'widthscan-{name}.json','w'))
