"""E1521 proposed one-shot independent replay wrapper. Stdlib only; NOT_RUN.

No project/codec imports or output parsing. Root's separate admission digest is
mandatory at invocation; constructing this file is not replay authority.
"""
import datetime
import hashlib
import json
import os
from pathlib import Path
import shutil
import stat
import subprocess
import sys
import time

ROOT = Path('/workspace/scratch/8528bb251845')
HERE = ROOT / 'discovery-cycle06/V1/E1521'
LAB = ROOT / 'chainspot-discovery-lab'
MANIFEST = ROOT / 'discovery-cycle06/G5/E1510/manifest.v1.json'
COMMAND = HERE / 'prospective-command.v1.json'
ADMISSION = ROOT / 'discovery-cycle06/E1521-root-replay-admission.json'
OUT = HERE / 'replay-v1'
STDOUT = HERE / 'replay-v1.stdout.log'
STDERR = HERE / 'replay-v1.stderr.log'
TOKEN = HERE / 'one-invocation-token.json'
OUTER = HERE / 'outer-command.json'
NODE = '/opt/codex/runtimes/codex-primary-runtime/dependencies/node/bin/node'
ARGV = ['node', str(LAB / 'experiments/capability-discovery/lenard5-station-evidence/cli.mjs'),
        'run', '--manifest', str(MANIFEST), '--out', str(OUT)]


def utc():
    return datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='microseconds').replace('+00:00', 'Z')


def read_binding(path, expected=None, size=None, retain=False, cap=33554432):
    """Hash regular bounded bytes, retaining only explicitly requested metadata."""
    path = Path(path)
    fd = os.open(path, os.O_RDONLY | os.O_NONBLOCK)
    try:
        before = os.fstat(fd)
        if not stat.S_ISREG(before.st_mode) or before.st_size < 0 or before.st_size > cap:
            raise RuntimeError('regular bounded file required: ' + str(path))
        if size is not None and before.st_size != size:
            raise RuntimeError('byte length mismatch: ' + str(path))
        digest = hashlib.sha256()
        kept = bytearray() if retain else None
        total = 0
        while total < before.st_size:
            chunk = os.read(fd, min(65536, before.st_size - total))
            if not chunk:
                raise RuntimeError('file shortened: ' + str(path))
            digest.update(chunk)
            if retain:
                kept.extend(chunk)
            total += len(chunk)
        if os.read(fd, 1) or os.fstat(fd).st_size != before.st_size:
            raise RuntimeError('file changed length: ' + str(path))
        result = {'path': str(path), 'bytes': total, 'sha256': digest.hexdigest()}
        if expected is not None and result['sha256'] != expected:
            raise RuntimeError('SHA256 mismatch: ' + str(path))
        return result, bytes(kept) if retain else None
    finally:
        os.close(fd)


def checked(path, expected, size=None, records=None, parse=False, cap=33554432):
    result, raw = read_binding(path, expected, size, retain=parse, cap=cap)
    if records is not None:
        records.append(result)
    # Metadata is parsed only after its actual bytes/digest pass the binding.
    return json.loads(raw.decode('utf-8')) if parse else result


def save_new(path, value):
    with Path(path).open('x', encoding='utf-8', newline='\n') as stream:
        json.dump(value, stream, indent=2, ensure_ascii=True)
        stream.write('\n')


