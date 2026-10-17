# Badge-seeded hallway tracker: every badge sits on the first straight stretch of its own hole's ribbon.
# Find that ribbon through the badge, march back to the tee (cap) and forward through bends to the BasketPoint.
import sys, math, json, warnings, numpy as np
warnings.filterwarnings('ignore')
from course import Course
from contrast import station_contrast, unit
import follow
from follow import run_end, trace, TAU
from track import fit_free
from polyscore import refine_vertices, poly_score, cap_score
FRONT=10.6/25.02   # ribbon cap centre ahead of the pad centre, in pad lengths (Alex stack, 12 pads)
def ribbon_through_badge(C,c,half,W):
    """scan centreline direction through the badge (lateral ±3 px); both sides must carry the ribbon edges."""
    best=[]
    for psi in np.arange(0,180,1.0):
        for lat in (-3,-1.5,0,1.5,3):
            u=unit(math.radians(psi)); n=np.array([-u[1],u[0]]); O=c+n*lat; pf=[];med=[]
            for sgn in (1,-1):
                ts=np.arange(half+2,half+2+60,1.0); cl,cr,okl,okr=station_contrast(C,O,math.radians(psi)+(0 if sgn>0 else math.pi),ts,W); v=okl&okr
                if v.sum()<8: continue          # side hidden by sprites: neutral
                m=np.minimum(cl,cr)[v]; pf.append(float((m>TAU).mean())); med.append(float(np.median(m)))
            if not pf or max([0]+[1 for _ in pf])==0: continue
            if len(pf)==1: pf=pf*2; med=med*2
            best.append((min(pf)+0.005*min(med),psi,lat,pf))
    best.sort(reverse=True); return best
