# Inside every closed-loop digit: which px are owned by nobody (not badge.px, not a counter)? Components, sizes, lum.
import json, numpy as np
from scipy import ndimage as ndi
ST='/home/user/chainspot-toolkit/attempts/stages'; W=1290
C=[('golden','attempt-1792256170903-b68743f9e95c'),('lenard','attempt-1792256225103-92dacbe97c0f'),('townelake','attempt-1792256243822-fb785314ae52'),('heritage','attempt-1792256261126-6ee7ff71e848'),('alex','attempt-1792263349086-27173a1f38f5')]
tot={}
for c,att in C:
    A=f'{ST}/{att}/fork/stage-output/early/artifacts/s1'
    d=json.load(open(f'{A}/px.digits.json')); bj=json.load(open(f'{A}/px.badges.json'))['badges']
    raw=np.fromfile(f'{A}/badgePx.rgba.bin',dtype=np.uint8); H=raw.size//4//W; lum=raw.reshape(H,W,4)[...,:3].astype(float).mean(-1)
    for db in d['badges']:
        b=bj[db['index']]; own=np.zeros(H*W,bool); own[b['px']]=True; own=own.reshape(H,W)
        cnt=np.zeros(H*W,bool)
        for k in db.get('counters') or []: cnt[k['px']]=True
        cnt=cnt.reshape(H,W)
        for g in db['digits']:
            if g['predicted'] not in '04689': continue
            x,y,w,h=g['bbox']; sl=(slice(y,y+h),slice(x,x+w))
            glyph=lum[sl]>=120   # bright glyph core
            loop=ndi.binary_fill_holes(glyph)&~glyph            # enclosed by the bright glyph
            enc=ndi.binary_dilation(loop)                        # + its AA ring
            un=enc&~own[sl]&~cnt[sl]
            lab,nc=ndi.label(un)
            for i in range(1,nc+1):
                m=lab==i; key=(g['predicted'],db['label'])
                tot.setdefault(c,[]).append((db['label'],g['predicted'],int(m.sum()),round(float(lum[sl][m].min())),round(float(lum[sl][m].max()))))
    print(c, 'unowned components inside closed loops:', len(tot.get(c,[])), 'px', sum(t[2] for t in tot.get(c,[])))
    for t in tot.get(c,[])[:40]: print('   badge',t[0],'digit',t[1],'px',t[2],'lum',t[3],'..',t[4])
