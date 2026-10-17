# Badge-seeded hallway traces, per hole number; conflicts (two holes on one BasketPoint) and failures in orange.
import sys, json, math, numpy as np
from PIL import Image, ImageDraw, ImageFont
from course import Course, TESTIMONY
name=sys.argv[1]; C=Course(name); R=json.load(open(f'badge-{name}.json')); W=R['width']; H_=R['holes']
FT=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',22); FS=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',16); FM=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',15)
# truth: tee points, baskets, bends (source frame -> canonical)
truth={}
if name in TESTIMONY:
    f,dy=TESTIMONY[name]; a=json.load(open('/home/user/chainspot-toolkit/testimony/'+f))
    for h in a['holes']:
        truth[h['number']]=dict(tee=np.array([h['tee']['xPx'],h['tee']['yPx']+dy]),basket=np.array([h['basket']['xPx'],h['basket']['yPx']+dy]),bends=[np.array([b['xPx'],b['yPx']+dy]) for b in h.get('corridorBends',[])])
elif name=='alex':
    a=json.load(open('../alex-ann.json')); HOLE={1:16,2:13,3:6}
    for h in a['holes']:
        L=np.array([[p['xPx'],p['yPx']-4] for p in h['left']]); Rr=np.array([[p['xPx'],p['yPx']-4] for p in h['right']])
        if np.hypot(*(Rr[0]-L[0]))>np.hypot(*(Rr[-1]-L[0])): Rr=Rr[::-1]
        cen=(L+Rr)/2; truth[HOLE[h['number']]]=dict(tee=np.array([h['tee']['xPx'],h['tee']['yPx']-4]),basket=np.array([h['basket']['xPx'],h['basket']['yPx']-4]),bends=list(cen[1:-1]))
# status
byend={}
for h in H_:
    if 'fail' in h: h['status']='fail: '+h['fail']; continue
    h['status']='ok' if h['end'] is not None else 'lost: no BasketPoint reached'
    if h['end'] is not None: byend.setdefault(h['end'],[]).append(h)
for k,hs in byend.items():
    if len(hs)>1:
        hs.sort(key=lambda h:-(h.get('polyScore') or 0))
        for h in hs[1:]: h['status']=f"conflict: BP{k} also ends hole {hs[0]['hole']} (scores {hs[0].get('polyScore')} vs {h.get('polyScore')} lum)"
for h in H_:
    t=truth.get(h['hole'])
    if not t or 'fail' in h: continue
    h['truthTeeErrPx']=round(float(np.hypot(*(np.array(h['teePred'])-t['tee']))),2)
    if h['end'] is not None: h['truthBasketErrPx']=round(float(np.hypot(*(C.bp[h['end']]-t['basket']))),2)
    inner=np.array(h['verts'][1:-1]) if h['end'] is not None else np.zeros((0,2))
    h['truthBends']=len(t['bends']); h['truthBendErrPx']=[round(float(np.hypot(*(inner-b).T).min()),2) if len(inner) else None for b in t['bends']]
json.dump(R,open(f'badge-{name}.json','w'),indent=1,default=float)
img=Image.fromarray(C.rgb.astype(np.uint8)).convert('RGBA'); ov=Image.new('RGBA',img.size,(0,0,0,0)); d=ImageDraw.Draw(ov)
for k,(x,y) in enumerate(C.bp): d.ellipse([x-5,y-5,x+5,y+5],outline=(255,60,60,255),width=2); d.text((x+6,y-8),f'BP{k}',fill=(255,90,90,255),font=FM)
for n,t in truth.items():
    for b in t['bends']: d.ellipse([b[0]-7,b[1]-7,b[0]+7,b[1]+7],outline=(255,0,255,255),width=2)
    d.line([t['tee'][0]-6,t['tee'][1],t['tee'][0]+6,t['tee'][1]],fill=(255,0,255,255),width=2); d.line([t['tee'][0],t['tee'][1]-6,t['tee'][0],t['tee'][1]+6],fill=(255,0,255,255),width=2)
