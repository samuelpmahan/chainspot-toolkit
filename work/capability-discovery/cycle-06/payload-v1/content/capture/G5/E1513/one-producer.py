"""Outer one-shot provenance wrapper; stdlib only, never imports project code."""
import datetime
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import time

ROOT = Path('/workspace/scratch/8528bb251845')
HERE = ROOT / 'discovery-cycle06/G5/E1513'
LAB = ROOT / 'chainspot-discovery-lab'

def utc():
    return datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='microseconds').replace('+00:00', 'Z')

def binding(path):
    path = Path(path)
    data = path.read_bytes()
    return {'path': str(path), 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}

def load(path):
    return json.loads(Path(path).read_text())

def save_new(name, value):
    with (HERE / name).open('x') as file:
        json.dump(value, file, indent=2, ensure_ascii=True)
        file.write('\n')

def checked(path, expected, size=None):
    result = binding(path)
    if result['sha256'] != expected or (size is not None and result['bytes'] != size):
        raise RuntimeError('binding mismatch: ' + str(path))
    return result

def main():
    # No claim/log/output is reserved until every read-only guard passes.
    records = []
    exact = {
        'discovery-cycle06/root-source-admission.json': '6f3f30924749e0104a12e7d5d3d43b45b23569e55de8ffe565111620dd0355b8',
        'discovery-cycle06/V1/E1512/replay-policy.json': 'b146b7183e4aab0708792b7f72aa37790113ca8061f34c551ea590f24391027d',
        'discovery-cycle06/G5/E1510/manifest.v1.json': '4ae5f021bc3c9be8184cdb0627abdacabae9d7c8dcff88a12b404762843bbe9f',
        'discovery-cycle06/G5/E1510/prospective-command.v1.json': 'aee1eb7a3788f3392078584d038f45531a7db9410356b9be48a951b3d764302f',
        'discovery-cycle06/G5/E1510/source-bindings.v1.json': '33b341363a56a8ffe4e8fc3e7546358cfdf71aced520145fad07b6dbfbdafcad',
        'discovery-cycle06/E1513-root-producer-admission.json': '6c0d9a6567e01cfae4d5956614e108ab9e2ec85634d69e75dfbbc1f35b95a4a4',
        'discovery-cycle06/E1513-root-ambient-admission.json': '465e281fbaf108261239c0e084bb062098be2a0a90499b283a6ccff4de6c588d',
        'discovery-cycle06/E1513-root-ambient-addendum-recovery.json': '05a57ec694e1d480c29fa4d8a3e24c91be40a0633b1a514d94c989163b9838b8',
    }
    for path, digest in exact.items():
        records.append(checked(ROOT / path, digest))
    source = load(ROOT / 'discovery-cycle06/root-source-admission.json')
    if len(source['entries']) != 22:
        raise RuntimeError('source closure count mismatch')
    for entry in source['entries']:
        records.append(checked(LAB / entry['path'], entry['sha256'], entry['bytes']))
    for entry in source['independentReviews']:
        records.append(checked(ROOT / entry['path'], entry['sha256'], entry['bytes']))
    bindings = load(ROOT / 'discovery-cycle06/G5/E1510/source-bindings.v1.json')
    for key in ('newPresetFiles', 'acceptedOldStationFiles', 'ninePhysicalQueryClosure', 'stageFiles'):
        for entry in bindings[key]:
            records.append(checked(ROOT / entry['path'], entry['sha256'], entry.get('bytes')))
    for key in ('protocol', 'stagingImplementation', 'stagingAttestation', 'proposedClosureCompanion'):
        entry = bindings[key]
        records.append(checked(ROOT / entry['path'], entry['sha256'], entry.get('bytes')))
    ambient = load(ROOT / 'discovery-cycle06/E1513-root-ambient-admission.json')
    addendum_path = ROOT / 'discovery-cycle06/E1513-root-ambient-addendum-recovery.json'
    addendum = load(addendum_path)
    if addendum.get('job_id') != 'E1513' or addendum.get('admittedUnchanged') != {'NODE_USE_ENV_PROXY':'1', 'LC_CTYPE':'C.UTF-8'}:
        raise RuntimeError('ambient addendum mismatch')
    records.append(binding(addendum_path))
    allowed = {**ambient['observedNonempty'], **addendum['admittedUnchanged']}
    observed = {key: os.environ.get(key) for key in allowed}
    if observed != allowed or any(key in os.environ for key in ambient['observedUnset']):
        raise RuntimeError('ambient value/unset guard mismatch')
    relevant = {key: value for key, value in os.environ.items() if key.startswith(('NODE', 'LD_', 'LC_')) or key in ('TZ','LANG','OPENSSL_CONF')}
    if relevant != allowed:
        raise RuntimeError('unexpected relevant ambient key')
    node = shutil.which('node')
    if node != ambient['node']['path']:
        raise RuntimeError('runtime executable path mismatch')
    records.append(binding(node))
    command = load(ROOT / 'discovery-cycle06/G5/E1510/prospective-command.v1.json')
    if command['cwd'] != str(LAB) or command['argv'] != ['node', str(LAB / 'experiments/capability-discovery/lenard5-station-evidence/cli.mjs'), 'run', '--manifest', str(ROOT / 'discovery-cycle06/G5/E1510/manifest.v1.json'), '--out', str(ROOT / 'discovery-cycle06/G5/E1510/producer-v1')]:
        raise RuntimeError('exact argv/cwd mismatch')
    out = Path(command['outputDirectory'])
    stdout = Path(command['rawCapture']['stdout'])
    stderr = Path(command['rawCapture']['stderr'])
    for path in (out, stdout, stderr, HERE / 'one-invocation-token.json', HERE / 'outer-command.json'):
        if os.path.lexists(path):
            raise RuntimeError('preexisting invocation/output path: ' + str(path))
    evidence = {
        'schema':'cycle06-E1513-outer-command@1', 'job_id':'E1513', 'worker':'G5',
        'argv':command['argv'], 'cwd':command['cwd'], 'resolvedNode':node,
        'nodeVersionObservedBeforeProducer':'v24.19.0', 'nodeVersionAuthority':'read-only node --version observation preceding wrapper; no product import',
        'ambientNonsecret':relevant, 'environmentMutation':False,
        'guardedUTC':utc(), 'zeroAttemptGuard':{'outputAbsent':True,'stdoutAbsent':True,'stderrAbsent':True,'tokenAbsent':True},
        'guardBindings':records, 'wrapperBinding':binding(__file__),
        'actualProcessStartUTC':None, 'actualProcessEndUTC':None, 'pid':None, 'actualExitCode':None, 'actualSignal':None,
        'spawnCount':0, 'rawOutputs':[], 'error':None,
    }
    save_new('one-invocation-token.json', {'job_id':'E1513', 'worker':'G5', 'reservedUTC':utc(), 'maximumProducerInvocations':1, 'argv':command['argv']})
    try:
        with stdout.open('xb') as out_stream, stderr.open('xb') as err_stream:
            evidence['actualProcessStartUTC'] = utc()
            begin = time.monotonic()
            process = subprocess.Popen(command['argv'], cwd=command['cwd'], stdout=out_stream, stderr=err_stream)
            evidence['spawnCount'] = 1
            evidence['pid'] = process.pid
            code = process.wait()
            evidence['actualProcessEndUTC'] = utc()
            evidence['outerElapsedSeconds'] = time.monotonic() - begin
            evidence['actualExitCode'] = code if code >= 0 else None
            evidence['actualSignal'] = -code if code < 0 else None
    except BaseException as error:
        evidence['actualProcessEndUTC'] = utc()
        evidence['error'] = {'type':type(error).__name__, 'message':str(error)}
    finally:
        for path in (stdout, stderr, out / 'value-trace.json', out / 'timing-sidecar.json', out / 'artifact-manifest.json', out / 'cli-receipt.json'):
            evidence['rawOutputs'].append(binding(path) if path.is_file() else {'path':str(path), 'absent':True})
        save_new('outer-command.json', evidence)
    print(json.dumps({'job_id':'E1513', 'spawnCount':evidence['spawnCount'], 'actualExitCode':evidence['actualExitCode'], 'actualSignal':evidence['actualSignal'], 'error':evidence['error'], 'record':str(HERE / 'outer-command.json')}))

if __name__ == '__main__':
    main()
