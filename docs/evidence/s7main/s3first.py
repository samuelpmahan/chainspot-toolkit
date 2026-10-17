# S3-first hallway solve (Sam's order): tee -> badge -> 0-bend holes by the 3-point straight test -> n-bend holes by pathfinding.
#  1. course width from the 3-point STRAIGHT holes themselves (along-path averaged profile over unmasked stations)
#  2. every 3-point STRAIGHT hole: verify the segment tee cap -> BasketPoint; pass = done, 0 bends
#  3. every other hole with an S3 tee: trace from the pad's cap along its axis toward the badge (bends, close on a BasketPoint)
#  4. holes without an S3 tee: badge-only seeding (badgeseed.seed_one), the competing implementation
import sys, json, math, glob, warnings, numpy as np
warnings.filterwarnings('ignore')
from course import Course, TESTIMONY
from track import profile, edge_pair
from contrast import unit
import follow
from follow import trace
from polyscore import refine_vertices, poly_score
import badgeseed, pxcache, os, hashlib
from course import COURSES, ST
FRONT = badgeseed.FRONT
TK = '/home/user/chainspot-toolkit'

def seg_fit(C, A, B, W, tolW, lat_lim, trim0, trim1):
    d = B - A; Lg = np.linalg.norm(d); phi = math.atan2(d[1], d[0])
    prof, ok, nT = profile(C, A, phi, trim0, Lg - trim1)
    e = edge_pair(prof, ok, nT, W, tolW=tolW, lat_lim=lat_lim) if prof is not None else None
    return e, (int((ok > 0).sum()) if ok is not None else 0)

def course_sha(name):
    A = f"{ST}/{COURSES[name][0]}/fork/stage-output/early/artifacts"
    return {f: pxcache.file_sha(f'{A}/{f}') for f in ('s1/badgePx.rgba.bin', 's1/px.badges.json', 's2/px.baskets.json', 's3fix/px.tees.refined.json', 's3fix/px.tees.family-refined.json')}
TRACE_DEPS = ['follow.py', 'contrast.py', 'track.py', 'polyscore.py', 'course.py']
def solve(name):
    C = Course(name); base = json.load(open(os.environ.get('BASELINE', f'{TK}/baselines/s3assoc/{name}.json')))['holes']; CS = course_sha(name)
    follow.TEES.clear()
    for h, b in base.items(): follow.TEES.append((np.array(b['teeCenter']), np.array(b['u'])))
    # 1. width from straight holes: free width search (wide tolerance), median
    def _width():
      ws = []
      for h, b in base.items():
        s3 = b['straight3']
        if not s3 or s3['verdict'] != 'STRAIGHT': continue
        T = np.array(b['teeCenter']); K = np.array(s3['basketPoint'])
        for Wg in np.arange(20, 60, 2.0):
            e, _ = seg_fit(C, T, K, Wg, 1.0, 3.0, C.L * 0.6, 2)
            if e: ws.append((e['score'], e['w'], h))
      return ws
    ws = pxcache.cached('width', TRACE_DEPS + ['s3first.py'], dict(course=CS, straight={h: b for h, b in base.items() if b['straight3'] and b['straight3']['verdict'] == 'STRAIGHT'}), _width)
    by = {}
    for sc, w, h in ws: by.setdefault(h, []).append((sc, w))
    per = [max(v)[1] for v in by.values()]
    W = float(np.median(per)) if per else 0.933 * C.R1
    # Course hallway model learned from the TEE -> BADGE segments (always straight; every hole has one); straight holes are the fallback.
    import teebadge
    _, _, TB = teebadge.learn(name)
    if TB['widthPx'] and TB['segments'] >= 3: W = TB['widthPx']
    if os.environ.get('WIDTH'): W = float(os.environ['WIDTH'])
    out = {}; used = set()
    # 2. 3-point STRAIGHT holes: verify the whole segment
    for h, b in base.items():
        s3 = b['straight3']
        if not s3 or s3['verdict'] != 'STRAIGHT': continue
        T = np.array(b['teeCenter']); u = np.array(b['u']); K = np.array(s3['basketPoint']); S = T + u * FRONT * C.L
        e, nvis = pxcache.cached('verifyStraight', TRACE_DEPS + ['s3first.py'], dict(course=CS, S=S, K=K, W=W), lambda: seg_fit(C, S, K, W, 1.5, 1.5, W * 0.6, 2))
        k = int(np.argmin(np.hypot(*(C.bp - K).T)))
        if e and e['score'] >= 6:
            out[int(h)] = dict(hole=int(h), how='3-point straight, verified', verts=[S.round(2).tolist(), C.bp[k].round(2).tolist()], end=k, bends=0,
                               widthPx=round(e['w'], 2), centreOffPx=round(e['c'], 2), edgeStep=round(e['score'], 1), stationsVisible=nvis)
            used.add(k)
        else:
            out[int(h)] = dict(hole=int(h), straightRejected=dict(edge=None if not e else round(e['score'], 1), width=None if not e else round(e['w'], 2)))
    # 3. other holes with an S3 tee: trace from the pad
    for h, b in base.items():
        if int(h) in out and 'how' in out[int(h)]: continue
        T = np.array(b['teeCenter']); u = np.array(b['u']); S = T + u * FRONT * C.L
        r = pxcache.cached('traceFromTee', TRACE_DEPS, dict(course=CS, S=S, u=u, W=W, used=sorted(used), tees=[(c.tolist(), a.tolist()) for c, a in follow.TEES], T=T), lambda: trace(C, S, math.atan2(u[1], u[0]), W, exclude_bp=tuple(used), self_c=T))
        rec = dict(hole=int(h), how='traced from the S3 tee', end=r['end'], legs=r['legs'], verts=np.round(r['verts'], 2).tolist(), **{k: v for k, v in out.get(int(h), {}).items() if k != 'hole'})
        if r['end'] is not None and len(r['verts']) > 2:
            Vr, s1 = pxcache.cached('refine', TRACE_DEPS, dict(course=CS, V=np.asarray(r['verts']), W=W, u=u), lambda: refine_vertices(C, r['verts'], W, pad_axis=u)); rec.update(verts=np.round(Vr, 2).tolist(), polyScore=round(s1, 2))
        rec['bends'] = len(rec['verts']) - 2 if r['end'] is not None else None
        if r['end'] is not None: used.add(r['end'])
        out[int(h)] = rec
    # 4. holes without an S3 tee: badge-only seeding
    for n in sorted(C.badges):
        if n in out: continue
        r = pxcache.cached('badgeSeed', TRACE_DEPS + ['badgeseed.py'], dict(course=CS, n=n, W=W, tees=[(c.tolist(), a.tolist()) for c, a in follow.TEES]), lambda: badgeseed.seed_one(C, n, W, C.pads)); r = dict(r); r['how'] = 'badge-only seed (no S3 tee)'; out[n] = r
    return C, W, out

