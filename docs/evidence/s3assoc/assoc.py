# S3 initial association: each visible pad -> its badge (<=2 candidates, one clearly better), then straight-hole test:
# does the pad axis, continued past the badge, hit a BasketPoint?  Judged against Sam's annotations (4 courses).
import json, math, glob, numpy as np
ST='/home/user/chainspot-toolkit/attempts/stages'; T='/home/user/chainspot-toolkit/testimony'
C=[('golden','attempt-1792256170903-b68743f9e95c',-4),('lenard','attempt-1792256225103-92dacbe97c0f',-2),('townelake','attempt-1792256243822-fb785314ae52',-1),('heritage','attempt-1792256261126-6ee7ff71e848',-2),('alex','attempt-1792263349086-27173a1f38f5',None)]
BPD=np.array(json.load(open('../bp/basketpoint.json'))['delta'])
ANG=3.0      # deg: candidate window for pad axis -> badge centre
def load(c,att):
    A=f'{ST}/{att}/fork/stage-output/early/artifacts'
    tees=[t for t in json.load(open(f'{A}/s3fix/px.tees.refined.json'))['tees'] if t.get('verdict','ADMITTED')=='ADMITTED']
    fam=json.load(open(f'{A}/s3fix/px.tees.family-refined.json'))['model']; Lp=fam['major']['median']
    bad={}
    for b in json.load(open(f'{A}/s1/px.badges.json'))['badges']:
        fr=[p for p in b['findPx']['parts'] if p['polarity']=='bright'][0]; x,y,w,h=fr['bbox']; bad[str(b['label'])]=np.array([x+(w-1)/2,y+(h-1)/2])
    bps=[np.array([k['bbox'][0]+22.5,k['bbox'][1]+71.0])+BPD for k in json.load(open(f'{A}/s2/px.baskets.json'))['baskets']]
    return tees,Lp,bad,bps
def assoc(tees,Lp,bad,bps):
    out=[]
    for t in tees:
        c=np.array(t['center']); a=t['angleRad']; ax=np.array([math.cos(a),math.sin(a)])
        cands=[]
        for lab,b in bad.items():
            v=b-c; dist=np.linalg.norm(v)
            if dist>12*Lp or dist<0.6*Lp: continue
            s=1 if v@ax>0 else -1; u=ax*s
            res=math.degrees(math.atan2(abs(v@np.array([-u[1],u[0]])),v@u))
            if res<=ANG: cands.append(dict(badge=lab,resDeg=round(res,2),latPx=round(float(dist*math.sin(math.radians(res))),2),distPx=round(float(dist),1),sense=s))
        cands.sort(key=lambda k:k['latPx'])
        best=cands[0] if cands else None
        straight=None
        if best:
            u=ax*best['sense']; n=np.array([-u[1],u[0]]); hits=[]
            for i,bp in enumerate(bps):
                v=bp-c; along=v@u
                if along<best['distPx']*0.5: continue
                hits.append((abs(v@n),i,float(along)))
            hits.sort()
            if hits: straight=dict(basket=hits[0][1],latPx=round(hits[0][0],2),alongPx=round(hits[0][2],1),next=round(hits[1][0],1) if len(hits)>1 else None)
        out.append(dict(tee=t['label'],center=[round(float(x),2) for x in c],cands=cands,best=best,straight=straight))
    return out
def truth(c,off):
    f=glob.glob(f'{T}/{c}/*.annotation.json')[0]; a=json.load(open(f)); hs={}
    for h in a['holes']:
        hs[h['number']]=dict(tee=np.array([h['tee']['xPx'],h['tee']['yPx']+off]),basket=np.array([h['basket']['xPx'],h['basket']['yPx']+off]),bent=len(h.get('corridorBends') or [])>0)
    return hs
ALL={}
for c,att,off in C:
    tees,Lp,bad,bps=load(c,att); R=assoc(tees,Lp,bad,bps); ALL[c]=R
    hs=truth(c,off) if off is not None else None
    nC=[len(r['cands']) for r in R]
    print(f'== {c}: {len(R)} visible pads, pad L {Lp:.1f} px; candidates per pad: 0:{nC.count(0)} 1:{nC.count(1)} 2:{nC.count(2)} 3+:{sum(n>2 for n in nC)}')
    ok=wrong=0; sOK=sWrong=0; rows=[]
    for r in R:
        b=r['best']; st=r['straight']; th=None
        if hs:
            d=min(hs.items(),key=lambda kv:np.linalg.norm(kv[1]['tee']-np.array(r['center']))); 
            if np.linalg.norm(d[1]['tee']-np.array(r['center']))<8: th=d
        gap=(r['cands'][1]['latPx']/max(b['latPx'],0.05)) if b and len(r['cands'])>1 else None
        line=f"  tee {r['tee']:>2}: "+(f"badge {b['badge']:>2} ({b['resDeg']:.2f} deg, {b['latPx']:.2f} px lateral at {b['distPx']:.0f} px)" if b else 'no badge')
        if len(r['cands'])>1: line+=f" | 2nd {r['cands'][1]['badge']} {r['cands'][1]['latPx']:.1f} px"
        if st: line+=f" | axis->BasketPoint b{st['basket']} {st['latPx']:.2f} px at {st['alongPx']:.0f} px (next {st['next']})"
        if th:
            n_,h_=th; good=b and b['badge']==str(n_); ok+=bool(good); wrong+=not good
            bi=int(np.argmin([np.linalg.norm(bp-h_['basket']) for bp in bps])) if bps else None
            line+=f"   TRUTH hole {n_} {'bent' if h_['bent'] else 'straight'} basket b{bi} -> badge {'OK' if good else 'WRONG'}"
            if st and not h_['bent']: line+=f", basket {'OK' if st['basket']==bi else 'WRONG'}"
        print(line)
    if hs: print(f'  badge association vs Sam: {ok} right, {wrong} wrong')
json.dump(ALL,open('assoc.json','w'),indent=1)
