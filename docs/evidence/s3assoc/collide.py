import json, math, numpy as np
ST='/home/user/chainspot-toolkit/attempts/stages'
cases=[('lenard','attempt-1792256225103-92dacbe97c0f','9','12'),('heritage','attempt-1792256261126-6ee7ff71e848','5','12'),('heritage','attempt-1792256261126-6ee7ff71e848','6','13'),('alex','attempt-1792263349086-27173a1f38f5','6','18')]
out=[]
for c,att,tee,lab in cases:
    A=f'{ST}/{att}/fork/stage-output/early/artifacts'
    R=json.load(open(f'{ST}/{att}/fork/stage-output/s3assoc/px.tees.association.json'))
    r=[x for x in R['rows'] if x['tee']==tee][0]; p=r['pose']; c0=np.array([p['cx'],p['cy']]); th=math.radians(p['thDeg'])
    bj=json.load(open(f'{A}/s1/px.badges.json'))['badges']; kj=json.load(open(f'{A}/s2/px.baskets.json'))['baskets']
    b=[x for x in bj if str(x['label'])==lab]
    if not b: print(c,tee,'no badge labelled',lab,'labels',sorted(str(x['label']) for x in bj)); continue
    b=b[0]; x,y,w,h=[q for q in b['findPx']['parts'] if q['polarity']=='bright'][0]['bbox']; bc=np.array([x+(w-1)/2,y+(h-1)/2])
    v=bc-c0; d=np.linalg.norm(v); s=1 if v@[math.cos(th),math.sin(th)]>0 else -1; u=np.array([math.cos(th),math.sin(th)])*s
    ideal=c0+u*d; shift=bc-ideal; lat=abs(u[0]*v[1]-u[1]*v[0])
    ib=[ideal[0]-w/2,ideal[1]-h/2,ideal[0]+w/2,ideal[1]+h/2]; hits=[]
    for k in kj:
        kx,ky,kw,kh=k['bbox']
        if not (kx>ib[2] or kx+kw<ib[0] or ky>ib[3] or ky+kh<ib[1]): hits.append(f"basket{k.get('index')}")
    for o in bj:
        if o is b: continue
        ox,oy,ow,oh=o['bbox']
        if not (ox>ib[2] or ox+ow<ib[0] or oy>ib[3] or oy+oh<ib[1]): hits.append(f"badge{o['label']}")
    print(f"{c} S3#{tee} badge {lab}: dist {d:.1f} px, off-axis {lat:.2f} px; box {w}x{h} px; on-axis spot overlaps: {hits or 'nothing'}; badge shifted ({shift[0]:+.1f},{shift[1]:+.1f}) px from it")
    out.append(dict(course=c,att=att,tee=tee,badge=lab,c0=c0.tolist(),u=u.tolist(),ideal=ideal.tolist(),bbox=[x,y,w,h],hits=hits))
json.dump(out,open('/tmp/claude-0/-home-user/73d91f40-13de-5bef-9b81-7de266a5102a/scratchpad/inspect/collide.json','w'))
