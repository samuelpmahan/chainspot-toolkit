# Leg follower: fixed-centreline edge contrast run; bends where the run ends; stop at a BasketPoint on the leg.
import math, json, numpy as np
from contrast import station_contrast, unit
from track import fit_free, profile, edge_pair
TAU=8.0
def run_end(C,O,phi,W,t0,tmax=1500,G=None):
    ts=np.arange(t0,tmax,1.0); cl,cr,okl,okr=station_contrast(C,O,phi,ts,W)
    valid=okl&okr; ok=valid&(np.minimum(cl,cr)>TAU)
    inside=(O[0]+ts*math.cos(phi)>2)&(O[0]+ts*math.cos(phi)<C.W-3)&(O[1]+ts*math.sin(phi)>2)&(O[1]+ts*math.sin(phi)<C.H-3)
    G=int(1.0*W) if G is None else G; last=t0; fails=0
    for t,v,o,ins in zip(ts,valid,ok,inside):
        if not ins: break
        if not v: continue          # masked: neutral
        if o: last=t; fails=0
        else:
            fails+=1
            if fails>G: break
    seg=(ts>=t0)&(ts<=last)&valid
    frac=float(ok[seg].mean()) if seg.any() else 0.0
    return float(last),frac
def bp_on_leg(C,O,phi,t_lo,t_hi,lat=5.0,exclude=()):
    u=unit(phi); n=np.array([-u[1],u[0]]); hits=[]
    for k,b in enumerate(C.bp):
        if k in exclude: continue
        d=b-O; a=d@u; l=d@n
        if t_lo<=a<=t_hi and abs(l)<=lat: hits.append((a,k,l))
    return min(hits) if hits else None
TEES=[]   # (centre, axis unit) of every visible pad, set by the runner: a bend never continues onto another tee's own ribbon
def other_tee_ribbon(V,psi,W,self_c):
    u=unit(psi); n=np.array([-u[1],u[0]])
    for c,a in TEES:
        if np.hypot(*(c-self_c))<1: continue
        d=c-V; along=d@u; lat=d@n
        if -W<=along<=2.5*W and abs(lat)<=4 and abs(abs(a@u)-1)<1-math.cos(math.radians(4)): return True
    return False
def find_bend(C,O,phi,W,t_end,self_c=None):
    best=None; u=unit(phi)
    for tv in np.arange(max(W*0.5,t_end-1.2*W),t_end+W*0.9,1.0):
        V=O+u*tv
        for side in (1,-1):
            for d in np.arange(4,151,2.0):
                psi=phi+side*math.radians(d); ts=np.arange(W*0.75,W*0.75+70,1.0)
                if self_c is not None and other_tee_ribbon(V,psi,W,self_c): continue
                cl,cr,okl,okr=station_contrast(C,V,psi,ts,W); valid=okl&okr
                if valid.sum()<25: continue
                m=np.minimum(cl,cr)[valid]; sc=float((m>TAU).mean())+0.01*float(np.median(m))
                if best is None or sc>best[0]: best=(sc,tv,psi,float((m>TAU).mean()))
    return best
def close_on_bp(C,O,phi,W,t_end,used=()):
    """work back from a BasketPoint: last leg V->BP with V on the current leg near the run end; best pass fraction wins."""
    u=unit(phi); best=None
    for k,b in enumerate(C.bp):
        if k in used: continue
        if np.hypot(*(b-(O+u*t_end)))>8*W: continue
        for tv in np.arange(max(W*0.5,t_end-1.5*W),t_end+0.6*W,1.0):
            V=O+u*tv; d=b-V; Lg=np.linalg.norm(d)
            if Lg<1.2*W: continue
            psi=math.atan2(d[1],d[0]); turn=abs((math.degrees(psi-phi)+180)%360-180)
            if turn<4 or turn>150: continue
            ts=np.arange(W*0.75,Lg-W*0.5,1.0); cl,cr,okl,okr=station_contrast(C,V,psi,ts,W); valid=okl&okr
            if valid.sum()<12: continue
            pf=float((np.minimum(cl,cr)[valid]>TAU).mean())
            if best is None or pf>best[0]: best=(pf,k,tv,psi)
    return best
