# Sam, 2026-10-19: "see if path edges work AFTER S4 to finish off the rest".
# The recorded s7main hallway tracker (edge contrast only), fed with what S4 established: every S3 tee plus S4's
# recovered tees (accepted variant), and S2 baskets plus S4's recovered baskets. Same tracker code, same judge.
import sys, os, json, math, glob, numpy as np
TK = '/home/user/chainspot-toolkit'; HERE = os.path.dirname(os.path.abspath(__file__))
att = dict(l.split() for l in open(f'{TK}/docs/evidence/dev-s1s4/ATTEMPTS').read().split('\n') if l.strip())
import course
from scipy import ndimage as ndi
for n, a in att.items(): course.COURSES[n] = (a, None)
course.TESTIMONY['heritage'] = ('heritage/HeritagePark-full.corrected-2026-10-18.annotation.json', -2)
OUT = lambda a: f'{TK}/attempts/stages/{a}/fork/stage-output'
def s4(a):
    o = OUT(a); run = sorted(glob.glob(f'{o}/s4recover/run-*'))[-1]; cmp = json.load(open(f'{run}/cmp.fn.Tee.recover.json'))
    tees = json.load(open(f'{run}/artifacts/fn.Tee.recover/{cmp["accepted"]}/recovered.json'))['recovered'] if cmp.get('accepted') else []
    br = json.load(open(f'{o}/basket-bridge/basket-recovery.part.json')).get('comparisons', {}).get('accepted', [])
    return tees, [d['semanticBbox'] for d in br if d.get('classification') != 'existing-s2-exact'], cmp.get('accepted')
_init = course.Course.__init__
def init(s, name):
    _init(s, name)
    _, boxes, _ = s4(course.COURSES[name][0]); s.s4baskets = len(boxes)
    if not boxes: return
    yy, xx = np.mgrid[0:s.H, 0:s.W]
    for x, y, w, h in boxes:
        bp = np.array([x + (w - 1) / 2, y + h - 1]) + course.DELTA; s.bp = np.vstack([s.bp, bp])
        s.spriteFilled[max(y, 0):y + h, max(x, 0):x + w] = True
        d = np.hypot(xx - bp[0], yy - bp[1]); s.ring |= (np.abs(d - s.R1) <= 3.5) | (np.abs(d - 2 * s.R1) <= 4.5)
    s.sprite = ndi.binary_dilation(s.spriteFilled, iterations=2); s.occluder = ndi.binary_dilation(s.spriteFilled)
    s.MASK = (s.sprite | s.ring).astype(float)
course.Course.__init__ = init

def baseline(name):
    a = att[name]; o = OUT(a); rows = json.load(open(f'{o}/s3assoc/px.tees.association.json'))['rows']
    C = course.Course(name); holes = {}
    for r in rows:
        if not r.get('best'): continue
        b = r['best']['badge']; T = np.array(r['center']); th = math.radians(r['pose']['thDeg']); u = np.array([math.cos(th), math.sin(th)])
        if (C.badges[int(b)] - T) @ u < 0: u = -u
        s3 = r.get('straight3') or {}; bpk = s3.get('basket')
        holes[b] = dict(teeCenter=T.round(2).tolist(), u=u.round(4).tolist(), badgeLabel=b, source='S3',
                        straight3=dict(verdict=s3.get('verdict'), basketPoint=C.bp[bpk].round(2).tolist() if bpk is not None and s3.get('verdict') == 'STRAIGHT' else None) if s3 else None)
    tees, _, acc = s4(a)
    for t in tees:
        b = str(t['hole'])
        if b in holes: continue
        T = np.array(t['center']); th = math.radians(t['angleDeg']); u = np.array([math.cos(th), math.sin(th)])
        if (C.badges[int(b)] - T) @ u < 0: u = -u
        holes[b] = dict(teeCenter=T.round(2).tolist(), u=u.round(4).tolist(), badgeLabel=b, source=f'S4 {acc}', straight3=None)
    return holes, C

if __name__ == '__main__':
    name = sys.argv[1]
    holes, C0 = baseline(name)
    bdir = f'{HERE}/baselines'; os.makedirs(bdir, exist_ok=True); f = f'{bdir}/{name}.json'
    json.dump(dict(holes=holes), open(f, 'w')); os.environ['BASELINE'] = f; os.environ['BASELINE_DIR'] = bdir
    print(f'{name}: {len(holes)} tees after S4 ({sum(1 for h in holes.values() if h["source"] != "S3")} recovered), {len(C0.bp)} baskets after S4 ({C0.s4baskets} recovered), badges {len(C0.badges)}')
    sys.argv = ['s3first.py', name]
    import runpy; runpy.run_path(f'{HERE}/s3first.py', run_name='__main__')
