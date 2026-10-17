from ac12 import *
from PIL import Image, ImageDraw, ImageFont
Fs,Fl=F['strict'],F['loose']
FT=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',16); FS=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',13)
# ---- panel A: AC12 at 8x
Z=8; x0,y0,x1,y1=kx-12,ky-12,kx+kw+40,ky+kh+8
A_=Image.fromarray(rgb[y0:y1,x0:x1].astype(np.uint8)).resize(((x1-x0)*Z,(y1-y0)*Z),Image.NEAREST).convert('RGBA')
ov=Image.new('RGBA',A_.size,(0,0,0,0)); d=ImageDraw.Draw(ov)
P=lambda x,y:((x-x0+0.5)*Z,(y-y0+0.5)*Z)
sq=lambda xx,yy,col: d.rectangle([(xx-x0)*Z,(yy-y0)*Z,(xx-x0)*Z+Z-1,(yy-y0)*Z+Z-1],outline=col)
for yy,xx in zip(*np.nonzero((filled&~core)[y0:y1,x0:x1])): sq(xx+x0,yy+y0,(255,140,0,255))
for yy,xx in zip(*np.nonzero(fringe[y0:y1,x0:x1])): sq(xx+x0,yy+y0,(0,150,255,150))
def corners(cx,cy,thd,a=L/2,b=Wd/2):
    t=math.radians(thd); c,s=math.cos(t),math.sin(t); return [P(cx+p*c-q_*s,cy+p*s+q_*c) for p,q_ in ((-a,-b),(a,-b),(a,b),(-a,b))]
(q,u,phd)=lines[1]; n=np.array([-u[1],u[0]])
for off,col in ((-16.8,(0,255,255,230)),(16.8,(0,255,255,230))):
    a=q+n*off-u*45; b=q+n*off+u*80; d.line([P(*a),P(*b)],fill=col,width=2)
for t in np.arange(-45,80,4): a=q+u*t; b=q+u*(t+2); d.line([P(*a),P(*b)],fill=(0,255,255,200),width=2)
for x,y,_,_ in Fl[::3]: d.point(P(x,y),fill=(255,255,255,90))
for x,y,_,_ in Fs: d.ellipse([P(x,y)[0]-1.5,P(x,y)[1]-1.5,P(x,y)[0]+1.5,P(x,y)[1]+1.5],fill=(255,230,0,255))
smin=Fs[np.argmin(Fs[:,3])]; smax=Fs[np.argmax(Fs[:,3])]; mc=Fs[:,:3].mean(0)
for f_ in (smin,smax): d.polygon(corners(*f_[:3]),outline=(0,255,90,200),width=2)
d.polygon(corners(*mc),outline=(0,255,90,255),width=4)
for f_ in (smin,smax):   # hidden cap circle at the two extremes
    t=math.radians(f_[2]); cc=np.array(f_[:2])+np.array([math.cos(t),math.sin(t)])*10.63; r=16.8*Z
    d.ellipse([P(*cc)[0]-r,P(*cc)[1]-r,P(*cc)[0]+r,P(*cc)[1]+r],outline=(255,0,255,120),width=1)