for h in H_:
    if 'fail' in h:
        b=h['badge']; d.text((b[0]+30,b[1]-8),'✗ '+h['fail'][:30],fill=(255,150,0,255),font=FS); continue
    col=(0,255,255,255) if h['status']=='ok' else (255,150,0,255)
    V=np.array(h['verts'])
    for a_,b_ in zip(V[:-1],V[1:]):
        if np.linalg.norm(b_-a_)<1e-6: continue
        u=(b_-a_)/np.linalg.norm(b_-a_); nn=np.array([-u[1],u[0]])
        for s_ in (-1,1): d.line([tuple(a_+nn*s_*W/2),tuple(b_+nn*s_*W/2)],fill=col,width=1)
        d.line([tuple(a_),tuple(b_)],fill=col[:3]+(170,),width=1)
    for v in V[1:-1]: d.ellipse([v[0]-4,v[1]-4,v[0]+4,v[1]+4],fill=(255,230,0,255))
    tp=h['teePred']; d.ellipse([tp[0]-5,tp[1]-5,tp[0]+5,tp[1]+5],outline=(60,255,60,255),width=3)
    if h.get('hiddenTeeBox'):
        x0,x1,y0,y1=h['hiddenTeeBox']; d.rectangle([x0,y0,x1,y1],outline=(60,255,60,255),width=1)
    cap=h['capCentre']; d.line([tuple(cap),tuple(tp)],fill=(60,255,60,255),width=2)
    lab=f"H{h['hole']} tee "+(f"{h['teeErrPx']:.1f}px" if h.get('teeVisible') else 'hidden')
    d.text((tp[0]+8,tp[1]+4),lab,fill=(60,255,60,255),font=FM)
    if h['status']!='ok': d.text((V[-1][0]+6,V[-1][1]+6),h['status'][:40],fill=(255,150,0,255),font=FS)
img=Image.alpha_composite(img,ov).convert('RGB')
ok=[h for h in H_ if h.get('status')=='ok']; vis=[h for h in H_ if h.get('teeVisible')]
hdr=150; out=Image.new('RGB',(img.width,img.height+hdr),(18,18,18)); out.paste(img,(0,hdr)); o=ImageDraw.Draw(out)
o.text((10,8),f'{name}: hallway traced from each S1 badge (both ways), per hole number',fill=(255,255,255),font=FT)
o.text((10,40),f'ribbon width {W:.2f} px; badge line through the badge centre (|off| <= 2.5 px); tee end = round cap (radius W/2) fitted on its edges, tee centre {10.6/25.02:.3f} L behind it; hidden cap: entailed interval (pad fully under the sprite)',fill=(220,220,220),font=FS)
o.text((10,62),'cyan = hole traced to a BasketPoint (edges ±W/2), yellow = bend, green ring = predicted tee centre (box = hidden-tee range), red = BasketPoint, magenta = Sam (tee +, bends o), orange = conflict/lost/fail',fill=(220,220,220),font=FS)
ve=[h['teeErrPx'] for h in vis]
o.text((10,86),f"holes reaching a unique BasketPoint {len(ok)}/{len(H_)}; visible tees {len(vis)}: predicted-from-cap vs pad median {np.median(ve):.2f} px, max {max(ve):.2f} px" if vis else '',fill=(0,255,255),font=FS)
tb=[(h['hole'],h['truthBendErrPx']) for h in H_ if h.get('truthBends')]
o.text((10,108),'bends vs Sam: '+'; '.join(f"H{a}: {b}" for a,b in tb)[:240],fill=(255,0,255),font=FS)
out.save(f's7badge-{name}.png')
for h in H_: print(f"{name} hole {h['hole']:2d}: {h['status'][:70]:70} tee {'visible %.2f px'%h['teeErrPx'] if h.get('teeVisible') else 'hidden'}  Sam tee err {h.get('truthTeeErrPx')} px, basket {h.get('truthBasketErrPx')} px, bends {h.get('truthBends')} err {h.get('truthBendErrPx')}")
