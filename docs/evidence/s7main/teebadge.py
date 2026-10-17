# Learn each course's hallway from its TEE -> BADGE segments (always straight: the badge precedes the first bend).
# Per segment: free width search on the along-path averaged profile (unmasked stations), then per-station edge contrast
# at that width; course model = medians. Cached per course + code.
import sys, os, json, math, numpy as np
from course import Course
from track import profile, edge_pair
from contrast import station_contrast
import badgeseed, pxcache
import s3first as _s3; course_sha=_s3.course_sha; TRACE_DEPS=_s3.TRACE_DEPS
TK='/home/user/chainspot-toolkit'
def learn(name):
    C=Course(name); base=json.load(open(os.path.join(os.environ.get('BASELINE_DIR', f'{TK}/baselines/s3assoc'), f'{name}.json')))['holes']; CS=course_sha(name)
    def _do():
        rows=[]
        for h,b in base.items():
            T=np.array(b['teeCenter']); u=np.array(b['u']); S=T+u*badgeseed.FRONT*C.L; B=C.badges[int(h)]
            stop=(B-S)@u-C.badgeHalf[int(h)]-2          # stop before the badge sprite
            if stop<25: rows.append(dict(hole=int(h),usable=False,why=f'only {stop:.0f} px between tee cap and badge')); continue
            phi=math.atan2(u[1],u[0]); best=None
            for Wg in np.arange(18,60,1.0):
                prof,ok,nT=profile(C,S,phi,2,stop)
                e=edge_pair(prof,ok,nT,Wg,tolW=0.75,lat_lim=3.0) if prof is not None else None
                if e and (best is None or e['score']>best['score']): best=e
            if not best: rows.append(dict(hole=int(h),usable=False,why='no edge pair',lenPx=round(stop,1))); continue
            ts=np.arange(2,stop,1.0); cl,cr,okl,okr=station_contrast(C,S,phi,ts,best['w']); v=okl&okr
            m=np.minimum(cl,cr)[v]
            rows.append(dict(hole=int(h),usable=True,lenPx=round(stop,1),widthPx=round(best['w'],2),centreOffPx=round(best['c'],2),edgeStep=round(best['score'],1),
                             stationsVisible=int(v.sum()),contrastMedian=round(float(np.median(m)),1) if len(m) else None,contrastP10=round(float(np.percentile(m,10)),1) if len(m) else None))
        return rows
    rows=pxcache.cached('teeBadgeLearn',TRACE_DEPS+['teebadge.py','badgeseed.py'],dict(course=CS,base=base),_do)
    use=[r for r in rows if r['usable'] and abs(r['centreOffPx'])<=3]
    W=float(np.median([r['widthPx'] for r in use])) if use else None
    return C,rows,dict(widthPx=W,widthIQR=[round(float(np.percentile([r['widthPx'] for r in use],q)),2) for q in (25,75)] if use else None,
                       contrastMedian=float(np.median([r['contrastMedian'] for r in use if r['contrastMedian'] is not None])) if use else None,
                       contrastP10=float(np.median([r['contrastP10'] for r in use if r['contrastP10'] is not None])) if use else None,segments=len(use),of=len(rows))
if __name__=='__main__':
    for name in sys.argv[1:]:
        C,rows,m=learn(name)
        print(f"{name}: {m['segments']}/{m['of']} tee->badge segments usable; width {m['widthPx']:.2f} px (IQR {m['widthIQR']}); per-station edge contrast median {m['contrastMedian']:.1f}, p10 {m['contrastP10']:.1f} lum (follower threshold TAU is 8.0)")
        bad=[r for r in rows if not r['usable'] or abs(r.get('centreOffPx',0))>3]
        if bad: print('   not used:',[(r['hole'],r.get('why') or f"centre {r['centreOffPx']} px") for r in bad])
