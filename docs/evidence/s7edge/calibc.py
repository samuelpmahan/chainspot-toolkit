import sys, math, json, warnings, numpy as np
warnings.filterwarnings('ignore')
from course import Course
from contrast import station_contrast, unit
name=sys.argv[1]; C=Course(name); Wj=json.load(open(f'width-{name}.json')); Wc=Wj['width']
on=[];off=[]
for p,w in zip(C.pads,Wj['rows']):
    phi=math.radians(p['thDeg']+w['sense']); c=np.array([p['cx'],p['cy']]); S0=c+unit(phi)*(10.6/25.02*C.L)
    ts=np.arange(Wc*0.6,120,1.0)
    cl,cr,okl,okr=station_contrast(C,S0,phi,ts,Wc); m=okl&okr; on.append(np.minimum(cl,cr)[m])
    for dd in (25,-25):
        cl,cr,okl,okr=station_contrast(C,S0,phi+math.radians(dd),ts,Wc); m=okl&okr; off.append(np.minimum(cl,cr)[m])
on=np.concatenate(on); off=np.concatenate(off)
for q in (5,10,25,50): print(f'{name} min-side contrast p{q}: on-ribbon {np.percentile(on,q):6.1f}  off {np.percentile(off,100-q):6.1f} (p{100-q})')
for tau in (3,5,8,10): print(f'  tau {tau}: on pass {np.mean(on>tau):.2f}  off pass {np.mean(off>tau):.2f}')
