# python3 crossval.py [course ...]   Ground-truth-free cross-validation of S1-S4 per course (Sam, 2026-10-18: "LEARN TO
# CROSS VALIDATE WITHOUT GROUND TRUTH"). Each hole's identity is claimed by independent geometric signals; agreement is
# the evidence, disagreement is where to look. Testimony, where it exists, is used AFTERWARDS only to calibrate how much
# each agreement class can be trusted (calibration.json); the signals never read it.
#
# Signals per hole n (all from S1-S4 outputs of one fresh attempt, ../dev-s1s4/ATTEMPTS):
#   tee      S3 tee whose long axis points at badge n (association z), else the S4 tee recovered for badge n
#   straight 3-point test: tee n, badge n and a BasketPoint on one line (TLS max residual <= 1.5 px), first basket past
#            the badge  -> basket of hole n (holds for every straight hole; a bent hole can line up by coincidence)
#   spoke    basket k's C1 spoke runs from its BasketPoint to the front edge of hole n+1's tee (ridge evidence read along
#            each predicted line, one-to-one)  -> basket k is hole n's (holds for bent holes too)
# Baskets are S2 + S4 recovered; tees S3 + S4 recovered (greedyOccluded).
import json, math, os, sys, glob, numpy as np
from scipy import ndimage as ndi
from scipy.optimize import linear_sum_assignment
HERE = os.path.dirname(os.path.abspath(__file__)); TK = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
ATT = dict(l.split() for l in open(os.path.join(HERE, '..', 'dev-s1s4', 'ATTEMPTS')) if l.strip())
W = 1290; BPO = np.array([22.5 + 0.34, 71 + 0.73])        # BasketPoint = bbox (x, y) + this (px)
STRAIGHT_TLS_PX = 1.5; SPOKE_MIN_LUM = 2.0; N = 18
samp = lambda I, x, y: ndi.map_coordinates(I, [np.atleast_1d(y), np.atleast_1d(x)], order=1, mode='nearest')
DY = {'golden': 4, 'lenard': 2, 'townelake': 1, 'heritage': 2, 'alex': 4}

def load(course):
    out = f'{TK}/attempts/stages/{ATT[course]}/fork/stage-output'; A = f'{out}/early/artifacts'
    raw = np.fromfile(f'{A}/s1/badgePx.rgba.bin', dtype=np.uint8); H = raw.size // 4 // W
    rgb = raw.reshape(H, W, 4)[..., :3]; lum = rgb.astype(float).mean(-1)
    bj = json.load(open(f'{A}/s1/px.badges.json'))['badges']; kj = json.load(open(f'{A}/s2/px.baskets.json'))['baskets']
    tj = json.load(open(f'{A}/s3fix/px.tees.refined.json'))['tees']
    badges = {int(b['label']): np.array([b['bbox'][0] + (b['bbox'][2] - 1) / 2, b['bbox'][1] + (b['bbox'][3] - 1) / 2]) for b in bj}
    rec = [d for d in json.load(open(f'{out}/basket-bridge/basket-recovery.part.json'))['comparisons']['accepted'] if d['classification'] != 'existing-s2-exact']
    baskets = [dict(src='S2', bbox=k['bbox']) for k in kj] + [dict(src='S4', bbox=d['semanticBbox']) for d in rec]
    for k in baskets: k['bp'] = np.array(k['bbox'][:2], float) + BPO
    assoc = json.load(open(f'{out}/s3assoc/px.tees.association.json')); L = assoc['template']['L']
    tees = {}
    for r in assoc['rows']:
        if not r.get('best'): continue
        th = math.radians(r['thDeg']); u = np.array([math.cos(th), math.sin(th)]) * r['best']['sense']
        tees[int(r['best']['badge'])] = dict(src='S3', center=np.array(r['center']), u=u, z=r['best']['z'])
    s4 = sorted(glob.glob(f'{out}/s4recover/run-*'))
    if s4:
        for t in json.load(open(f'{s4[-1]}/artifacts/fn.Tee.recover/greedyOccluded/recovered.json'))['recovered']:
            h = int(t['hole']); c = np.array(t['center']); u = np.array([math.cos(t['angleRad']), math.sin(t['angleRad'])])
            if h in tees or h not in badges: continue
            if u @ (badges[h] - c) < 0: u = -u
            tees[h] = dict(src='S4', center=c, u=u, conf=t.get('confidence'), rayDeg=t.get('badgeRayResidualDeg'))
    spr = np.zeros(H * W, bool)
    spr[[p for k in kj for p in k['px'] + k['shell']['blackPx']] + [p for b in bj for p in b['px'] + b['mute']['px']] + [p for t in tj for p in t['px']]] = True
    spr = spr.reshape(H, W)
    for d in rec: x, y, w, h = d['semanticBbox']; spr[y:y + h, x:x + w] = True
    SPR = ndi.binary_dilation(ndi.binary_fill_holes(spr), iterations=2).astype(float)
    return dict(course=course, rgb=rgb, lum=lum, H=H, badges=badges, baskets=baskets, tees=tees, L=L, SPR=SPR)

