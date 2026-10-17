from ac12 import *
tip=np.array(json.load(open('tip12.json'))['tip'])
phi0=math.atan2(p0[1]-tip[1],p0[0]-tip[0]); D=np.linalg.norm(p0-tip)
print('tip->p0 distance %.1f px, angle %.2f deg'%(D,math.degrees(phi0)))
fits=[]
for t0,t1 in ((20,150),(20,175),(40,175),(20,110)):
    s,dphi,l,r,gl,gr,prof=ribbon_fit(tip,phi0,t0,t1,span=2.0)
    fits.append((t0,t1,dphi,l,r))
    print(f'pivot=tip stations {t0}-{t1}px: axis {math.degrees(phi0)+dphi:.2f} deg, width {r-l:.2f} px, centreline passes tip at {(l+r)/2:+.2f} px, edge contrast {gl:.1f}/{gr:.1f}')
# finer angle
best=None
for dphi in np.arange(-1.5,1.51,0.05):
    prof,ok,nT=mean_profile(tip,phi0+math.radians(dphi),20,175); l,r,gl,gr=edges(prof,ok,nT)
    if best is None or min(gl,gr)>best[0]: best=(min(gl,gr),dphi,l,r)
print('fine: axis %.2f deg, width %.2f px, tip offset %+.2f px'%(math.degrees(phi0)+best[1],best[3]-best[2],(best[2]+best[3])/2))
json.dump(dict(tip=tip.tolist(),phiDeg=math.degrees(phi0)+best[1],off=(best[2]+best[3])/2,width=best[3]-best[2]),open('tipribbon.json','w'))
