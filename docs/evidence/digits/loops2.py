import json, numpy as np
from scipy import ndimage as ndi
from PIL import Image, ImageDraw, ImageFont
ST='/home/user/chainspot-toolkit/attempts/stages'; W=1290
C=[('golden','attempt-1792256170903-b68743f9e95c'),('lenard','attempt-1792256225103-92dacbe97c0f'),('townelake','attempt-1792256243822-fb785314ae52'),('heritage','attempt-1792256261126-6ee7ff71e848'),('alex','attempt-1792263349086-27173a1f38f5')]
FS=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',11); FT=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',13)
tiles=[]; summary={}
for c,att in C:
    A=f'{ST}/{att}/fork/stage-output/early/artifacts/s1'
    d=json.load(open(f'{A}/px.digits.json')); bj=json.load(open(f'{A}/px.badges.json'))['badges']
    raw=np.fromfile(f'{A}/badgePx.rgba.bin',dtype=np.uint8); H=raw.size//4//W; rgb=raw.reshape(H,W,4)[...,:3]; lum=rgb.astype(float).mean(-1)
    for db in d['badges']:
        b=bj[db['index']]; own=np.zeros(H*W,bool); own[b['px']]=True; own=own.reshape(H,W)
        cnt=np.zeros(H*W,bool)
        for k in db.get('counters') or []: cnt[k['px']]=True
        cnt=cnt.reshape(H,W)
        for g in db['digits']:
            x,y,w,h=g['bbox']; p=2; sl=(slice(y-p,y+h+p),slice(x-p,x+w+p)); L_=lum[sl]
            glyph=L_>=120; loop=ndi.binary_fill_holes(glyph)&~glyph
            if not loop.any(): continue
            dark=(L_<60)&loop; lab,n=ndi.label(dark)
            comps=[]
            for i in range(1,n+1):
                m=lab==i; inC=(m&cnt[sl]).sum(); inO=(m&own[sl]).sum()
                comps.append(dict(px=int(m.sum()),inCounter=int(inC),inBadgePx=int(inO),unowned=int((m&~cnt[sl]&~own[sl]).sum())))
            ring=ndi.binary_dilation(loop)&~loop&~glyph  # AA between counter and glyph, not bright core
            unr=(ndi.binary_dilation(loop)&~own[sl]&~cnt[sl])
            summary.setdefault(c,[]).append((db['label'],g['predicted'],comps,int(unr.sum())))
            if c in ('lenard','alex'): tiles.append((c,db['label'],g['predicted'],rgb[sl].copy(),own[sl],cnt[sl],unr,comps))
for c,rows in summary.items():
    dk=[(l,p,cc) for l,p,comps,_ in rows for cc in comps if cc['unowned']]
    print(c,'closed-loop digits',len(rows),'dark comps',sum(len(r[2]) for r in rows),'dark comps with unowned px',len(dk),dk[:6],'| unowned AA-ring px',sum(r[3] for r in rows))
# sheet: lenard and alex closed-loop digits; green = badge.px, blue = counter, red = owned by nobody
Z=10; th=0
ims=[]
for c,l,p,R,O,Cn,U,comps in tiles:
    h,w,_=R.shape; im=Image.fromarray(R).resize((w*Z,h*Z),Image.NEAREST); dr=ImageDraw.Draw(im)
    for M,col in ((O,(0,200,80)),(Cn,(60,140,255)),(U,(255,40,40))):
        for yy,xx in zip(*np.nonzero(M)): dr.rectangle([xx*Z+1,yy*Z+1,xx*Z+Z-2,yy*Z+Z-2],outline=col,width=2 if col[0]==255 else 1)
    cv=Image.new('RGB',(im.width,im.height+16),(18,18,18)); cv.paste(im,(0,16)); ImageDraw.Draw(cv).text((2,1),f'{c[:5]} b{l} "{p}" red {int(U.sum())}',fill=(255,255,255),font=FS); ims.append(cv)
cols=8; cw=max(i.width for i in ims)+6; ch=max(i.height for i in ims)+6
S=Image.new('RGB',(cols*cw,40+((len(ims)+cols-1)//cols)*ch),(18,18,18)); ImageDraw.Draw(S).text((6,6),'Closed-loop digits (lenard, alex). green = badge.px  blue = digit-owned counter  red = owned by nobody (only inside the 2-px mute)',fill=(255,255,255),font=FT)
for i,im in enumerate(ims): S.paste(im,((i%cols)*cw,40+(i//cols)*ch))
S.save('/tmp/claude-0/-home-user/73d91f40-13de-5bef-9b81-7de266a5102a/scratchpad/viz/loops.png'); print(S.size)
