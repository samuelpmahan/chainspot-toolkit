# Sam, 2026-10-19: "Start from 18x18 matching ... first ensure 18/18 associations ... the POINT of score -> rank -> match
# is to prevent all that." No greedy tracer, no claims: every hole (S3 + S4 tee, its badge from S5) x every basket
# (S2 + S4), each scored by the best 0- or 1-bend route (tee cap -> along the tee axis past the badge -> bend -> BasketPoint)
# rendered and scored on path edges; then one assignment over the whole matrix; then routes judged.
import sys, os, json, math, numpy as np
from scipy.optimize import linear_sum_assignment
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import after_s4, course
from polyscore import poly_score, refine_vertices
from badgeseed import FRONT
name = sys.argv[1]
holes, C = after_s4.baseline(name)
f, dy = course.TESTIMONY[name]; sam = {h['number']: h for h in json.load(open(f'{after_s4.TK}/testimony/{f}'))['holes']}
SP = lambda q: np.array([q['xPx'], q['yPx'] + dy])
# 1. associations: every badge has exactly one tee, and that tee is Sam's tee for the badge (tee rule 8 px)
assoc = {}
for b, h in holes.items():
    n = int(b); T = np.array(h['teeCenter']); s = sam.get(n); err = float(np.hypot(*(T - SP(s['tee'])))) if s else None
    assoc[n] = dict(source=h['source'], teeErrPx=None if err is None else round(err, 1), ok=err is not None and err <= 8)
bad = [n for n, a in assoc.items() if not a['ok']]; missing = sorted(set(C.badges) - set(assoc))
print(f'{name}: associations {sum(a["ok"] for a in assoc.values())}/{len(C.badges)} right (tee within 8 px of Sam\'s tee for that badge); wrong {bad}; no tee {missing}')
# width: the course hallway learned from the tee -> badge segments (teebadge), as the tracker does
import teebadge
os.makedirs(f'{HERE}/baselines', exist_ok=True); bf = f'{HERE}/baselines/{name}.json'; json.dump(dict(holes=holes), open(bf, 'w')); os.environ['BASELINE_DIR'] = f'{HERE}/baselines'
_, _, TB = teebadge.learn(name); W = TB['widthPx']
print(f'  hallway width {W:.2f} px (from {TB["segments"]} tee -> badge segments)')
order = sorted(int(b) for b in holes); K = len(C.bp)
def best_route(n, k):
    h = holes[str(n)]; T = np.array(h['teeCenter']); u = np.array(h['u']); S = T + u * FRONT * C.L; E = C.bp[k]
    dB = float((C.badges[n] - S) @ u); best = (poly_score(C, [S, E], W)[0], [S, E])
    for t in np.arange(dB + W * 0.5, dB + 800, 6.0):
        B1 = S + u * t
        if not (0 <= B1[0] < C.W and 0 <= B1[1] < C.H): break
        s, _ = poly_score(C, [S, B1, E], W)
        if s > best[0]: best = (s, [S, B1, E])
    return best
M = np.full((len(order), K), -99.0); R = {}
for i, n in enumerate(order):
    for k in range(K):
        s, V = best_route(n, k); M[i, k] = s; R[(n, k)] = V
ri, cj = linear_sum_assignment(-M)
# Sam's basket for each hole = the BasketPoint nearest his basket mark
samK = {n: int(np.argmin(np.hypot(*(C.bp - SP(sam[n]['basket'])).T))) for n in order if n in sam}
out = {}
for i, k in zip(ri, cj):
    n = order[i]; row = M[i]; srt = np.sort(row)[::-1]
    V = R[(n, k)]
    if len(V) == 3: V, s = refine_vertices(C, V, W, pad_axis=np.array(holes[str(n)]['u']), iters=2)
    out[n] = dict(hole=n, end=int(k), verts=np.round(np.asarray(V), 2).tolist(), bends=len(V) - 2, how='18x18 match',
                  score=round(float(row[k]), 2), margin=round(float(srt[0] - srt[1]), 2), rowBest=int(np.argmax(row)), samBasket=samK.get(n))
import s3first
J = s3first.judge(C, name, out, W)
print(f'  hole | assigned | Sam basket | score (margin to row runner-up) | row best | route vs Sam')
for n in order:
    r = out[n]; j = J.get(n, {})
    print(f"  {n:4d} | BP{r['end']:<6d} | BP{r['samBasket']!s:<8s} | {r['score']:6.1f} ({r['margin']:+5.1f})              | BP{r['rowBest']:<5d} | "
          + ('OK' if j.get('ok') else 'X') + (f" end {j['endErrPx']} px, max off centreline {j['maxDevPx']} px / half-width {j['halfWidthPx']}, bends ours {j['bendsOurs']} Sam {j['bendsSam']}" if 'endErrPx' in j else ''))
nb = sum(out[n]['end'] == out[n]['samBasket'] for n in order); nr = sum(1 for j in J.values() if j.get('ok'))
print(f'  baskets right {nb}/{len(order)}; routes agreeing with Sam {nr}/{len(order)}; greedy row-best would give {sum(out[n]["rowBest"] == out[n]["samBasket"] for n in order)}/{len(order)} right')
json.dump(dict(width=W, holes=[out[n] for n in order], judge=J, assoc=assoc, matrix=M.round(2).tolist(), order=order), open(f'{HERE}/match18-{name}.json', 'w'), default=float)
