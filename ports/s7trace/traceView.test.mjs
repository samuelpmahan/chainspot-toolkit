import { test } from 'node:test';
import assert from 'node:assert/strict';
import { routeMatchViewOf, TRACE_VIEW, TRACE_VIEW_SCHEMA } from './traceView.mjs';
import { renderValue, partKind } from '../../fg/render.mjs';
import { loadHolePaths } from './holePaths.mjs';

/** One hole bent at (150, 100) (Sam), one with no testimony; our hole 1 route bends 40 px short before the placement and on it after. */
const W = 30, holesPart = { holes: [{ hole: '1', tee: { teeCenter: [20, 100] } }, { hole: '2', tee: { teeCenter: [20, 30] } }] };
const solve = { holes: {
  1: { verts: [[30, 100], [148, 101], [230, 60]], bendsRefined: { taken: true, before: [[110, 100]] } },
  2: { verts: [[30, 30], [200, 30]], bendsRefined: { taken: false, before: [] } } } };
const holePaths = { path: 'fixture', holes: [{ hole: '1', tee: [22, 100], basket: [231, 60], bends: [[150, 100]], corridorWidthPx: null }] };

test('the view: per hole the bends before and after, the agreement (tee 8 px, basket 12 px, corridor W / 2) and the offsets', () => {
  const v = routeMatchViewOf({ solve, holesPart, holePaths, widthPx: W }), r = v.rows[0];
  assert.equal(v.schema, TRACE_VIEW_SCHEMA);
  assert.deepEqual(r.before, [[110, 100]]); assert.deepEqual(r.after, [[148, 101]]);
  assert.equal(r.judged, true); assert.equal(r.teeOk, true); assert.equal(r.agree, true);
  assert.ok(Math.abs(r.bendOffBeforePx[0] - 40) < 1e-9 && r.bendOffAfterPx[0] < 3, JSON.stringify([r.bendOffBeforePx, r.bendOffAfterPx]));
  assert.equal(v.rows[1].judged, false); assert.equal(v.rows[1].agree, null);
  assert.deepEqual([v.totals.judged, v.totals.agree, v.totals.bendsHitBefore, v.totals.bendsHitAfter], [1, 1, 0, 1]);   // the 40 px-off bend is a miss before, a hit after
  assert.ok(v.totals.bendOffsetMedianBeforePx > 30 && v.totals.bendOffsetMedianAfterPx < 3);
});

test('a tee mark farther than 8 px, a basket farther than 12 px, or a route outside W / 2 of the corridor disagrees', () => {
  const far = (patch) => routeMatchViewOf({ solve, holesPart, holePaths: { path: 'f', holes: [{ ...holePaths.holes[0], ...patch }] }, widthPx: W }).rows[0];
  assert.equal(far({ tee: [22 + TRACE_VIEW.teeMatchPx + 1, 100] }).agree, false);
  assert.equal(far({ basket: [231 + TRACE_VIEW.basketMatchPx + 1, 60] }).agree, false);
  assert.equal(far({ bends: [[150, 100 + W]] }).agree, false);
});

test('an old-schema hole (no bend points) is judged on its corridor centreline and reports no bend offsets', () => {
  const p = { hole: '1', tee: [22, 100], basket: [231, 60], bends: null, centre: [[22, 100], [150, 100], [231, 60]] };
  const v = routeMatchViewOf({ solve, holesPart, holePaths: { path: 'f', holes: [p] }, widthPx: W });
  assert.equal(v.rows[0].judged, true); assert.equal(v.rows[0].bendsKnown, false); assert.equal(v.rows[0].bendOffAfterPx, undefined); assert.equal(v.totals.bendsSam, 0);
});

test('alex corridor centre (testimony corridorOf): left and right polylines stored in opposite directions pair up end to end', () => {
  const alex = loadHolePaths('alex');
  for (const h of alex.holes) {
    const [a, b] = [h.tee, h.basket], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    for (const q of h.centre) {   // a mispaired (flipped) right polyline puts midpoints far off the tee -> basket chord
      const t = ((q[0] - a[0]) * (b[0] - a[0]) + (q[1] - a[1]) * (b[1] - a[1])) / (L * L);
      assert.ok(t > -0.05 && t < 1.05 && Math.hypot(q[0] - a[0] - t * (b[0] - a[0]), q[1] - a[1] - t * (b[1] - a[1])) < 150, `hole ${h.hole} centre point ${q}`);
    }
  }
});

test('the view renders through the default render: one raster with the legend, bends before hollow and after filled', () => {
  const IW = 260, IH = 140, rgba = new Uint8Array(IW * IH * 4).fill(90);
  const v = routeMatchViewOf({ solve, holesPart, holePaths, widthPx: W });
  assert.equal(partKind(v), 'routeMatchView');
  const r = renderValue('tk.s7.routeMatchView', v, { widthPx: IW, heightPx: IH, rgba });
  assert.equal(r.kind, 'routeMatchView');
  const png = r.parts.find((p) => p.kind === 'raster');
  assert.equal(png.data.width, IW * 2); assert.ok(png.data.headerBandPx > 0 && png.data.height === IH * 2 + png.data.headerBandPx);   // the legend is a header band above the map, never over it
   assert.ok(png.data.png.length > 1000);
  assert.ok(r.parts.some((p) => p.address.endsWith('#legend')) && r.parts.some((p) => p.address.endsWith('#holes')));
  assert.equal(renderValue('x', v, null).parts[0].kind, 'ledger');   // an image-free store records the condition, never throws
});
