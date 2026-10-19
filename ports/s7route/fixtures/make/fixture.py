# Fixture for E01: match2.py's own code up to the assignment (exec'd verbatim), dumping the UNROUNDED matrix, the best
# route per (hole, basket), the starts, W, and sensor() on 20 random routes. Usage: python3 fixture.py <course> <outdir>
import sys, os, json, time
D = '/tmp/claude-0/-home-user/73d91f40-13de-5bef-9b81-7de266a5102a/scratchpad/after-s4'
name, outdir = sys.argv[1], sys.argv[2]
src = open(f'{D}/match2.py').read()
cut = src.index('ri, cj = linear_sum_assignment')
sys.argv = [f'{D}/match2.py', name]
g = {'__file__': f'{D}/match2.py', '__name__': 'match2_fixture'}
t0 = time.time()
exec(compile(src[:cut], f'{D}/match2.py', 'exec'), g)
tm = time.time() - t0
np = g['np']; sensor = g['sensor']; start = g['start']; C = g['C']; W = g['W']; order = g['order']; M = g['M']; R = g['R']; holes = g['holes']
rng = np.random.default_rng(20261019)
rand = []
for i in range(20):
    n = order[int(rng.integers(len(order)))]; S, u, dB = start(n)
    nb = int(rng.integers(0, 3)); V = [S]
    for b in range(nb): V.append(np.array([rng.uniform(0, C.W), rng.uniform(0, C.H)]))
    V.append(C.bp[int(rng.integers(len(C.bp)))] if rng.random() < 0.7 else np.array([rng.uniform(0, C.W), rng.uniform(0, C.H)]))
    f, N = sensor(V); rand.append(dict(hole=n, verts=[[float(x) for x in v] for v in V], passFrac=float(f), stations=int(N)))
starts = {str(n): dict(zip(('S', 'u', 'badgeAlongPx'), (lambda r: ([float(x) for x in r[0]], [float(x) for x in r[1]], float(r[2])))(start(n)))) for n in order}
routes = {f'{n}|{k}': dict(passFrac=float(R[(n, k)][0]), stations=int(R[(n, k)][1]), verts=[[float(x) for x in v] for v in R[(n, k)][2]]) for n in order for k in range(len(C.bp))}
json.dump(dict(course=name, widthPx=float(W), L=float(C.L), order=order, bp=C.bp.tolist(), holes=holes, starts=starts, matrix=M.tolist(), routes=routes, random=rand,
               pythonSeconds=round(tm, 1), source='after-s4/match2.py exec verbatim up to the assignment (fixture.py)'), open(f'{outdir}/match2-{name}.fixture.json', 'w'))
print(name, 'W', W, 'holes', len(order), 'baskets', len(C.bp), 'seconds', round(tm, 1))
