import json, numpy as np
from PIL import Image, ImageDraw, ImageFont
A='/home/user/chainspot-toolkit/attempts/stages/attempt-1792256170903-b68743f9e95c/fork/stage-output/early/artifacts'
raw=np.fromfile(f'{A}/s1/badgePx.rgba.bin',dtype=np.uint8); H=raw.size//4//1290; rgb=raw.reshape(H,1290,4)[...,:3].astype(int)
F=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',14); FS=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',12)
tees=json.load(open(f'{A}/s3/px.tees.json'))['tees']
def panel(t, title):
    cx,cy=t['center']; R=22; x0,y0=int(cx-R),int(cy-R); Z=12
    c=rgb[y0:y0+2*R,x0:x0+2*R]; mx=c.max(-1); mn=c.min(-1); S=np.where(mx>0,(mx-mn)*255//np.maximum(mx,1),0)
    bright=(mx>=210)&(S<=45)
    # AA blend: not bright, neutral-ish, adjacent (<=2px) to bright, brighter than local bg median
    dil=bright.copy()
    for _ in range(2): d=dil.copy(); d[1:]|=dil[:-1]; d[:-1]|=dil[1:]; d[:,1:]|=dil[:,:-1]; d[:,:-1]|=dil[:,1:]; dil=d
    bg=np.median(mx[~dil]); aa=(~bright)&dil&(mx>bg+15)&(S<=60)
    im=Image.fromarray(c.astype(np.uint8)).resize((2*R*Z,2*R*Z),Image.NEAREST).convert('RGBA')
    ov=Image.new('RGBA',im.size,(0,0,0,0)); d=ImageDraw.Draw(ov)
    for (yy,xx) in zip(*np.nonzero(bright)): d.rectangle([xx*Z,yy*Z,xx*Z+Z-1,yy*Z+Z-1],outline=(0,255,90,255),width=2)
    for (yy,xx) in zip(*np.nonzero(aa)): d.rectangle([xx*Z+2,yy*Z+2,xx*Z+Z-3,yy*Z+Z-3],fill=(255,210,0,150))
    im=Image.alpha_composite(im,ov).convert('RGB')
    out=Image.new('RGB',(im.width,im.height+46),(18,18,18)); out.paste(im,(0,46)); od=ImageDraw.Draw(out)
    od.text((8,4),title,fill=(255,255,255),font=F)
    od.text((8,25),f'green = kept by bright threshold: {int(bright.sum())} px   yellow = AA blend thrown away: {int(aa.sum())} px',fill=(230,230,230),font=FS)
    return out, int(bright.sum()), int(aa.sum())
# pick hole-3-like rotated pad and an axis-aligned pad
def rot(t): a=abs(((t['angleRad']*180/np.pi)+45)%90-45); return a
ts=sorted(tees[:15],key=rot)
p1=panel(ts[0],f'axis-aligned pad (rotation {rot(ts[0]):.1f} deg)')
p2=panel(ts[-1],f'rotated pad (rotation {rot(ts[-1]):.1f} deg)')
W=p1[0].width+p2[0].width+10; sheet=Image.new('RGB',(W,p1[0].height),(40,40,40)); sheet.paste(p1[0],(0,0)); sheet.paste(p2[0],(p1[0].width+10,0)); sheet.save('aa-demo.png')
# all 15: AA px vs rotation
rows=[]
for t in tees[:15]:
    _,b,a=panel(t,''); rows.append((round(rot(t),1),b,a,round(a/(a+b),3)))
print(sorted(rows))
