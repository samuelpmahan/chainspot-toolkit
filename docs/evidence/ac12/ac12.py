from edges import *
bc=np.array(fit['badgeCentres']['12']); p0=np.array([457.32,229.25]); phi0=math.atan2(bc[1]-p0[1],bc[0]-p0[0])
k=kj[2]; kx,ky,kw,kh=k['bbox']
for t0,t1 in ((28,70),(28,95),(40,95)):
    b=ribbon_fit(p0,phi0,t0,t1,span=4.0); s,dphi,l,r,gl,gr,prof=b
    print(f'stations {t0}-{t1}px: axis {math.degrees(phi0)+dphi:.2f} deg (badge ray {math.degrees(phi0):.2f}), edges {l:.2f} {r:.2f} px, width {r-l:.2f} px, centre off {(l+r)/2:.2f} px, edge contrast {gl:.1f}/{gr:.1f}')
core=mk(k['px']+k['shell']['blackPx']); filled=ndi.binary_fill_holes(core)
print('core px',core.sum(),'filled',filled.sum(),'seam holes filled',(filled&~core).sum())
fringe=ndi.binary_dilation(filled)&~filled
# lines from the three windows
lines=[]
for t0,t1 in ((28,70),(28,95),(40,95)):
    s,dphi,l,r,gl,gr,prof=ribbon_fit(p0,phi0,t0,t1,span=4.0)
    phi=phi0+math.radians(dphi); u=np.array([math.cos(phi),math.sin(phi)]); n=np.array([-u[1],u[0]])
    lines.append((p0+n*(l+r)/2,u,math.degrees(phi)))
json.dump([[a.tolist(),b.tolist(),c] for a,b,c in lines],open('lines12.json','w'))
LAT=0.61; AX=1.0; BR=0.5   # calibrated on 12 visible Alex pads: centre-to-centreline max 0.61 px, axis max 1.0 deg; badge ray max 0.36 deg
def pad_ok(cx,cy,thd,mask,grow=0.5):
    t=math.radians(thd); c,s=math.cos(t),math.sin(t); r=int(math.ceil(math.hypot(L,Wd)/2+2))
    ys=np.arange(int(cy)-r,int(cy)+r+2); xs=np.arange(int(cx)-r,int(cx)+r+2); X,Y=np.meshgrid(xs,ys)
    Uq=(X-cx)*c+(Y-cy)*s; Vq=-(X-cx)*s+(Y-cy)*c
    # pixel square overlaps the pad rectangle (conservative: rect grown by grow px)
    inside=(np.abs(Uq)<=L/2+grow)&(np.abs(Vq)<=Wd/2+grow)
    return mask[Y[inside],X[inside]].all()
F={'strict':[],'loose':[]}
for (q,u,phd) in lines:
    n=np.array([-u[1],u[0]])
    for s in np.arange(-40,30,0.25):
        for lat in np.arange(-LAT,LAT+1e-9,0.2):
            c=q+u*s+n*lat; ray=math.degrees(math.atan2(bc[1]-c[1],bc[0]-c[0]))
            for thd in np.arange(phd-AX,phd+AX+1e-9,0.1):
                if abs(thd-ray)>BR: continue
                if pad_ok(c[0],c[1],thd,filled): F['strict'].append((c[0],c[1],thd,s))
                if pad_ok(c[0],c[1],thd,filled|fringe,grow=0.0): F['loose'].append((c[0],c[1],thd,s))
for kk,v in F.items():
    v=np.array(v); F[kk]=v
    if len(v): print(kk,len(v),'x %.2f..%.2f y %.2f..%.2f theta %.2f..%.2f deg  along-axis s %.2f..%.2f px'%(v[:,0].min(),v[:,0].max(),v[:,1].min(),v[:,1].max(),v[:,2].min(),v[:,2].max(),v[:,3].min(),v[:,3].max()), 'mean',v[:,:3].mean(0).round(2))
    else: print(kk,'none')
np.save('F12.npy',np.array([F['strict'],F['loose']],dtype=object),allow_pickle=True)
