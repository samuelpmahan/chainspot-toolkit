# Render-and-score a ribbon polyline (round joins/caps): edge contrast over every visible pixel within 3 px of the predicted edge.
import math, numpy as np
def seg_dist(X,Y,a,b):
    d=b-a; L2=max(d@d,1e-9); t=np.clip(((X-a[0])*d[0]+(Y-a[1])*d[1])/L2,0,1)
    return np.hypot(X-(a[0]+t*d[0]),Y-(a[1]+t*d[1]))
def poly_score(C,V,W,band=(0.5,3.0),pad=None):
    V=np.asarray(V,float); h=W/2; pad=pad or W
    x0,y0=np.floor(V.min(0)-h-band[1]-2).astype(int); x1,y1=np.ceil(V.max(0)+h+band[1]+3).astype(int)
    x0=max(x0,0); y0=max(y0,0); x1=min(x1,C.W); y1=min(y1,C.H)
    Y,X=np.mgrid[y0:y1,x0:x1].astype(float)
    D=np.min([seg_dist(X,Y,a,b) for a,b in zip(V[:-1],V[1:])],0)
    vis=C.MASK[y0:y1,x0:x1]<0.01; L=C.lum[y0:y1,x0:x1]
    # exclude the two end caps' neighbourhood (tee pad end, basket end): only the parallel edges carry the fit
    for e in (V[0],V[-1]): vis&=np.hypot(X-e[0],Y-e[1])>h+band[1]+2
    ins=vis&(D>=h-band[1])&(D<=h-band[0]); out=vis&(D>=h+band[0])&(D<=h+band[1])
    if ins.sum()<30 or out.sum()<30: return -99.0,0
    return float(L[ins].mean()-L[out].mean()), int(min(ins.sum(),out.sum()))
def refine_vertices(C,V,W,pad_axis=None,iters=3):
    """coordinate search: vertex 1 slides along the first-leg ray (pad axis), later vertices move in 2D; ends fixed."""
    V=np.array(V,float); best,_=poly_score(C,V,W)
    for it in range(iters):
        for i in range(1,len(V)-1):
            if i==1 and pad_axis is not None:
                u=pad_axis; cands=[V[1]+u*s for s in np.arange(-60,60.1,1.0 if it==0 else 0.25)]
            else:
                st=2.0 if it==0 else 0.5; rng=np.arange(-20,20.1,st) if it==0 else np.arange(-4,4.01,st)
                cands=[V[i]+np.array([dx,dy]) for dx in rng for dy in rng]
            for c in cands:
                Vt=V.copy(); Vt[i]=c; s,_=poly_score(C,Vt,W)
                if s>best: best=s; V=Vt
    return V,best
def cap_score(C,S0,ub,W,band=(0.5,3.0),reach=None):
    """contrast of a round ribbon cap at S0 (ribbon runs from S0 against ub, i.e. toward the badge), scored only near the cap."""
    h=W/2; reach=reach or 1.6*W
    A=S0; Bp=S0-ub*reach
    x0,y0=np.floor(np.minimum(A,Bp)-h-6).astype(int); x1,y1=np.ceil(np.maximum(A,Bp)+h+7).astype(int)
    x0=max(x0,0); y0=max(y0,0); x1=min(x1,C.W); y1=min(y1,C.H)
    Y,X=np.mgrid[y0:y1,x0:x1].astype(float); D=seg_dist(X,Y,A,Bp)
    along=(X-S0[0])*ub[0]+(Y-S0[1])*ub[1]                 # >0 = behind the cap centre
    vis=(C.MASK[y0:y1,x0:x1]<0.01)&(along>-0.6*W)
    L=C.lum[y0:y1,x0:x1]
    ins=vis&(D>=h-band[1])&(D<=h-band[0]); out=vis&(D>=h+band[0])&(D<=h+band[1])
    capi=ins&(along>0); capo=out&(along>0)
    if capi.sum()<12 or capo.sum()<12 or ins.sum()<30: return -99.0
    return float(L[ins].mean()-L[out].mean())+float(L[capi].mean()-L[capo].mean())
