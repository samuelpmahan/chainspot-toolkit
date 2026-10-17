import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { renderBoard } from './render-board.mjs';

const sha = value => createHash('sha256').update(value).digest('hex');

test('writes a portable file with embedded source, receipts, crop canvas, and validated tee outlines', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'nctk-board-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, 'stage-output/early'), { recursive: true });
  await mkdir(path.join(root, 'stage-output/late'), { recursive: true });
  // A tiny local image payload is enough for testing the file embedding contract.
  const jpg = Buffer.from('native-image-bytes');
  await writeFile(path.join(root, 'course.jpg'), jpg);
  const early = { schema: 'early-test', source: { path: 'course.jpg', sha256: sha(jpg), widthPx: 10, heightPx: 12 },
    snapshot: { sha256: 'snap-1' }, stages: [{ id: 'S0', receipt: 'rowsRemoved: upper=1 lower=1\ncroppedPx: 10x10' }],
    experiments: { branches: { S0: { evidence: { topRowsRemoved: 1, bottomRowsRemoved: 1 } } } } };
  const geomPath = path.join(root, 'stage-output/late/geometry.json');
  const geomBytes = Buffer.from(JSON.stringify({ schema: 'nctk-late-source-geometry@1', sourceSha256: sha(jpg), s3SnapshotSha256: 'snap-1', frame: 'original-jpeg-pixels',
    baselineAxes: { visible: [{ detId: 'tee-a', corners: [[1, 2], [3, 2], [3, 4], [1, 4]], cornerSupport: [{ status: 'visible-observed' }, { status: 'visible-observed' }, { status: 'inferred' }, { status: 'inferred' }] }], recovered: [] }, refinedAxes: { visible: [], recovered: [] } }));
  await writeFile(geomPath, geomBytes);
  const late = { schema: 'nctk-late@1', s3SnapshotSha256: 'snap-1', s6: null,
    stages: [{ stageId: 'S4', evidenceFiles: [{ path: 'stage-output/late/geometry.json', sha256: sha(geomBytes) }] }] };
  await writeFile(path.join(root, 'stage-output/early/run.receipt.json'), JSON.stringify(early));
  await writeFile(path.join(root, 'stage-output/late/run.receipt.json'), JSON.stringify(late));
  const summary = { schema: 'nctk-stage-run@1', request: { sourcePath: 'course.jpg', until: 4, lanes: ['s4.openFrame'] },
    source: { path: 'course.jpg', sha256: sha(jpg), widthPx: 10, heightPx: 12 },
    early: { receiptPath: 'stage-output/early/run.receipt.json', snapshot: { sha256: 'snap-1' } },
    late: { receiptPath: 'stage-output/late/run.receipt.json' }, s7: null,
    stages: [{ stage: 'S0', source: 'native', summary: { crop: 'observed' }, acceptance: 'UNKNOWN' },
      { stage: 'S3', source: 'native', summary: { visibleTees: 1 }, acceptance: 'UNKNOWN' },
      { stage: 'S4', source: 'fresh S3 snapshot', summary: { candidates: 1 }, candidate: { benefit: 'test benefit', falsifier: 'test falsifier' }, acceptance: 'UNKNOWN' }],
    blockers: ['semantic fit UNKNOWN'], humanAcceptance: 'UNKNOWN', testimonyLimit: 'No semantic acceptance.' };
  await writeFile(path.join(root, 'stage-output/summary.json'), JSON.stringify(summary));
  const result = await renderBoard({ forkRoot: root });
  assert.equal(result.imageEmbedded, true);
  assert.equal(result.geometryLayers, 1);
  const html = await readFile(path.join(root, result.outPath), 'utf8');
  assert.match(html, /data:image\/jpeg;base64,/);
  assert.match(html, /Shared cropped-course canvas/);
  assert.match(html, /Expected benefit/);
  assert.match(html, /UNKNOWN/);
  assert.match(html, /node toolkit\.mjs run --recipe/);
  assert.match(html, /stage-output\/late\/geometry\.json/);
  assert.doesNotMatch(html, /fetch\s*\(|<img[^>]+src="(?:https?:|file:)/i);
});

test('does not draw geometry when its evidence hash or source binding fails', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'nctk-board-unverified-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, 'stage-output/early'), { recursive: true });
  await mkdir(path.join(root, 'stage-output/late'), { recursive: true });
  const jpg = Buffer.from('image'); await writeFile(path.join(root, 'course.jpg'), jpg);
  await writeFile(path.join(root, 'stage-output/early/run.receipt.json'), JSON.stringify({ source: { path: 'course.jpg', sha256: sha(jpg), widthPx: 3, heightPx: 4 }, snapshot: { sha256: 'snap' }, stages: [] }));
  const geometry = { sourceSha256: 'different-source', s3SnapshotSha256: 'snap', frame: 'original-jpeg-pixels', baselineAxes: { visible: [{ corners: [[0,0],[1,0],[1,1],[0,1]] }] } };
  await writeFile(path.join(root, 'stage-output/late/geometry.json'), JSON.stringify(geometry));
  await writeFile(path.join(root, 'stage-output/late/run.receipt.json'), JSON.stringify({ stages: [{ evidenceFiles: [{ path: 'stage-output/late/geometry.json', sha256: sha('wrong-hash') }] }] }));
  await writeFile(path.join(root, 'stage-output/summary.json'), JSON.stringify({ request: { sourcePath: 'course.jpg', until: 4, lanes: [] },
    source: { path: 'course.jpg', sha256: sha(jpg), widthPx: 3, heightPx: 4 }, early: { receiptPath: 'stage-output/early/run.receipt.json', snapshot: { sha256: 'snap' } }, late: { receiptPath: 'stage-output/late/run.receipt.json' },
    stages: [{ stage: 'S4' }], blockers: [], humanAcceptance: 'UNKNOWN' }));
  const result = await renderBoard({ forkRoot: root });
  assert.equal(result.geometryLayers, 0);
});

test('prefix S3 board ends its stage slider at the highest executed stage', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'nctk-board-prefix-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, 'stage-output'), { recursive: true });
  const jpg = Buffer.from('prefix-image-bytes');
  await writeFile(path.join(root, 'course.jpg'), jpg);
  await writeFile(path.join(root, 'stage-output/summary.json'), JSON.stringify({
    request: { sourcePath: 'course.jpg', until: 3, lanes: [] },
    source: { path: 'course.jpg', sha256: sha(jpg), widthPx: 4, heightPx: 5 },
    stages: ['S0', 'S1', 'S2', 'S3'].map(stage => ({ stage, acceptance: 'UNKNOWN' })),
    blockers: [], humanAcceptance: 'UNKNOWN',
  }));
  const rendered = await renderBoard({ forkRoot: root });
  const html = await readFile(path.join(root, rendered.outPath), 'utf8');
  assert.match(html, /id="stage-scrubber"[^>]*max="3" value="3"/);
  assert.doesNotMatch(html, /id="stage-scrubber"[^>]*max="7"/);
});
