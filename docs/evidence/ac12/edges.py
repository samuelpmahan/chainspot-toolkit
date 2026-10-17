# Ribbon edges from along-path averaged profiles: the tint is a constant-alpha blend, so its two edges are straight steps.
from ribbon import *
OFFS=np.arange(-28,28.01,0.25)
def mean_profile(p0,phi,t0,t1,lat0=0.0):
    u=np.array([math.cos(phi),math.sin(phi)]); n=np.array([-u[1],u[0]])
    T=np.arange(t0,t1,1.0); X=p0[0]+np.outer(T,u)[:,0][:,None]+(OFFS+lat0)[None]*n[0]; Y=p0[1]+np.outer(T,u)[:,1][:,None]+(OFFS+lat0)[None]*n[1]
    v=samp(lum,X.ravel(),Y.ravel()).reshape(X.shape); b=samp(SPR,X.ravel(),Y.ravel()).reshape(X.shape)>0.01
    v=np.where(b,np.nan,v); ok=(~b).sum(0)
    prof=np.nanmean(v,0); return prof,ok,len(T)
def edges(prof,ok,nT):
    g=np.gradient(np.convolve(prof,np.ones(3)/3,'same'))/0.25
    g[(ok<0.5*nT)|np.isnan(g)]=0; g[:4]=0; g[-4:]=0
    iL=int(np.argmax(g[:len(g)//2+40])); iR=int(np.argmin(np.where(np.arange(len(g))>iL+20,g,0)))
    def sub(i):
        if 0<i<len(g)-1:
            a,b,c=g[i-1],g[i],g[i+1]; den=a-2*b+c; return OFFS[i]+(0.5*(a-c)/den*0.25 if den!=0 else 0)
        return OFFS[i]
    return sub(iL),sub(iR),g[iL],-g[iR]
def ribbon_fit(p0,phi0,t0,t1,span=6.0):
    best=None
    for dphi in np.arange(-span,span+0.01,0.25):
        phi=phi0+math.radians(dphi); prof,ok,nT=mean_profile(p0,phi,t0,t1)
        l,r,gl,gr=edges(prof,ok,nT); s=min(gl,gr)
        if best is None or s>best[0]: best=(s,dphi,l,r,gl,gr,prof)
    return best
if __name__=='__main__':
    rows=[]
    for r in fit['rows']:
        c=np.array([r['cx'],r['cy']]); out=[]
        for sense in (0,180):
            phi0=math.radians(r['thDeg']+sense); b=ribbon_fit(c,phi0,L/2+4,70)
            out.append((b[0],sense,b))
        out.sort(key=lambda z:-z[0]); s,sense,(s_,dphi,l,rr,gl,gr,prof)=out[0]
        rows.append(dict(tee=r['tee'],sense=sense,axisDeg=round(dphi,2),centreOffPx=round((l+rr)/2,2),widthPx=round(rr-l,2),edgeLum=(round(gl,1),round(gr,1))))
        print(rows[-1])
    json.dump(rows,open('calib3.json','w'),indent=1)
