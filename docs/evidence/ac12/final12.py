from ac12 import *
from PIL import Image, ImageDraw, ImageFont
T=json.load(open('tipribbon.json')); tip=np.array(T['tip'])
variants={}
for name,off,phd in (('full-span ribbon (tip offset -1.26 px)',T['off'],T['phiDeg']),('centreline forced through tip',0.0,None)):
    if phd is None:   # refit angle with the centreline pinned through the tip: maximise edge sharpness with lateral fixed 0
        best=None; phi0=math.radians(T['phiDeg'])
        for dphi in np.arange(-1.5,1.51,0.05):
            prof,ok,nT=mean_profile(tip,phi0+math.radians(dphi),20,175); l,r,gl,gr=edges(prof,ok,nT)
            sc=min(gl,gr)-2*abs((l+r)/2)
            if best is None or sc>best[0]: best=(sc,dphi)
        phd=T['phiDeg']+best[1]
    u=np.array([math.cos(math.radians(phd)),math.sin(math.radians(phd))]); n=np.array([-u[1],u[0]]); q=tip+n*off
    ax=phd-180; V=[]
    for s in np.arange(190,215,0.1):
        for lat in np.arange(-0.6,0.61,0.2):
            c=q+u*s+n*lat; rb=math.degrees(math.atan2(bc[1]-c[1],bc[0]-c[0]))
            for thd in np.arange(ax-1.0,ax+1.0001,0.1):
                if abs(thd-rb)>0.5: continue
                if pad_ok(c[0],c[1],thd,filled): V.append((c[0],c[1],thd,s))
    V=np.array(V); variants[name]=(V,q,u,phd)
    print(name,'axis %.2f deg'%ax, len(V),'x %.2f..%.2f y %.2f..%.2f theta %.2f..%.2f slide %.2f px mean'%(V[:,0].min(),V[:,0].max(),V[:,1].min(),V[:,1].max(),V[:,2].min(),V[:,2].max(),V[:,3].max()-V[:,3].min()),V[:,:3].mean(0).round(2))
sam=np.load('sam-sketch-stroke.npy'); SX=sam[:,0]/6+405-0.5; SY=(sam[:,1]-110)/6+126-0.5; sc_=np.array([(SX.min()+SX.max())/2,(SY.min()+SY.max())/2])
V,q,u,phd=variants['full-span ribbon (tip offset -1.26 px)']; n=np.array([-u[1],u[0]])
print('Sam sketch centre',sc_.round(2),'lateral from full-span centreline %.2f px, slide %.2f (feasible %.2f..%.2f)'%((sc_-q)@n,(sc_-q)@u,V[:,3].min(),V[:,3].max()))
# ---------- render: overview (tip -> tee) + zoom
FT=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',16); FS=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',13)
def panel(x0,y0,x1,y1,Z,detail):
    im=Image.fromarray(rgb[y0:y1,x0:x1].astype(np.uint8)).resize(((x1-x0)*Z,(y1-y0)*Z),Image.NEAREST).convert('RGBA'); ov=Image.new('RGBA',im.size,(0,0,0,0)); d=ImageDraw.Draw(ov)
    P=lambda x,y:((x-x0+0.5)*Z,(y-y0+0.5)*Z)
    for off_,w_ in ((-16.75,2),(16.75,2)):
        a=q+n*off_-u*5; b=q+n*off_+u*235; d.line([P(*a),P(*b)],fill=(0,255,255,220),width=w_)
    for t in np.arange(-5,235,6): d.line([P(*(q+u*t)),P(*(q+u*(t+3)))],fill=(0,255,255,230),width=2)
    r=6 if not detail else 10; d.ellipse([P(*tip)[0]-r,P(*tip)[1]-r,P(*tip)[0]+r,P(*tip)[1]+r],outline=(255,60,60,255),width=3)
    d.line([P(*tip),P(*bc)],fill=(255,0,255,180),width=1)
    def corners(cx,cy,thd):
        t=math.radians(thd); c,s=math.cos(t),math.sin(t); return [P(cx+a*c-b*s,cy+a*s+b*c) for a,b in ((-L/2,-Wd/2),(L/2,-Wd/2),(L/2,Wd/2),(-L/2,Wd/2))]
    if detail:
        for yy,xx in zip(*np.nonzero((filled&~core)[y0:y1,x0:x1])): d.rectangle([xx*Z,yy*Z,xx*Z+Z-1,yy*Z+Z-1],outline=(255,140,0,200))
        for x,y,_,_ in V[::2]: d.point(P(x,y),fill=(255,230,0,255))
        for f in (V[np.argmin(V[:,3])],V[np.argmax(V[:,3])]): d.polygon(corners(*f[:3]),outline=(0,255,90,200),width=2)
        for sx,sy in zip(SX,SY): d.point(P(sx,sy),fill=(110,150,40,255))
        d.ellipse([P(*sc_)[0]-4,P(*sc_)[1]-4,P(*sc_)[0]+4,P(*sc_)[1]+4],fill=(110,150,40,255))
    mc=V[:,:3].mean(0); d.polygon(corners(*mc),outline=(0,255,90,255),width=3 if detail else 2)
    return Image.alpha_composite(im,ov).convert('RGB')
A_=panel(420,70,630,250,3,False); B_=panel(432,195,486,258,10,True)
hdr=150; out=Image.new('RGB',(A_.width+B_.width+20,hdr+max(A_.height,B_.height)),(18,18,18)); out.paste(A_,(0,hdr)); out.paste(B_,(A_.width+20,hdr)); o=ImageDraw.Draw(out)
lo,hi=V[:,3].min(),V[:,3].max()
o.text((8,6),'AlexClark tee 12 — worked back from basket 12\'s tip along the hole-12 ribbon',fill=(255,255,255),font=FT)
o.text((8,30),f'red ring = basket 12 tip (sprite bottom-centre, {tip[0]:.1f}, {tip[1]:.1f}) px   cyan = ribbon fitted over 155 px from the tip: width {T["width"]:.2f} px, axis {phd-180:.2f} deg, passes the tip at {T["off"]:+.2f} px',fill=(0,255,255),font=FS)
o.text((8,48),'calibration, 8 visible straight Alex holes: pad axis passes its basket tip within 0.14-1.31 px (105-315 px away); ribbon centre within 0.61 px of pad centre, axis within 1.0 deg',fill=(220,220,220),font=FS)
o.text((8,66),f'feasible (centre within 0.61 px of that centreline, axis within 1.0 deg of it and 0.5 deg of badge 12, every pad px + 0.5 px AA inside basket 11): {len(V)} poses',fill=(255,230,0),font=FS)
o.text((8,84),f'centre x {V[:,0].min():.2f}..{V[:,0].max():.2f} px, y {V[:,1].min():.2f}..{V[:,1].max():.2f} px, theta {V[:,2].min():.2f}..{V[:,2].max():.2f} deg; the only freedom is a {hi-lo:.2f} px slide along the axis (green = both ends, bold = mean)',fill=(255,230,0),font=FS)
o.text((8,102),f'olive = your sketch (centre {sc_[0]:.1f}, {sc_[1]:.1f}): {(sc_-q)@u-lo:+.2f} px along the slide from its low end, {(sc_-q)@n:+.2f} px off the centreline',fill=(150,200,60),font=FS)
o.text((8,120),'orange = basket 11 seam px filled into the occluder   magenta = tip -> badge 12',fill=(255,160,60),font=FS)
out.save('ac12-from-tip.png'); print(out.size)