def main():
    if len(sys.argv) != 3 or sys.argv[1] != '--admission-sha256':
        raise RuntimeError('separate root admission digest required: --admission-sha256 HEX64')
    admission_digest = sys.argv[2]
    if len(admission_digest) != 64 or any(c not in '0123456789abcdef' for c in admission_digest):
        raise RuntimeError('invalid separate root admission digest')
    records = []
    admission = checked(ADMISSION, admission_digest, records=records, parse=True, cap=131072)
    if (admission.get('schema'), admission.get('job_id'), admission.get('worker'), admission.get('admitted'), admission.get('scope')) != (
            'cycle06-root-replay-admission@1', 'E1521', 'V1', True, 'ONE_FIXED160_REPLAY'):
        raise RuntimeError('separate replay admission mismatch')
    wrapper = admission['wrapper']
    if wrapper['path'] != str(HERE / 'one-replay.py') or str(Path(__file__).absolute()) != wrapper['path']:
        raise RuntimeError('wrapper path mismatch')
    wrapper_binding = checked(wrapper['path'], wrapper['sha256'], wrapper['bytes'], records)
    command_binding = admission['prospectiveCommand']
    if command_binding['path'] != str(COMMAND):
        raise RuntimeError('prospective command path mismatch')
    command = checked(COMMAND, command_binding['sha256'], command_binding['bytes'], records, parse=True, cap=131072)
    review = admission['comparatorReview']
    if review.get('decision') != 'accepted':
        raise RuntimeError('accepted independent comparator review required')
    checked(ROOT / review['path'], review['sha256'], review['bytes'], records)
    exact = {
        'discovery-cycle06/root-source-admission.json': '6f3f30924749e0104a12e7d5d3d43b45b23569e55de8ffe565111620dd0355b8',
        'discovery-cycle06/V1/E1512/replay-policy.json': 'b146b7183e4aab0708792b7f72aa37790113ca8061f34c551ea590f24391027d',
        'discovery-cycle06/G5/E1510/manifest.v1.json': '4ae5f021bc3c9be8184cdb0627abdacabae9d7c8dcff88a12b404762843bbe9f',
        'discovery-cycle06/G5/E1510/prospective-command.v1.json': 'aee1eb7a3788f3392078584d038f45531a7db9410356b9be48a951b3d764302f',
        'discovery-cycle06/G5/E1510/source-bindings.v1.json': '33b341363a56a8ffe4e8fc3e7546358cfdf71aced520145fad07b6dbfbdafcad',
        'discovery-cycle06/E1513-root-producer-admission.json': '6c0d9a6567e01cfae4d5956614e108ab9e2ec85634d69e75dfbbc1f35b95a4a4',
        'discovery-cycle06/E1513-root-ambient-admission.json': '465e281fbaf108261239c0e084bb062098be2a0a90499b283a6ccff4de6c588d',
        'discovery-cycle06/E1513-root-ambient-addendum-recovery.json': '05a57ec694e1d480c29fa4d8a3e24c91be40a0633b1a514d94c989163b9838b8',
        'discovery-cycle06/replay-source-shape-addendum.v1.json': '3537cdce221ab424672097ed6d8530afaf94128d66ddb3dc38a8d3490407232b',
        'discovery-cycle06/replay-source-shape-admission.v1.json': '8c6360ba697cebcd798b23deff6b1688cf2010eff1ee6036e452ca1bdde7f8ae',
        'discovery-cycle06/G5/E1513/one-producer.py': '840ccf87e9c9627be3faa041518e16d38f8225f4dd7f5c3c4003d3fdabf633e8',
        'discovery-cycle06/replay-runtime-current-readback.json': 'f630de362a143e4bcf550620f8cf24fec0bfea6bf6e9e411e86588cbdbd7a4bc',
    }
    documents = {}
    for path, digest in exact.items():
        documents[path] = checked(ROOT / path, digest, 367 if ROOT / path == MANIFEST else None,
                                  records, parse=path.endswith('.json'), cap=131072)
    source = documents['discovery-cycle06/root-source-admission.json']
    if len(source['entries']) != 22:
        raise RuntimeError('source closure count mismatch')
    for entry in source['entries']:
        checked(LAB / entry['path'], entry['sha256'], entry['bytes'], records)
    for entry in source['independentReviews']:
        checked(ROOT / entry['path'], entry['sha256'], entry['bytes'], records)
    bindings = documents['discovery-cycle06/G5/E1510/source-bindings.v1.json']
    for key in ('newPresetFiles', 'acceptedOldStationFiles', 'ninePhysicalQueryClosure', 'stageFiles'):
        for entry in bindings[key]:
            checked(ROOT / entry['path'], entry['sha256'], entry.get('bytes'), records)
    for key in ('protocol', 'stagingImplementation', 'stagingAttestation', 'proposedClosureCompanion'):
        entry = bindings[key]
        checked(ROOT / entry['path'], entry['sha256'], entry.get('bytes'), records)
    ambient = documents['discovery-cycle06/E1513-root-ambient-admission.json']
    addendum = documents['discovery-cycle06/E1513-root-ambient-addendum-recovery.json']
    if addendum.get('job_id') != 'E1513' or addendum.get('admittedUnchanged') != {'NODE_USE_ENV_PROXY': '1', 'LC_CTYPE': 'C.UTF-8'}:
        raise RuntimeError('original ambient addendum mismatch')
    allowed = {**ambient['observedNonempty'], **addendum['admittedUnchanged']}
    relevant = {key: value for key, value in os.environ.items()
                if key.startswith(('NODE', 'LD_', 'LC_')) or key in ('TZ', 'LANG', 'OPENSSL_CONF')}
    if relevant != allowed or any(key in os.environ for key in ambient['observedUnset']):
        raise RuntimeError('original relevant ambient/unset guard mismatch; do not clear or retry')
    node = shutil.which('node')
    runtime = admission['node']
    if node != NODE or ambient['node'] != {'path': NODE, 'version': 'v24.19.0'} or runtime['path'] != NODE or runtime['version'] != 'v24.19.0':
        raise RuntimeError('original configured runtime identity mismatch')
    if runtime.get('binaryHashAuthority') != 'CURRENT_REPLAY_READBACK_ONLY_NO_ORIGINAL_EXECUTABLE_HASH':
        raise RuntimeError('current-only executable readback authority required; original executable hash was not captured')
    readback = documents['discovery-cycle06/replay-runtime-current-readback.json']
    if readback['originalExecutableByteIdentity'] != 'NOT_ESTABLISHED' or any(runtime[key] != readback[key] for key in ('path', 'bytes', 'sha256')):
        raise RuntimeError('root current-only executable readback mismatch')
    node_binding = checked(node, runtime['sha256'], runtime['bytes'], records, cap=runtime['bytes'])
    original = documents['discovery-cycle06/G5/E1510/prospective-command.v1.json']
    original_argv = ARGV[:-1] + [str(ROOT / 'discovery-cycle06/G5/E1510/producer-v1')]
    if original['cwd'] != str(LAB) or original['argv'] != original_argv:
        raise RuntimeError('original fixed command provenance mismatch')
    if command['cwd'] != str(LAB) or command['argv'] != ARGV or command['outputDirectory'] != str(OUT):
        raise RuntimeError('replay argv/cwd/output mismatch; only original --out may differ')
    if command['rawCapture'] != {'stdout': str(STDOUT), 'stderr': str(STDERR)} or command['outerRecord'] != str(OUTER) or command['exclusiveToken'] != str(TOKEN):
        raise RuntimeError('fixed replay evidence path mismatch')
    for path in (OUT, STDOUT, STDERR, TOKEN, OUTER):
        if os.path.lexists(path):
            raise RuntimeError('preexisting replay output/invocation path: ' + str(path))
    # Every read-only guard precedes exclusive token reservation and sole Popen.
    evidence = {
        'schema': 'cycle06-E1521-outer-command@1', 'job_id': 'E1521', 'worker': 'V1',
        'argv': ARGV, 'cwd': str(LAB), 'resolvedNode': node, 'nodeVersion': 'v24.19.0',
        'nodeVersionAuthority': 'original recorded configured path/version plus separate root replay runtime testimony; no runtime probe subprocess',
        'nodeBinaryHashAuthority': 'CURRENT_REPLAY_READBACK_ONLY_NO_ORIGINAL_EXECUTABLE_HASH; not cross-run executable identity',
        'nodeBinding': node_binding, 'ambientNonsecret': relevant, 'environmentMutation': False,
        'guardedUTC': utc(), 'guardBindings': records, 'wrapperBinding': wrapper_binding,
        'zeroAttemptGuard': {'outputAbsent': True, 'stdoutAbsent': True, 'stderrAbsent': True, 'tokenAbsent': True, 'outerRecordAbsent': True},
        'actualProcessStartUTC': None, 'actualProcessEndUTC': None, 'pid': None,
        'actualExitCode': None, 'actualSignal': None, 'spawnCount': 0, 'outerElapsedSeconds': None,
        'rawOutputs': [], 'outputParsing': 'NOT_RUN; raw bytes hash-bound only', 'error': None,
    }
    save_new(TOKEN, {'job_id': 'E1521', 'worker': 'V1', 'reservedUTC': utc(), 'maximumReplayInvocations': 1,
                     'argv': ARGV, 'rootAdmissionSha256': admission_digest, 'wrapperBinding': wrapper_binding})
    process = None
    try:
        with STDOUT.open('xb') as out_stream, STDERR.open('xb') as err_stream:
            evidence['actualProcessStartUTC'] = utc()
            begin = time.monotonic()
            # Inherit the unchanged original ambient environment. No env=,
            # shell, preload, inspector, warmup or alternate product command.
            process = subprocess.Popen(ARGV, cwd=str(LAB), stdout=out_stream, stderr=err_stream)
            evidence['spawnCount'] = 1
            evidence['pid'] = process.pid
            code = process.wait()
            evidence['actualProcessEndUTC'] = utc()
            evidence['outerElapsedSeconds'] = time.monotonic() - begin
            evidence['actualExitCode'] = code if code >= 0 else None
            evidence['actualSignal'] = -code if code < 0 else None
    except BaseException as error:
        evidence['error'] = {'type': type(error).__name__, 'message': str(error)}
        if process is None:
            evidence['actualProcessEndUTC'] = utc()
        # Do not claim a terminated child if an interrupted wait leaves it live.
    finally:
        for path in (STDOUT, STDERR, OUT / 'value-trace.json', OUT / 'timing-sidecar.json', OUT / 'artifact-manifest.json', OUT / 'cli-receipt.json'):
            try:
                if os.path.lexists(path):
                    raw_binding, _ = read_binding(path)
                    evidence['rawOutputs'].append(raw_binding)
                else:
                    evidence['rawOutputs'].append({'path': str(path), 'absent': True})
            except BaseException as error:
                evidence['rawOutputs'].append({'path': str(path), 'bindingError': {'type': type(error).__name__, 'message': str(error)}})
        save_new(OUTER, evidence)
    print(json.dumps({'job_id': 'E1521', 'spawnCount': evidence['spawnCount'], 'actualExitCode': evidence['actualExitCode'],
                      'actualSignal': evidence['actualSignal'], 'error': evidence['error'], 'record': str(OUTER)}))
    raw_bindings_complete = all('sha256' in entry for entry in evidence['rawOutputs'])
    return 0 if evidence['actualExitCode'] == 0 and evidence['error'] is None and raw_bindings_complete else 1


if __name__ == '__main__':
    sys.exit(main())
