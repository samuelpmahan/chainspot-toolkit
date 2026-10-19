"""Read-only CommonJS literal-require inventory. Never import/evaluate producer JS."""
import hashlib
import json
import re
from collections import deque
from pathlib import Path

ROOT = Path('/workspace/scratch/8528bb251845/chainspot-discovery-lab')
ALG = ROOT / 'source/provider/packages/alg'
DIST = ALG / 'dist'
ENTRIES = [DIST / p for p in (
    'exec/gateway.js', 'exec/operations.js', 'exec/board.js', 'exec/sink.js',
    'exec/pcr.js', 'exec/sha256.js', 'detectors/threeFactor/hash.js',
    'detectors/threeFactor/features/types.js')]
BUILTINS = set('assert assert/strict async_hooks buffer child_process cluster console constants crypto dgram diagnostics_channel dns dns/promises domain events fs fs/promises http http2 https module net os path path/posix path/win32 perf_hooks process punycode querystring readline readline/promises repl stream stream/consumers stream/promises stream/web string_decoder sys timers timers/promises tls trace_events tty url util util/types v8 vm wasi worker_threads zlib test test/reporters'.split())
REQ = re.compile(r'\brequire\s*\(\s*([\'"])([^\'"\n]+)\1\s*\)')
CALL = re.compile(r'\brequire\s*\(')
IMPORT = re.compile(r'\bimport\s*\(')

def rel(p):
    try:
        return str(p.relative_to(ROOT))
    except ValueError:
        return str(p)

def pin(p):
    b = p.read_bytes()
    return {'path': rel(p), 'sha256': hashlib.sha256(b).hexdigest(), 'size': len(b)}

def resolve_local(base):
    candidates = [base, Path(str(base) + '.js'), Path(str(base) + '.json'), Path(str(base) + '.node')]
    for p in candidates:
        if p.is_file():
            return p.resolve()
    if base.is_dir():
        package = base / 'package.json'
        if package.is_file():
            doc = json.loads(package.read_text())
            main = doc.get('main')
            if isinstance(main, str) and main != '.':
                resolved = resolve_local(base / main)
                if resolved:
                    return resolved
        for name in ('index.js', 'index.json', 'index.node'):
            p = base / name
            if p.is_file():
                return p.resolve()
    return None

def resolve_external(name, caller):
    parts = name.split('/')
    package_name = '/'.join(parts[:2]) if name.startswith('@') else parts[0]
    suffix = parts[2:] if name.startswith('@') else parts[1:]
    for directory in caller.parent.parents:
        package_dir = directory / 'node_modules' / package_name
        if package_dir.exists():
            p = resolve_local(package_dir.joinpath(*suffix))
            return p, package_dir / 'package.json'
    return None, None

queue = deque(ENTRIES)
seen = set()
modules, edges, external, dynamic, assets, boundaries, missing = [], [], [], [], [], {}, []
while queue:
    p = queue.popleft().resolve()
    if p in seen:
        continue
    seen.add(p)
    if not p.is_file():
        missing.append({'caller': None, 'specifier': rel(p), 'kind': 'missing-entry'})
        continue
    modules.append(pin(p))
    for directory in (p.parent, *p.parent.parents):
        package = directory / 'package.json'
        if package.is_file():
            doc = json.loads(package.read_text())
            boundaries[str(package)] = {**pin(package), 'type': doc.get('type', 'commonjs'), 'name': doc.get('name')}
            break
    if p.suffix != '.js':
        assets.append(pin(p))
        continue
    text = p.read_text()
    matches = list(REQ.finditer(text))
    spans = {m.start() for m in matches}
    for m in CALL.finditer(text):
        if m.start() not in spans:
            dynamic.append({'path': rel(p), 'line': text.count('\n', 0, m.start()) + 1, 'kind': 'non-literal-require'})
    for m in IMPORT.finditer(text):
        dynamic.append({'path': rel(p), 'line': text.count('\n', 0, m.start()) + 1, 'kind': 'dynamic-import'})
    for m in matches:
        specifier = m.group(2)
        edge = {'caller': rel(p), 'line': text.count('\n', 0, m.start()) + 1, 'specifier': specifier}
        if specifier.startswith('node:') or specifier in BUILTINS:
            edges.append({**edge, 'kind': 'builtin', 'resolved': specifier})
            continue
        if specifier.startswith('.') or specifier.startswith('/'):
            resolved = resolve_local(p.parent / specifier)
            kind = 'local'
        else:
            resolved, package = resolve_external(specifier, p)
            kind = 'external'
            external.append({**edge, 'resolved': rel(resolved) if resolved else None, 'package_boundary': rel(package) if package else None})
        if resolved is None:
            missing.append({**edge, 'kind': 'missing-' + kind})
            edges.append({**edge, 'kind': kind, 'resolved': None})
        else:
            edges.append({**edge, 'kind': kind, 'resolved': rel(resolved)})
            queue.append(resolved)

print(json.dumps({
    'schema': 'lab14-static-commonjs-closure@1',
    'method': 'Read bytes and scan literal require calls with line anchors; resolve local files as Node CJS file/directory candidates. No producer imports, evaluation, tests, or rebuild.',
    'limitations': ['Text scanner is not a full JavaScript parser. Dynamic loads and assets beyond literal require are separately reported and require source review.', 'External package exports conditions are not modeled; any external package is a review stop before import.'],
    'entries': [rel(p) for p in ENTRIES],
    'modules': sorted(modules, key=lambda x: x['path']),
    'package_boundaries': sorted(boundaries.values(), key=lambda x: x['path']),
    'edges': edges,
    'externals': external,
    'dynamic_loads': dynamic,
    'literal_assets': assets,
    'missing': missing,
    'first_stop': missing[0] if missing else (external[0] if external else None),
}, indent=2))
