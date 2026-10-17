# Label every basket from its C1 spoke: basket of hole n points at the front edge of hole n+1's tee.
import json, math, glob, numpy as np
ST='/home/user/chainspot-toolkit/attempts/stages'
SP=json.load(open('/tmp/claude-0/-home-user/73d91f40-13de-5bef-9b81-7de266a5102a/scratchpad/bp/spokes.json'))
C=[('golden','attempt-1792256170903-b68743f9e95c',4),('lenard','attempt-1792256225103-92dacbe97c0f',2),('townelake','attempt-1792256243822-fb785314ae52',1),('heritage','attempt-1792256261126-6ee7ff71e848',2),('alex','attempt-1792263349086-27173a1f38f5',None)]
out={}
for c,att,dy in C:
    R=json.load(open(f'{ST}/{att}/fork/stage-output/s3assoc/px.tees.association.json')); T=R['template']
    kj=json.load(open(f'{ST}/{att}/fork/stage-output/early/artifacts/s2/px.baskets.json'))['baskets']
    hole_of_tee={r['tee']:int(r['best']['badge']) for r in R['rows'] if r['best']}
    fronts={}
    for r in R['rows']:
        if not r['best']: continue
        th=math.radians(r['thDeg']); s=r['best']['sense']; u=np.array([math.cos(th),math.sin(th)])*s
        fronts[int(r['best']['badge'])]=np.array(r['center'])+u*T['L']/2
    truth=None
    if dy is not None:
        holes=json.load(open(glob.glob(f'/home/user/chainspot-toolkit/testimony/{c}/*.annotation.json')[0]))['holes']; truth={}
        for h in holes:
            s=np.array([h['basket']['xPx'],h['basket']['yPx']-dy]); bp=np.array([[k['bbox'][0]+22.84,k['bbox'][1]+71.73] for k in kj]); d=np.linalg.norm(bp-s,axis=1)
            if d.min()<12: truth[int(d.argmin())]=h['number']
    labels={}; rows=[]
    spk={r['i']:r for r in SP[c] if r['ok']}
    for i,k in enumerate(kj):
        bp=np.array([k['bbox'][0]+22.84,k['bbox'][1]+71.73]); r=spk.get(i)
        if not r: rows.append((i,None,None,truth and truth.get(i))); continue
        t=math.radians(r['spokeDeg']); u=np.array([math.cos(t),math.sin(t)]); n=np.array([-u[1],u[0]])
        best=None
        for m,f in fronts.items():
            v=f-bp; a=v@u
            if a<=0: continue
            ang=math.degrees(math.atan2(abs(v@n),a))
            if best is None or ang<best[1]: best=(m,ang,a)
        lab=(best[0]-2)%max(fronts.keys() | {18})+1 if best and best[1]<=4 else None   # spoke -> tee m => basket of hole m-1
        if best and best[1]<=4: lab=best[0]-1 if best[0]>1 else 18
        labels[i]=lab; rows.append((i,lab,best and round(best[1],2),truth and truth.get(i)))
    ok=sum(1 for i,l,a,tr in rows if l is not None and tr is not None and l==tr); bad=[(i,l,a,tr) for i,l,a,tr in rows if l is not None and tr is not None and l!=tr]
    print(f'{c}: baskets {len(kj)}, labelled by spoke {sum(1 for r in rows if r[1] is not None)}'+(f'; agree with Sam {ok}, disagree {bad}' if truth else ''))
    out[c]=labels
json.dump(out,open('/tmp/claude-0/-home-user/73d91f40-13de-5bef-9b81-7de266a5102a/scratchpad/bp/spokelabels.json','w'))
