import sys, json, math, numpy as np, warnings; warnings.filterwarnings('ignore')
from course import Course
from polyscore import poly_score, refine_vertices
name=sys.argv[1]; C=Course(name); W=json.load(open(f'width-{name}.json'))['width']; T=json.load(open(f'judged-{name}.json'))
truth={}
if name=='golden':
    a=json.load(open('/home/user/chainspot-toolkit/testimony/golden/DashsTrack-full.annotation.json'))
    for h in a['holes']: truth[h['number']]=[np.array([b['xPx'],b['yPx']-4]) for b in h['corridorBends']]
else:
    a=json.load(open('../alex-ann.json')); HOLE={1:16,2:13,3:6}
    for h in a['holes']:
        L=np.array([[p['xPx'],p['yPx']-4] for p in h['left']]); R=np.array([[p['xPx'],p['yPx']-4] for p in h['right']])
        if np.hypot(*(R[0]-L[0]))>np.hypot(*(R[-1]-L[0])): R=R[::-1]
        truth[HOLE[h['number']]]=list(((L+R)/2)[1:-1])
for t in T:
    if t['end'] is None or len(t['verts'])<3: continue
    V=np.array(t['verts']); s0,_=poly_score(C,V,W)
    u=(V[1]-V[0])/np.linalg.norm(V[1]-V[0])
    Vr,s1=refine_vertices(C,V,W,pad_axis=u)
    t['vertsRefined']=np.round(Vr,2).tolist(); t['polyScore']=[round(s0,2),round(s1,2)]
    line=f"tee {t['tee']:>3} ({t['status'][:9]}): score traced {s0:.2f} -> refined {s1:.2f} lum; vertices "+' '.join(f'({v[0]:.1f},{v[1]:.1f})' for v in Vr[1:-1])
    if t.get('truth') and t['truth']['hole'] in truth and len(truth[t['truth']['hole']]):
        tb=truth[t['truth']['hole']]; err=[float(np.hypot(*(Vr[1:-1]-b).T).min()) for b in tb]
        # Sam's polyline scored the same way (start/end = ours)
        Vs=np.array([V[0]]+[np.array(b) for b in tb]+[V[-1]]); ss,_=poly_score(C,Vs,W)
        t['truthCmp']=dict(hole=t['truth']['hole'],bendErrRefinedPx=[round(e,2) for e in err],samPolyScore=round(ss,2))
        line+=f" | hole {t['truth']['hole']}: Sam bend err {[round(e,1) for e in err]} px; Sam's polyline scores {ss:.2f} lum"
    print(line)
json.dump(T,open(f'judged-{name}.json','w'),indent=1,default=float)
