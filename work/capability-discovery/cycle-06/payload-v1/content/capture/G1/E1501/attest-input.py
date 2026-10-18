#!/usr/bin/env python3
"""E1501 exact-input attestation. Scratch outputs; no CV/product/native writes."""
import argparse
import hashlib
import importlib.util
import json
import math
import os
from pathlib import Path
import subprocess
import sys

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2] / 'chainspot-discovery-lab'
OLD = HERE.parents[2] / 'discovery-cycle05/F2/E1104'
PROTOCOL = REPO / 'work/capability-discovery/cycle-05/capture/final/F2/E1104/protocol-proposal.json'
STAGER = REPO / 'experiments/capability-discovery/source-pixels/stage-png.py'
EXPECTED = {
    'head': 'be67d44a653c79ca61efae99934e90475a9aba5e',
    'tree': '87dfd9aebb09050d1c56e39d54d9a9920b93341c',
    'protocol': 'cb4d757f36ffe6721e71541d6093a48cc11e081bd10c1684746aad8249973829',
    'ref': '49255331791b1245cf0f9cd699816175f94e70f2',
    'blob': '78a4345489a5544640859127cd79f5a06bf9f21b',
    'png': '30fa01879840deb0584ffe001fa39779998710010faeae93510dbc7a8a0abe6e',
    'rgba': '4379abb30a5b0907aa0e1435b13e19eafe8fdd31ac57c9b8bdff4495a14fdc2a',
    'mask': '305285b7e2bc9d44dfd572caa8d39030ed1b0c2254c15967fbb9b7bff7fae609',
    'crop': 'fecfff14beff8dcfb42203f2b2c1fabaef2e52374815274c8e1830d5b813cc84',
}
ENV = dict(os.environ, GIT_OPTIONAL_LOCKS='0', PYTHONDONTWRITEBYTECODE='1')
COMMANDS = []
PHASE = ''


def digest(data):
    return hashlib.sha256(data).hexdigest()


def write(name, data):
    path = HERE / name
    assert path.parent.resolve() == HERE
    with path.open('xb') as handle:
        handle.write(data)
    return {'path': str(path), 'bytes': len(data), 'sha256': digest(data)}


def write_json(name, value):
    return write(name, (json.dumps(value, indent=2) + '\n').encode())


