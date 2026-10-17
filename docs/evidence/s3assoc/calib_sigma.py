import json, math, numpy as np
from scipy.optimize import minimize
ST='/home/user/chainspot-toolkit/attempts/stages'
C=[('golden','attempt-1792256170903-b68743f9e95c'),('lenard','attempt-1792256225103-92dacbe97c0f'),('townelake','attempt-1792256243822-fb785314ae52'),('heritage','attempt-1792256261126-6ee7ff71e848'),('alex','attempt-1792263349086-27173a1f38f5')]
D=[]; R_={}
for c,att in C:
    R=json.load(open(f'{ST}/{att}/fork/stage-output/s3assoc/px.tees.association.json')); R_[c]=R
    J={p['tee']:p for p in (R['judgement'] or {}).get('perTee',[])}
    for r in R['rows']:
        ok=J.get(r['tee'],{}).get('badgeAgrees', c=='alex')   # alex: no testimony, its 13 pairings are unique (path side settles #12)
        if ok: D.append((r['best']['latPx'],r['best']['distPx'],r['pose']['sigmaRaw']['thDeg'],c))
lat=np.array([d[0] for d in D]); dist=np.array([d[1] for d in D]); sr=np.radians(np.array([d[2] for d in D]))
def nll(p):
    s0,k=np.exp(p); v=s0**2+(dist*k*sr)**2
    return np.sum(0.5*np.log(v)+lat**2/(2*v))
r=minimize(nll,[0,1.5],method='Nelder-Mead'); s0,k=np.exp(r.x)
z=lat/np.sqrt(s0**2+(dist*k*sr)**2)
print(f'calibrated on {len(D)} confirmed pairings: sigma0 {s0:.2f} px (badge+pad centre), sigma_theta = {k:.1f} x raw; |z| median {np.median(np.abs(z)):.2f} (0.67 expected), max {np.abs(z).max():.2f}')
json.dump(dict(sigma0Px=s0,thetaScale=k,n=len(D)),open('/tmp/claude-0/-home-user/73d91f40-13de-5bef-9b81-7de266a5102a/scratchpad/inspect/sigma_calib.json','w'))
# for every pad: all badges within z<=3 (any distance)
for c,att in C:
    R=R_[c]; J={p['tee']:p for p in (R['judgement'] or {}).get('perTee',[])}
    A=f'{ST}/{att}/fork/stage-output/early/artifacts'; bj=json.load(open(f'{A}/s1/px.badges.json'))['badges']
    multi=[]
    for r in R['rows']:
        cx,cy=r['center']; th=math.radians(r['thDeg']); st=math.radians(r['pose']['sigmaRaw']['thDeg'])*k
        cons=[]
        for b in bj:
            x,y,w,h=b['bbox']; v=np.array([x+(w-1)/2-cx,y+(h-1)/2-cy]); d=np.linalg.norm(v)
            if d<10: continue
            u=np.array([math.cos(th),math.sin(th)]); l=abs(u[0]*v[1]-u[1]*v[0]); zz=l/math.sqrt(s0**2+(d*st)**2)
            if zz<=3: cons.append((str(b['label']),round(zz,2),round(d)))
        cons.sort(key=lambda t:t[1])
        if len(cons)>1: multi.append((r['tee'],J.get(r['tee'],{}).get('hole'),cons))
    print(f'{c}: pads with more than one badge consistent at z<=3: {len(multi)}/{len(R["rows"])}', *[f'\n    S3#{t} (Sam hole {h}): {cs}' for t,h,cs in multi])
