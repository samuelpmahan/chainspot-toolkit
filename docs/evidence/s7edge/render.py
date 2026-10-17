import sys, json, math, numpy as np
from PIL import Image, ImageDraw, ImageFont
from course import Course
name=sys.argv[1]; C=Course(name); FINAL=len(sys.argv)>2; T=json.load(open(f'judged-{name}.json' if FINAL else f'trace-{name}.json')); W=json.load(open(f'width-{name}.json'))['width']
FT=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',22); FS=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',16); FM=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',15)
# ---- truth (bends): alex = Sam's corridor polylines for bent holes; golden = corridorBends
truth=[]
if name=='alex':
    a=json.load(open('../alex-ann.json')); HOLE={1:16,2:13,3:6}
    for h in a['holes']:
        L=np.array([[p['xPx'],p['yPx']-4] for p in h['left']]); R=np.array([[p['xPx'],p['yPx']-4] for p in h['right']])
        if np.hypot(*(R[0]-L[0]))>np.hypot(*(R[-1]-L[0])): R=R[::-1]
        cen=(L+R)/2; truth.append(dict(hole=HOLE[h['number']],tee=np.array([h['tee']['xPx'],h['tee']['yPx']-4]),basket=np.array([h['basket']['xPx'],h['basket']['yPx']-4]),bends=cen[1:-1],cen=cen))
else:
    a=json.load(open('/home/user/chainspot-toolkit/testimony/golden/DashsTrack-full.annotation.json'))
    for h in a['holes']:
        truth.append(dict(hole=h['number'],tee=np.array([h['tee']['xPx'],h['tee']['yPx']-4]),basket=np.array([h['basket']['xPx'],h['basket']['yPx']-4]),bends=np.array([[b['xPx'],b['yPx']-4] for b in h['corridorBends']]).reshape(-1,2)))
if FINAL:
    for t in T:
        if t.get('vertsRefined'): t['verts']=t['vertsRefined']
# short legs: residual windows of 14 px
from follow import residuals
for t in T:
    if t['end'] is not None and t.get('resCentreMedPx') is None:
        cs,ws=residuals(C,np.array(t['verts']),W,win=14.0)
        if len(cs): t.update(resCentreMedPx=round(float(np.median(np.abs(cs))),2),widthMedPx=round(float(np.median(ws)),2),widthStdPx=round(float(np.std(ws)),2),nWin=int(len(cs)),shortWin=True)
# ---- judge each trace: accepted if it ends at a BasketPoint, centre residual median <= 1 px; BP used once (lowest residual wins)
rows=[]
for t in T:
    ok=t['end'] is not None and t.get('resCentreMedPx') is not None and t['resCentreMedPx']<=1.0
    t['status']='ok' if ok else (('rejected: centre residual %.2f px'%t['resCentreMedPx'] if t.get('resCentreMedPx') is not None else 'unverified: no residual windows') if t['end'] is not None else 'lost after %.0f px'%sum(l['tEnd'] for l in t['legs']))
from polyscore import poly_score
for t in T:
    if t['end'] is not None and 'polyScore' not in t: t['polyScore']=[round(poly_score(C,np.array(t['verts']),W)[0],2)]*2
    if t['status']=='ok' and t.get('minPass',1)<0.5: t['status']='rejected: a leg passes only %.2f'%t['minPass']
bybp={}
for t in T:
    if t['status']=='ok': bybp.setdefault(t['end'],[]).append(t)
for k,ts in bybp.items():
    ts.sort(key=lambda t:-t['polyScore'][-1])
    for t in ts[1:]: t['status']=f'rejected: BP{k} already ends tee {ts[0]["tee"]}'
# match traces to truth holes (by tee proximity) and score bends
for t in T:
    pc=np.array(t['pad'][:2]); m=[h for h in truth if np.hypot(*(h['tee']-pc))<6]
    t['truth']=None
    if m:
        h=m[0]; V=np.array(t['verts']); inner=V[1:-1]; bd=[]
        for b in h['bends']:
            d=np.hypot(*(inner-b).T).min() if len(inner) else None; bd.append(None if d is None else round(float(d),2))
        bk=np.hypot(*(np.array(C.bp[t['end']])-h['basket'])) if t['end'] is not None else None
        t['truth']=dict(hole=h['hole'],nBendsTruth=len(h['bends']),bendErrPx=bd,basketErrPx=None if bk is None else round(float(bk),2))