def trace(C,start,phi,W,max_legs=4,exclude_bp=(),self_c=None):
    O=np.array(start,float); verts=[O.copy()]; legs=[]
    for leg in range(max_legs):
        t_end,frac=run_end(C,O,phi,W,W*0.6 if leg==0 else W*0.75)
        hit=bp_on_leg(C,O,phi,W*0.5,t_end+1.6*W,exclude=exclude_bp)
        legs.append(dict(O=O.tolist(),phiDeg=math.degrees(phi),tEnd=t_end,passFrac=round(frac,2)))
        if hit is not None:
            a,k,l=hit; verts.append(C.bp[k].copy()); legs[-1].update(endBP=int(k),endLatPx=round(float(l),2),endAlongMinusRun=round(float(a-t_end),1))
            return dict(verts=np.array(verts),end=int(k),legs=legs)
        cb=close_on_bp(C,O,phi,W,t_end,used=exclude_bp)
        if cb is not None and cb[0]>=0.75:
            pf,k,tv,psi=cb; V=O+unit(phi)*tv; verts.append(V.copy()); legs[-1]['bendDeg']=round((math.degrees(psi-phi)+180)%360-180,1)
            legs.append(dict(O=V.tolist(),phiDeg=math.degrees(psi),tEnd=float(np.linalg.norm(C.bp[k]-V)),passFrac=round(pf,2),endBP=int(k),endLatPx=0.0,closedOnBP=True))
            verts.append(C.bp[k].copy()); return dict(verts=np.array(verts),end=int(k),legs=legs)
        b=find_bend(C,O,phi,W,t_end,self_c)
        if b is None or b[3]<0.6:
            legs[-1]['stop']='lost'; verts.append(O+unit(phi)*t_end); return dict(verts=np.array(verts),end=None,legs=legs)
        _,tv,psi,pf=b; V=O+unit(phi)*tv; verts.append(V.copy()); legs[-1]['bendDeg']=round((math.degrees(psi-phi)+180)%360-180,1)
        O=V; phi=psi
    return dict(verts=np.array(verts),end=None,legs=legs)
def refine(C,verts,W):
    """sub-pixel: each leg re-fitted on free step edges over its interior; inner vertices = intersections; ends fixed (tee front stroke, BasketPoint)."""
    V=[np.array(v,float) for v in verts]; lines=[]
    for a,b in zip(V[:-1],V[1:]):
        d=b-a; Lg=np.linalg.norm(d); phi=math.atan2(d[1],d[0])
        t0=W*0.75; t1=Lg-W*0.75
        if t1-t0<20: lines.append((a,unit(phi),None)); continue
        f=fit_free(C,a,phi,t0,t1,W,span=1.5,dstep=0.1,tolW=2.5,lat_lim=5.0)
        if f is None: lines.append((a,unit(phi),None)); continue
        u=unit(f['phi']); n=np.array([-u[1],u[0]]); lines.append((a+n*f['c'],u,f))
    newV=[V[0]]
    for (p1,u1,_),(p2,u2,_) in zip(lines[:-1],lines[1:]):
        A=np.array([u1,-u2]).T
        try: s,_=np.linalg.solve(A,p2-p1); newV.append(p1+u1*s)
        except np.linalg.LinAlgError: newV.append(V[len(newV)])
    newV.append(V[-1]); return np.array(newV),lines
def residuals(C,verts,W,win=24.0):
    """per-window free step edges along each leg: lateral centre offset (px) and width (px) vs the polyline."""
    cs=[];ws=[]
    for a,b in zip(verts[:-1],verts[1:]):
        d=b-a; Lg=np.linalg.norm(d); phi=math.atan2(d[1],d[0])
        for t in np.arange(W*0.75,Lg-W*0.75-win,win/2):
            prof,ok,nT=profile(C,a,phi,t,t+win); e=edge_pair(prof,ok,nT,W,tolW=3.0,lat_lim=6.0)
            if e: cs.append(e['c']); ws.append(e['w'])
    return np.array(cs),np.array(ws)
