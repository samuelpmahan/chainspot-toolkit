# Content-addressed step cache (PxC idea: unchanged inputs -> same Part, served from cache; changed -> recomputed, new receipt).
# key = sha256(step name, the source bytes of the files the step depends on, canonical inputs). Arrays hash by bytes.
# Every lookup is logged (HIT/MISS, step, key, seconds) so a run can prove what it reused.
import hashlib, json, os, pickle, time, numpy as np
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '.cache')
LOG = []
_src = {}
def _code(files):
    h = hashlib.sha256()
    for f in sorted(files):
        if f not in _src: _src[f] = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), f), 'rb').read()
        h.update(f.encode()); h.update(_src[f])
    return h.hexdigest()
def _canon(x, h):
    if isinstance(x, np.ndarray): h.update(b'nd'); h.update(str(x.dtype).encode()); h.update(str(x.shape).encode()); h.update(np.ascontiguousarray(x).tobytes())
    elif isinstance(x, (list, tuple)): h.update(b'['); [_canon(v, h) for v in x]; h.update(b']')
    elif isinstance(x, dict): h.update(b'{'); [(_canon(k, h), _canon(x[k], h)) for k in sorted(x, key=str)]; h.update(b'}')
    elif isinstance(x, (float, np.floating)): h.update(repr(round(float(x), 9)).encode())
    else: h.update(repr(x).encode())
def file_sha(path):
    return hashlib.sha256(open(path, 'rb').read()).hexdigest()
def cached(step, deps, inputs, compute):
    h = hashlib.sha256(); h.update(step.encode()); h.update(_code(deps).encode()); _canon(inputs, h); key = h.hexdigest()[:20]
    path = os.path.join(ROOT, step, key + '.pkl'); t = time.time()
    if os.path.exists(path):
        v = pickle.load(open(path, 'rb')); LOG.append(dict(step=step, key=key, hit=True, s=round(time.time() - t, 3))); return v
    v = compute(); os.makedirs(os.path.dirname(path), exist_ok=True); pickle.dump(v, open(path, 'wb'))
    LOG.append(dict(step=step, key=key, hit=False, s=round(time.time() - t, 3))); return v
def summary():
    by = {}
    for e in LOG: s = by.setdefault(e['step'], dict(hit=0, miss=0, s=0.0)); s['hit' if e['hit'] else 'miss'] += 1; s['s'] += e['s']
    return {k: dict(v, s=round(v['s'], 1)) for k, v in by.items()}
