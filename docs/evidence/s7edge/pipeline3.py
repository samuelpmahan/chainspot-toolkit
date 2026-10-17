# Sam's order: tee (frozen S3 association) -> badge -> 0-bend holes by the straight segment test -> bent / hidden holes by tracing.
import sys, json, math, numpy as np, warnings; warnings.filterwarnings('ignore')
from course import Course
from contrast import unit
import follow, badgeseed
from follow import trace
from polyscore import refine_vertices, poly_score, cap_score
from visfit import profile_vis, fit_vis, fit_free_vis
from track import edge_pair
name=sys.argv[1]; C=Course(name); W=json.load(open(f'widthscan-{name}.json'))['width']
AS=json.load(open(f'/home/user/chainspot-toolkit/baselines/s3assoc/{name}.json')); L=AS['template']['L']; FRONT=10.6/25.02
follow.TEES.clear()
for p in C.pads:
    a=math.radians(p['thDeg']); follow.TEES.append((np.array([p['cx'],p['cy']]),np.array([math.cos(a),math.sin(a)])))
def nearest_bp(pt,tol=2.5):
    d=np.hypot(*(C.bp-np.array(pt)).T); k=int(np.argmin(d)); return (k,float(d[k])) if d[k]<=tol else (None,float(d[k]))
def verify_straight(tee,bp):
    d=bp-tee; Lg=float(np.linalg.norm(d)); phi=math.atan2(d[1],d[0]); S0=FRONT*L
    t0=S0+2; t1=Lg-W*0.5
    prof,ok,nT=profile_vis(C,tee,phi,t0,t1,W); e=edge_pair(prof,ok,nT,W,tolW=4.0,lat_lim=6.0) if prof is not None else None
    comp=0.0; a1=max(6.0,math.degrees(math.atan(W/max(Lg-S0,1.0))))
    for dd in (-2*a1,-a1,a1,2*a1):
        p2,o2,n2=profile_vis(C,tee,phi+math.radians(dd),t0,t1,W); e2=edge_pair(p2,o2,n2,W,tolW=4.0,lat_lim=6.0) if p2 is not None else None
        if e2: comp=max(comp,min(e2['gl'],e2['gr']))
    if e is None: return dict(ok=False,why='no edge pair',nStations=nT,lenPx=round(Lg,1),competitorStep=round(comp,1))
    st=min(e['gl'],e['gr'])
    # the hallway must END at the BasketPoint: no ribbon continuing straight past it (stations from BP+W/2+2 on)
    pp,op,np_=profile_vis(C,bp,phi,W/2+2,W/2+70,W); ep=edge_pair(pp,op,np_,W,tolW=2.0,lat_lim=3.0) if pp is not None else None
    past=min(ep['gl'],ep['gr']) if ep else 0.0
    okk=abs(e['w']-W)<=1.5 and abs(e['c'])<=1.5 and st>=2*max(comp,1.0) and past<0.5*st
    return dict(ok=bool(okk),widthPx=round(e['w'],2),centrePx=round(e['c'],2),stepLumPerPx=[round(e['gl'],1),round(e['gr'],1)],competitorStep=round(comp,1),competitorDeg=round(a1,1),pastBasketStep=round(past,1),nStations=nT,lenPx=round(Lg,1),
                why=None if okk else ('width' if abs(e['w']-W)>1.5 else 'centre' if abs(e['c'])>1.5 else 'not above competitor' if st<2*max(comp,1.0) else 'ribbon runs on past the BasketPoint'))
out={}; claimed=set()
holes={int(h['badgeLabel']):h for h in AS['holes'].values() if h['verdict'] in ('ASSOCIATED','ASSOCIATED_BY_EXCLUSIVITY')}
# step 2: straight holes
for n,h in sorted(holes.items()):
    tee=np.array(h['teeCenter']); s3=h.get('straight3',{})
    if s3.get('verdict')=='STRAIGHT':
        bp=np.array(s3['basketPoint']); v=verify_straight(tee,bp); k,dk=nearest_bp(bp)
        if v['ok']:
            out[n]=dict(hole=n,method='straight segment (S3 association, verified)',tee=tee.tolist(),teeVisible=True,teePred=tee.tolist(),capCentre=(tee+(bp-tee)/np.linalg.norm(bp-tee)*FRONT*L).tolist(),teeErrPx=0.0,padCentre=tee.tolist(),verts=[tee.tolist(),C.bp[k].tolist() if k is not None else bp.tolist()],end=k,bends=0,verify=v); claimed.add(k)
        else: out[n]=dict(hole=n,pending='bent',verify=v)
    else: out[n]=dict(hole=n,pending='bent')
