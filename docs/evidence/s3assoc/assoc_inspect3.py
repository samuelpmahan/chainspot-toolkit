import json, math, numpy as np
from PIL import Image, ImageDraw, ImageFont
ST='/home/user/chainspot-toolkit/attempts/stages'; W=1290
CAL=json.load(open('sigma_calib.json')); S0=CAL['sigma0Px']
C=[('golden','attempt-1792256170903-b68743f9e95c'),('lenard','attempt-1792256225103-92dacbe97c0f'),('townelake','attempt-1792256243822-fb785314ae52'),('heritage','attempt-1792256261126-6ee7ff71e848'),('alex','attempt-1792263349086-27173a1f38f5')]
FS=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',13); FB=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',14)
panels=[]
for c,att in C:
    A=f'{ST}/{att}/fork/stage-output/early/artifacts'; R=json.load(open(f'{ST}/{att}/fork/stage-output/s3assoc/px.tees.association.json'))
    raw=np.fromfile(f'{A}/s1/badgePx.rgba.bin',dtype=np.uint8); H=raw.size//4//W; rgb=raw.reshape(H,W,4)[...,:3]
    bj=json.load(open(f'{A}/s1/px.badges.json'))['badges']; J={p['tee']:p for p in (R['judgement'] or {}).get('perTee',[])}
    T=R['template']
    for r in R['rows']:
        p=r['pose']; cx,cy=p['cx'],p['cy']; th=math.radians(p['thDeg']); thf=math.radians(p['freeShapeThDeg']); sth=math.radians(p['sigmaRaw']['thDeg'])
        u=np.array([math.cos(th),math.sin(th)])
        cons=[]
        for b in bj:
            x,y,w,h=b['bbox']; bc=np.array([x+(w-1)/2,y+(h-1)/2]); v=bc-[cx,cy]; d=np.linalg.norm(v)
            if d<10: continue
            l=abs(u[0]*v[1]-u[1]*v[0]); z=l/math.sqrt(S0**2+(d*sth)**2); cons.append((z,str(b['label']),d,bc,l,np.sign(v@u)))
        cons.sort(key=lambda t:t[0]); ok=[t for t in cons if t[0]<=3]
        moved=abs(p['thDeg']-p['freeShapeThDeg'])>0.3
        if not (r['verdict']!='ASSOCIATED' or moved): continue
        taken={x['badge']:x['takenByTee'] for x in r['resolvedBy']}
        Z=9; x0,y0=int(cx)-22,int(cy)-22; z_=Image.fromarray(rgb[y0:y0+45,x0:x0+45]).resize((45*Z,45*Z),Image.NEAREST); d=ImageDraw.Draw(z_)
        P=lambda x,y:((x-x0+0.5)*Z,(y-y0+0.5)*Z)
        def rect(t,L,Wd,col,w=2,dash=False):
            cs,sn=math.cos(t),math.sin(t); pts=[P(cx+a*cs-b*sn,cy+a*sn+b*cs) for a,b in ((-L/2,-Wd/2),(L/2,-Wd/2),(L/2,Wd/2),(-L/2,Wd/2))]
            if dash:
                for i in range(4):
                    a,b=np.array(pts[i]),np.array(pts[(i+1)%4])
                    for f in np.arange(0,1,0.08): d.line([tuple(a+(b-a)*f),tuple(a+(b-a)*min(f+0.04,1))],fill=col,width=w)
            else: d.polygon(pts,outline=col,width=w)
        rect(thf,p['L'] if 'L' in p else T['L'],p['W'] if 'W' in p else T['W'],(255,140,0),2,True)
        rect(th,T['L'],T['W'],(0,255,255),2)
        d.line([P(cx-30*math.cos(th),cy-30*math.sin(th)),P(cx+30*math.cos(th),cy+30*math.sin(th))],fill=(255,0,255),width=1)
        # context: pad + every badge with z<=4 (at least 2)
        show=[t for t in cons if t[0]<=4] or cons[:2]
        if len(show)<2: show=cons[:2]
        pts=[(cx,cy)]+[tuple(t[3]) for t in show]
        xs=[q[0] for q in pts]; ys=[q[1] for q in pts]; bx0=int(max(0,min(xs)-40)); by0=int(max(0,min(ys)-40)); bx1=int(min(W,max(xs)+40)); by1=int(min(H,max(ys)+40))
        sc=min(420/max(bx1-bx0,1),420/max(by1-by0,1),4.0)
        ctx=Image.fromarray(rgb[by0:by1,bx0:bx1]).resize((max(1,int((bx1-bx0)*sc)),max(1,int((by1-by0)*sc))),Image.LANCZOS).convert('RGBA'); ov=Image.new('RGBA',ctx.size,(0,0,0,0)); dc=ImageDraw.Draw(ov)
        Q=lambda x,y:((x-bx0+0.5)*sc,(y-by0+0.5)*sc)
        n=np.array([-u[1],u[0]]); Dm=max(t[2] for t in show)+30
        for s in (1,-1):
            poly=[]
            for dd in np.linspace(0,Dm,30): poly.append(Q(*(np.array([cx,cy])+u*s*dd+n*3*math.sqrt(S0**2+(dd*sth)**2))))
            for dd in np.linspace(Dm,0,30): poly.append(Q(*(np.array([cx,cy])+u*s*dd-n*3*math.sqrt(S0**2+(dd*sth)**2))))
            dc.polygon(poly,fill=(255,0,255,70),outline=(255,0,255,160))
        dc.line([Q(*(np.array([cx,cy])-u*Dm)),Q(*(np.array([cx,cy])+u*Dm))],fill=(255,0,255,220),width=1)
        for t in show:
            zz,lab,dd,bc,l,sg=t; chosen=lab==(r['best']['badge'] if r['best'] else None)
            col=(0,255,90,255) if chosen else ((255,200,0,255) if (zz<=3 and taken.get(lab)) else ((255,120,0,255) if zz<=3 else (255,60,60,255)))
            txt=f'{lab}: z {zz:.1f}'+(f' (taken by S3#{taken[lab]})' if taken.get(lab) else (' (unclaimed)' if zz<=3 and not chosen else ''))
            dc.ellipse([Q(*bc)[0]-5,Q(*bc)[1]-5,Q(*bc)[0]+5,Q(*bc)[1]+5],fill=col); dc.text((Q(*bc)[0]+7,Q(*bc)[1]-16),txt,fill=col,font=FB)
        ctx=Image.alpha_composite(ctx,ov).convert('RGB')
        j=J.get(r['tee'],{})
        lines=[f"{c}  S3 #{r['tee']}  -> badge {r['best']['badge']}  [{r['verdict']}]  path side agrees: {r['badgeOnPathSide']}"+(f"   Sam: hole {j['hole']}" if j.get('hole') else ''),
               f"theta pose-only {p['thDeg']:.2f} deg (cyan) vs free-shape {p['freeShapeThDeg']:.2f} deg (orange dashed); raw sigma {p['sigmaRaw']['thDeg']:.3f} deg",
               "z = lateral / sqrt(0.85^2 + (dist * sigma_theta)^2):  "+',  '.join(f"{t[1]} z {t[0]:.2f} ({t[4]:.2f} px at {t[2]:.0f} px)" for t in cons[:3])]
        Hh=max(z_.height,ctx.height)+18*len(lines)+10
        pn=Image.new('RGB',(z_.width+ctx.width+10,Hh),(24,24,24)); pn.paste(z_,(0,18*len(lines)+6)); pn.paste(ctx,(z_.width+10,18*len(lines)+6)); o=ImageDraw.Draw(pn)
        for i,l in enumerate(lines): o.text((6,4+18*i),l,fill=(255,255,255) if i==0 else (220,220,220),font=FB if i==0 else FS)
        panels.append(pn)
cols=3; cw=max(p.width for p in panels)+12; rows=[panels[i:i+cols] for i in range(0,len(panels),cols)]
Ht=sum(max(p.height for p in rw)+12 for rw in rows)+50
S=Image.new('RGB',(cols*cw,Ht),(12,12,12)); o=ImageDraw.Draw(S)
o.text((8,8),f'Every pad whose badge was not unique, or whose angle moved > 0.3 deg between fits ({len(panels)}). Magenta band = 3 sigma corridor (0.85 px centre error + distance x the pad\'s own angle sigma). Green = chosen; yellow = consistent but owned by a better-fitting pad; orange = consistent and unclaimed; red = outside 3 sigma',fill=(255,255,255),font=FB)
y=40
for rw in rows:
    x=0
    for p in rw: S.paste(p,(x,y)); x+=cw
    y+=max(p.height for p in rw)+12
S.save('inspect3.png'); print(S.size,len(panels))
