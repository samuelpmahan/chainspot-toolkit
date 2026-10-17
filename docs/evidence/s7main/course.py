# Course loader for the ribbon-edge tracker: raster, sprite mask, basket points, C1/C2 ring mask, visible pads.
import json, math, numpy as np
from scipy import ndimage as ndi
SP='/tmp/claude-0/-home-user/73d91f40-13de-5bef-9b81-7de266a5102a/scratchpad'
ST='/home/user/chainspot-toolkit/attempts/stages'; W=1290
COURSES={'alex':('attempt-1792263349086-27173a1f38f5',SP+'/aafit/alex-pads.json'),
         'golden':('attempt-1792256170903-b68743f9e95c',SP+'/aafit/pads-golden.json'),
         'lenard':('attempt-1792256225103-92dacbe97c0f',None),
         'townelake':('attempt-1792256243822-fb785314ae52',None),
         'heritage':('attempt-1792256261126-6ee7ff71e848',None),
         # invariant ledger (docs/evidence/ledger/): northpark and the zoomed Lenard views, S3 structural fix on
         'northpark':('attempt-1792280536732-17ca01ed60ea',None),'lenard1':('attempt-1792280475576-d2ac09b8a95e',None),
         'lenard2':('attempt-1792280485821-a43d06513f8a',None),'lenard3':('attempt-1792280427142-df55fc0dc44d',None),
         'lenard4':('attempt-1792280454564-4bcfa80a7409',None),'lenard5':('attempt-1792280465277-cc8f2983d237',None)}
TESTIMONY={'golden':('golden/DashsTrack-full.annotation.json',-4),'lenard':('lenard/Lenard-full.annotation.json',-2),
           'townelake':('townelake/TowneLake-full.annotation.json',-1),'heritage':('heritage/HeritagePark-full.annotation.json',-2)}
DELTA=np.array(json.load(open(SP+'/bp/basketpoint.json'))['delta'])   # BasketPoint = sprite tip + DELTA (px), from 59 spokes
samp=lambda I,x,y: ndi.map_coordinates(I,[np.atleast_1d(y),np.atleast_1d(x)],order=1,mode='nearest')
class Course:
    def __init__(s,name):
        att,padf=COURSES[name]; s.name=name
        A=f'{ST}/{att}/fork/stage-output/early/artifacts'; s.A=A
        raw=np.fromfile(f'{A}/s1/badgePx.rgba.bin',dtype=np.uint8); s.H=raw.size//4//W; s.W=W
        s.rgb=raw.reshape(s.H,W,4)[...,:3].astype(float); s.lum=s.rgb.mean(-1)
        s.kj=json.load(open(f'{A}/s2/px.baskets.json'))['baskets']; s.bj=json.load(open(f'{A}/s1/px.badges.json'))['badges']
        s.tj=json.load(open(f'{A}/s3fix/px.tees.refined.json'))['tees']
        if padf:
            P=json.load(open(padf)); s.pads=P['rows'] if isinstance(P,dict) else P
            s.L=float(np.median([p['L'] for p in s.pads])); s.Wd=float(np.median([p['W'] for p in s.pads]))
        else:   # S3 tees (ring centres, S3 angle) and the S3 family template; AA-fit pads exist only for alex/golden
            m=json.load(open(f'{A}/s3fix/px.tees.family-refined.json'))['model']; s.L=m['major']['median']; s.Wd=m['minor']['median']
            s.pads=[dict(label=t['label'],cx=t['center'][0],cy=t['center'][1],thDeg=math.degrees(t['angleRad'])) for t in s.tj]
        s.badges={int(b['label']):np.array([b['bbox'][0]+(b['bbox'][2]-1)/2,b['bbox'][1]+(b['bbox'][3]-1)/2]) for b in s.bj}
        s.badgeHalf={int(b['label']):0.5*math.hypot(b['bbox'][2],b['bbox'][3]) for b in s.bj}
        def mk(px):
            m=np.zeros(s.H*W,bool); m[np.asarray(px,dtype=np.int64)]=True; return m.reshape(s.H,W)
        spr=mk([p for k in s.kj for p in k['px']+k['shell']['blackPx']]+[p for b in s.bj for p in b['px']+b['mute']['px']]+[p for t in s.tj for p in t['px']])
        s.spriteFilled=ndi.binary_fill_holes(spr); s.sprite=ndi.binary_dilation(s.spriteFilled,iterations=2)
        s.occluder=ndi.binary_dilation(s.spriteFilled)   # opaque sprite + 1 px AA fringe: a hidden pad must sit inside
        s.bp=np.array([[k['bbox'][0]+(k['bbox'][2]-1)/2, k['bbox'][1]+k['bbox'][3]-1] for k in s.kj])+DELTA
        s.R1=s._r1()
        yy,xx=np.mgrid[0:s.H,0:W]; ring=np.zeros((s.H,W),bool)
        for bx,by in s.bp:
            x0,x1=int(max(bx-2*s.R1-8,0)),int(min(bx+2*s.R1+9,W)); y0,y1=int(max(by-2*s.R1-8,0)),int(min(by+2*s.R1+9,s.H))
            d=np.hypot(xx[y0:y1,x0:x1]-bx,yy[y0:y1,x0:x1]-by)
            ring[y0:y1,x0:x1]|=(np.abs(d-s.R1)<=3.5)|(np.abs(d-2*s.R1)<=4.5)
        s.ring=ring
        s.MASK=(s.sprite|s.ring).astype(float)
    def _r1(s):
        # mean radial luminance profile around all basket points (sprites masked): C1 is the stronger ring, C2 = 2 x C1
        # radius range must hold 2 x R1 at every scale: R1 is LOCAL (21 px full heritage .. 56 px zoomed Lenard); the old
        # 10-110 px range silently capped R1 at 54.75 px
        th=np.radians(np.arange(0,360,1.0)); rs=np.arange(10,260,0.5); prof=[]
        SPR=s.sprite.astype(float)
        for r in rs:
            v=[]
            for bx,by in s.bp:
                X=bx+r*np.cos(th); Y=by+r*np.sin(th); ok=(samp(SPR,X,Y)<0.01)&(X>1)&(X<s.W-2)&(Y>1)&(Y<s.H-2)
                if ok.sum()>20: v.append(samp(s.lum,X[ok],Y[ok]).mean())
            prof.append(np.mean(v))
        prof=np.array(prof); hp=prof-ndi.uniform_filter1d(prof,15)
        best=None
        for i,r in enumerate(rs):
            j=np.argmin(np.abs(rs-2*r))
            if 2*r>rs[-1]: break
            sc=hp[i]+hp[j]
            if best is None or sc>best[0]: best=(sc,r)
        return float(best[1])
if __name__=='__main__':
    for n in ('alex','golden'):
        c=Course(n); print(n,'pads',len(c.pads),'template %.2f x %.2f px'%(c.L,c.Wd),'baskets',len(c.bp),'R1 %.1f px'%c.R1)