# straight holes sharing a BasketPoint: the one whose ribbon actually caps there keeps it; the other is bent
byk={}
for n,r in out.items():
    if r.get('bends')==0 and r.get('end') is not None: byk.setdefault(r['end'],[]).append(n)
for k,ns in byk.items():
    if len(ns)<2: continue
    sc=[]
    for n in ns:
        tee=np.array(out[n]['tee']); d=C.bp[k]-tee; ub=-d/np.linalg.norm(d)   # cap_score's ub points from the cap back along the ribbon
        sc.append((cap_score(C,C.bp[k],-ub,W),n))
    sc.sort(reverse=True)
    for s_,n in sc[1:]:
        v=out[n]['verify']; v['ok']=False; v['why']=f'BP{k} is capped by hole {sc[0][1]} (cap score {sc[0][0]:.1f} vs {s_:.1f} lum)'
        out[n]=dict(hole=n,pending='bent',verify=v); claimed.discard(k)
    claimed.add(k)
# step 3a: associated but bent (or failed straight): trace from the pad along its axis toward the badge
for n,h in sorted(holes.items()):
    if 'pending' not in out[n]: continue
    tee=np.array(h['teeCenter']); u=np.array(h['u'],float); u/=np.linalg.norm(u); phi0=math.atan2(u[1],u[0])
    f=fit_vis(C,tee,phi0,FRONT*L+2,FRONT*L+90,W,span=2.0,dstep=0.1,tolW=2.0,lat_lim=2.0)
    phi=f['phi'] if f else phi0
    start=tee+unit(phi)*FRONT*L
    r=trace(C,start,phi,W,self_c=tee,exclude_bp=tuple(k for k in claimed if k is not None))
    rec=dict(hole=n,method='traced from the associated pad'+(' (straight test failed: %s)'%out[n]['verify']['why'] if out[n].get('verify') else ''),tee=tee.tolist(),teeVisible=True,firstLegDeg=round(math.degrees(phi),2),
             verify=out[n].get('verify'),end=r['end'],legs=r['legs'])
    V=np.vstack([tee,r['verts'][1:]]) if r['end'] is not None else r['verts']
    if r['end'] is not None and len(V)>2: V,s1=refine_vertices(C,V,W,pad_axis=unit(phi)); rec['polyScore']=round(s1,2)
    rec['verts']=np.round(V,2).tolist(); rec['bends']=len(V)-2 if r['end'] is not None else None
    if r['end'] is None: rec['lostAt']=np.round(r['verts'][-1],2).tolist()
    else: claimed.add(r['end'])
    rec.update(teePred=tee.tolist(),capCentre=(tee+unit(phi)*FRONT*L).tolist(),teeErrPx=0.0,padCentre=tee.tolist())
    out[n]=rec
# step 3b: everything else (no association: hidden tee, ambiguous): badge scan with visible-only verification
badgeseed.fit_free=fit_free_vis
_tr=badgeseed.trace
badgeseed.trace=lambda C_,s_,p_,W_,self_c=None: _tr(C_,s_,p_,W_,self_c=self_c,exclude_bp=tuple(k for k in claimed if k is not None))
badgeseed.FRONT=FRONT; C.L=L
for n in sorted(C.badges):
    if n in out and out[n].get('end') is None and 'pending' not in out[n] and out[n].get('method','').startswith('traced'):
        r=badgeseed.seed_one(C,n,W,C.pads)
        if r.get('end') is not None and r['end'] not in claimed:
            r['method']='badge scan (pad trace lost at %s)'%out[n].get('lostAt'); claimed.add(r['end']); out[n]=r
        continue
    if n in out: continue
    r=badgeseed.seed_one(C,n,W,C.pads); r['method']='badge scan (no frozen association)'
    if r.get('end') is not None: claimed.add(r['end'])
    out[n]=r
res=[out[n] for n in sorted(out)]
json.dump(dict(width=W,holes=res),open(f'p3-{name}.json','w'),indent=1,default=float)
for r in res:
    v=r.get('verify') or {}
    print(f"{name} hole {r['hole']:2d}: {r.get('method','?')[:58]:58} end {('BP'+str(r['end'])) if r.get('end') is not None else 'LOST' if 'fail' not in r else 'FAIL'} bends {r.get('bends')}"+(f" | straight test w {v.get('widthPx')} c {v.get('centrePx')} steps {v.get('stepLumPerPx')} vs competitor {v.get('competitorStep')} (±{v.get('competitorDeg')} deg), past basket {v.get('pastBasketStep')} ({v.get('nStations')} stations){' FAIL '+str(v.get('why')) if v.get('why') else ''}" if v else ''))