def seed_one(C,n,W,pads,exclude_dirs=()):
    c=C.badges[n]; half=C.badgeHalf[n]; cands=ribbon_through_badge(C,c,half,W)
    padc=[]
    for p in pads:
        a=math.radians(p['thDeg']); u_=np.array([math.cos(a),math.sin(a)]); d=c-np.array([p['cx'],p['cy']])
        if abs(d@u_)<450 and abs(d@np.array([-u_[1],u_[0]]))<=3.5: padc.append((9.0,p['thDeg']%180,0.0,[1,1]))
    cands=padc+cands
    seen=[]; good=[]
    for sc,psi0,lat0,pf in cands[:80]:
        if any(abs((psi0-q+90)%180-90)<4 for q in seen): continue
        if any(abs((psi0-q+90)%180-90)<4 for q in exclude_dirs): continue
        seen.append(psi0)
        u=unit(math.radians(psi0)); nn=np.array([-u[1],u[0]]); O=c+nn*lat0-u*(half+70)
        f=fit_free(C,O,math.radians(psi0),0,2*(half+70),W,span=2.0,dstep=0.1,tolW=1.5,lat_lim=6.0)
        if f is not None:
            u=unit(f['phi']); nn=np.array([-u[1],u[0]]); P=O+nn*f['c']; off=float((c-P)@nn)
            if abs(off)<=2.5:
                # a visible pad on this line (centre within 3.5 px, axis within 3 deg, within 450 px) is decisive evidence of the hole's own ribbon
                padhit=False
                for p in pads:
                    d=np.array([p['cx'],p['cy']])-P; al=abs(d@u); la=abs(d@nn); ax=abs((p['thDeg']-math.degrees(f['phi'])+90)%180-90)
                    if al<450 and la<=3.5 and ax<=3: padhit=True
                good.append((padhit,sc,math.degrees(f['phi']),P,u,nn,off,f['w'],pf))
        if len(seen)>=8: break
    if not good: return dict(hole=n,badge=c.round(2).tolist(),fail='no ribbon through the badge (centre within 2.5 px, width within 1.5 px)',candidatesTried=len(seen))
    good.sort(key=lambda g:(g[0],g[1]),reverse=True); chosen=good[0][1:]
    sc,psi,P,u,nn,off,Wm,pf=chosen
    B=P+u*((c-P)@u)
    # which way is the tee? the side whose trace ends at a BasketPoint is forward; else a visible pad on the line marks the back
    sides=[]
    for sgn in (1,-1):
        phi=math.radians(psi)+(0 if sgn>0 else math.pi); uu=unit(phi); n2=np.array([-uu[1],uu[0]])
        pad=None
        for p in pads:
            d=np.array([p['cx'],p['cy']])-B; al=d@uu; la=d@n2; ax=abs((p['thDeg']-math.degrees(phi)+90)%180-90)
            if 0<al<450 and abs(la)<=3.5 and ax<=3:
                if pad is None or al<pad[1]: pad=(p,al,la)
        r=trace(C,B,phi,W,self_c=None if pad is None else np.array([pad[0]['cx'],pad[0]['cy']]))
        t_end,frac=run_end(C,B,phi,W,half+2)
        sides.append(dict(phi=phi,pad=pad,tEnd=t_end,frac=frac,tr=r))
    ends=[s_['tr']['end'] is not None for s_ in sides]; pads_=[s_['pad'] is not None for s_ in sides]
    if pads_[0]!=pads_[1]: back=0 if pads_[0] else 1; how='visible pad on the line'
    elif ends[0]!=ends[1]: back=1 if ends[0] else 0; how='trace ends at a BasketPoint'
    else: back=0 if sides[0]['tEnd']<sides[1]['tEnd'] else 1; how='shorter run'
    bk=sides[back]; fw=sides[1-back]; ub=unit(bk['phi'])
    # tee end. Strict visible run (tolerance 6 px); if the stations right after it are sprite-masked the cap is hidden
    ta,_=run_end(C,B,bk['phi'],W,half+2,G=6)
    ts=np.arange(ta+1,ta+1+W,1.0); cl,cr,okl,okr=station_contrast(C,B,bk['phi'],ts,W); masked=float(1-(okl&okr).mean())
    hidden=masked>0.5 and bk['pad'] is None
    if not hidden:
        cs=[(cap_score(C,B+ub*t,ub,W),t) for t in np.arange(max(half+4,ta-W),ta+W,0.25)]
        sc_,tcap=max(cs); feas=None
    else:
        # cap centre >= ta (edges seen up to there); the cap's far tip must not show past the sprite: S0 + W/2 <= first unmasked no-ribbon station tb;
        # and the whole pad (+0.5 px AA) must sit inside the opaque sprite (+1 px fringe)
        tt=np.arange(ta+1,ta+400,1.0); cl,cr,okl,okr=station_contrast(C,B,bk['phi'],tt,W); v=okl&okr; nz=np.nonzero(v)[0]
        tb=float(tt[nz[0]]) if len(nz) else ta+400
        feas=[]
        for t in np.arange(ta,max(ta,tb-W/2)+0.01,0.25):
            for lat in (-0.6,0,0.6):
                pc=B+ub*(t+FRONT*C.L)+np.array([-ub[1],ub[0]])*lat; th=math.atan2(ub[1],ub[0]); cth,sth=math.cos(th),math.sin(th)
                r_=int(math.ceil(math.hypot(C.L,C.Wd)/2+2)); ys=np.arange(int(pc[1])-r_,int(pc[1])+r_+2); xs=np.arange(int(pc[0])-r_,int(pc[0])+r_+2); X,Y=np.meshgrid(xs,ys)
                Uq=(X-pc[0])*cth+(Y-pc[1])*sth; Vq=-(X-pc[0])*sth+(Y-pc[1])*cth; ins=(np.abs(Uq)<=C.L/2+0.5)&(np.abs(Vq)<=C.Wd/2+0.5)
                ok=(Y[ins]>=0).all() and (Y[ins]<C.H).all() and (X[ins]>=0).all() and (X[ins]<C.W).all() and C.occluder[Y[ins].clip(0,C.H-1),X[ins].clip(0,C.W-1)].all()
                if ok: feas.append((t,pc[0],pc[1]))
        feas=np.array(feas) if feas else None
        tcap=float(feas[:,0].mean()) if feas is not None else ta; sc_=None
    S0=B+ub*tcap; teeC=S0+ub*FRONT*C.L
    rec=dict(padOnLine=bool(good[0][0]),lineDeg=round(psi%180,2),hole=n,badge=c.round(2).tolist(),badgeOffLinePx=round(off,2),dirToBasketDeg=round(math.degrees(fw['phi']),2),widthPx=None if Wm is None else round(Wm,2),
             sideRule=how,capScore=None if sc_ is None else round(sc_,2),capMaskedFrac=round(masked,2),hiddenCapInterval=None if feas is None else [round(float(feas[:,0].min()),2),round(float(feas[:,0].max()),2)],hiddenTeeBox=None if feas is None else [round(float(feas[:,1].min()),2),round(float(feas[:,1].max()),2),round(float(feas[:,2].min()),2),round(float(feas[:,2].max()),2)],teePred=teeC.round(2).tolist(),capCentre=S0.round(2).tolist(),scanPass=[round(x,2) for x in pf])
    if bk['pad'] is not None:
        p=bk['pad'][0]; pc=np.array([p['cx'],p['cy']]); rec.update(teeVisible=True,padCentre=[round(p['cx'],2),round(p['cy'],2)],padLabelS3=str(p.get('label',p.get('tee'))),
              teeErrPx=round(float(np.hypot(*(teeC-pc))),2),teeErrAlongPx=round(float((teeC-pc)@ub),2),teeErrLatPx=round(float((teeC-pc)@np.array([-ub[1],ub[0]])),2))
        start=pc-ub*FRONT*C.L; self_c=pc
    else:
        rec.update(teeVisible=False,teeHiddenUnderSprite=bool(hidden),teeFeasible=feas is not None if hidden else None); start=S0; self_c=None
    r=trace(C,start,fw['phi'],W,self_c=self_c)
    rec.update(end=r['end'],legs=r['legs'],verts=np.round(r['verts'],2).tolist())
    if r['end'] is None: rec['lostAt']=np.round(r['verts'][-1],2).tolist()
    if r['end'] is not None and len(r['verts'])>2:
        Vr,s1=refine_vertices(C,r['verts'],W,pad_axis=unit(fw['phi'])); rec.update(verts=np.round(Vr,2).tolist(),polyScore=round(s1,2))
    elif r['end'] is not None: rec['polyScore']=round(poly_score(C,r['verts'],W)[0],2)
    rec['bends']=len(rec['verts'])-2 if r['end'] is not None else None
    return rec
