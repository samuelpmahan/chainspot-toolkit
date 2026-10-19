import sys, json, numpy as np
from scipy.optimize import linear_sum_assignment
sys.path.insert(0, '.')
import after_s4, course
from badgeseed import FRONT
for name in ('lenard', 'golden', 'townelake', 'heritage'):
    A = json.load(open(f'match18-{name}.json')); M = np.array(A['matrix']); order = A['order']; W = A['width']
    holes, C = after_s4.baseline(name); samK = {h['hole']: h['samBasket'] for h in A['holes']}
    B = M.copy()
    for i, n in enumerate(order):
        h = holes[str(n)]; T = np.array(h['teeCenter']); u = np.array(h['u']); S = T + u * FRONT * C.L
        dB = float((C.badges[n] - S) @ u); d = C.bp - S; along = d @ u; lat = np.abs(d @ np.array([-u[1], u[0]]))
        ok = np.where((along > dB) & (lat <= W / 2))[0]
        if len(ok): B[i, ok[np.argmin(along[ok])]] += 15.0
    for lab, X in (('contrast only', M), ('+ on-axis prior', B)):
        ri, cj = linear_sum_assignment(-X); right = sum(cj[i] == samK[order[i]] for i in ri)
        wrong = [order[i] for i in ri if cj[i] != samK[order[i]]]
        print(f'{name:10s} {lab:16s} baskets right {right}/{len(order)} wrong {wrong}')