def run(args, stdout_name=None):
    seq = len(COMMANDS) + 1
    result = subprocess.run(args, cwd=REPO, env=ENV, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    out = write(stdout_name or f'{PHASE}.command-{seq:02d}.stdout', result.stdout)
    err = write(f'{PHASE}.command-{seq:02d}.stderr', result.stderr)
    COMMANDS.append({'argv': args, 'cwd': str(REPO),
                     'environmentOverrides': {'GIT_OPTIONAL_LOCKS': '0', 'PYTHONDONTWRITEBYTECODE': '1'},
                     'exit': result.returncode, 'rawStdout': out, 'rawStderr': err})
    print(json.dumps({'argv': args, 'exit': result.returncode, 'stdout': out}, separators=(',', ':')))
    if result.returncode:
        raise RuntimeError(f'command refused: {args!r}; exit {result.returncode}')
    return result.stdout


def binding(path):
    return {'path': str(path), 'bytes': path.stat().st_size, 'sha256': digest(path.read_bytes())}


def snapshot(label):
    refs = run(['git', 'show-ref']).decode()
    head = run(['git', 'rev-parse', 'HEAD', 'HEAD^{tree}']).decode().splitlines()
    status = run(['git', 'status', '--porcelain=v1', '--untracked-files=all']).decode()
    paths = run(['git', 'ls-files', '-z']).split(b'\0')
    entries = []
    for raw in paths:
        if not raw:
            continue
        path = REPO / os.fsdecode(raw)
        entries.append(binding(path))
    value = {'label': label, 'head': head[0], 'tree': head[1], 'refsRaw': refs,
             'statusRaw': status, 'trackedFileCount': len(entries), 'trackedFiles': entries,
             'externalInputs': [binding(OLD / 'Lenard-5.original.png'),
                                binding(OLD / 'Lenard-5.inspection-crop.png'),
                                binding(OLD / 'protocol-proposal.json')]}
    write_json(f'snapshot.{label}.json', value)
    return value


def unchanged(before, after):
    keys = ['head', 'tree', 'refsRaw', 'statusRaw', 'trackedFileCount', 'trackedFiles', 'externalInputs']
    differences = [key for key in keys if before[key] != after[key]]
    assert not differences, f'read-only before/after mismatch: {differences}'
    return {'unchangedFields': keys, 'trackedFileCount': after['trackedFileCount'], 'differences': differences}


def stage():
    before = snapshot('before')
    assert before['head'] == EXPECTED['head'] and before['tree'] == EXPECTED['tree']
    assert digest(PROTOCOL.read_bytes()) == EXPECTED['protocol']
    assert PROTOCOL.read_bytes() == (OLD / 'protocol-proposal.json').read_bytes()
    protocol = json.loads(PROTOCOL.read_text())
    resolved = run(['git', 'rev-parse', EXPECTED['ref'] + ':specimens/dev/Lenard-5.png']).decode().strip()
    assert resolved == EXPECTED['blob']
    assert run(['git', 'cat-file', '-t', EXPECTED['blob']]).decode().strip() == 'blob'
    encoded = run(['git', 'cat-file', 'blob', EXPECTED['blob']], 'Lenard-5.original.png')
    assert len(encoded) == 3943106 and digest(encoded) == EXPECTED['png']
    assert encoded == (OLD / 'Lenard-5.original.png').read_bytes()
    spec = importlib.util.spec_from_file_location('strict_stage_png_E1501', STAGER)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    stage_args = {'path': str(HERE / 'Lenard-5.original.png'), 'expected_sha256': EXPECTED['png'],
                  'image_id': 'Lenard-5', 'frame': protocol['source']['frame']}
    decoded = module.stage(**stage_args)
    rgba = bytes(decoded['image'].pop('data'))
    assert (decoded['image']['width'], decoded['image']['height']) == (1290, 2796)
    assert len(rgba) == 14427360 and digest(rgba) == EXPECTED['rgba']
    assert all(alpha == 255 for alpha in rgba[3::4])
    rgba_binding = write('Lenard-5.full.rgba', rgba)
    decoder = decoded['provenance']['decoder']
    assert decoder['sourceMode'] == 'RGB' and decoder['outputMode'] == 'RGBA'
    from PIL import Image
    crop_bytes = (OLD / 'Lenard-5.inspection-crop.png').read_bytes()
    assert digest(crop_bytes) == EXPECTED['crop']
    with Image.open(HERE / 'Lenard-5.original.png') as image, Image.open(OLD / 'Lenard-5.inspection-crop.png') as crop:
        selected = image.crop((600, 650, 1200, 1050))
        assert crop.size == (600, 400) and crop.mode == selected.mode
        assert crop.tobytes() == selected.tobytes()
    crop_binding = write('Lenard-5.inspection-crop.png', crop_bytes)
    # Frozen predicate only, directly evaluated at every integer source center.
    # The integer expression is a second check; it never supplies mask values.
    mask = bytearray(1290 * 2796)
    u = protocol['geometry']['headingConstruction']['unitTangent']
    n = protocol['geometry']['headingConstruction']['positiveUnitNormal']
    assert u == [24 / math.sqrt(601), -5 / math.sqrt(601)]
    assert n == [5 / math.sqrt(601), 24 / math.sqrt(601)]
    disagreements = 0
    xs, ys = [], []
    for y in range(2796):
        dy = y - 906
        for x in range(1290):
            dx = x - 780
            s = dx * u[0] + dy * u[1]
            r = dx * n[0] + dy * n[1]
            floating = -3 <= s < 3 and -64 <= r < 64
            integer = abs(24 * dx - 5 * dy) <= 73 and abs(5 * dx + 24 * dy) <= 1568
            disagreements += floating != integer
            if floating:
                mask[y * 1290 + x] = 1
                xs.append(x)
                ys.append(y)
    assert disagreements == 0 and len(mask) == 3606840 and sum(mask) == 767
    assert digest(mask) == EXPECTED['mask']
    mask_binding = write('Lenard-5.primary-oriented-six-pixel-strip.mask.u8', mask)
    after = snapshot('after-stage')
    report = {
        'schema': 'cycle06-exact-input-attestation@1', 'job_id': 'E1501', 'worker': 'G1',
        'protocol': binding(PROTOCOL), 'sourceRef': EXPECTED['ref'], 'gitBlob': resolved,
        'sourcePng': binding(HERE / 'Lenard-5.original.png'), 'fullRgba': rgba_binding,
        'image': decoded['image'], 'provenance': decoded['provenance'],
        'strictDecoder': {'implementation': binding(STAGER), 'call': 'stage(**stage_args)', 'args': stage_args,
                          'fullDataArrayNotSerialized': True, 'allAppendedAlpha255': True},
        'mask': dict(mask_binding, ones=sum(mask), uniqueValues=sorted(set(mask)),
                     nonzeroBoundsInclusivePx=[min(xs), min(ys), max(xs), max(ys)],
                     predicate=protocol['masks']['primary-oriented-six-pixel-strip']['predicate'],
                     floatingVsIntegerDisagreements=disagreements, origin='regenerated frozen predicate, no CV'),
        'inspectionCrop': dict(crop_binding, sourceBoundsHalfOpenPx=[600, 650, 1200, 1050],
                               exactSourceCropPixels=True, measurementInput=False),
        'preservation': unchanged(before, after),
        'execution': {'cvCalls': 0, 'PATHCalls': 0, 'storeCalls': 0, 'productImports': 0,
                      'sourceEdits': 0, 'gitWrites': 0, 'nativeWrites': 0},
        'knownExposed': True, 'heldout': False, 'geometryScientificIdentity': 'UNKNOWN',
        'limitations': ['Content identity and decoder semantics only; no scientific or human acceptance.',
                        'Caller mask is synthetic visibility, not detected occlusion or physical gap.',
                        'Stored original full-frame coordinates preserved; crop is inspection only.',
                        'No network/remote-state readback; coordinator supplies remote context.',
                        'No measurement, producer, fit, contrast, loss, query or tuning occurred.'],
    }
    write_json('staging-attestation.json', report)
    print(json.dumps({'phase': 'staged', 'png': EXPECTED['png'], 'rgba': EXPECTED['rgba'],
                      'mask': EXPECTED['mask'], 'maskOnes': sum(mask), 'decoder': decoder}, indent=2))


def finalize():
    before = json.loads((HERE / 'snapshot.before.json').read_text())
    report = json.loads((HERE / 'staging-attestation.json').read_text())
    testimony = json.loads((HERE / 'visual-testimony.json').read_text())
    assert testimony['originalViewed'] and testimony['cropViewed']
    for artifact in [report['sourcePng'], report['fullRgba'], report['mask'], report['inspectionCrop']]:
        assert binding(Path(artifact['path'])) == {k: artifact[k] for k in ['path', 'bytes', 'sha256']}
    preservation = unchanged(before, snapshot('after-visual'))
    result = {
        'schema': 'capability-discovery-extraction-result@1', 'job_id': 'E1501', 'worker': 'G1',
        'outcome': 'confirmed_reuse',
        'summary': 'Confirmed exact frozen E1104 protocol and original Lenard5 Git/blob/PNG/full-RGBA identities; staged full original RGBA via unchanged strict Pillow decoder with no gamma/orientation transform; regenerated only the frozen six-pixel visibility predicate, exactly 3606840 binary bytes/767 ones with expected SHA256; independently inspected actual original and exact crop. Before/after tracked files, refs and prior inputs unchanged. No CV/PATH/store/product call or source/Git/native write; exposed same-course input, not heldout, scientific/human identity UNKNOWN.',
        'inputs': {'expected': EXPECTED, 'attestation': binding(HERE / 'staging-attestation.json')},
        'outputs': {key: report[key] for key in ['sourcePng', 'fullRgba', 'image', 'provenance', 'strictDecoder', 'mask', 'inspectionCrop']},
        'visualTestimony': binding(HERE / 'visual-testimony.json'),
        'preservation': preservation, 'execution': report['execution'],
        'commands': {'stage': str(HERE / 'commands.stage.json'), 'finalize': str(HERE / 'commands.finalize.json'),
                     'entry': 'PYTHONDONTWRITEBYTECODE=1 python3 ' + str(Path(__file__)) + ' --stage ; after actual view_image inspection and testimony, --finalize',
                     'rawStdoutAndStderrRetained': True, 'allRecordedCommandExits': 0},
        'preliminaryDiagnostics': [{'exit': 2, 'command': 'ls -l ' + str(HERE),
                                    'rawStdout': '', 'rawStderr': 'ls: cannot access ' + repr(str(HERE)) + ': No such file or directory\n',
                                    'meaning': 'Precreation discovery only; fresh assigned output directory did not yet exist. No attestation failure or data substitution.'}],
        'limitations': report['limitations'], 'knownExposed': True, 'heldout': False,
        'scientificAcceptance': 'UNKNOWN', 'humanAcceptance': 'UNKNOWN', 'promoted': False,
    }
    write_json('result.json', result)
    print(json.dumps({'job_id': 'E1501', 'worker': 'G1', 'outcome': result['outcome'],
                      'result': str(HERE / 'result.json'), 'preservation': preservation}, indent=2))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument('--stage', action='store_true')
    mode.add_argument('--finalize', action='store_true')
    args = parser.parse_args()
    PHASE = 'stage' if args.stage else 'finalize'
    assert HERE == Path('/workspace/scratch/8528bb251845/discovery-cycle06/G1/E1501')
    try:
        stage() if args.stage else finalize()
    finally:
        write_json('commands.' + PHASE + '.json', COMMANDS)