def judge(C, name, out, W):
    """Sam's S7 pass: the trace ends at the hole's basket and its centreline never breaks the hallway edge
    (max distance from Sam's corridor polyline tee -> bends -> basket <= W/2). Bend offsets are reported, never gated."""
    if name not in TESTIMONY: return None
    f, dy = TESTIMONY[name]; holes = {h['number']: h for h in json.load(open(f'{TK}/testimony/{f}'))['holes']}
    def seg_d(p, a, b):
        d = b - a; t = np.clip((p - a) @ d / max(d @ d, 1e-9), 0, 1); return float(np.hypot(*(p - (a + t * d))))
    res = {}
    for n, r in out.items():
        h = holes.get(n)
        if not h or r.get('end') is None: res[n] = dict(ok=False, why=r.get('status') or r.get('fail') or 'no BasketPoint reached'); continue
        K = np.array([h['basket']['xPx'], h['basket']['yPx'] + dy]); endErr = float(np.hypot(*(C.bp[r['end']] - K)))
        sam = [np.array([h['tee']['xPx'], h['tee']['yPx'] + dy])] + [np.array([q['xPx'], q['yPx'] + dy]) for q in (h.get('corridorBends') or [])] + [K]
        V = [np.array(v) for v in r['verts']]; dev = 0.0
        for a, b in zip(V[:-1], V[1:]):
            for t in np.linspace(0, 1, max(2, int(np.hypot(*(b - a))))):
                p = a + t * (b - a); dev = max(dev, min(seg_d(p, s0, s1) for s0, s1 in zip(sam[:-1], sam[1:])))
        bends = sam[1:-1]; ours = V[1:-1]
        res[n] = dict(endErrPx=round(endErr, 1), maxDevPx=round(dev, 1), halfWidthPx=round(W / 2, 1), bendsSam=len(bends), bendsOurs=len(ours),
                      bendOffPx=[round(float(min(np.hypot(*(v - q)) for v in ours)), 1) if ours else None for q in bends],
                      ok=endErr < 12 and dev <= W / 2)
    return res

if __name__ == '__main__':
    import time as _t; t0 = _t.time(); name = sys.argv[1]; C, W, out = solve(name); J = judge(C, name, out, W)
    print(f'{name}: course width {W:.2f} px (from 3-point straight holes)')
    for n in sorted(out):
        r = out[n]; j = (J or {}).get(n)
        line = f"  hole {n:2d}: {r.get('how', '?'):32s} " + (f"end BP{r['end']} bends {r['bends']}" if r.get('end') is not None else f"NO END ({r.get('status') or r.get('fail') or 'lost'})")
        if r.get('straightRejected'): line += f"  [3-point straight rejected: edge {r['straightRejected']}]"
        if r.get('edgeStep'): line += f"  [width {r['widthPx']} px, centre {r['centreOffPx']:+.2f} px, edges {r['edgeStep']} lum/px]"
        if j: line += f"  || Sam: {'OK' if j['ok'] else 'X'} " + (f"end {j['endErrPx']} px, stays within {j['maxDevPx']} px of Sam's centreline (half-width {j['halfWidthPx']}), bends {j['bendsOurs']}/{j['bendsSam']} off {j['bendOffPx']}" if 'endErrPx' in j else j['why'])
        print(line)
    if J: print(f"  agreement with Sam: {sum(1 for j in J.values() if j['ok'])}/{len(J)} holes")
    blob = json.dumps(dict(width=W, holes=[out[n] for n in sorted(out)], judge=J), indent=1, default=float)
    open(f's3first-{name}.json', 'w').write(blob)
    print(f"  run {_t.time() - t0:.1f} s; cache {pxcache.summary()}; output sha256 {hashlib.sha256(blob.encode()).hexdigest()[:16]}")
