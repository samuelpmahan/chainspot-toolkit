# Along-path averaged profiles over VISIBLE stations only (a station is dropped when >20% of its lateral samples are masked).
import math, numpy as np
from course import samp
from track import OFFS, edge_pair
def unit(phi): return np.array([math.cos(phi),math.sin(phi)])
def profile_vis(C,O,phi,t0,t1,W,step=1.0,maxmask=0.2):
    u=unit(phi); n=np.array([-u[1],u[0]]); T=np.arange(t0,t1,step)
    if len(T)==0: return None,None,0
    X=O[0]+T[:,None]*u[0]+OFFS[None]*n[0]; Y=O[1]+T[:,None]*u[1]+OFFS[None]*n[1]
    inside=(X>1)&(X<C.W-2)&(Y>1)&(Y<C.H-2)
    v=samp(C.lum,X.ravel(),Y.ravel()).reshape(X.shape); b=(samp(C.MASK,X.ravel(),Y.ravel()).reshape(X.shape)>0.01)|~inside
    core=np.abs(OFFS)<=W/2+6; keep=b[:,core].mean(1)<=maxmask
    if keep.sum()<5: return None,None,0
    v=np.where(b,np.nan,v)[keep]; ok=(~b[keep]).sum(0)
    with np.errstate(all='ignore'): prof=np.nanmean(v,0)
    return prof,ok,int(keep.sum())
def fit_vis(C,O,phi0,t0,t1,W,span=2.0,dstep=0.1,tolW=1.5,lat_lim=6.0):
    best=None
    for d in np.arange(-span,span+1e-9,dstep):
        phi=phi0+math.radians(d); prof,ok,nT=profile_vis(C,O,phi,t0,t1,W)
        e=edge_pair(prof,ok,nT,W,tolW,lat_lim) if prof is not None else None
        if e and (best is None or e['score']>best['score']): best=dict(e,phi=phi,nStations=nT)
    return best
def fit_free_vis(C,O,phi0,t0,t1,Wexp,span=3.0,dstep=0.25,tolW=3.0,lat_lim=12.0):
    return fit_vis(C,O,phi0,t0,t1,Wexp,span=span,dstep=dstep,tolW=tolW,lat_lim=lat_lim)
