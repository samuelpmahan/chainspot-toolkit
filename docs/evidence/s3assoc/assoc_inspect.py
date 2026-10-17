import json, math, numpy as np
from PIL import Image, ImageDraw, ImageFont
ST='/home/user/chainspot-toolkit/attempts/stages'; W=1290
C=[('golden','attempt-1792256170903-b68743f9e95c'),('lenard','attempt-1792256225103-92dacbe97c0f'),('townelake','attempt-1792256243822-fb785314ae52'),('heritage','attempt-1792256261126-6ee7ff71e848'),('alex','attempt-1792263349086-27173a1f38f5')]
FS=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',13); FB=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',14)
COL=[(0,255,90),(255,200,0),(255,90,200)]
panels=[]
for c,att in C:
    A=f'{ST}/{att}/fork/stage-output/early/artifacts'; R=json.load(open(f'{ST}/{att}/fork/stage-output/s3assoc/px.tees.association.json'))
    raw=np.fromfile(f'{A}/s1/badgePx.rgba.bin',dtype=np.uint8); H=raw.size//4//W; rgb=raw.reshape(H,W,4)[...,:3]
    bj={str(b['label']):b for b in json.load(open(f'{A}/s1/px.badges.json'))['badges']}
    J={p['tee']:p for p in (R['judgement'] or {}).get('perTee',[])}
    for r in R['rows']:
        if not r['inspect']: continue
        p=r['pose']; cx,cy=p['cx'],p['cy']; th=math.radians(p['thDeg'])
        # zoom panel 10x, +-22 px
        Z=9; x0,y0=int(cx)-22,int(cy)-22; z=Image.fromarray(rgb[y0:y0+45,x0:x0+45]).resize((45*Z,45*Z),Image.NEAREST); d=ImageDraw.Draw(z)
        P=lambda x,y:((x-x0+0.5)*Z,(y-y0+0.5)*Z)
        def rect(L,Wd,col,w=2):
            cs,sn=math.cos(th),math.sin(th); pts=[P(cx+a*cs-b*sn,cy+a*sn+b*cs) for a,b in ((-L/2,-Wd/2),(L/2,-Wd/2),(L/2,Wd/2),(-L/2,Wd/2))]; d.polygon(pts,outline=col,width=w)
        rect(p['L'],p['W'],(0,255,255)); rect(p['L']-2*p['se'],p['W']-2*p['ss'],(0,160,255),1)
        d.line([P(cx-30*math.cos(th),cy-30*math.sin(th)),P(cx+30*math.cos(th),cy+30*math.sin(th))],fill=(255,0,255),width=1)
        # context panel: include nearest badges
        pts=[(cx,cy)]+[tuple(np.array([bj[k['badge']]['bbox'][0]+bj[k['badge']]['bbox'][2]/2,bj[k['badge']]['bbox'][1]+bj[k['badge']]['bbox'][3]/2])) for k in r['nearest'][:3]]
        xs=[q[0] for q in pts]; ys=[q[1] for q in pts]; bx0=int(max(0,min(xs)-40)); by0=int(max(0,min(ys)-40)); bx1=int(min(W,max(xs)+40)); by1=int(min(H,max(ys)+40))
        sc=min(400/max(bx1-bx0,1),400/max(by1-by0,1),4.0)
        ctx=Image.fromarray(rgb[by0:by1,bx0:bx1]).resize((int((bx1-bx0)*sc),int((by1-by0)*sc)),Image.LANCZOS); dc=ImageDraw.Draw(ctx)
        Q=lambda x,y:((x-bx0+0.5)*sc,(y-by0+0.5)*sc)
        L_=2000; dc.line([Q(cx-L_*math.cos(th),cy-L_*math.sin(th)),Q(cx+L_*math.cos(th),cy+L_*math.sin(th))],fill=(255,0,255),width=1)
        for i,k in enumerate(r['nearest'][:3]):
            b=bj[k['badge']]; fr=[q for q in b['findPx']['parts'] if q['polarity']=='bright'][0]; x,y,w,h=fr['bbox']; bc=(x+(w-1)/2,y+(h-1)/2)
            dc.rectangle([Q(x-0.5,y-0.5),Q(x+w-0.5,y+h-0.5)],outline=COL[i],width=2); dc.ellipse([Q(*bc)[0]-3,Q(*bc)[1]-3,Q(*bc)[0]+3,Q(*bc)[1]+3],fill=COL[i])
            dc.line([Q(cx,cy),Q(*bc)],fill=COL[i],width=1)
        dc.ellipse([Q(cx,cy)[0]-4,Q(cx,cy)[1]-4,Q(cx,cy)[0]+4,Q(cx,cy)[1]+4],outline=(0,255,255),width=2)
        j=J.get(r['tee'],{})
        lines=[f"{c}  S3 #{r['tee']}  -> badge {r['best']['badge'] if r['best'] else '-'} ({r['verdict']})" + (f"   Sam: hole {j['hole']} {'bent' if j.get('bent') else 'straight'}" if j.get('hole') else ''),
               f"AA fit {p['L']:.2f} x {p['W']:.2f} px  theta {p['thDeg']:.2f} deg  rms {p['rmsRgb']:.1f}  clean {p['clean']}  (S3 moment angle off {p['s3AngleDiffDeg']:+.2f} deg)"]
        for i,k in enumerate(r['nearest'][:3]): lines.append(f"badge {k['badge']:>2}: {k['resDeg']:.2f} deg, {k['latPx']:.2f} px off axis at {k['distPx']:.0f} px")
        st=r['straight']
        if st: lines.append(f"axis -> BasketPoint b{st['basket']}: {st['latPx']:.2f} px at {st['alongPx']:.0f} px ({st['verdict']})")
        Hh=max(z.height,ctx.height)+18*len(lines)+10
        pn=Image.new('RGB',(z.width+ctx.width+10,Hh),(24,24,24)); pn.paste(z,(0,18*len(lines)+6)); pn.paste(ctx,(z.width+10,18*len(lines)+6)); o=ImageDraw.Draw(pn)
        for i,l in enumerate(lines): o.text((6,4+18*i),l,fill=(255,255,255) if i==0 else (COL[i-2] if 2<=i<5 else (220,220,220)),font=FB if i==0 else FS)
        panels.append(pn)
cols=3; cw=max(p.width for p in panels)+12; rows=[panels[i:i+cols] for i in range(0,len(panels),cols)]
Ht=sum(max(p.height for p in rw)+12 for rw in rows)+50
S=Image.new('RGB',(cols*cw,Ht),(12,12,12)); o=ImageDraw.Draw(S)
o.text((8,8),f'S3 association: every pad flagged for inspection ({len(panels)}), not dropped. Left: AA pad fit (cyan outer, blue inner, magenta axis). Right: axis line + 3 nearest badges by residual (green, yellow, pink)',fill=(255,255,255),font=FB)
y=40
for rw in rows:
    x=0
    for p in rw: S.paste(p,(x,y)); x+=cw
    y+=max(p.height for p in rw)+12
S.save('inspect.png'); print(S.size,len(panels))
