import json, os, sys, math, numpy as np
from PIL import Image, ImageDraw, ImageFont
T='/home/user/chainspot-toolkit'
S='/tmp/claude-0/-home-user/73d91f40-13de-5bef-9b81-7de266a5102a/scratchpad'
F=ImageFont.load_default()
try: F=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',13); FS=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',11)
except Exception: FS=F
courses=[('golden','testimony/golden/DashsTrack-full.annotation.json',4,[3,5,12]),('lenard','testimony/lenard/Lenard-full.annotation.json',2,[3]),
         ('townelake','testimony/townelake/TowneLake-full.annotation.json',1,[13]),('heritage','testimony/heritage/HeritagePark-full.annotation.json',2,[5,6,10,15])]
Z=5; R=34  # crop half-size px (canonical), zoom
tiles=[]
for sp,annp,dy,holes in courses:
    out=json.load(open(f'{S}/s4r-{sp}.out'))['out']; att=out.split('/fork/')[0]
    raw=np.fromfile(f'{att}/fork/stage-output/early/artifacts/s1/badgePx.rgba.bin',dtype=np.uint8); H=raw.size//4//1290
    img=Image.fromarray(raw.reshape(H,1290,4)[...,:3])
    ann={h['number']:h for h in json.load(open(f'{T}/{annp}'))['holes']}
    badges={str(b['label']):b for b in json.load(open(f'{att}/fork/stage-output/early/artifacts/s1/px.badges.json'))['badges']}
    rec={}
    for impl in ('greedyOccluded','pinned'):
        p=f'{out}/artifacts/fn.Tee.recover/{impl}/recovered.json'
        if os.path.exists(p):
            v=json.load(open(p)); v=v.get('value',v); lst=v['recovered'] if isinstance(v,dict) else v
            for t in lst: rec.setdefault(int(t['hole']),{})[impl]=t
    for n in holes:
        sx,sy=ann[n]['tee']['xPx'],ann[n]['tee']['yPx']-dy
        x0,y0=int(sx-R),int(sy-R)
        crop=img.crop((x0,y0,x0+2*R,y0+2*R)).resize((2*R*Z,2*R*Z),Image.NEAREST).convert('RGBA')
        ov=Image.new('RGBA',crop.size,(0,0,0,0)); d=ImageDraw.Draw(ov)
        P=lambda x,y:((x-x0+0.5)*Z,(y-y0+0.5)*Z)  # pixel-index convention: pixel i's centre is at i
        g=rec.get(n,{}).get('greedyOccluded'); pin=rec.get(n,{}).get('pinned')
        b=badges.get(str(n))
        if b:  # badge direction from the pad
            bx,by,bw,bh=b['bbox']; bc=(bx+bw/2,by+bh/2); c=(g or pin or {'center':[sx,sy]})['center']
            ang=math.atan2(bc[1]-c[1],bc[0]-c[0]); d.line([P(*c),P(c[0]+60*math.cos(ang),c[1]+60*math.sin(ang))],fill=(255,210,0,230),width=2)
        if pin: d.polygon([P(*q) for q in pin['corners']],outline=(255,140,0,255)); 
        if g:
            d.polygon([P(*q) for q in g['corners']],outline=(0,255,90,255),width=3)
            cx,cy=P(*g['center']); d.line([cx-7,cy,cx+7,cy],fill=(0,255,90,255),width=2); d.line([cx,cy-7,cx,cy+7],fill=(0,255,90,255),width=2)
            if g.get('visibleCenter'): vx,vy=P(*g['visibleCenter']); d.ellipse([vx-5,vy-5,vx+5,vy+5],outline=(0,220,255,255),width=2)
        mx,my=P(sx,sy); d.line([mx-8,my-8,mx+8,my+8],fill=(255,0,255,255),width=3); d.line([mx-8,my+8,mx+8,my-8],fill=(255,0,255,255),width=3)
        crop=Image.alpha_composite(crop,ov).convert('RGB')
        tile=Image.new('RGB',(crop.width,crop.height+44),(18,18,18)); tile.paste(crop,(0,44)); td=ImageDraw.Draw(tile)
        td.text((6,4),f'{sp}  hole {n}',fill=(255,255,255),font=F)
        if g:
            vc=g.get('visibleCenter') or g['center']; e=math.hypot(vc[0]-sx,vc[1]-sy); ec=math.hypot(g['center'][0]-sx,g['center'][1]-sy)
            col=(120,255,140) if e<=3 else (255,200,80)
            td.text((6,23),f'greedy: {e:.2f} px (visible ctr) | pad ctr {ec:.2f} px',fill=col,font=FS)
        else: td.text((6,23),'greedy: NOT RECOVERED',fill=(255,90,90),font=FS)
        if pin: td.text((crop.width-120,4),f'pinned {math.hypot(pin["center"][0]-sx,pin["center"][1]-sy):.1f} px',fill=(255,160,60),font=FS)
        tiles.append(tile)
W=tiles[0].width; cols=3; rows=(len(tiles)+cols-1)//cols
legend_h=30; sheet=Image.new('RGB',(cols*(W+6),rows*(tiles[0].height+6)+legend_h),(40,40,40))
for i,t in enumerate(tiles): sheet.paste(t,((i%cols)*(W+6),legend_h+(i//cols)*(t.height+6)))
ld=ImageDraw.Draw(sheet); x=8
for txt,col in [('green box/+ = recovered pad & centre (greedyOccluded)',(0,255,90)),('cyan o = visible-hole centroid',(0,220,255)),('magenta X = Sam',(255,0,255)),('orange = pinned S4',(255,140,0)),('yellow = toward badge n',(255,210,0))]:
    ld.text((x,8),txt,fill=col,font=FS); x+=ld.textlength(txt,font=FS)+18
sheet.save(f'{S}/viz/s4-tees.png'); print(sheet.size, len(tiles))