d.line([P(*mc[:2]),P(*bc)],fill=(255,0,255,255),width=2)
lx,ly=458,223.5; d.ellipse([P(lx,ly)[0]-7,P(lx,ly)[1]-7,P(lx,ly)[0]+7,P(lx,ly)[1]+7],outline=(255,60,60,255),width=3)
A_=Image.alpha_composite(A_,ov).convert('RGB')
# ---- panel B: calibration stack
Bs=np.load('padstack.npy'); U=np.arange(-50,70.01,0.5); V=np.arange(-35,35.01,0.5); zb=3
B_=Image.fromarray(np.nan_to_num(Bs,nan=0).clip(0,255).astype(np.uint8)).resize((len(U)*zb,len(V)*zb),Image.NEAREST); db=ImageDraw.Draw(B_)
PB=lambda uu,vv:((uu-U[0])/0.5*zb,(vv-V[0])/0.5*zb)
db.rectangle([*PB(-L/2,-Wd/2),*PB(L/2,Wd/2)],outline=(255,0,255))
for vv in (-16.8,16.8): db.line([PB(-5,vv),PB(70,vv)],fill=(0,255,255),width=1)
db.line([PB(0,0),PB(70,0)],fill=(0,255,255),width=1)
cx_,cy_=PB(10.63,0); r=16.8/0.5*zb; db.ellipse([cx_-r,cy_-r,cx_+r,cy_+r],outline=(255,230,0),width=2); db.ellipse([cx_-3,cy_-3,cx_+3,cy_+3],fill=(255,230,0))
# ---- compose
W_=A_.width+B_.width+30; hdr=150
out=Image.new('RGB',(W_,hdr+max(A_.height,B_.height+120)),(18,18,18)); out.paste(A_,(0,hdr)); out.paste(B_,(A_.width+30,hdr+24)); o=ImageDraw.Draw(out)
o.text((8,6),'AlexClark tee 12 — fully hidden under basket 11 (S2 #2): entailed pose',fill=(255,255,255),font=FT)
L1=f'strict (pad px + 0.5 px AA inside the opaque basket): {len(Fs)} poses — centre x {Fs[:,0].min():.2f}..{Fs[:,0].max():.2f} px, y {Fs[:,1].min():.2f}..{Fs[:,1].max():.2f} px, theta {Fs[:,2].min():.2f}..{Fs[:,2].max():.2f} deg; slide along axis {Fs[:,3].max()-Fs[:,3].min():.2f} px'
L2=f'mean centre ({mc[0]:.2f}, {mc[1]:.2f}) px, theta {mc[2]:.2f} deg     loose (+1 px basket AA fringe, blue): slide {Fl[:,3].max()-Fl[:,3].min():.2f} px (white dots)'
o.text((8,32),L1,fill=(255,230,0),font=FS); o.text((8,50),L2,fill=(255,230,0),font=FS)
o.text((8,72),'constraints: pad 25.02 x 17.38 px (AA fit, 13 Alex pads) | axis within 0.5 deg of badge 12 (max seen 0.36 deg) | centre within 0.61 px of hole-12 ribbon centreline, axis within 1.0 deg (calibrated, right)',fill=(220,220,220),font=FS)
o.text((8,90),f'hole-12 ribbon measured past the basket: width {33.50:.2f} px (course 33.6 px), axis {lines[0][2]:.2f}..{lines[2][2]:.2f} deg   cyan = ribbon edges + centreline',fill=(0,255,255),font=FS)
o.text((8,108),'orange = 154 white/black seam px the S2 basket did not own (now filled; they were holes in the occluder)   magenta circles = ribbon cap at slide extremes: hidden either way',fill=(255,160,60),font=FS)
o.text((8,126),'green = pads at both slide extremes, bold = mean    red ring = legacy injected guess (458, 223.5)',fill=(220,220,220),font=FS)
bx_=A_.width+30
o.text((bx_,hdr),'calibration: 12 visible Alex pads stacked at 1/12 in their own frame',fill=(255,255,255),font=FS)
yb=hdr+24+B_.height+6
for i,s in enumerate(['ribbon width 33.29..33.85 px (median 33.6 px)','ribbon centreline to pad centre: |off| <= 0.61 px (median 0.28 px)','ribbon axis to pad axis: <= 1.0 deg','round cap: radius 16.5-16.8 px, centred +10.1..10.6 px ahead','  of pad centre = middle of the front stroke (yellow)','behind the back edge: no tint (excess 5 vs 40 lum ahead)','1 of 13 pads (S3 #8) fails: its ribbon is not straight off the pad']):
    o.text((bx_,yb+i*17),s,fill=(220,220,220),font=FS)
out.save('ac12-entailed.png'); print(out.size)
