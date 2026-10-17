import sys, json, math, numpy as np
from PIL import Image, ImageDraw, ImageFont
from course import Course, TESTIMONY
name=sys.argv[1]; C=Course(name); R=json.load(open(f's3first-{name}.json')); W=R['width']; J=R['judge'] or {}
TK='/home/user/chainspot-toolkit'
im=Image.fromarray((C.rgb*0.6).astype(np.uint8)).convert('RGBA'); ov=Image.new('RGBA',im.size,(0,0,0,0)); d=ImageDraw.Draw(ov)
FB=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',17); FS=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',15); FT=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',24)
sam={}
if name in TESTIMONY:
    f,dy=TESTIMONY[name]
    for h in json.load(open(f'{TK}/testimony/{f}'))['holes']: sam[h['number']]=[(q['xPx'],q['yPx']+dy) for q in (h.get('corridorBends') or [])]
ok=0
for r in R['holes']:
    n=r['hole']; j=J.get(str(n)) or J.get(n) or {}
    V=r.get('verts')
    good=j.get('ok') if j else None
    col=(0,255,120,255) if good else ((255,60,60,255) if good is False else (0,220,255,255))
    if V and r.get('end') is not None:
        for a,b in zip(V[:-1],V[1:]):
            a=np.array(a); b=np.array(b); dv=b-a; L=np.linalg.norm(dv); u=dv/L; nn=np.array([-u[1],u[0]])
            for s in (1,-1): d.line([tuple(a+nn*s*W/2),tuple(b+nn*s*W/2)],fill=col[:3]+(170,),width=2)
            d.line([tuple(a),tuple(b)],fill=col,width=2)
        for v in V[1:-1]: d.ellipse([v[0]-6,v[1]-6,v[0]+6,v[1]+6],outline=(255,230,0,255),width=3)
        s=V[0]; d.ellipse([s[0]-5,s[1]-5,s[0]+5,s[1]+5],fill=(255,255,255,255))
    elif V:
        for a,b in zip(V[:-1],V[1:]): d.line([tuple(a),tuple(b)],fill=(255,60,60,255),width=3)
    for q in sam.get(n,[]): d.line([q[0]-7,q[1]-7,q[0]+7,q[1]+7],fill=(255,0,255,255),width=3); d.line([q[0]-7,q[1]+7,q[0]+7,q[1]-7],fill=(255,0,255,255),width=3)
    b=C.badges[n]; lab=f'{n}'+(f" {'OK' if good else 'X'}" if j else '')
    d.text((b[0]+30,b[1]-10),lab,fill=col,font=FB)
for k,(x,y) in enumerate(C.bp): d.ellipse([x-4,y-4,x+4,y+4],outline=(255,80,80,255),width=2)
im=Image.alpha_composite(im,ov).convert('RGB')
hdr=Image.new('RGB',(im.width,110),(18,18,18)); o=ImageDraw.Draw(hdr)
n_ok=sum(1 for v in J.values() if v.get('ok')) if J else None
o.text((8,6),f"{name}: hallways solved S3-first (tee -> badge -> 3-point straight -> pathfinding), width {W:.2f} px",fill=(255,255,255),font=FT)
o.text((8,42),'green = agrees with Sam (end within 12 px, same bend count, every bend within 15 px); red = disagrees or lost; cyan = no testimony',fill=(220,220,220),font=FS)
o.text((8,64),'yellow rings = our bends   magenta X = Sam\'s bends   white dot = tee cap   red rings = BasketPoints'+(f'   ->  {n_ok}/{len(J)} holes agree with Sam' if J else ''),fill=(220,220,220),font=FS)
out=Image.new('RGB',(im.width,im.height+110)); out.paste(hdr,(0,0)); out.paste(im,(0,110)); out.save(f's3first-{name}.png'); print(out.size)
