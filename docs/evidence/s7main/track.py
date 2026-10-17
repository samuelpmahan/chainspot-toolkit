# Ribbon-edge tracker: piecewise-linear centreline from a tee's front stroke to a BasketPoint, fitted on sub-pixel step edges.
import math, json, numpy as np
from course import Course, samp
OFFS=np.arange(-30,30.01,0.25)
def unit(phi): return np.array([math.cos(phi),math.sin(phi)])
def profile(C,O,phi,t0,t1,lat0=0.0,step=1.0):
    u=unit(phi); n=np.array([-u[1],u[0]]); T=np.arange(t0,t1,step)
    if len(T)==0: return None,None,0
    X=O[0]+T[:,None]*u[0]+(OFFS+lat0)[None]*n[0]; Y=O[1]+T[:,None]*u[1]+(OFFS+lat0)[None]*n[1]
    inside=(X>1)&(X<C.W-2)&(Y>1)&(Y<C.H-2)
    v=samp(C.lum,X.ravel(),Y.ravel()).reshape(X.shape); b=(samp(C.MASK,X.ravel(),Y.ravel()).reshape(X.shape)>0.01)|~inside
    v=np.where(b,np.nan,v); ok=(~b).sum(0)
    with np.errstate(all='ignore'): prof=np.nanmean(v,0)
    return prof,ok,len(T)
def edge_pair(prof,ok,nT,Wexp,tolW=3.0,lat_lim=12.0):
    """best rising (left) + falling (right) step pair with width near Wexp; sub-pixel; returns l, r, score, gl, gr."""
    if prof is None: return None
    p=prof.copy(); good=ok>=max(8,0.2*nT)   # absolute visible evidence: short holes are mostly covered by their own badge, basket and rings
    if good.mean()<0.6: return None
    idx=np.arange(len(p)); p[~good]=np.interp(idx[~good],idx[good],p[good])
    g=np.gradient(np.convolve(p,np.ones(5)/5,'same'))/0.25; g[:6]=0; g[-6:]=0; g[~good]=0
    best=None
    L=[i for i in range(1,len(g)-1) if g[i]>0 and g[i]>=g[i-1] and g[i]>=g[i+1]]
    R=[i for i in range(1,len(g)-1) if g[i]<0 and g[i]<=g[i-1] and g[i]<=g[i+1]]
    for i in L:
        for j in R:
            w=OFFS[j]-OFFS[i]
            if abs(w-Wexp)>tolW: continue
            c=(OFFS[i]+OFFS[j])/2
            if abs(c)>lat_lim: continue
            sc=min(g[i],-g[j])
            if best is None or sc>best[2]: best=(i,j,sc)
    if best is None: return None
    def sub(i):
        a,b,c=g[i-1],g[i],g[i+1]; den=a-2*b+c; return OFFS[i]+(0.5*(a-c)/den*0.25 if den!=0 else 0)
    i,j,sc=best; l,r=sub(i),sub(j)
    return dict(l=l,r=r,c=(l+r)/2,w=r-l,score=sc,gl=g[i],gr=-g[j])
def fit_free(C,O,phi0,t0,t1,Wexp,span=3.0,dstep=0.25,tolW=3.0,lat_lim=12.0):
    best=None
    for d in np.arange(-span,span+1e-9,dstep):
        phi=phi0+math.radians(d); prof,ok,nT=profile(C,O,phi,t0,t1)
        e=edge_pair(prof,ok,nT,Wexp,tolW,lat_lim)
        if e and (best is None or e['score']>best['score']): best=dict(e,phi=phi)
    return best

