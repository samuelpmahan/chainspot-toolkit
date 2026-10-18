#!/usr/bin/env python3
"""One bounded R1501 input-identity review; writes only beside this script."""
import contextlib
import hashlib
import importlib.util
import io
import json
import math
import os
from pathlib import Path
import subprocess
import sys

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
REPO = ROOT / 'chainspot-discovery-lab'
G1 = ROOT / 'discovery-cycle06/G1/E1501'
PROTOCOL = REPO / 'work/capability-discovery/cycle-05/capture/final/F2/E1104/protocol-proposal.json'
STAGER = REPO / 'experiments/capability-discovery/source-pixels/stage-png.py'
ENV = dict(os.environ, GIT_OPTIONAL_LOCKS='0', PYTHONDONTWRITEBYTECODE='1')
COMMANDS = []
EXPECTED = {
    'result': 'c4387714aadd05bec26ef99e5647be37085872a2d1fa57e3cf6bd2c0c1d4ff65',
    'attestation': '9f1cb90eed3c74214c9a03029730ea1ab487c48bd86b89cbe3a701eebe923ef1',
    'protocol': 'cb4d757f36ffe6721e71541d6093a48cc11e081bd10c1684746aad8249973829',
    'stager': 'e194f56e2899f516bb79dd8d6c5e4b876440d6f0932bf9d74e0a56c117f06a44',
    'png': '30fa01879840deb0584ffe001fa39779998710010faeae93510dbc7a8a0abe6e',
    'rgba': '4379abb30a5b0907aa0e1435b13e19eafe8fdd31ac57c9b8bdff4495a14fdc2a',
    'mask': '305285b7e2bc9d44dfd572caa8d39030ed1b0c2254c15967fbb9b7bff7fae609',
    'crop': 'fecfff14beff8dcfb42203f2b2c1fabaef2e52374815274c8e1830d5b813cc84',
}


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def save(name, raw):
    target = HERE / name
    assert target.parent == HERE and target.resolve().parent == HERE
    with target.open('xb') as output:
        output.write(raw)
    return {'path': str(target), 'bytes': len(raw), 'sha256': sha(raw)}


def save_json(name, value):
    return save(name, (json.dumps(value, indent=2) + '\n').encode())


def binding(path):
    raw = path.read_bytes()
    return {'path': str(path), 'bytes': len(raw), 'sha256': sha(raw)}


def git_read(args):
    proc = subprocess.run(['git', *args], cwd=REPO, env=ENV, capture_output=True)
    number = len(COMMANDS) + 1
    record = {'argv': ['git', *args], 'cwd': str(REPO),
              'environmentOverrides': {'GIT_OPTIONAL_LOCKS': '0', 'PYTHONDONTWRITEBYTECODE': '1'},
              'exit': proc.returncode,
              'rawStdout': save(f'git-{number:02}.stdout', proc.stdout),
              'rawStderr': save(f'git-{number:02}.stderr', proc.stderr)}
    COMMANDS.append(record)
    assert proc.returncode == 0, record
    return proc.stdout


