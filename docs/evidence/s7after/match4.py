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
out = {}
for h in A['holes']:
    n = h['hole']; b = holes[str(n)]; T = np.array(b['teeCenter']); u = np.array(b['u']); S = T + u * FRONT * C.L; E = C.bp[h['end']]
    f0, N0 = sensor([S, E])
    if N0 >= MIN_ST and f0 >= TAU: out[n] = dict(h, verts=np.round([S, E], 2).tolist(), bends=0, how=f'straight: sensor {f0:.2f} on {N0} st')
    else: f1, N1 = sensor(h['verts']); out[n] = dict(h, how=f'contrast route ({h["bends"]} bends): sensor {f1:.2f}; straight read {f0:.2f}')
import s3first
J = s3first.judge(C, name, out, W)
for n in sorted(out):
    j = J.get(n, {})
    if not j.get('ok'): print(f"  {n:3d} BP{out[n]['end']} (Sam BP{out[n]['samBasket']}) {out[n]['how']} | X max off {j.get('maxDevPx')} px / {j.get('halfWidthPx')}, bends ours {j.get('bendsOurs')} Sam {j.get('bendsSam')}")
print(f"{name}: baskets right {sum(out[n]['end'] == out[n]['samBasket'] for n in out)}/{len(out)}; routes agreeing with Sam {sum(1 for j in J.values() if j.get('ok'))}/{len(out)}")
json.dump(dict(width=W, holes=[out[n] for n in sorted(out)], judge=J), open(f'{HERE}/match4-{name}.json', 'w'), default=float)