class Tracker:
    def __init__(s,C,Wc,win=30.0,step=6.0,drift=2.0,minscore=None):
        s.C=C; s.Wc=Wc; s.win=win; s.step=step; s.drift=drift; s.minscore=minscore
    def nearest_bp_ahead(s,O,phi,t_lo,t_hi,lat=4.0,exclude=()):
        u=unit(phi); n=np.array([-u[1],u[0]]); hits=[]
        for k,b in enumerate(s.C.bp):
            if k in exclude: continue
            d=b-O; a=d@u; l=d@n
            if t_lo<=a<=t_hi and abs(l)<=lat: hits.append((a,k,l))
        return min(hits) if hits else None
    def run(s,start,phi,max_len=1400,start_bp=None):
        C=s.C; O=np.array(start,float); verts=[O.copy()]; log=[]; t=0.0; seg_len=0.0; total=0.0; misses=0; bends=0
        while total<max_len:
            # end test: a BasketPoint on the current line within the next window
            hit=s.nearest_bp_ahead(O,phi,max(t-2,8),t+s.win+s.step,exclude=() if start_bp is None else (start_bp,))
            if hit is not None and hit[0]>20:
                a,k,l=hit; verts.append(C.bp[k].copy()); log.append(dict(t=a,kind='end',bp=int(k),latPx=round(l,2)))
                return dict(verts=np.array(verts),end=int(k),endLatPx=l,log=log,bends=bends)
            prof,ok,nT=profile(C,O,phi,t,t+s.win)
            e=edge_pair(prof,ok,nT,s.Wc)
            good = e is not None and abs(e['c'])<=s.drift and (s.minscore is None or e['score']>=s.minscore)
            if good:
                log.append(dict(t=t,c=e['c'],w=e['w'],score=e['score'])); misses=0
                # refresh the segment's line from its accumulated stations (keeps sub-pixel lateral, angle)
                t+=s.step; total+=s.step; continue
            # masked / weak window: tolerate a few (badges, baskets, other paths)
            if e is None or (s.minscore is not None and e['score']<s.minscore):
                misses+=1; log.append(dict(t=t,kind='weak')); 
                if misses<=6: t+=s.step; total+=s.step; continue
            # bend search: vertex B on the current line near here, new direction psi
            B,psi,ee=s.find_bend(O,phi,t)
            if B is None:
                log.append(dict(t=t,kind='lost')); verts.append(O+unit(phi)*t)
                return dict(verts=np.array(verts),end=None,log=log,bends=bends)
            verts.append(B.copy()); bends+=1; log.append(dict(t=t,kind='bend',B=B.round(2).tolist(),dDeg=round(math.degrees(psi-phi),1),score=ee['score']))
            total+=np.linalg.norm(B-O); O=B; phi=psi; t=12.0; misses=0
        verts.append(O+unit(phi)*t); return dict(verts=np.array(verts),end=None,log=log,bends=bends)
    def find_bend(s,O,phi,t):
        best=None; u=unit(phi)
        for tb in np.arange(max(10,t-24),t+s.win+6,2.0):
            B=O+u*tb
            for side in (1,-1):
                for d in np.arange(6,121,3.0):
                    psi=phi+side*math.radians(d)
                    prof,ok,nT=profile(s.C,B,psi,s.Wc*0.6,s.Wc*0.6+s.win+10)
                    e=edge_pair(prof,ok,nT,s.Wc,lat_lim=4.0)
                    if e is None: continue
                    sc=e['score']-2.0*abs(e['c'])
                    if best is None or sc>best[0]: best=(sc,tb,psi,e)
        if best is None or (s.minscore is not None and best[3]['score']<s.minscore): return None,None,None
        _,tb,psi,e=best
        # refine: free line on the new leg, vertex = intersection with the old line
        B0=O+u*tb; f=fit_free(s.C,B0,psi,s.Wc*0.6,s.Wc*0.6+45,s.Wc,span=4.0,lat_lim=6.0)
        if f is not None:
            v=unit(f['phi']); nn=np.array([-v[1],v[0]]); P=B0+nn*f['c']
            A=np.array([u,-v]).T
            try:
                a,bb=np.linalg.solve(A,P-O)
                if 0<a<t+s.win+40: return O+u*a,f['phi'],f
            except np.linalg.LinAlgError: pass
        return B0,psi,e
