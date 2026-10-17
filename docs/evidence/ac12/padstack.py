from edges import *
from PIL import Image, ImageDraw, ImageFont
cal=json.load(open('calib3.json'))
U=np.arange(-50,70.01,0.5); V=np.arange(-35,35.01,0.5); UU,VV=np.meshgrid(U,V)
stack=[];sprst=[]
SPRonly=ndi.binary_dilation(ndi.binary_fill_holes(mk([p for b in bj for p in b['px']+b['mute']['px']]+[p for b in kj for p in b['px']+b['shell']['blackPx']])),iterations=2).astype(float)
for r,k in zip(fit['rows'],cal):
    if k['widthPx']<30: continue
    phi=math.radians(r['thDeg']+k['sense']); c=np.array([r['cx'],r['cy']]); u=np.array([math.cos(phi),math.sin(phi)]); n=np.array([-u[1],u[0]])
    X=c[0]+UU*u[0]+VV*n[0]; Y=c[1]+UU*u[1]+VV*n[1]
    v=np.stack([samp(rgb[...,i],X.ravel(),Y.ravel()).reshape(X.shape) for i in range(3)],-1)
    b=samp(SPRonly,X.ravel(),Y.ravel()).reshape(X.shape)>0.01
    v[b]=np.nan; stack.append(v)
S_=np.nanmean(np.stack(stack),0); cnt=np.sum(~np.isnan(np.stack(stack)[...,0]),0)
np.save('padstack.npy',S_)
lumS=S_.mean(-1)
# column profile inside ribbon vs outside, as function of u
inside=np.abs(V)<=12; outside=(np.abs(V)>=20)&(np.abs(V)<=30)
prof=np.nanmean(lumS[inside],0)-np.nanmean(lumS[outside],0)
for uu,p in zip(U[::4],prof[::4]): print(f'{uu:6.1f} {p:6.1f}')
Z=4; img=Image.fromarray(np.nan_to_num(S_,nan=0).clip(0,255).astype(np.uint8)).resize((len(U)*Z//2*2//1,len(V)*Z//2*2//1),Image.NEAREST)
img=img.resize((len(U)*Z,len(V)*Z),Image.NEAREST); d=ImageDraw.Draw(img)
P=lambda u,v:((u-U[0])/0.5*Z,(v-V[0])/0.5*Z)
d.rectangle([*P(-L/2,-Wd/2),*P(L/2,Wd/2)],outline=(255,0,255))
for vv in (-16.8,16.8): d.line([P(U[0],vv),P(U[-1],vv)],fill=(0,200,255))
img.save('padstack.png')
