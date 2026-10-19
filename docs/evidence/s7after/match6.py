# Hybrid, corrected: assignment AND route candidates by edge contrast (match18), the hallway sensor only DECIDES how many
# bends: the straight route if the sensor reads it as hallway (>= TAU), else the contrast-best 1-bend route.
import sys, os, json, math, numpy as np
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
sys.argv = [sys.argv[0], sys.argv[1]]
import after_s4, course
from contrast import station_contrast
from badgeseed import FRONT
STEP_LUM, TAU, MIN_ST = 8.0, 0.75, 20
name = sys.argv[1]; A = json.load(open(f'{HERE}/match18-{name}.json')); W = A['width']
holes, C = after_s4.baseline(name)
def sensor(V):
    V = [np.asarray(v, float) for v in V]; P = N = 0
    for i, (a, b) in enumerate(zip(V[:-1], V[1:])):
        L = float(np.hypot(*(b - a))); t0 = W * 0.75 if i == 0 else W * 0.5; t1 = L - W * 0.5
        if t1 <= t0: continue
        ts = np.arange(t0, t1, 1.0); cl, cr, okl, okr = station_contrast(C, a, math.atan2(*(b - a)[::-1]), ts, W)
        ok = okl & okr; P += int(((np.minimum(cl, cr) > STEP_LUM) & ok).sum()); N += int(ok.sum())
    return (P / N if N else 0.0), N
# the on-axis prior (E03, verified): the nearest BasketPoint on the tee ray past the badge within W/2 gets +15 before assignment
from scipy.optimize import linear_sum_assignment
from polyscore import poly_score
M = np.array(A['matrix']); order = A['order']; byHole = {h['hole']: h for h in A['holes']}
for i, n in enumerate(order):
    b = holes[str(n)]; T = np.array(b['teeCenter']); u = np.array(b['u']); S = T + u * FRONT * C.L
    dB = float((C.badges[n] - S) @ u); d = C.bp - S; al = d @ u; lat = np.abs(d @ np.array([-u[1], u[0]]))
    ok = np.where((al > dB) & (lat <= W / 2))[0]
    if len(ok): M[i, ok[np.argmin(al[ok])]] += 15.0
ri, cj = linear_sum_assignment(-M)
for i, k in zip(ri, cj):
    n = order[i]; h = byHole[n]
    if h['end'] != int(k):   # a reassigned hole: its contrast route to the new basket (straight or one bend on the tee axis)
        b = holes[str(n)]; T = np.array(b['teeCenter']); u = np.array(b['u']); S = T + u * FRONT * C.L; E = C.bp[k]
        dB = float((C.badges[n] - S) @ u); best = (poly_score(C, [S, E], W)[0], [S, E])
        for t in np.arange(dB + W * 0.5, dB + 800, 6.0):
            B1 = S + u * t
            if not (0 <= B1[0] < C.W and 0 <= B1[1] < C.H): break
            sc, _ = poly_score(C, [S, B1, E], W)
            if sc > best[0]: best = (sc, [S, B1, E])
        byHole[n] = dict(h, end=int(k), verts=np.round(np.asarray(best[1]), 2).tolist(), bends=len(best[1]) - 2, reassignedByPrior=True)
A['holes'] = [byHole[n] for n in order]

def second_bend(n, h, S, E, u, f1, rec):
    """sensor-gated second bend: B1 on the tee axis (+-80 px around the 1-bend vertex), B2 free (grid W/2 then refine)."""
    V1 = np.asarray(h['verts'], float)[1]; t1 = float((V1 - S) @ u)
    lo, hi = np.minimum(S, E) - 2 * W, np.maximum(S, E) + 2 * W
    gx = np.arange(max(lo[0], 0), min(hi[0], C.W), W / 2); gy = np.arange(max(lo[1], 0), min(hi[1], C.H), W / 2)
    cands = []
    for t in np.arange(t1 - 80, t1 + 80.1, 8.0):
        B1 = S + u * t
        if not (0 <= B1[0] < C.W and 0 <= B1[1] < C.H): continue
        for x in gx:
            for y in gy:
                B2 = np.array([x, y])
                if np.hypot(*(B2 - B1)) < W or np.hypot(*(B2 - E)) < W: continue
                sc, _ = poly_score(C, [S, B1, B2, E], W)
                cands.append((sc, t, B2))
    cands.sort(key=lambda c: -c[0]); best = (-99.0, None)
    for sc, t, B2 in cands[:8]:   # refine the top coarse cells: B1 +-8 px along axis (2 px), B2 +-W/2 (2 px)
        for dt in np.arange(-8, 8.1, 2.0):
            B1 = S + u * (t + dt)
            for dx in np.arange(-W / 2, W / 2 + .1, 2.0):
                for dy in np.arange(-W / 2, W / 2 + .1, 2.0):
                    Vt = [S, B1, B2 + [dx, dy], E]; s2, _ = poly_score(C, Vt, W)
                    if s2 > best[0]: best = (s2, Vt)
    if best[1] is None: return dict(rec, how=rec['how'] + '; no 2-bend candidate')
    f2, N2 = sensor(best[1]); c1 = poly_score(C, h['verts'], W)[0]
    note = f'2-bend candidate contrast {best[0]:.1f} (1-bend {c1:.1f}) lum/px, sensor {f2:.2f} on {N2} st vs 1-bend {f1:.2f}'
    if f2 >= TAU and f2 - f1 >= 0.15 and N2 >= MIN_ST:
        return dict(rec, verts=np.round(np.asarray(best[1]), 2).tolist(), bends=2, secondBend=True, how=f'2-bend accepted: {note}')
    return dict(rec, how=rec['how'] + f'; 2-bend rejected: {note}')
out = {}
for h in A['holes']:
    n = h['hole']; b = holes[str(n)]; T = np.array(b['teeCenter']); u = np.array(b['u']); S = T + u * FRONT * C.L; E = C.bp[h['end']]
    f0, N0 = sensor([S, E])
    if N0 >= MIN_ST and f0 >= TAU: out[n] = dict(h, verts=np.round([S, E], 2).tolist(), bends=0, how=f'straight: sensor {f0:.2f} on {N0} st')
    else:
        f1, N1 = sensor(h['verts']); out[n] = dict(h, how=f'contrast route ({h["bends"]} bends): sensor {f1:.2f}; straight read {f0:.2f}')
        if h['bends'] == 1 and f1 < TAU: out[n] = second_bend(n, h, S, E, u, f1, out[n])
import s3first
J = s3first.judge(C, name, out, W)
for n in sorted(out):
    j = J.get(n, {})
    if not j.get('ok') or out[n].get('secondBend') or '2-bend' in out[n]['how']: print(f"  {n:3d} BP{out[n]['end']} (Sam BP{out[n]['samBasket']}) {out[n]['how']} | X max off {j.get('maxDevPx')} px / {j.get('halfWidthPx')}, bends ours {j.get('bendsOurs')} Sam {j.get('bendsSam')}")
print(f"{name}: baskets right {sum(out[n]['end'] == out[n]['samBasket'] for n in out)}/{len(out)}; routes agreeing with Sam {sum(1 for j in J.values() if j.get('ok'))}/{len(out)}")
json.dump(dict(width=W, holes=[out[n] for n in sorted(out)], judge=J), open(f'{HERE}/match6-{name}.json', 'w'), default=float)
