# Fixture for E01 (contrast half): match18.py's own code up to the assignment (exec'd verbatim), dumping the UNROUNDED
# contrast matrix and the best route per (hole, basket). Usage: python3 fixture18.py <course> <outdir>
import sys, os, json, time
D = '/tmp/claude-0/-home-user/73d91f40-13de-5bef-9b81-7de266a5102a/scratchpad/after-s4'
name, outdir = sys.argv[1], sys.argv[2]
src = open(f'{D}/match18.py').read(); cut = src.index('ri, cj = linear_sum_assignment')
sys.argv = [f'{D}/match18.py', name]
g = {'__file__': f'{D}/match18.py', '__name__': 'match18_fixture'}
t0 = time.time(); exec(compile(src[:cut], f'{D}/match18.py', 'exec'), g); tm = time.time() - t0
M = g['M']; R = g['R']; order = g['order']; C = g['C']; K = len(C.bp)
json.dump(dict(course=name, widthPx=float(g['W']), order=order, bp=C.bp.tolist(), matrix=M.tolist(),
               routes={f'{n}|{k}': [[float(x) for x in v] for v in R[(n, k)]] for n in order for k in range(K)},
               pythonSeconds=round(tm, 1), source='after-s4/match18.py exec verbatim up to the assignment (fixture18.py)'), open(f'{outdir}/match18-{name}.fixture.json', 'w'))
print(name, 'done', round(tm, 1))