if __name__=='__main__':
    name=sys.argv[1]; C=Course(name)
    W=float(sys.argv[2]) if len(sys.argv)>2 else (json.load(open(f'width-{name}.json'))['width'] if name in ('alex','golden') else 0.933*C.R1)
    follow.TEES.clear()
    for p in C.pads:
        a=math.radians(p['thDeg']); follow.TEES.append((np.array([p['cx'],p['cy']]),np.array([math.cos(a),math.sin(a)])))
    out={}
    for n in sorted(C.badges): out[n]=seed_one(C,n,W,C.pads)
    for it in range(2):   # two holes cannot end at one BasketPoint: the weaker polyline retries its next ribbon through the badge
        byend={}
        for n,r in out.items():
            if 'fail' not in r and r['end'] is not None: byend.setdefault(r['end'],[]).append(n)
        changed=False
        for k,ns in byend.items():
            if len(ns)<2: continue
            ns.sort(key=lambda n:(out[n].get('padOnLine',False),out[n].get('polyScore') or 0),reverse=True)
            for n in ns[1:]:
                ex=tuple(out[n].get('excluded',()))+(out[n]['lineDeg'],)
                r=seed_one(C,n,W,C.pads,exclude_dirs=ex); r['excluded']=list(ex); r['retryReason']=f'BP{k} conflict with hole {ns[0]}'; out[n]=r; changed=True
        if not changed: break
    out=[out[n] for n in sorted(out)]
    for r in out:
        n=r['hole']
        if 'fail' in r: print(f"{name} hole {n:2d}: FAIL {r['fail']}"); continue
        print(f"{name} hole {n:2d}: line {r['lineDeg']} deg{' (pad on line)' if r['padOnLine'] else ''}, badge off {r['badgeOffLinePx']:+.2f} px, width {r['widthPx']} px, tee "+(f"visible (S3 #{r['padLabelS3']}) cap-predicted {r['teeErrPx']} px off (along {r['teeErrAlongPx']:+.2f}, lat {r['teeErrLatPx']:+.2f})" if r['teeVisible'] else f"hidden{' under a sprite' if r['teeHiddenUnderSprite'] else ''} ({r['sideRule']}): ({r['teePred'][0]:.1f}, {r['teePred'][1]:.1f}) px"+(f" box x {r['hiddenTeeBox'][0]}..{r['hiddenTeeBox'][1]} y {r['hiddenTeeBox'][2]}..{r['hiddenTeeBox'][3]}" if r.get('hiddenTeeBox') else ''))+f"; end {'BP'+str(r['end']) if r['end'] is not None else 'LOST at '+str(r.get('lostAt'))} bends {r['bends']}"+(f" [retry: {r['retryReason']}]" if r.get('retryReason') else ''))
    json.dump(dict(width=W,R1=C.R1,holes=out),open(f'badge-{name}.json','w'),indent=1,default=float)
