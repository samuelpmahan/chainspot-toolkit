import json, glob, numpy as np
from PIL import Image, ImageDraw, ImageFont
ST='/home/user/chainspot-toolkit/attempts/stages'; TK='/home/user/chainspot-toolkit'
C=[('golden','attempt-1792256170903-b68743f9e95c'),('lenard','attempt-1792256225103-92dacbe97c0f'),('townelake','attempt-1792256243822-fb785314ae52'),('heritage','attempt-1792256261126-6ee7ff71e848'),('alex','attempt-1792263349086-27173a1f38f5')]
FT=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',15); FS=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',12); FX=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',10)
summary={}
cells=[]  # (course, hole, kind, [fractions per level])
for c,att in C:
    P=json.load(open(f'{ST}/{att}/fork/stage-output/s3assoc/perturbation.json'))['table']
    bent={}
    try:
        for h in json.load(open(glob.glob(f'{TK}/testimony/{c}/*.annotation.json')[0]))['holes']: bent[str(h['number'])]=bool(h.get('corridorBends'))
    except IndexError: pass
    holes=sorted(json.load(open(f'{TK}/baselines/s3assoc/{c}.json'))['holes'].keys(),key=int)
    for h in holes:
        badge=[sum(w['fraction'] for w in lv['worst'] if w['hole']==h and w['what'].startswith('badge')) for lv in P]
        st=[sum(w['fraction'] for w in lv['worst'] if w['hole']==h and (w['what'].startswith('straight'))) for lv in P]
        cells.append((c,h,bent.get(h),badge,st))
levels=[(lv['thetaSigmaDeg'],lv['positionSigmaPx']) for lv in P]
cw,rh=46,15; left=150; top=110
W=left+2*len(levels)*cw+60; H=top+len(cells)*rh+40
im=Image.new('RGB',(W,H),(18,18,18)); d=ImageDraw.Draw(im)
d.text((8,6),'Perturbation test: how often each hole\'s S3 decision changes when every pad and badge gets EXTRA error (200 draws per column)',fill=(255,255,255),font=FT)
d.text((8,28),'left block: which badge the tee pairs with   right block: 3-point straight test (verdict or basket)   black = never, red = 50%+',fill=(220,220,220),font=FS)
d.text((8,46),'row label: course hole [S]traight / [B]ent per Sam (alex: no testimony). Bent holes flipping the 3-point verdict do not matter: the hallway decides them.',fill=(220,220,220),font=FS)
for b,name in enumerate(['badge pairing','3-point straight test']):
    x0=left+b*(len(levels)*cw+30); d.text((x0,66),name,fill=(255,230,0),font=FS)
    for k,(t,p) in enumerate(levels): d.text((x0+k*cw+2,84),f'{t}deg\n{p}px',fill=(200,200,200),font=FX)
for r,(c,h,bt,badge,st) in enumerate(cells):
    y=top+r*rh; tag='S' if bt is False else ('B' if bt else '?')
    d.text((8,y),f'{c} {h} [{tag}]',fill=(255,255,255) if r==0 or cells[r-1][0]==c else (255,230,0),font=FS)
    if r>0 and cells[r-1][0]!=c: d.line([(0,y-1),(W,y-1)],fill=(90,90,90))
    for b,vals in enumerate([badge,st]):
        x0=left+b*(len(levels)*cw+30)
        for k,v in enumerate(vals):
            g=min(1,v/0.5); col=(int(40+215*g),int(40*(1-g)),int(40*(1-g))) if v>0.01 else (0,0,0)
            d.rectangle([x0+k*cw,y,x0+k*cw+cw-2,y+rh-2],fill=col)
            if v>0.01: d.text((x0+k*cw+4,y+1),f'{v:.0%}',fill=(255,255,255),font=FX)
im.save('perturb-heat.png'); print(im.size)
# compact verdicts for the first column (extra error = our measured error) and the 0.5deg/1.2px column
for k in (0,4):
    bad_badge=[(c,h,round(b[k],2)) for c,h,bt,b,s in cells if b[k]>0.01]
    bad_straight=[(c,h,round(s[k],2)) for c,h,bt,b,s in cells if s[k]>0.01 and bt is False]
    print('level',levels[k],'badge changes',bad_badge,'| straight-hole (per Sam) 3pt changes',bad_straight)
