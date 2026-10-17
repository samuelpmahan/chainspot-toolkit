import sys, math, json, warnings, numpy as np
warnings.filterwarnings('ignore')
from course import Course
from contrast import unit
import follow
from follow import trace, refine, residuals
name=sys.argv[1]; C=Course(name); Wj=json.load(open(f'width-{name}.json')); W=Wj['width']
BC=np.array([(b['bbox'][0]+(b['bbox'][2]-1)/2,b['bbox'][1]+(b['bbox'][3]-1)/2) for b in C.bj])
def badge_sense(p,fallback):
    c=np.array([p['cx'],p['cy']]); a=math.radians(p['thDeg']); u=np.array([math.cos(a),math.sin(a)]); n=np.array([-u[1],u[0]])
    d=BC-c; al=d@u; la=d@n; an=np.degrees(np.arctan2(np.abs(la),np.abs(al)))
    cand=[(abs(x),x) for x,y in zip(al,an) if y<=1.5 and abs(x)<300]
    return (0 if min(cand)[1]>0 else 180) if cand else fallback
out=[]
for p,w in zip(C.pads,Wj['rows']):
    a=math.radians(p['thDeg']); follow.TEES.append((np.array([p['cx'],p['cy']]),np.array([math.cos(a),math.sin(a)])))
for p,w in zip(C.pads,Wj['rows']):
    c=np.array([p['cx'],p['cy']]); cands=[]
    for sense in (0,180):
        phi=math.radians(p['thDeg']+sense); S0=c+unit(phi)*(10.6/25.02*C.L)
        rr=trace(C,S0,phi,W,self_c=c); mp=min(l['passFrac'] for l in rr['legs'])
        cands.append(((rr['end'] is not None, mp, sense==badge_sense(p,-1)),sense,rr))
    cands.sort(key=lambda z:z[0],reverse=True); _,s_,r=cands[0]; w=dict(w,sense=s_)
    rec=dict(minPass=min(l['passFrac'] for l in r['legs']),tee=str(p.get('label',p.get('tee'))),pad=[p['cx'],p['cy'],p['thDeg']],sense=w['sense'],end=r['end'],legs=r['legs'],coarse=np.round(r['verts'],2).tolist())
    if r['end'] is not None:
        V,lines=refine(C,r['verts'],W); cs,ws=residuals(C,V,W)
        rec.update(verts=np.round(V,2).tolist(),bends=len(V)-2,resCentreMedPx=round(float(np.median(np.abs(cs))),2) if len(cs) else None,resCentreP90Px=round(float(np.percentile(np.abs(cs),90)),2) if len(cs) else None,
                   widthMedPx=round(float(np.median(ws)),2) if len(ws) else None,widthStdPx=round(float(np.std(ws)),2) if len(ws) else None,nWin=int(len(cs)))
    else: rec.update(verts=np.round(r['verts'],2).tolist(),bends=None)
    out.append(rec)
    L=rec['legs']
    print(f"tee {rec['tee']:>3}: {'END BP'+str(rec['end']) if rec['end'] is not None else 'LOST    '} bends {rec['bends']}  legs "+' | '.join(f"{l['phiDeg']:.0f}deg run {l['tEnd']:.0f}px pass {l['passFrac']}"+(f" bend {l['bendDeg']}" if 'bendDeg' in l else '')+(f" endLat {l['endLatPx']}" if 'endLatPx' in l else '') for l in L)+(f"  | res centre med {rec['resCentreMedPx']} p90 {rec['resCentreP90Px']} px, width {rec['widthMedPx']}±{rec['widthStdPx']} px (n {rec['nWin']})" if rec['end'] is not None else ''))
json.dump(out,open(f'trace-{name}.json','w'),indent=1,default=float)