for t in T: print(f"tee {t['tee']:>3}: {t['status']:40} end BP{t['end']} bends {t.get('bends')} res {t.get('resCentreMedPx')} px width {t.get('widthMedPx')}±{t.get('widthStdPx')} px  truth {t['truth']}")
json.dump(T,open(f'judged-{name}.json' if not FINAL else f'final-{name}.json','w'),indent=1,default=float)
# ---- render whole course at 1x with zoom insets of bends
img=Image.fromarray(C.rgb.astype(np.uint8)).convert('RGBA'); ov=Image.new('RGBA',img.size,(0,0,0,0)); d=ImageDraw.Draw(ov)
for k,(x,y) in enumerate(C.bp):
    d.ellipse([x-5,y-5,x+5,y+5],outline=(255,60,60,255),width=2); d.text((x+6,y-8),f'BP{k}',fill=(255,90,90,255),font=FM)
for h in truth:
    if 'cen' in h: d.line([tuple(p) for p in h['cen']],fill=(255,0,255,170),width=2)
    for b in h['bends']: d.ellipse([b[0]-7,b[1]-7,b[0]+7,b[1]+7],outline=(255,0,255,255),width=2)
for t in T:
    V=np.array(t['verts']); col=(0,255,255,255) if t['status']=='ok' else (255,150,0,255)
    for a,b in zip(V[:-1],V[1:]):
        u=(b-a)/np.linalg.norm(b-a); n=np.array([-u[1],u[0]])
        for s_ in (-1,1): d.line([tuple(a+n*s_*W/2),tuple(b+n*s_*W/2)],fill=col,width=1)
        d.line([tuple(a),tuple(b)],fill=(col[0],col[1],col[2],200),width=1)
    for v in V[1:-1]: d.ellipse([v[0]-4,v[1]-4,v[0]+4,v[1]+4],fill=(255,230,0,255))
    d.text((V[0][0]+8,V[0][1]+6),f"T{t['tee']}"+('' if t['status']=='ok' else ' ✗'),fill=col,font=FM)
    if t['status']!='ok': d.text((V[-1][0]+6,V[-1][1]),t['status'][:34],fill=(255,150,0,255),font=FS)
img=Image.alpha_composite(img,ov).convert('RGB')
ok=[t for t in T if t['status']=='ok']
hdr=150; out=Image.new('RGB',(img.width,img.height+hdr),(18,18,18)); out.paste(img,(0,hdr)); o=ImageDraw.Draw(out)
o.text((10,8),f'{name}: S7 ribbon-edge trace from every visible tee (prototype)',fill=(255,255,255),font=FT)
o.text((10,40),f'ribbon width {W:.2f} px (measured off the pads; 0.93 x C1 radius {C.R1:.1f} px). Leg 1 leaves along the pad axis from the front stroke; legs follow fixed-centreline edge contrast > 8 lum; end at a BasketPoint (sprite tip + spoke offset)',fill=(220,220,220),font=FS)
o.text((10,62),f'cyan = accepted trace (edges at ±W/2, centreline), yellow = fitted bend vertex, orange = rejected/lost, red = BasketPoint, magenta = Sam\'s corridor centreline / bend points',fill=(220,220,220),font=FS)
cs=[t['resCentreMedPx'] for t in ok]; ws=[t['widthMedPx'] for t in ok]
o.text((10,86),f'accepted {len(ok)}/{len(T)} visible tees; per-trace edge-centre residual median {np.median(cs):.2f} px (max {max(cs):.2f}); width {np.median(ws):.2f} px (traces {min(ws):.2f}..{max(ws):.2f})',fill=(0,255,255),font=FS)
bl=[(t['tee'],t['truth']) for t in T if t['truth'] and t['truth']['nBendsTruth']]
o.text((10,108),'bend vertices refined by render-and-score (start/end fixed); vs Sam: '+'; '.join(f"T{a} hole {b['hole']}: {b['nBendsTruth']} marked, vertex err {b['bendErrPx']} px, basket {b['basketErrPx']} px" for a,b in bl)[:250],fill=(255,0,255),font=FS)
out.save(f's7edge-{name}.png'); print(out.size)
