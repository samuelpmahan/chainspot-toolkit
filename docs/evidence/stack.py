import json, os, math, numpy as np
from PIL import Image, ImageDraw, ImageFont
ST='/home/user/chainspot-toolkit/attempts/stages'
COURSES=[('golden','attempt-1792256170903-b68743f9e95c'),('lenard','attempt-1792256225103-92dacbe97c0f'),
         ('townelake','attempt-1792256243822-fb785314ae52'),('heritage','attempt-1792256261126-6ee7ff71e848'),('alex','attempt-1792229563197-375c3b48964b')]
F=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',14); FS=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',11)
W=1290
def load(att):
    A=f'{ST}/{att}/fork/stage-output/early/artifacts'
    raw=np.fromfile(f'{A}/s1/badgePx.rgba.bin',dtype=np.uint8); rgb=raw.reshape(raw.size//4//W,W,4)[...,:3].astype(float)
    return A,rgb
def mask_of(idx,H):
    m=np.zeros((H,W),bool); idx=np.asarray(idx,dtype=np.int64); m.flat[idx]=True; return m
def patch(rgb,own,x,y,w,h,p=4):
    x0,y0=x-p,y-p; return rgb[y0:y0+h+2*p,x0:x0+w+2*p], own[y0:y0+h+2*p,x0:x0+w+2*p].astype(float)
def render(stack, title, Z=8):
    P=np.stack([s[0] for s in stack]); O=np.stack([s[1] for s in stack])
    mean=P.mean(0); sd=P.std(0).mean(-1); freq=O.mean(0)
    h,w=freq.shape
    a=Image.fromarray(np.clip(mean,0,255).astype(np.uint8)).resize((w*Z,h*Z),Image.NEAREST)
    s=Image.fromarray(np.clip(sd*3,0,255).astype(np.uint8)).resize((w*Z,h*Z),Image.NEAREST).convert('RGB')
    f=np.zeros((h,w,3),np.uint8); f[...,1]=(freq*255).astype(np.uint8); part=(freq>0.02)&(freq<0.98); f[part]=[255,int(0),255]; f[part,0]=(255*(1-np.abs(freq[part]-0.5)*2)).astype(np.uint8)+0
    f[part]=np.stack([np.full(part.sum(),255),(freq[part]*200).astype(np.uint8),np.full(part.sum(),40)],-1)
    fi=Image.fromarray(f).resize((w*Z,h*Z),Image.NEAREST)
    gap=8; out=Image.new('RGB',(3*w*Z+2*gap,h*Z+42),(18,18,18)); out.paste(a,(0,42)); out.paste(s,(w*Z+gap,42)); out.paste(fi,(2*(w*Z+gap),42))
    d=ImageDraw.Draw(out); d.text((4,2),title+f'   N={len(stack)}',fill=(255,255,255),font=F)
    d.text((4,22),'mean (1/N each)',fill=(220,220,220),font=FS); d.text((w*Z+gap+4,22),'spread (std x3)',fill=(220,220,220),font=FS); d.text((2*(w*Z+gap)+4,22),'owned in every copy = green · in some = orange',fill=(220,220,220),font=FS)
    return out, freq
def sheet(panels, name, header):
    Wd=max(p.width for p in panels); Ht=sum(p.height+10 for p in panels)+40
    sh=Image.new('RGB',(Wd+20,Ht),(40,40,40)); d=ImageDraw.Draw(sh); d.text((10,10),header,fill=(255,255,255),font=F); y=40
    for p in panels: sh.paste(p,(10,y)); y+=p.height+10
    sh.save(name)
# ---- baskets (all courses; same sprite)
bk=[]; bad=[]; badge_frames={}; digits={}
for course,att in COURSES:
    A,rgb=load(att); H=rgb.shape[0]
    baskets=json.load(open(f'{A}/s2/px.baskets.json'))['baskets']; own=mask_of([i for k in baskets for i in k['px']],H)
    for k in baskets:
        x,y,w,h=[int(v) for v in k['bbox'][:4]]; bk.append(patch(rgb,own,x,y,46,72))
    badges=json.load(open(f'{A}/s1/px.badges.json'))['badges']; bown=mask_of([i for b in badges for i in b['px']],H)
    for b in badges:
        x,y,w,h=[int(v) for v in b['bbox'][:4]]; badge_frames.setdefault(f'{w}x{h}',[]).append((patch(rgb,bown,x,y,w,h),course,b['label']))
    dig=json.load(open(f'{A}/s1/px.digits.json'))['badges']
    for b in dig:
        n=len(b['digits'])
        for j,g in enumerate(b['digits']):
            x,y,w,h=g['bbox']; key=f"{g['predicted']}"; pos='alone' if n==1 else ('left' if j==0 else 'right')
            digits.setdefault(key,[]).append((patch(rgb,bown,x,y,9,23,3),course,b['badgeLabel'],pos,(w,h)))
panels=[render(bk,'BASKETS · all 5 courses aligned on bbox (46x72 px)')[0]]
sheet(panels,'stack-baskets.png','Stacked baskets: signal reinforces, noise averages away')
# ---- badge frames by size
panels=[]
for sz,items in sorted(badge_frames.items(),key=lambda kv:-len(kv[1])):
    w,h=map(int,sz.split('x')); ps=[i[0] for i in items]
    # patches must share shape: re-cut to the group's size
    out,_=render(ps,f'BADGE FRAMES {sz} px · labels '+','.join(sorted({f"{c[:1]}{l}" for _,c,l in items})),Z=7); panels.append(out)
sheet(panels,'stack-badges.png','Stacked badge frames, grouped by bbox size (digits blur away; frame and plate reinforce)')
# ---- digits per class
panels=[]
for key,items in sorted(digits.items()):
    sizes={}
    for it in items: sizes.setdefault(it[4],0); sizes[it[4]]+=1
    out,_=render([i[0] for i in items],f'DIGIT "{key}" · positions '+', '.join(f'{p}:{sum(1 for i in items if i[3]==p)}' for p in ('alone','left','right'))+' · bbox sizes '+', '.join(f'{a}x{b}:{n}' for (a,b),n in sorted(sizes.items())),Z=10); panels.append(out)
sheet(panels,'stack-digits.png','Stacked digits per class, aligned on each digit bbox top-left (crop 9x23 px + 3 px)')
print({k:len(v) for k,v in badge_frames.items()}, {k:len(v) for k,v in digits.items()})
