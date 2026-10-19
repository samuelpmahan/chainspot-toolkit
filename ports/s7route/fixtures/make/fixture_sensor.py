# Sensor fixture for E01/E11 on the CURRENT dev attempts: match2.py's own code exec'd verbatim up to the matrix loop
# (baseline, W, sensor, start), then sensor() on 20 random routes. Usage: python3 fixture_sensor.py <course> <outdir>
import sys, os, json, time
D = '/tmp/claude-0/-home-user/73d91f40-13de-5bef-9b81-7de266a5102a/scratchpad/after-s4'
name, outdir = sys.argv[1], sys.argv[2]
src = open(f'{D}/match2.py').read(); cut = src.index('order = sorted(int(b) for b in holes)')
sys.argv = [f'{D}/match2.py', name]
g = {'__file__': f'{D}/match2.py', '__name__': 'match2_sensor_fixture'}
t0 = time.time(); exec(compile(src[:cut], f'{D}/match2.py', 'exec'), g); tm = time.time() - t0
np = g['np']; sensor = g['sensor']; start = g['start']; C = g['C']; W = g['W']; holes = g['holes']; course = g['course']
order = sorted(int(b) for b in holes)
rng = np.random.default_rng(20261019); rand = []
for i in range(20):
    n = order[int(rng.integers(len(order)))]; S, u, dB = start(n); V = [S]
    for b in range(int(rng.integers(0, 3))): V.append(np.array([rng.uniform(0, C.W), rng.uniform(0, C.H)]))
    V.append(C.bp[int(rng.integers(len(C.bp)))] if rng.random() < 0.7 else np.array([rng.uniform(0, C.W), rng.uniform(0, C.H)]))
    f, N = sensor(V); rand.append(dict(hole=n, verts=[[float(x) for x in v] for v in V], passFrac=float(f), stations=int(N)))
starts = {str(n): dict(zip(('S', 'u', 'badgeAlongPx'), (lambda r: ([float(x) for x in r[0]], [float(x) for x in r[1]], float(r[2])))(start(n)))) for n in order}
json.dump(dict(course=name, attempt=course.COURSES[name][0], widthPx=float(W), L=float(C.L), order=order, bp=C.bp.tolist(), holes=holes, starts=starts, random=rand,
               pythonSeconds=round(tm, 1), source='after-s4/match2.py exec verbatim up to the matrix loop (fixture_sensor.py), on the attempt named here'), open(f'{outdir}/sensor-{name}.fixture.json', 'w'))
print(name, course.COURSES[name][0], 'W', W, 'holes', len(order), 'baskets', len(C.bp), 'seconds', round(tm, 1))
