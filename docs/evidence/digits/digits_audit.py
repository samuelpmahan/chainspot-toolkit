import json, numpy as np
from scipy import ndimage as ndi
ST='/home/user/chainspot-toolkit/attempts/stages'; W=1290
C=[('golden','attempt-1792256170903-b68743f9e95c'),('lenard','attempt-1792256225103-92dacbe97c0f'),('townelake','attempt-1792256243822-fb785314ae52'),('heritage','attempt-1792256261126-6ee7ff71e848'),('alex','attempt-1792263349086-27173a1f38f5')]
out={}
for c,att in C:
    A=f'{ST}/{att}/fork/stage-output/early/artifacts/s1'
    d=json.load(open(f'{A}/px.digits.json')); bj=json.load(open(f'{A}/px.badges.json'))['badges']
    H=d['image']['heightPx']
    unat=d.get('unattributedCounterCandidates') or d['totals'].get('unattributedCounterCandidates')
    print(f'== {c}: digits {d["totals"]["digitCount"]}, counters {d["totals"]["counterComponentCount"]} comps / {d["totals"]["counterPx"]} px; expectation', d.get('specimenExpectation',{}).get('matches'), '; unattributed', unat if unat is None else len(unat))
    cnt={}
    for b in d['badges']:
        for k in b.get('counters') or []:
            cnt.setdefault(b['label'],[]).append(k)
    rows=[]
    for i,b in enumerate(bj):
        m=np.zeros(H*W,bool); m[np.array(b['px']+b['mute']['px'])]=True
        db=[x for x in d['badges'] if x['index']==i or x.get('badgeLabel')==b['label']][0]
        cpx=[p for k in (db.get('counters') or []) for p in k['px']]
        cm=np.zeros(H*W,bool)
        if cpx: cm[np.array(cpx)]=True
        x,y,w,h=b['bbox']; sl=(slice(y-3,y+h+3),slice(x-3,x+w+3))
        M=m.reshape(H,W)[sl]; CM=cm.reshape(H,W)[sl]
        hole=ndi.binary_fill_holes(M|CM)&~(M|CM)
        overlap=(M&CM).sum()
        digs=[g['predicted'] for g in db['digits']]
        rows.append((b['label'],''.join(digs),[k['pxCount'] for k in (db.get('counters') or [])],int(hole.sum()),int(overlap)))
    bad=[r for r in rows if r[3] or r[4]]
    print('  per-badge counters:',' '.join(f'{r[0]}:{r[2]}' for r in rows if r[2]))
    print('  badges with unowned holes or counter/badge overlap:',bad if bad else 'none')
    out[c]=rows
json.dump(out,open('/tmp/claude-0/-home-user/73d91f40-13de-5bef-9b81-7de266a5102a/scratchpad/viz/digits_audit.json','w'))
