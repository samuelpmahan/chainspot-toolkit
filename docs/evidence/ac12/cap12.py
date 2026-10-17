from ac12 import *   # reruns fit (fast enough)
from PIL import Image, ImageDraw, ImageFont
Fs=F['strict']; (q,u,phd)=lines[1]; n=np.array([-u[1],u[0]])
R=16.8; UC=10.63
others=ndi.binary_dilation(ndi.binary_fill_holes(mk([p for b in bj for p in b['px']+b['mute']['px']]+[p for b in kj for p in b['px']+b['shell']['blackPx']])),iterations=2)
yy,xx=np.mgrid[0:H,0:W]
def stadium_dist(cx,cy,thd):
    t=math.radians(thd); uu=np.array([math.cos(t),math.sin(t)]); a=np.array([cx,cy])+uu*UC
    dx=xx-a[0]; dy=yy-a[1]; along=dx*uu[0]+dy*uu[1]; perp=-dx*uu[1]+dy*uu[0]
    return np.where(along>=0,np.abs(perp),np.hypot(along,perp))   # distance to the ray from cap centre
# evaluation window: around the cap, outside every sprite (+2 px)
win=np.zeros((H,W),bool); win[195:262,440:500]=True; ev=win&~others
print('eval px',ev.sum())
scores=[]
for s in np.arange(-2,8.01,0.25):
    c=q+u*s; d=stadium_dist(c[0],c[1],phd)
    inb=ev&(d>R-3)&(d<=R-0.5); outb=ev&(d>R+0.5)&(d<R+3)
    if inb.sum()<15 or outb.sum()<15: scores.append((s,np.nan,inb.sum(),outb.sum())); continue
    scores.append((s,lum[inb].mean()-lum[outb].mean(),inb.sum(),outb.sum()))
for s,v,a,b in scores: print(f's {s:5.2f}  step {v:6.2f}  n_in {a} n_out {b}')
