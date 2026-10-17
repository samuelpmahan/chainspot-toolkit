import json, math, numpy as np
from PIL import Image, ImageDraw, ImageFont
ST='/home/user/chainspot-toolkit/attempts/stages'; W=1290
C=[('golden','attempt-1792256170903-b68743f9e95c'),('lenard','attempt-1792256225103-92dacbe97c0f'),('townelake','attempt-1792256243822-fb785314ae52'),('heritage','attempt-1792256261126-6ee7ff71e848'),('alex','attempt-1792263349086-27173a1f38f5')]
FT=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',22); FS=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',16); FB=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',15)
S=0.5; panels=[]
for c,att in C:
    A=f'{ST}/{att}/fork/stage-output/early/artifacts'; R=json.load(open(f'{ST}/{att}/fork/stage-output/s3assoc/px.tees.association.json'))
    raw=np.fromfile(f'{A}/s1/badgePx.rgba.bin',dtype=np.uint8); H=raw.size//4//W; rgb=raw.reshape(H,W,4)[...,:3]
    im=Image.fromarray((rgb*0.55).astype(np.uint8)).resize((int(W*S),int(H*S)),Image.LANCZOS).convert('RGBA'); ov=Image.new('RGBA',im.size,(0,0,0,0)); d=ImageDraw.Draw(ov)
    P=lambda x,y:(x*S,y*S)
    bj={str(b['label']):b for b in json.load(open(f'{A}/s1/px.badges.json'))['badges']}
    kj=json.load(open(f'{A}/s2/px.baskets.json'))['baskets']
    bp=lambda k:(k['bbox'][0]+22.5+0.34,k['bbox'][1]+71+0.73)
    J={p['tee']:p for p in (R['judgement'] or {}).get('perTee',[])}
    for k in kj: x,y=bp(k); d.ellipse([P(x,y)[0]-4,P(x,y)[1]-4,P(x,y)[0]+4,P(x,y)[1]+4],outline=(255,255,255,255),width=2)
    for r in R['rows']:
        cx,cy=r['center']; th=math.radians(r['thDeg']); j=J.get(r['tee'],{})
        if r['best']:
            s=r['best']['sense']; u=(math.cos(th)*s,math.sin(th)*s); dist=r['best']['distPx']
            ok=j.get('badgeAgrees',None)
            col=(0,255,90,255) if ok in (True,None) else (255,40,40,255)
            d.line([P(cx,cy),P(cx+u[0]*dist,cy+u[1]*dist)],fill=col,width=3)
            st=r['straight']
            if st and st['verdict']=='STRAIGHT_CANDIDATE':
                bent=j.get('bent')
                d.line([P(cx+u[0]*dist,cy+u[1]*dist),P(cx+u[0]*st['alongPx'],cy+u[1]*st['alongPx'])],fill=(255,60,60,255) if bent else (0,220,255,255),width=3)
            elif j.get('hole') and j.get('bent') is False and not j.get('samBasketSeenInS2'):
                for t in np.arange(dist,dist+600,14): d.line([P(cx+u[0]*t,cy+u[1]*t),P(cx+u[0]*(t+7),cy+u[1]*(t+7))],fill=(255,170,0,255),width=3)
            if r['verdict']=='ASSOCIATED_BY_PATH_SIDE': d.text((P(cx,cy)[0]+8,P(cx,cy)[1]-18),'path side',fill=(255,0,255,255),font=FB)
        else:
            d.ellipse([P(cx,cy)[0]-12,P(cx,cy)[1]-12,P(cx,cy)[0]+12,P(cx,cy)[1]+12],outline=(255,40,40,255),width=4)
        d.ellipse([P(cx,cy)[0]-4,P(cx,cy)[1]-4,P(cx,cy)[0]+4,P(cx,cy)[1]+4],fill=(255,230,0,255))
        lab=f"{j['hole']}" if j.get('hole') else (r['best']['badge'] if r['best'] else '?')
        d.text((P(cx,cy)[0]+6,P(cx,cy)[1]+2),lab,fill=(255,230,0,255),font=FB)
    im=Image.alpha_composite(im,ov).convert('RGB')
    hdr=Image.new('RGB',(im.width,96),(18,18,18)); o=ImageDraw.Draw(hdr); n=R['counts']; jb=(R['judgement'] or {}).get('badge'); js=(R['judgement'] or {}).get('straight')
    o.text((6,4),f"{c}  pad {R['template']['L']:.2f} x {R['template']['W']:.2f} px",fill=(255,255,255),font=FT)
    o.text((6,34),f"{n['tees']} pads: {n['associated']+n['associatedByPathSide']} associated, {n['ambiguous']} ambiguous, {n['noBadge']} no badge"+(f"  | Sam: {jb['agree']}/{jb['of']} agree" if jb else '  | no testimony'),fill=(220,220,220),font=FS)
    if js: o.text((6,58),f"straight: {js['straightHolesCalledStraight']}/{js['straightHoles']-js['straightHolesWithBasketUnseenInS2']} (basket seen), {js['straightHolesWithBasketUnseenInS2']} basket unseen; bent hit by chance {js['bentHolesCalledStraight']}",fill=(0,220,255),font=FS)
    else: o.text((6,58),f"straight candidates: {n['straightCandidates']}",fill=(0,220,255),font=FS)
    pn=Image.new('RGB',(im.width,im.height+96),(18,18,18)); pn.paste(hdr,(0,0)); pn.paste(im,(0,96)); panels.append(pn)
Wt=sum(p.width for p in panels)+10*(len(panels)-1); Ht=max(p.height for p in panels)+64
out=Image.new('RGB',(Wt,Ht),(18,18,18)); x=0
for p in panels: out.paste(p,(x,64)); x+=p.width+10
o=ImageDraw.Draw(out)
o.text((8,6),'S3 initial association: AA-fit pad -> badge (green; red = disagrees with Sam), axis continued to a BasketPoint (cyan = straight; red = bent hole hit by chance)',fill=(255,255,255),font=FT)
o.text((8,36),'white rings = BasketPoints (S2)   orange dashes = straight hole whose basket S2 did not find: the ray to search along in S4   red circle = no badge within 3 deg   labels = Sam\'s hole number (alex: best badge)',fill=(220,220,220),font=FS)
out.save('assoc-overview.png'); print(out.size)
