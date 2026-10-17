# Spokes as known structure: basket of hole n -> spoke from its BasketPoint to the front edge of hole n+1's tee.
# Predict every (basket, tee) line, read ridge evidence ALONG it (+-2 deg), then one-to-one matching.
import json, math, glob, numpy as np
from scipy import ndimage as ndi
from scipy.optimize import linear_sum_assignment
ST='/home/user/chainspot-toolkit/attempts/stages'; W=1290
C=[('golden','attempt-1792256170903-b68743f9e95c',4),('lenard','attempt-1792256225103-92dacbe97c0f',2),('townelake','attempt-1792256243822-fb785314ae52',1),('heritage','attempt-1792256261126-6ee7ff71e848',2),('alex','attempt-1792263349086-27173a1f38f5',None)]
samp=lambda I,x,y: ndi.map_coordinates(I,[np.atleast_1d(y),np.atleast_1d(x)],order=1,mode='nearest')
res={}
for c,att,dy in C:
    A=f'{ST}/{att}/fork/stage-output/early/artifacts'
    raw=np.fromfile(f'{A}/s1/badgePx.rgba.bin',dtype=np.uint8); H=raw.size//4//W; lum=raw.reshape(H,W,4)[...,:3].astype(float).mean(-1)
    kj=json.load(open(f'{A}/s2/px.baskets.json'))['baskets']; bj=json.load(open(f'{A}/s1/px.badges.json'))['badges']; tj=json.load(open(f'{A}/s3fix/px.tees.refined.json'))['tees']
    spr=np.zeros(H*W,bool); spr[[p for k in kj for p in k['px']+k['shell']['blackPx']]+[p for b in bj for p in b['px']+b['mute']['px']]+[p for t in tj for p in t['px']]]=True
    SPR=ndi.binary_dilation(ndi.binary_fill_holes(spr.reshape(H,W)),iterations=2).astype(float)
    R=json.load(open(f'{ST}/{att}/fork/stage-output/s3assoc/px.tees.association.json')); L=R['template']['L']
    fronts={}
    for r in R['rows']:
        if not r['best']: continue
        th=math.radians(r['thDeg']); u=np.array([math.cos(th),math.sin(th)])*r['best']['sense']; fronts[int(r['best']['badge'])]=np.array(r['center'])+u*L/2
    bps=[np.array([k['bbox'][0]+22.84,k['bbox'][1]+71.73]) for k in kj]
    holes=sorted(fronts); N=18
    def ridge(bp,f):
        d=f-bp; D=np.linalg.norm(d); best=-9
        for da in np.arange(-2,2.01,0.25):
            a=math.atan2(d[1],d[0])+math.radians(da); u=np.array([math.cos(a),math.sin(a)]); n=np.array([-u[1],u[0]])
            rs=np.arange(8,min(D-4,130),0.75)
            if len(rs)<10: continue
            X=bp[0]+rs*u[0]; Y=bp[1]+rs*u[1]
            on=np.maximum(samp(lum,X,Y),np.maximum(samp(lum,X+0.7*n[0],Y+0.7*n[1]),samp(lum,X-0.7*n[0],Y-0.7*n[1])))
            side=np.maximum(samp(lum,X+3.5*n[0],Y+3.5*n[1]),samp(lum,X-3.5*n[0],Y-3.5*n[1]))
            bad=(samp(SPR,X,Y)>0.01)|(samp(SPR,X+3.5*n[0],Y+3.5*n[1])>0.01)|(samp(SPR,X-3.5*n[0],Y-3.5*n[1])>0.01)
            if (~bad).sum()<8: continue
            v=np.median(np.clip(on-side,-10,20)[~bad])
            best=max(best,v)
        return best
    S=np.full((len(bps),len(holes)),-9.0)
    for i,bp in enumerate(bps):
        for j,m in enumerate(holes): S[i,j]=ridge(bp,fronts[m])
    # basket i is hole (m-1)'s if its spoke points at tee m; maximise total ridge evidence one-to-one
    ri,ci=linear_sum_assignment(-S)
    lab={int(i):(holes[j]-1 if holes[j]>1 else N) for i,j in zip(ri,ci) if S[i,j]>2}
    # second best margin per basket
    marg={int(i):round(float(S[i,j]-np.max(np.delete(S[i],j))),2) for i,j in zip(ri,ci)}
    truth={}
    if dy is not None:
        for h in json.load(open(glob.glob(f'/home/user/chainspot-toolkit/testimony/{c}/*.annotation.json')[0]))['holes']:
            s=np.array([h['basket']['xPx'],h['basket']['yPx']-dy]); d=[np.linalg.norm(b-s) for b in bps]
            if min(d)<12: truth[int(np.argmin(d))]=h['number']
    ok=[i for i in lab if i in truth and lab[i]==truth[i]]; bad=[(i,lab[i],truth[i]) for i in lab if i in truth and lab[i]!=truth[i]]
    print(f"{c}: baskets {len(bps)}, labelled by verified spoke {len(lab)}"+(f"; agree with Sam {len(ok)}/{len([i for i in lab if i in truth])}; wrong (basket, said hole, Sam hole): {bad}" if truth else ''))
    print('    ridge evidence median of matched lines', round(float(np.median([S[i,j] for i,j in zip(ri,ci)])),1),'lum; unmatched lines median', round(float(np.median(S[S>-9])),1),'lum')
    res[c]=dict(labels=lab,margin=marg)
json.dump(res,open('/tmp/claude-0/-home-user/73d91f40-13de-5bef-9b81-7de266a5102a/scratchpad/bp/spoke_verify.json','w'))
