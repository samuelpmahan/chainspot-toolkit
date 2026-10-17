# Per-station edge contrast of a ribbon with a fixed centreline: inside band minus outside band, each side.
import math, numpy as np
from course import samp
def unit(phi): return np.array([math.cos(phi),math.sin(phi)])
def station_contrast(C,O,phi,ts,W,band=(1.0,3.0),along=2.0):
    """left/right contrast (lum) and validity per station t in ts; centreline = O + t*u(phi)."""
    u=unit(phi); n=np.array([-u[1],u[0]]); h=W/2
    if len(ts)==0: z=np.zeros(0); return z,z,z.astype(bool),z.astype(bool)
    ins=np.arange(band[0],band[1]+1e-9,0.5); da=np.arange(-along,along+1e-9,1.0)
    res=[]
    for sgn in (-1,1):
        def S(off):
            TT=ts[:,None,None]+da[None,:,None]; OO=off[None,None,:]+0*TT
            X=O[0]+TT*u[0]+OO*n[0]; Y=O[1]+TT*u[1]+OO*n[1]
            ok=(X>1)&(X<C.W-2)&(Y>1)&(Y<C.H-2)
            v=samp(C.lum,X.ravel(),Y.ravel()).reshape(X.shape); m=(samp(C.MASK,X.ravel(),Y.ravel()).reshape(X.shape)>0.01)|~ok
            v=np.where(m,np.nan,v)
            with np.errstate(all='ignore'): return np.nanmean(v.reshape(len(ts),-1),1), (~m).reshape(len(ts),-1).mean(1)
        vi,oki=S(sgn*(h-ins)); vo,oko=S(sgn*(h+ins))
        res.append((vi-vo, np.minimum(oki,oko)))
    (cl,okl),(cr,okr)=res
    return cl,cr,okl>0.5,okr>0.5
