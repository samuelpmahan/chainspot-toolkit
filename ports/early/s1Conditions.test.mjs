import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyFeatureKnobs, noBadgesOf, NoBadgesCondition, S1_ROUND_VIEW_PLATE_KNOBS } from './earlyStore.mjs';

const FINDPX = "PxC: Tick 'Badge.findPx' access contradicts its declaration; missing reads=[px.badges.stage, px.components] extra reads=[] missing writes=[] extra writes=[].";
const board = (reads) => ({ has: (a) => a === 'badges', get: () => reads });

test('an empty badge read set is recorded as a no-badges condition, anything else still throws', () => {
  const c = noBadgesOf(new Error(FINDPX), board([]));
  assert.ok(c instanceof NoBadgesCondition); assert.deepEqual([c.condition.stage, c.condition.result], ['S1', 'no badges']);
  assert.equal(noBadgesOf(new Error(FINDPX), board([{ label: '1' }])), null, 'with a badge read the same error is a real failure');
  assert.equal(noBadgesOf(new Error(FINDPX.replace('px.components', 'px.other')), board([])), null, 'another access mismatch is a real failure');
  assert.equal(noBadgesOf(new Error('boom'), board([])), null);
});

test('lane knobs apply to the named features only, while the gateway runs, and are restored', () => {
  const ctx = { resolve(feature) { return { enabled: true, knobs: { ...feature.defaults } }; } };
  const hsv = { id: 'hsv', defaults: { darkVMax: 45, brightVMin: 210 } }, badges = { id: 'badges', defaults: { plateFillMin: 0.55, plateMinWidth: 34 } }, other = { id: 'basket', defaults: { x: 1 } };
  const restore = applyFeatureKnobs(ctx, S1_ROUND_VIEW_PLATE_KNOBS);
  assert.deepEqual(ctx.resolve(hsv).knobs, { darkVMax: 65, brightVMin: 210 }); assert.deepEqual(ctx.resolve(badges).knobs, { plateFillMin: 0.45, plateMinWidth: 34 }); assert.deepEqual(ctx.resolve(other).knobs, { x: 1 });
  restore();
  assert.equal(ctx.resolve(hsv).knobs.darkVMax, 45); assert.equal(ctx.resolve(badges).knobs.plateFillMin, 0.55);
  assert.equal(applyFeatureKnobs(ctx, null)(), undefined, 'no knobs: nothing to restore');
});
