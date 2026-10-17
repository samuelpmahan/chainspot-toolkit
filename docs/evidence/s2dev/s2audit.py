# S2 over the 6 single-image dev courses: render every basket, check sprite invariants and BasketPoints against Sam.
import json, glob, numpy as np, collections
from PIL import Image, ImageDraw, ImageFont
ST='/home/user/chainspot-toolkit/attempts/stages'; TK='/home/user/chainspot-toolkit'; W=1290; BPD=(0.34,0.73)
RUNS=[l.split()[:2] for l in open('/tmp/claude-0/-home-user/73d91f40-13de-5bef-9b81-7de266a5102a/scratchpad/s2-dev-attempts.txt')]
TEST={'golden':('golden',4),'lenard':('lenard',2),'townelake':('townelake',1),'heritage':('heritage',2)}
FB=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',12); FT=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',18); FS=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',13)
sheets=[]; rep={}
for spec,att in RUNS:
    A=f'{ST}/{att}/fork/stage-output/early/artifacts'
    kj=json.load(open(f'{A}/s2/px.baskets.json'))['baskets']; bj=json.load(open(f'{A}/s1/px.badges.json'))['badges']
    raw=np.fromfile(f'{A}/s1/badgePx.rgba.bin',dtype=np.uint8); H=raw.size//4//W; rgb=raw.reshape(H,W,4)[...,:3]
    bp=np.array([[k['bbox'][0]+22.5+BPD[0],k['bbox'][1]+71+BPD[1]] for k in kj])
    sam={}
    if spec in TEST:
        f=glob.glob(f'{TK}/testimony/{TEST[spec][0]}/*.annotation.json')[0]; dy=TEST[spec][1]
        for h in json.load(open(f))['holes']: sam[h['number']]=np.array([h['basket']['xPx'],h['basket']['yPx']-dy])
    sizes=collections.Counter(f"{k['bbox'][2]}x{k['bbox'][3]}" for k in kj)
    # precision: each detection -> nearest Sam basket; recall: Sam baskets with no detection
    hole_of={}; err={}
    for i,p in enumerate(bp):
        if sam:
            n,q=min(sam.items(),key=lambda kv:np.hypot(*(kv[1]-p))); d=float(np.hypot(*(q-p)))
            hole_of[i]=n if d<12 else None; err[i]=round(d,2)
    missing=sorted(n for n,q in sam.items() if not any(np.hypot(*(q-p))<12 for p in bp))
    fps=[i for i in hole_of if hole_of[i] is None]
    # overlaps: basket bbox touching a badge bbox or another basket bbox
    def touch(a,b): return not (a[0]+a[2]<b[0] or b[0]+b[2]<a[0] or a[1]+a[3]<b[1] or b[1]+b[3]<a[1])
    ov={i:[f"badge {b['label']}" for b in bj if touch(k['bbox'],b['bbox'])]+[f"basket of hole {hole_of.get(j,'?')}" for j,o in enumerate(kj) if j!=i and touch(k['bbox'],o['bbox'])] for i,k in enumerate(kj)}
    rep[spec]=dict(attempt=att,baskets=len(kj),sizes=dict(sizes),samBaskets=len(sam),missingHoles=missing,falsePositives=len(fps),
                   bpErrPx=dict(median=round(float(np.median(list(err.values()))),2) if err else None,max=round(max(err.values()),2) if err else None),
                   overlapping={hole_of.get(i,i) if sam else i:v for i,v in ov.items() if v})
    # contact sheet: each basket crop labelled by Sam's hole number
    Z=3; tiles=[]
    order=sorted(range(len(kj)),key=lambda i:(hole_of.get(i) or 99, i))
    for i in order:
        x,y,w,h=kj[i]['bbox']; x0,y0=max(0,x-6),max(0,y-6); x1,y1=min(W,x+w+6),min(H,y+h+6)
        c=Image.fromarray(rgb[y0:y1,x0:x1]).resize(((x1-x0)*Z,(y1-y0)*Z),Image.NEAREST); d=ImageDraw.Draw(c)
        p=bp[i]; P=((p[0]-x0+0.5)*Z,(p[1]-y0+0.5)*Z); d.ellipse([P[0]-5,P[1]-5,P[0]+5,P[1]+5],outline=(255,40,40),width=2)
        if sam and hole_of.get(i): q=sam[hole_of[i]]; Q=((q[0]-x0+0.5)*Z,(q[1]-y0+0.5)*Z); d.line([Q[0]-6,Q[1]-6,Q[0]+6,Q[1]+6],fill=(255,0,255),width=2); d.line([Q[0]-6,Q[1]+6,Q[0]+6,Q[1]-6],fill=(255,0,255),width=2)
        t=Image.new('RGB',(c.width,c.height+34),(24,24,24)); t.paste(c,(0,0)); dd=ImageDraw.Draw(t)
        name=(f"hole {hole_of[i]}" if hole_of.get(i) else ('FP?' if sam else f'#{i}'))
        dd.text((2,c.height+1),f"{name} {w}x{h}"+(f" {err[i]}px" if sam else ''),fill=(0,255,120) if (not sam or hole_of.get(i)) else (255,80,80),font=FB)
        if ov[i]: dd.text((2,c.height+17),'touches '+', '.join(ov[i])[:28],fill=(255,200,0),font=FB)
        tiles.append(t)
    tw=max(t.width for t in tiles); th=max(t.height for t in tiles); cols=9
    sh=Image.new('RGB',(cols*(tw+4)+8,62+((len(tiles)+cols-1)//cols)*(th+4)),(12,12,12)); dd=ImageDraw.Draw(sh)
    r=rep[spec]; dd.text((6,6),f"{spec}: {len(kj)} baskets, sizes {r['sizes']}"+(f"; Sam baskets {len(sam)}, missing holes {missing}, false positives {len(fps)}, BasketPoint vs Sam median {r['bpErrPx']['median']} px max {r['bpErrPx']['max']} px" if sam else '; no testimony'),fill=(255,255,255),font=FT)
    dd.text((6,34),'red ring = BasketPoint (sprite tip + spoke offset)   magenta X = Sam\'s basket point   yellow = bbox touches another sprite',fill=(200,200,200),font=FS)
    for k,t in enumerate(tiles): sh.paste(t,(6+(k%cols)*(tw+4),62+(k//cols)*(th+4)))
    sheets.append(sh)
json.dump(rep,open('s2-dev-report.json','w'),indent=1)
Wt=max(s.width for s in sheets); S=Image.new('RGB',(Wt,sum(s.height+8 for s in sheets)),(0,0,0)); y=0
for s in sheets: S.paste(s,(0,y)); y+=s.height+8
S.save('s2-dev-baskets.png'); print(S.size)
for s,r in rep.items(): print(s, {k:v for k,v in r.items() if k!='attempt'})
