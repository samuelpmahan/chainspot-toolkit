# Sam, 2026-10-19: "assignment + bend refinement passes using the hallway sensor".
# Hallway sensor = the recorded per-station edge test (contrast.station_contrast): a station passes when BOTH ribbon
# edges step by > 8 lum at the hallway width; a route's reading = fraction of its visible stations that pass.
#  Pass A, assignment: every hole x every basket, read by the sensor over its best 0- or 1-bend route; one-to-one.
#  Pass B, bend refinement: endpoints fixed; the FEWEST bends whose route the sensor reads as hallway (>= TAU).
import sys, os, json, math, numpy as np
from scipy.optimize import linear_sum_assignment
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import after_s4, course
from contrast import station_contrast
from polyscore import poly_score, refine_vertices
from badgeseed import FRONT
STEP_LUM, TAU, MIN_ST = 8.0, 0.75, 20
name = sys.argv[1]
holes, C = after_s4.baseline(name)
os.makedirs(f'{HERE}/baselines', exist_ok=True); bf = f'{HERE}/baselines/{name}.json'; json.dump(dict(holes=holes), open(bf, 'w')); os.environ['BASELINE_DIR'] = f'{HERE}/baselines'
import teebadge
_, _, TB = teebadge.learn(name); W = TB['widthPx']
def sensor(V):
    """(pass fraction, visible stations) of the polyline V: both edges step > 8 lum, ends and joints skipped by W/2."""
    V = [np.asarray(v, float) for v in V]; P = N = 0
    for i, (a, b) in enumerate(zip(V[:-1], V[1:])):
        L = float(np.hypot(*(b - a)))
        t0 = W * 0.75 if i == 0 else W * 0.5; t1 = L - W * 0.5
        if t1 <= t0: continue
        ts = np.arange(t0, t1, 1.0); cl, cr, okl, okr = station_contrast(C, a, math.atan2(*(b - a)[::-1]), ts, W)
        ok = okl & okr; P += int(((np.minimum(cl, cr) > STEP_LUM) & ok).sum()); N += int(ok.sum())
    return (P / N if N else 0.0), N
def start(n):
    h = holes[str(n)]; T = np.array(h['teeCenter']); u = np.array(h['u']); return T + u * FRONT * C.L, u, float((C.badges[n] - (T + u * FRONT * C.L)) @ u)
def one_bend(n, k, step=8.0):
    S, u, dB = start(n); E = C.bp[k]; best = None
    for t in np.arange(dB + W * 0.5, dB + 800, step):
        B1 = S + u * t
        if not (0 <= B1[0] < C.W and 0 <= B1[1] < C.H): break
        f, N = sensor([S, B1, E])
        if N >= MIN_ST and (best is None or f > best[0]): best = (f, N, [S, B1, E])
    return best
order = sorted(int(b) for b in holes); K = len(C.bp)
M = np.zeros((len(order), K)); R = {}
for i, n in enumerate(order):
    S, u, dB = start(n)
    for k in range(K):
        f0, N0 = sensor([S, C.bp[k]]); cand = [(f0, N0, [S, C.bp[k]])] if N0 >= MIN_ST else []
        b1 = one_bend(n, k)
        if b1: cand.append(b1)
        best = max(cand, key=lambda c: c[0]) if cand else (0.0, 0, [S, C.bp[k]])
        M[i, k] = best[0]; R[(n, k)] = best
ri, cj = linear_sum_assignment(-M)
f, dy = course.TESTIMONY[name]; sam = {h['number']: h for h in json.load(open(f'{after_s4.TK}/testimony/{f}'))['holes']}
SP = lambda q: np.array([q['xPx'], q['yPx'] + dy])
samK = {n: int(np.argmin(np.hypot(*(C.bp - SP(sam[n]['basket'])).T))) for n in order if n in sam}
def two_bend(n, k):
    S, u, dB = start(n); E = C.bp[k]; b1 = one_bend(n, k, step=16.0); best = None
    if not b1: return None
    lo = np.minimum(S, E) - 6 * W; hi = np.maximum(S, E) + 6 * W
    for dt in np.arange(-64, 65, 32):
        B1 = np.asarray(b1[2][1]) + u * dt
        for x in np.arange(lo[0], hi[0], W / 2):
            for y in np.arange(lo[1], hi[1], W / 2):
                B2 = np.array([x, y]); fr, N = sensor([S, B1, B2, E])
                if N >= MIN_ST and (best is None or fr > best[0]): best = (fr, N, [S, B1, B2, E])
    return best
out = {}
for i, k in zip(ri, cj):
    n = order[i]; S, u, dB = start(n); E = C.bp[k]
    f0, N0 = sensor([S, E]); choice = ('0 bends', f0, N0, [S, E])
    if not (N0 >= MIN_ST and f0 >= TAU):
        b1 = R[(n, k)] if len(R[(n, k)][2]) == 3 else one_bend(n, k)
        V1, _ = refine_vertices(C, b1[2], W, pad_axis=u, iters=2); f1, N1 = sensor(V1)
        choice = ('1 bend', f1, N1, V1)
        if f1 < TAU:
            b2 = two_bend(n, k)
            if b2:
                V2, _ = refine_vertices(C, b2[2], W, pad_axis=u, iters=2); f2, N2 = sensor(V2)
                if f2 >= TAU and f2 > f1 + 0.1: choice = ('2 bends', f2, N2, V2)
    row = np.sort(M[i])[::-1]
    out[n] = dict(hole=n, end=int(k), verts=np.round(np.asarray(choice[3]), 2).tolist(), bends=len(choice[3]) - 2, how=f'hallway sensor: {choice[0]}',
                  sensorFrac=round(float(choice[1]), 3), stations=int(choice[2]), assignFrac=round(float(M[i, k]), 3), margin=round(float(row[0] - row[1]), 3), samBasket=samK.get(n))
import s3first
J = s3first.judge(C, name, out, W)
for n in order:
    r = out[n]; j = J.get(n, {})
    print(f"  {n:3d} BP{r['end']:<3d} (Sam BP{r['samBasket']}) assign {r['assignFrac']:.2f} (margin {r['margin']:+.2f}) | {r['how']:24s} sensor {r['sensorFrac']:.2f} on {r['stations']} st | "
          + ('OK' if j.get('ok') else 'X') + (f" max off {j['maxDevPx']} px / {j['halfWidthPx']}, bends ours {j['bendsOurs']} Sam {j['bendsSam']}" if 'endErrPx' in j else ''))
nb = sum(out[n]['end'] == out[n]['samBasket'] for n in order); nr = sum(1 for j in J.values() if j.get('ok'))
print(f'{name}: hallway width {W:.2f} px; baskets right {nb}/{len(order)}; routes agreeing with Sam {nr}/{len(order)}')
json.dump(dict(width=W, holes=[out[n] for n in order], judge=J, matrix=M.round(3).tolist(), order=order), open(f'{HERE}/match2-{name}.json', 'w'), default=float)