def tls_max(P):
    P = np.asarray(P, float); c = P.mean(0); _, _, vt = np.linalg.svd(P - c); n = vt[1]
    return float(np.abs((P - c) @ n).max())

def straight(C):
    out = {}
    for h, t in C['tees'].items():
        if h not in C['badges']: continue
        b = C['badges'][h]; u = (b - t['center']) / np.linalg.norm(b - t['center'])
        cands = []
        for i, k in enumerate(C['baskets']):
            along = (k['bp'] - b) @ u
            if along <= 0: continue
            e = tls_max([t['center'], b, k['bp']])
            if e <= STRAIGHT_TLS_PX: cands.append((along, i, e))
        if cands: a, i, e = min(cands); out[h] = dict(basket=i, tlsPx=round(e, 2), alongPx=round(a, 1))
    return out

def spokes(C):
    lum, SPR, L = C['lum'], C['SPR'], C['L']
    fronts = {h: t['center'] + t['u'] * L / 2 for h, t in C['tees'].items()}
    holes = sorted(fronts); S = np.full((len(C['baskets']), len(holes)), -9.0)
    for i, k in enumerate(C['baskets']):
        bp = k['bp']
        for j, m in enumerate(holes):
            d = fronts[m] - bp; D = np.linalg.norm(d); best = -9
            for da in np.arange(-2, 2.01, 0.25):
                a = math.atan2(d[1], d[0]) + math.radians(da); u = np.array([math.cos(a), math.sin(a)]); n = np.array([-u[1], u[0]])
                rs = np.arange(8, min(D - 4, 130), 0.75)
                if len(rs) < 10: continue
                X = bp[0] + rs * u[0]; Y = bp[1] + rs * u[1]
                on = np.maximum(samp(lum, X, Y), np.maximum(samp(lum, X + 0.7 * n[0], Y + 0.7 * n[1]), samp(lum, X - 0.7 * n[0], Y - 0.7 * n[1])))
                side = np.maximum(samp(lum, X + 3.5 * n[0], Y + 3.5 * n[1]), samp(lum, X - 3.5 * n[0], Y - 3.5 * n[1]))
                bad = (samp(SPR, X, Y) > 0.01) | (samp(SPR, X + 3.5 * n[0], Y + 3.5 * n[1]) > 0.01) | (samp(SPR, X - 3.5 * n[0], Y - 3.5 * n[1]) > 0.01)
                if (~bad).sum() < 8: continue
                best = max(best, float(np.median(np.clip(on - side, -10, 20)[~bad])))
            S[i, j] = best
    ri, ci = linear_sum_assignment(-S); out = {}
    for i, j in zip(ri, ci):
        if S[i, j] <= SPOKE_MIN_LUM: continue
        h = holes[j] - 1 if holes[j] > 1 else N          # basket of hole n points at tee n+1 (hole 18's at tee 1)
        out[h] = dict(basket=int(i), ridgeLum=round(float(S[i, j]), 1), marginLum=round(float(S[i, j] - np.max(np.delete(S[i], j))), 1) if len(holes) > 1 else None, toTee=holes[j])
    return out

def crossval(C):
    st, sp = straight(C), spokes(C); rows = {}
    for h in range(1, N + 1):
        a, b = st.get(h), sp.get(h)
        if a and b: status = 'agree' if a['basket'] == b['basket'] else 'conflict'
        else: status = 'straight only' if a else 'spoke only' if b else 'unresolved'
        claim = a['basket'] if a and (not b or status == 'agree') else b['basket'] if b and not a else None
        t = C['tees'].get(h)
        rows[h] = dict(hole=h, badge=h in C['badges'], tee=t['src'] if t else None, teeCenter=t['center'].round(2).tolist() if t else None,
                       straight=a, spoke=b, status=status, basket=claim, basketSrc=C['baskets'][claim]['src'] if claim is not None else None)
    used = [r['basket'] for r in rows.values() if r['basket'] is not None]
    dup = sorted({k for k in used if used.count(k) > 1})
    for r in rows.values():
        if r['basket'] in dup: r['status'] += ' (basket claimed twice)'
    return rows, dict(badges=len(C['badges']), tees=len(C['tees']), teesS4=sum(t['src'] == 'S4' for t in C['tees'].values()),
                      baskets=len(C['baskets']), basketsS4=sum(k['src'] == 'S4' for k in C['baskets']), duplicateClaims=dup)