def review():
    assert HERE == Path('/workspace/scratch/8528bb251845/discovery-cycle06/G2/R1501')
    subject = json.loads((G1 / 'result.json').read_text())
    attestation = json.loads((G1 / 'staging-attestation.json').read_text())
    protocol = json.loads(PROTOCOL.read_text())
    checked = {}
    targets = [('result', G1 / 'result.json'), ('attestation', G1 / 'staging-attestation.json'),
               ('protocol', PROTOCOL), ('stager', STAGER),
               ('png', G1 / 'Lenard-5.original.png'), ('rgba', G1 / 'Lenard-5.full.rgba'),
               ('mask', G1 / 'Lenard-5.primary-oriented-six-pixel-strip.mask.u8'),
               ('crop', G1 / 'Lenard-5.inspection-crop.png')]
    for key, path in targets:
        checked[key] = binding(path)
        assert checked[key]['sha256'] == EXPECTED[key], key
    assert subject['inputs']['attestation'] == checked['attestation']
    for key, name in [('sourcePng', 'png'), ('fullRgba', 'rgba'), ('mask', 'mask'), ('inspectionCrop', 'crop')]:
        for field in ['path', 'bytes', 'sha256']:
            assert subject['outputs'][key][field] == checked[name][field]
            assert attestation[key][field] == checked[name][field]
    assert attestation['protocol'] == checked['protocol']
    assert attestation['strictDecoder']['implementation'] == checked['stager']
    assert protocol['source']['gitBlob'] == '78a4345489a5544640859127cd79f5a06bf9f21b'
    assert protocol['source']['ref'] == '49255331791b1245cf0f9cd699816175f94e70f2'

    raw_bindings = []
    for log_name in ['commands.stage.json', 'commands.finalize.json']:
        log = json.loads((G1 / log_name).read_text())
        for item in log:
            assert item['exit'] == 0
            assert item['cwd'] == str(REPO)
            for field in ['rawStdout', 'rawStderr']:
                actual = binding(Path(item[field]['path']))
                assert actual == item[field]
                raw_bindings.append(actual)
            assert item['rawStderr']['bytes'] == 0
        checked[log_name] = binding(G1 / log_name)
    checked['stagingScript'] = binding(G1 / 'attest-input.py')
    checked['visualTestimony'] = binding(G1 / 'visual-testimony.json')
    assert checked['visualTestimony'] == subject['visualTestimony']
    snapshots = [json.loads((G1 / f'snapshot.{label}.json').read_text())
                 for label in ['before', 'after-stage', 'after-visual']]
    preservation_keys = ['head', 'tree', 'refsRaw', 'statusRaw', 'trackedFileCount', 'trackedFiles', 'externalInputs']
    assert snapshots[0]['trackedFileCount'] == 2523
    for snapshot in snapshots[1:]:
        assert all(snapshot[k] == snapshots[0][k] for k in preservation_keys)
    for label in ['before', 'after-stage', 'after-visual']:
        checked[f'snapshot.{label}'] = binding(G1 / f'snapshot.{label}.json')

    git_before = {'refs': git_read(['show-ref']).decode(),
                  'headTree': git_read(['rev-parse', 'HEAD', 'HEAD^{tree}']).decode(),
                  'status': git_read(['status', '--porcelain=v1', '--untracked-files=all']).decode()}
    relation = protocol['source']['ref'] + ':' + protocol['source']['path']
    resolved = git_read(['rev-parse', relation]).decode().strip()
    assert resolved == protocol['source']['gitBlob']
    assert git_read(['cat-file', '-t', resolved]) == b'blob\n'
    blob = git_read(['cat-file', 'blob', resolved])
    png = (G1 / 'Lenard-5.original.png').read_bytes()
    assert blob == png and sha(blob) == EXPECTED['png']
    computed_blob = hashlib.sha1(b'blob ' + str(len(png)).encode() + b'\0' + png).hexdigest()
    assert computed_blob == resolved
    assert png == (ROOT / 'discovery-cycle05/F2/E1104/Lenard-5.original.png').read_bytes()
    assert (G1 / 'Lenard-5.inspection-crop.png').read_bytes() == (ROOT / 'discovery-cycle05/F2/E1104/Lenard-5.inspection-crop.png').read_bytes()
    assert PROTOCOL.read_bytes() == (ROOT / 'discovery-cycle05/F2/E1104/protocol-proposal.json').read_bytes()

    # Exactly one permitted invocation of the unchanged strict stage function.
    assert binding(STAGER)['sha256'] == EXPECTED['stager']
    spec = importlib.util.spec_from_file_location('strict_stage_png_R1501', STAGER)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    stage_args = {'path': str(G1 / 'Lenard-5.original.png'), 'expected_sha256': EXPECTED['png'],
                  'image_id': 'Lenard-5', 'frame': 'Lenard-5.original-source-pixel-centers'}
    stage_stdout, stage_stderr = io.StringIO(), io.StringIO()
    with contextlib.redirect_stdout(stage_stdout), contextlib.redirect_stderr(stage_stderr):
        decoded = module.stage(**stage_args)
    decoded_bytes = bytes(decoded['image'].pop('data'))
    assert decoded['image'] == {'width': 1290, 'height': 2796, 'frame': stage_args['frame']}
    assert len(decoded_bytes) == 14427360 and sha(decoded_bytes) == EXPECTED['rgba']
    assert decoded_bytes == (G1 / 'Lenard-5.full.rgba').read_bytes()
    assert all(x == 255 for x in decoded_bytes[3::4])
    assert decoded['provenance'] == attestation['provenance']
    actual_decoder = decoded['provenance']['decoder']
    expected_decoder = protocol['source']['decoder']
    for field in ['name', 'version', 'sourceMode', 'outputMode', 'orientation', 'colorTransform']:
        assert actual_decoder[field] == expected_decoder[field]
    assert actual_decoder['alpha'] == 'preserved RGBA; RGB appends 255'
    assert expected_decoder['alpha'] == 'RGB appends 255; existing RGBA alpha preserved'
    assert binding(STAGER)['sha256'] == EXPECTED['stager']

    # Check the frozen visibility predicate only; never sample the image.
    mask = (G1 / 'Lenard-5.primary-oriented-six-pixel-strip.mask.u8').read_bytes()
    assert len(mask) == 1290 * 2796 and set(mask) == {0, 1}
    u = (24 / math.sqrt(601), -5 / math.sqrt(601))
    n = (5 / math.sqrt(601), 24 / math.sqrt(601))
    assert list(u) == protocol['geometry']['headingConstruction']['unitTangent']
    assert list(n) == protocol['geometry']['headingConstruction']['positiveUnitNormal']
    regenerated = bytearray(len(mask))
    floating_integer_disagreements = 0
    xs, ys = [], []
    for index, actual in enumerate(mask):
        y, x = divmod(index, 1290)
        dx, dy = x - 780, y - 906
        floating = -3 <= dx * u[0] + dy * u[1] < 3 and -64 <= dx * n[0] + dy * n[1] < 64
        integer = abs(24 * dx - 5 * dy) <= 73 and abs(5 * dx + 24 * dy) <= 1568
        floating_integer_disagreements += floating != integer
        regenerated[index] = int(floating)
        if actual:
            xs.append(x)
            ys.append(y)
    assert floating_integer_disagreements == 0
    assert regenerated == mask and sha(regenerated) == EXPECTED['mask']
    assert sum(mask) == 767
    mask_bounds = [min(xs), min(ys), max(xs), max(ys)]
    assert mask_bounds == [765, 843, 795, 969]

    # Recheck exact admitted subjects after the work, without changing them.
    for key, path in targets:
        assert binding(path) == checked[key], key
    git_after = {'refs': git_read(['show-ref']).decode(),
                 'headTree': git_read(['rev-parse', 'HEAD', 'HEAD^{tree}']).decode(),
                 'status': git_read(['status', '--porcelain=v1', '--untracked-files=all']).decode()}
    assert git_before == git_after
    report = {
        'schema': 'cycle06-independent-input-review@1', 'job_id': 'R1501', 'worker': 'G2',
        'checks': 'all passed', 'bindings': checked,
        'gitObjectRelation': {'refPath': relation, 'resolvedBlob': resolved, 'contentSha1WithGitHeader': computed_blob,
                              'blobPngExactByteEquality': True, 'blobBytes': len(blob), 'blobSha256': sha(blob)},
        'g1CommandReceipts': {'commands': 15, 'rawArtifactBindingsVerified': len(raw_bindings),
                              'allRecordedExits': 0, 'allRawStderrEmpty': True,
                              'rawBindings': raw_bindings,
                              'historicalNote': 'G1 preliminary exit2 directory-discovery diagnostic is explicitly retained in result.json, outside the 15 successful subprocess commands.'},
        'strictStageReproduction': {'invocations': 1, 'args': stage_args, 'image': decoded['image'],
                                   'provenance': decoded['provenance'], 'rgbaBytes': len(decoded_bytes),
                                   'rgbaSha256': sha(decoded_bytes), 'exactEqualityWithG1FullRgba': True,
                                   'allAlpha255': True, 'stdout': save('strict-stage.stdout', stage_stdout.getvalue().encode()),
                                   'stderr': save('strict-stage.stderr', stage_stderr.getvalue().encode()),
                                   'alphaMetadataTextDifference': 'Same semantic decoder declaration; protocol says RGB appends255; existing RGBA alpha preserved, actual strict stager says preserved RGBA; RGB appends255. No pixel/behavior difference.'},
        'maskReproduction': {'generatedInMemoryOnly': True, 'bytes': len(mask), 'sha256': sha(regenerated),
                             'exactEqualityWithG1Mask': True, 'ones': sum(mask), 'uniqueValues': sorted(set(mask)),
                             'boundsInclusivePx': mask_bounds, 'floatingVsIntegerDisagreements': floating_integer_disagreements},
        'crop': {'pngIdentityChecked': True, 'exactEqualityWithOriginalLab5CropPng': True,
                 'redecodedOrVisuallyInspectedHere': False,
                 'claim': 'G1 crop-pixel/visual testimony remains attributed; reviewer independently verifies encoded crop identity, not new visual calibration. Crop remains inspection only.'},
        'preservation': {'g1ThreeStoredSnapshotsAgree': True, 'g1TrackedCount': 2523,
                         'currentGitBefore': git_before, 'currentGitAfter': git_after, 'currentGitUnchanged': True,
                         'allReviewedSubjectBindingsUnchanged': True,
                         'all2523CurrentFilesRehashedHere': False},
        'execution': {'strictDecoderImports': 1, 'strictStageCalls': 1, 'imageDecodes': 1,
                      'fixedMaskRegenerationsInMemory': 1, 'cvCalls': 0, 'PATHCalls': 0,
                      'vendorImports': 0, 'storeImports': 0, 'tests': 0, 'sourceEdits': 0,
                      'gitWrites': 0, 'nativeWrites': 0, 'remoteActions': 0},
        'commands': COMMANDS,
    }
    report_binding = save_json('verification.json', report)
    print(json.dumps({'job_id': 'R1501', 'checks': 'all passed', 'verification': report_binding,
                      'strictStageInvocations': 1, 'rgbaSha256': sha(decoded_bytes), 'maskSha256': sha(regenerated)}))


if __name__ == '__main__':
    if sys.argv[1:] == ['--inner']:
        try:
            review()
        finally:
            save_json('git-commands.json', COMMANDS)
    else:
        assert len(sys.argv) == 1
        proc = subprocess.run([sys.executable, str(Path(__file__).resolve()), '--inner'], env=ENV, capture_output=True)
        command = {'argv': [sys.executable, str(Path(__file__).resolve()), '--inner'], 'cwd': str(Path.cwd()),
                   'environmentOverrides': {'GIT_OPTIONAL_LOCKS': '0', 'PYTHONDONTWRITEBYTECODE': '1'},
                   'exit': proc.returncode, 'rawStdout': save('review.stdout', proc.stdout),
                   'rawStderr': save('review.stderr', proc.stderr)}
        save_json('command.json', command)
        print(json.dumps(command))
        sys.exit(proc.returncode)
