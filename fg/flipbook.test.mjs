/**
 * The LABUI flipbook (fg/flipbook.mjs): three panes over a Frame stream.
 *   1. The composition tree groups frames stage -> FG -> [branch ·] tick ·
 *      calculation, carries FG status from records (all three sidecar
 *      shapes), and lists FGs that emitted no frame.
 *   2. The viewer: one canvas per drawn frame cropped to its drawn bounds,
 *      PNG crops in the viewer when nothing else is drawn, a caption with
 *      the crop window, Fit / Zoom 1:1.
 *   3. The inspector: one <section class="page"> per frame with parts,
 *      verdicts, ledgers and the receipt slice; the stream is embedded once
 *      (Frames JSON download) and the output is deterministic.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { framesJson, renderFlipbook } from './flipbook.mjs';

const frame = (over) => ({ fg: 'fg.s1.toy.materialize', branch: null, seq: 0, tick: null, calculation: 'fn.toy', title: 'toy', parts: [], verdicts: [], receipt: { checks: [] }, ...over });
const frames = [
  frame({ title: 'boxes', parts: [{ address: 'px.toy#bbox', kind: 'bbox', ref: null, sha256: 'a'.repeat(64), data: { boxes: [[100, 200, 10, 10, '#0']] } }, { address: 'px.toy#ledger', kind: 'ledger', ref: null, sha256: 'b'.repeat(64), data: { rows: [{ id: 1, ok: true }] } }], verdicts: [{ name: 'one', ok: true }, { name: 'two', ok: false }] }),
  frame({ fg: 'fg.s1.toy.other', seq: 0, tick: 'T1', calculation: 'fn.other', title: 'refs only', parts: [{ address: 's1.mask.rgba', kind: 'raster', ref: 'artifacts/s1/mask.rgba.bin', sha256: 'c'.repeat(64), data: null }, { address: 's1.n', kind: 'scalar', ref: null, sha256: 'd'.repeat(64), data: { value: 7, unit: 'px' } }] }),
  frame({ fg: 'cmp.fn.toy', title: 'crop', parts: [{ address: 'cmp.fn.toy.crop.0', kind: 'raster', ref: null, sha256: 'e'.repeat(64), data: { width: 2, height: 2, origin: [5, 6], png: 'iVBORw0KGgo=' } }], receipt: { legend: 'red: member bbox' } })
];
const records = { stage: 's1', order: ['fg.s1.toy.materialize', 'fg.s1.toy.other', 'fg.s1.toy.lane'], records: {
  'fg.s1.toy.materialize': { guarantee: 'fg.s1.toy.materialize', status: 'held', reason: null, guards: ['px.toy'], calls: ['fn.toy'] },
  'fg.s1.toy.other': { guarantee: 'fg.s1.toy.other', status: 'failed', reason: 'boom' },
  'fg.s1.toy.lane': { guarantee: 'fg.s1.toy.lane', status: 'dormant', reason: 'lane toy is OFF' }
} };

test('three LABUI panes, one inspector page and one viewer shot per frame', () => {
  const html = renderFlipbook(frames, { records, title: 'toy S1' });
  for (const h of ['01 / COMPOSITION', '02 / FRAME', '03 / INSPECT', 'LABUI_', 'Zoom 1:1', 'Frames JSON']) assert.ok(html.includes(h), h);
  assert.equal(html.match(/<section class="page"/g).length, frames.length);
  assert.equal(html.match(/<div class="shot"/g).length, frames.length);
  assert.equal(html.match(/<canvas data-frame=/g).length, 1, 'only the drawn frame gets a canvas');
  assert.equal(html.match(/<button type="button" class="leaf/g).length, frames.length, 'every frame is a tree leaf');
  assert.ok(html.includes('crop window (76, 176)–(110, 210) of 110 × 210'), 'caption names the padded crop window, clamped to the extent');
  assert.match(html, /<img class="crop"[^>]+src="data:image\/png;base64,iVBORw0KGgo="/);
  assert.ok(html.includes('window (5, 6)–(7, 8)'), 'png crop caption carries its origin');
  assert.ok(html.includes('red: member bbox'), 'receipt legend shown under the viewer');
  assert.ok(html.includes('artifacts/s1/mask.rgba.bin'), 'ref-only rasters are named');
  assert.ok(html.includes('<table>') && html.includes('<span class="bad">1 bad</span>'));
  assert.ok(!/<script[^>]+src=/.test(html) && !/<link[^>]+href=/.test(html), 'self-contained');
  assert.ok(/try \{[^}]*history\.replaceState/.test(html), 'history writes are guarded for srcdoc sandboxes');
});

test('tree: stage -> FG (with record status) -> tick · calculation; dormant FGs without frames still listed', () => {
  const html = renderFlipbook(frames, { records });
  assert.ok(html.includes('<span class="stage">S1</span>'));
  assert.match(html, /toy\.<wbr>materialize<\/span><span class="st st-held"/);
  assert.match(html, /toy\.<wbr>other<\/span><span class="st st-failed" title="boom"/);
  assert.match(html, /toy\.<wbr>lane<\/span><span class="st st-dormant"[^>]*>dormant<\/span><\/summary><div class="t-calc"><div class="calc-label muted">no frames · lane toy is OFF/);
  assert.ok(html.includes('T1 · fn.other'), 'tick · calculation group label');
  // fork-join sidecar shape: status per branch
  const fj = [frame({ fg: 'fg.s3.toy.m', branch: 'loose', title: 'a' }), frame({ fg: 'fg.s3.toy.m', branch: 'strict', title: 'b' })];
  const out = renderFlipbook(fj, { records: { branches: { loose: { error: null, records: { 'fg.s3.toy.m': { status: 'held' } } }, strict: { error: null, records: { 'fg.s3.toy.m': { status: 'failed' } } } } } });
  assert.ok(out.includes('<span class="stage">S3</span>'));
  assert.match(out, /toy\.<wbr>m<\/span><span class="st st-failed"/, 'FG status is the worst branch');
  assert.match(out, /loose · fn\.toy<span class="st st-held"/);
  assert.match(out, /strict · fn\.toy<span class="st st-failed"/);
});

test('backward compatible, deterministic, and the stream is embedded once as canonical JSON', () => {
  const a = renderFlipbook(frames), b = renderFlipbook(JSON.parse(framesJson(frames)));
  assert.equal(a, b);
  const embedded = a.match(/<script type="application\/json" id="fg-frames">([^<]*)<\/script>/)[1];
  assert.deepEqual(JSON.parse(embedded), JSON.parse(framesJson(frames)));
  assert.equal(renderFlipbook([]).match(/<section class="page"/g), null);
  const bg = renderFlipbook(frames, { background: { src: 'data:image/png;base64,AAAA', width: 300, height: 400, y: -4 } });
  assert.ok(bg.includes('of 300 × 396'), 'background extent bounds the crop');
});