SPOKE_FULL_MARGIN_LUM = 5.0   # lum: a spoke whose best tee beats its second-best by this much counts as one full signal

def resolve(rows, nBaskets):
    """Entailment by exclusivity: every basket ends exactly one hole. Each claim carries its own weight (straight test 1;
    spoke min(1, margin / SPOKE_FULL_MARGIN_LUM): a spoke that barely prefers its tee is barely a claim); a hole x basket
    one-to-one assignment maximises the total weight. A conflict is settled when the losing claim's basket is owned by a
    stronger claim elsewhere; a claim that loses every basket leaves its hole unresolved, never guessed."""
    holes = sorted(rows); Wt = np.zeros((len(holes), nBaskets))
    for a, h in enumerate(holes):
        r = rows[h]
        if r['straight']: Wt[a, r['straight']['basket']] += 1.0
        if r['spoke']: Wt[a, r['spoke']['basket']] += max(0.0, min(1.0, (r['spoke']['marginLum'] or 0) / SPOKE_FULL_MARGIN_LUM))
    ri, ci = linear_sum_assignment(-Wt)
    for a, k in zip(ri, ci):
        r = rows[holes[a]]
        if Wt[a, k] <= 0: continue
        signals = [n for n in ('straight', 'spoke') if r[n] and r[n]['basket'] == k]
        rival = any(r[n] and r[n]['basket'] != k for n in ('straight', 'spoke'))
        r['resolved'] = dict(basket=int(k), weight=round(float(Wt[a, k]), 2), signals=signals,
                             how='two signals agree' if len(signals) == 2 else 'exclusivity settled a conflict' if rival else f'one signal ({signals[0]})')
    for h in holes:
        rows[h].setdefault('resolved', dict(basket=None, weight=0, signals=[], how='unresolved'))
    # Elimination: when exactly one hole and one basket are left, every other pairing is held by evidence, so they pair.
    left = [h for h in holes if rows[h]['resolved']['basket'] is None]
    free = sorted(set(range(nBaskets)) - {rows[h]['resolved']['basket'] for h in holes})
    if len(left) == 1 and len(free) == 1:
        rows[left[0]]['resolved'] = dict(basket=free[0], weight=0, signals=[], how='elimination (last hole, last basket)')
    return rows

def truth_basket(C, course):
    f = glob.glob(f'{TK}/testimony/{course}/*.annotation.json')
    if not f or course not in DY: return {}
    holes = json.load(open(f[0]))['holes']
    hmap = {m['annotationNumber']: m['holeNumber'] for m in json.load(open(f'{TK}/testimony/{course}/hole-numbers.json'))['map']} if os.path.exists(f'{TK}/testimony/{course}/hole-numbers.json') else None
    out = {}
    for h in holes:
        n = hmap[h['number']] if hmap else h['number']; s = np.array([h['basket']['xPx'], h['basket']['yPx'] - DY[course]])
        d = [np.linalg.norm(k['bp'] - s) for k in C['baskets']]
        out[n] = int(np.argmin(d)) if min(d) <= 12 else None
    return out

if __name__ == '__main__':
    courses = sys.argv[1:] or list(ATT)
    allres = {}
    for c in courses:
        C = load(c); rows, summ = crossval(C); rows = resolve(rows, len(C['baskets'])); T = truth_basket(C, c)
        for h, r in rows.items():
            if h in T: r['truthAgrees'] = (r['resolved']['basket'] == T[h]) if r['resolved']['basket'] is not None else None
        allres[c] = dict(summary=summ, holes={str(h): {k: v for k, v in r.items()} for h, r in rows.items()})
        from collections import Counter
        print(c, summ, dict(Counter(r['resolved']['how'] for r in rows.values())))
    json.dump(allres, open(os.path.join(HERE, 'crossval.json'), 'w'), indent=1, default=lambda o: o.tolist() if hasattr(o, 'tolist') else str(o))
