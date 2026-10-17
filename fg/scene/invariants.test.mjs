import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SCOPE, SCREEN_PX, RING_RATIO, PAD_MODEL, padFromScale, scaleFromPad, regimeOf, orient } from './invariants.mjs';

const LEDGER = JSON.parse(readFileSync(join(import.meta.dirname, '..', '..', 'docs', 'evidence', 'ledger', 'ledger.json'), 'utf8'));
const entry = (q) => LEDGER.entries.find((e) => e.quantity === q);
const IMAGES = Object.keys(LEDGER.images);
const R1 = entry('C1S radius R1 (10 m)').perImage;

test('every GLOBAL claim in the ledger has full-course AND zoomed evidence', () => {
  for (const e of LEDGER.entries.filter((x) => x.scope === SCOPE.GLOBAL)) {
    assert.ok(e.imagesFull.length >= 1 && e.imagesZoom.length >= 1, `${e.quantity}: GLOBAL without both scales`);
  }
  assert.ok(Object.values(LEDGER.images).includes('full') && Object.values(LEDGER.images).includes('zoom'));
});

test('screen-px sprites and the ring ratio match the ledger on every image', () => {
  assert.deepEqual(entry('basket sprite size').value, SCREEN_PX.basketSprite);
  for (const v of Object.values(entry('C2D radius / C1S radius').perImage)) assert.ok(Math.abs(v - RING_RATIO) <= 0.05, `R2/R1 ${v}`);
});

test('pad model: predicted from R1 within its residual on all 11 images; R1 recovered from the pad within 0.75 px', () => {
  const L = entry('pad length').perImage, W = entry('pad width').perImage, ROUND = 0.01;   // px: coefficients carry 3-4 decimals
  assert.deepEqual([PAD_MODEL.lengthPx, PAD_MODEL.widthPx, PAD_MODEL.maxResidualPx], [LEDGER.padModel.lengthPx, LEDGER.padModel.widthPx, LEDGER.padModel.maxResidualPx], 'PAD_MODEL is the ledger fit');
  for (const n of IMAGES) {
    const p = padFromScale(R1[n]);
    assert.ok(Math.abs(p.lengthPx - L[n]) <= PAD_MODEL.maxResidualPx[0] + ROUND, `${n} length ${p.lengthPx} vs ${L[n]}`);
    assert.ok(Math.abs(p.widthPx - W[n]) <= PAD_MODEL.maxResidualPx[1] + ROUND, `${n} width ${p.widthPx} vs ${W[n]}`);
    const s = scaleFromPad({ lengthPx: L[n], widthPx: W[n] });
    assert.ok(Math.abs(s.r1Px - R1[n]) <= 0.75, `${n}: R1 from pads ${s.r1Px} vs rings ${R1[n]}`);
  }
});

test('regime: scale, hallway width and dash count agree on every image', () => {
  const hw = entry('hallway width').perImage, rg = entry('hallway width / R1, dashes per C2 circle (regime)').perImage;
  for (const n of IMAGES) {
    const o = regimeOf({ r1Px: R1[n], hallwayPx: hw[n], dashesPerC2: rg[n].dashesPerC2 });
    assert.notEqual(o.regime, 'unresolved', `${n}: ${JSON.stringify(o.votes)}`);
    assert.equal(o.regime, LEDGER.images[n] === 'zoom' || R1[n] >= 36 ? 'fine' : 'coarse', n);
  }
  // full Lenard and its zoomed views sit in different regimes: the regime follows scale, not the course
  assert.equal(regimeOf({ r1Px: R1.lenard }).regime, 'coarse');
  assert.equal(regimeOf({ r1Px: R1.lenard1 }).regime, 'fine');
  assert.equal(regimeOf({ r1Px: 31 }).regime, 'unresolved', 'between the observed ranges nothing is assumed');
});

test('orient: blind prediction of the hallway width brackets the measured width', () => {
  const hw = entry('hallway width').perImage, L = entry('pad length').perImage, W = entry('pad width').perImage;
  for (const n of IMAGES) {
    const o = orient({ ringR1Px: R1[n], padTemplate: { lengthPx: L[n], widthPx: W[n] } });
    assert.equal(o.scaleAgrees, true, n);
    const [lo, hi] = o.predicted.hallwayPx;
    assert.ok(hw[n] >= lo - 0.5 && hw[n] <= hi + 0.5, `${n}: hallway ${hw[n]} px outside predicted [${lo}, ${hi}]`);
  }
});
