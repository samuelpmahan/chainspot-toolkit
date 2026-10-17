import json, numpy as np
from scipy import ndimage as ndi
from PIL import Image, ImageDraw, ImageFont
ST='/home/user/chainspot-toolkit/attempts/stages'; W=1290
C=[('golden','attempt-1792256170903-b68743f9e95c'),('lenard','attempt-1792256225103-92dacbe97c0f'),('townelake','attempt-1792256243822-fb785314ae52'),('heritage','attempt-1792256261126-6ee7ff71e848'),('alex','attempt-1792263349086-27173a1f38f5')]
FT=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',13); FS=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',11)
res={}; tiles={}
for c,att in C:
    A=f'{ST}/{att}/fork/stage-output/early/artifacts/s1'
    d=json.load(open(f'{A}/px.digits.json')); raw=np.fromfile(f'{A}/badgePx.rgba.bin',dtype=np.uint8); H=raw.size//4//W; lum=raw.reshape(H,W,4)[...,:3].astype(float).mean(-1)
    for db in d['badges']:
        for j,k in enumerate(db.get('counters') or []):
            m=np.zeros(H*W,bool); m[k['px']]=True; m=m.reshape(H,W)
            x,y,w,h=k['bbox']; sl=(slice(y-3,y+h+3),slice(x-3,x+w+3)); M=m[sl]; Lc=lum[sl]
            P=np.median(Lc[ndi.binary_erosion(M)]) if ndi.binary_erosion(M).any() else np.median(Lc[M])
            ring=ndi.binary_dilation(M,iterations=2)
            G=np.percentile(Lc[ring&~ndi.binary_dilation(M)],90)
            cov=np.clip((G-Lc)/(G-P),0,1)
            # the counter is the dark blob connected to M: take coverage inside M dilated 1 (glyph stroke is >=2 px wide)
            reg=ndi.binary_dilation(M)
            area=float(cov[reg].sum()); fragile=int(((cov>0.6)&(cov<0.95)&reg).sum())
            key=f"{db['label']}#{j}"
            res.setdefault(key,{})[c]=dict(thr=int(M.sum()),cov=round(area,2),fragile=fragile,P=round(float(P),1),G=round(float(G),1))
            tiles[(key,c)]=(Lc,M,cov,reg)
keys=sorted(res,key=lambda s:(int(s.split('#')[0]),s))
print('counter      '+'  '.join(f'{c:>16}' for c,_ in C)+'   cov spread px')
for k in keys:
    r=res[k]; covs=[r[c]['cov'] for c,_ in C if c in r]
    print(f'{k:8} '+'  '.join(f"{r[c]['thr']:3d}px cov{r[c]['cov']:6.2f}" if c in r else ' '*16 for c,_ in C)+f'   {max(covs)-min(covs):.2f}')
json.dump(res,open('/tmp/claude-0/-home-user/73d91f40-13de-5bef-9b81-7de266a5102a/scratchpad/viz/counters_cov.json','w'),indent=1)
# sheet: rows = counters, cols = courses; each tile: lum (grey), threshold-owned outline, coverage tint
Z=12; tw,th=14*Z,19*Z; hdr=60
S=Image.new('RGB',(110+len(C)*(tw+8),hdr+len(keys)*(th+26)),(18,18,18)); d_=ImageDraw.Draw(S)
d_.text((8,6),'Digit counters, every course: threshold-owned px (green outline) vs AA coverage (orange = partly counter, partly glyph)',fill=(255,255,255),font=FT)
d_.text((8,26),'Label below each tile: thresholded px | coverage area px (sum of (glyph-lum)/(glyph-plate)). Coverage agrees across courses; the threshold count flips on single AA px.',fill=(220,220,220),font=FS)
for ci,(c,_) in enumerate(C): d_.text((110+ci*(tw+8),44),c,fill=(255,230,0),font=FS)
for ri,k in enumerate(keys):
    y0=hdr+ri*(th+26); d_.text((8,y0+th//2),f'badge {k.split("#")[0]}\ncounter {k.split("#")[1]}',fill=(255,255,255),font=FS)
    for ci,(c,_) in enumerate(C):
        if (k,c) not in tiles: continue
        Lc,M,cov,reg=tiles[(k,c)]; h,w=Lc.shape
        im=np.stack([Lc]*3,-1); part=(cov>0.05)&(cov<0.95)&reg
        im[part]=im[part]*0.4+np.array([255,140,0])*0.6
        T=Image.fromarray(im.clip(0,255).astype(np.uint8)).resize((w*Z,h*Z),Image.NEAREST); dt=ImageDraw.Draw(T)
        for yy,xx in zip(*np.nonzero(M)): dt.rectangle([xx*Z,yy*Z,xx*Z+Z-1,yy*Z+Z-1],outline=(0,255,90))
        for yy,xx in zip(*np.nonzero(part)): dt.text((xx*Z+1,yy*Z+1),f'{int(Lc[yy,xx])}',fill=(255,255,255),font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',8))
        T=T.crop((0,0,min(T.width,tw),min(T.height,th)))
        S.paste(T,(110+ci*(tw+8),y0)); r=res[k][c]
        d_.text((110+ci*(tw+8),y0+min(h*Z,th)+3),f"{r['thr']} px | cov {r['cov']:.2f} px",fill=(0,255,90) if True else None,font=FS)
S.save('/tmp/claude-0/-home-user/73d91f40-13de-5bef-9b81-7de266a5102a/scratchpad/viz/counters-cov.png'); print(S.size)
