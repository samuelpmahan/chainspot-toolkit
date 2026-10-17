# S1 across the whole dev set: render every badge, cross-check S1's own receipts, and run the checks that used to be manual.
import json, numpy as np
from scipy import ndimage as ndi
from PIL import Image, ImageDraw, ImageFont
ST='/home/user/chainspot-toolkit/attempts/stages'; W=1290
RUNS=[l.split()[:2] for l in open('/tmp/claude-0/-home-user/73d91f40-13de-5bef-9b81-7de266a5102a/scratchpad/s1-dev-attempts.txt')]
FB=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',13); FS=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',11); FT=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',20)
FULL={'golden','alex','lenard','townelake','heritage','northpark'}
report={}; sheets=[]
for spec,att in RUNS:
    A=f'{ST}/{att}/fork/stage-output/early/artifacts/s1'
    bj=json.load(open(f'{A}/px.badges.json')); dj=json.load(open(f'{A}/px.digits.json'))
    raw=np.fromfile(f'{A}/badgePx.rgba.bin',dtype=np.uint8); H=raw.size//4//W; rgb=raw.reshape(H,W,4)[...,:3]; lum=rgb.astype(float).mean(-1)
    B=bj['badges']; D={d['index']:d for d in dj['badges']}
    labels=[str(b['label']) for b in B]
    chk=[]
    # 1. label set: unique; full views must be exactly 1..18; partial views a subset of 1..18
    dup=sorted({l for l in labels if labels.count(l)>1}); bad=[l for l in labels if not l.isdigit() or not 1<=int(l)<=18]
    want=set(map(str,range(1,19)))
    chk.append(('labels unique', not dup, dup)); chk.append(('labels in 1..18', not bad, bad))
    if spec in FULL: chk.append(('full view has all 18', set(labels)==want, sorted(want-set(labels),key=int)))
    # 2. every badge has its white frame as its own S1 bright part (else the "first bright part" is a digit)
    noframe=[b['label'] for b in B if not any(p['polarity']=='bright' and p['bbox'][2]>=40 for p in b['findPx']['parts'])]
    chk.append(('frame is its own bright part', not noframe, noframe))
    # 3. sprite size is screen-constant
    sizes={}; [sizes.setdefault(f"{b['bbox'][2]}x{b['bbox'][3]}",[]).append(b['label']) for b in B]
    ws=[b['bbox'][2] for b in B]; hs=[b['bbox'][3] for b in B]
    chk.append(('badge size constant (+-1 px)', max(ws)-min(ws)<=1 and max(hs)-min(hs)<=1, {k:len(v) for k,v in sizes.items()}))
    # 4. bbox centre vs dark-plate centre (two independent centre estimates)
    off=[]
    for b in B:
        dk=[p for p in b['findPx']['parts'] if p['polarity']=='dark']
        if dk: x,y,w,h=dk[0]['bbox']; X,Y,Wb,Hb=b['bbox']; off.append(np.hypot(x+(w-1)/2-(X+(Wb-1)/2),y+(h-1)/2-(Y+(Hb-1)/2)))
    chk.append(('bbox centre = plate centre (<=1 px)', max(off,default=0)<=1.0, f'max {max(off,default=0):.2f} px'))
    # 5. read confidence / abstentions
    low=[(b['label'],round(b['confidence'],3)) for b in B if (b.get('confidence') or 0)<0.9 or b.get('abstentionReason')]
    chk.append(('read confidence >= 0.9, no abstention', not low, low))
    # 6. counters: every closed-loop digit has its counter; coverage-agnostic count check by digit class
    loops={'0':1,'4':1,'6':1,'8':2,'9':1}; miss=[]
    for d in dj['badges']:
        want_n=sum(loops.get(g['predicted'],0) for g in d['digits']); got=len(d.get('counters') or [])
        if want_n!=got: miss.append((d['label'],want_n,got))
    chk.append(('counters = closed loops of the digits read', not miss, miss))
    # 7. unowned px inside the badge bbox (neither badge.px, mute, nor counter): the AA ring, measured not judged
    un=0
    for b in B:
        x,y,w,h=b['bbox']; m=np.zeros(H*W,bool); m[b['px']]=True; m[b['mute']['px']]=True
        d=D.get(b['index'])
        for k in (d.get('counters') or []): m[k['px']]=True
        un+=int((~m.reshape(H,W)[y:y+h,x:x+w]).sum())
    # receipts: S1's own guarantees
    rec=dict(specimenExpectationMatches=dj.get('specimenExpectation',{}).get('matches'), digitWitness=dj.get('witness',{}).get('digitEvidenceMatches'))
    report[spec]=dict(attempt=att,badges=len(B),labels=sorted(labels,key=lambda s:int(s) if s.isdigit() else 99),checks=[dict(name=n,ok=bool(o),detail=str(dd)) for n,o,dd in chk],unownedInBboxPx=un,receipts=rec)
    # contact sheet: every badge crop with its read
    Z=3; tiles=[]
    for b in sorted(B,key=lambda b:int(b['label']) if str(b['label']).isdigit() else 99):
        x,y,w,h=b['bbox']; x0,y0=max(0,x-4),max(0,y-4); crop=Image.fromarray(rgb[y0:y+h+4,x0:x+w+4]).resize(((x+w+4-x0)*Z,(y+h+4-y0)*Z),Image.NEAREST)
        t=Image.new('RGB',(crop.width,crop.height+30),(24,24,24)); t.paste(crop,(0,0)); d=ImageDraw.Draw(t)
        ok=b['label'] not in noframe and (b.get('confidence') or 0)>=0.9
        d.text((2,crop.height+1),f"read {b['label']}  {b.get('confidence',0):.3f}",fill=(0,255,120) if ok else (255,80,80),font=FB)
        d.text((2,crop.height+16),('no frame part' if b['label'] in noframe else '')+f" {w}x{h}",fill=(220,220,220),font=FS); tiles.append(t)
    tw=max(t.width for t in tiles); th=max(t.height for t in tiles); cols=9
    sh=Image.new('RGB',(cols*(tw+4)+8,40+((len(tiles)+cols-1)//cols)*(th+4)),(12,12,12)); dd=ImageDraw.Draw(sh)
    nok=sum(c['ok'] for c in report[spec]['checks']); dd.text((6,8),f"{spec}: {len(B)} badges, checks {nok}/{len(chk)} pass",fill=(255,255,255),font=FT)
    for i,t in enumerate(tiles): sh.paste(t,(6+(i%cols)*(tw+4),40+(i//cols)*(th+4)))
    sheets.append(sh)
json.dump(report,open('s1-dev-report.json','w'),indent=1)
Wt=max(s.width for s in sheets); Ht=sum(s.height+8 for s in sheets)
S=Image.new('RGB',(Wt,Ht),(0,0,0)); y=0
for s in sheets: S.paste(s,(0,y)); y+=s.height+8
S.save('s1-dev-badges.png'); print(S.size)
names=[c['name'] for c in report['golden']['checks']]+['full view has all 18']
print(f"{'image':10s} badges "+' | '.join(n[:22] for n in dict.fromkeys(names)))
for spec,r in report.items():
    m={c['name']:c for c in r['checks']}
    print(f"{spec:10s} {r['badges']:6d} "+' | '.join(('PASS' if m[n]['ok'] else 'FAIL '+m[n]['detail'][:40]) if n in m else 'n/a' for n in dict.fromkeys(names))+f" | unowned {r['unownedInBboxPx']} px | receipts {r['receipts']}")
