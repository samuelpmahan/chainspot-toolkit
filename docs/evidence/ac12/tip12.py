from ac12 import *
b0=kj[0]; tip=np.array([b0['bbox'][0]+(b0['bbox'][2]-1)/2, b0['bbox'][1]+b0['bbox'][3]-1])
TIPDEG=0.43; BR=0.5
# line tip -> badge, extended back
dv=(bc-tip)/np.linalg.norm(bc-tip); nv=np.array([-dv[1],dv[0]])
for q,u_,phd in lines:
    print('ribbon line vs tip-badge line: lateral at p0 %.2f px, angle %.2f deg'%(((q-tip)@nv), phd-math.degrees(math.atan2(-dv[1],-dv[0]))))
FT=[];FTl=[]
for cy in np.arange(218,234,0.1):
    for cx in np.arange(452,465,0.1):
        c=np.array([cx,cy]); rt=math.degrees(math.atan2(tip[1]-cy,tip[0]-cx)); rb=math.degrees(math.atan2(bc[1]-cy,bc[0]-cx))
        lo=max(rt-TIPDEG,rb-BR); hi=min(rt+TIPDEG,rb+BR)
        if lo>hi: continue
        for thd in np.arange(lo,hi+1e-9,0.1):
            if pad_ok(cx,cy,thd,filled): FT.append((cx,cy,thd))
            if pad_ok(cx,cy,thd,filled|fringe,grow=0.0): FTl.append((cx,cy,thd))
FT=np.array(FT); FTl=np.array(FTl)
for nm,v in (('tip strict',FT),('tip loose',FTl)):
    s=(v[:,:2]-tip)@(-dv); l=(v[:,:2]-tip)@nv
    print(nm,len(v),'x %.2f..%.2f y %.2f..%.2f theta %.2f..%.2f lateral %.2f..%.2f px slide %.2f px mean'%(v[:,0].min(),v[:,0].max(),v[:,1].min(),v[:,1].max(),v[:,2].min(),v[:,2].max(),l.min(),l.max(),s.max()-s.min()),v.mean(0).round(2))
np.save('FT.npy',FT); np.save('FTl.npy',FTl); json.dump(dict(tip=tip.tolist()),open('tip12.json','w'))
sam=np.load('sam-sketch-stroke.npy'); X=sam[:,0]/6+405-0.5; Y=(sam[:,1]-110)/6+126-0.5; sc=np.array([(X.min()+X.max())/2,(Y.min()+Y.max())/2])
print('Sam sketch bbox centre',sc.round(2),'lateral from tip line %.2f px'%((sc-tip)@nv), 'slide pos %.2f'%((sc-tip)@(-dv)), 'strict slide range %.2f..%.2f'%(((FT[:,:2]-tip)@(-dv)).min(),((FT[:,:2]-tip)@(-dv)).max()))
