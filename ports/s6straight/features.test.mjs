import { test } from 'node:test';
import assert from 'node:assert/strict';
import { separation, truePairs, featureReport, featureSvg, scalarColumns } from './features.mjs';

const item = (hole, value) => ({ hole, value });
test('separation: AUC, median gap and the overlap count of the two groups\' shared range', () => {
  const sep = separation([item('1', 10), item('2', 12), item('3', 11)], [item('4', 1), item('5', 2)]);
  assert.deepEqual(sep, { medianGap: 9.5, auc: 1, overlapCount: 0 });
  const mixed = separation([item('1', 5), item('2', 9)], [item('3', 4), item('4', 6), item('5', 3)]);
  assert.equal(mixed.overlapCount, 2, 'the values inside [5, 6]: straight 5 and bent 6');
  assert.equal(mixed.auc, 0.833);
  assert.equal(separation([], [item('1', 1)]).auc, null, 'no straight true pair: recorded, not thrown');
});

// a two-hole table: hole 1 (Sam straight) reaches basket 0, hole 2 (Sam bent) has its true basket 1
const table = {
  holes: [1, 2].map((n, i) => ({ id: `P${i}`, label: String(n), pair: { hole: String(n), tee: { center: [100, 200 + 50 * i] } } })),
  baskets: [0, 1].map((i) => ({ index: i, name: `Basket c${i}`, point: [500, 200 + 50 * i] })),
  columns: { edgePassFrac: { family: 'edge', unit: 'fraction of visible stations' }, segmentLengthPx: { family: 'segment', unit: 'px (start -> BasketPoint)' }, overlayFracStations: { family: 'overlay', unit: 'fraction per station' } },
  rows: [['P0', 0, 0.95, 400], ['P0', 1, 0.1, 412], ['P1', 0, 0.2, 402], ['P1', 1, 0.05, 430]].map(([hole, basket, e, len]) => ({ hole, basket, edgePassFrac: e, segmentLengthPx: len, overlayFracStations: [0.1, 0.2] }))
};
const testimony = { holes: [{ hole: 1, tee: [100, 201], basket: [500, 203], bent: false }, { hole: 2, tee: [100, 250], basket: [500, 250], bent: true }, { hole: 3, tee: [900, 900], basket: [0, 0], bent: false }] };

test('true pairs: tee within 8 px of Sam\'s, basket within 12 px of his; vectors are not scalar columns', () => {
  const t = truePairs(table, testimony);
  assert.deepEqual([...t.truth.entries()], [['P0|0', { hole: '1', bent: false }], ['P1|1', { hole: '2', bent: true }]]);
  assert.deepEqual(scalarColumns(table), ['edgePassFrac', 'segmentLengthPx']);
  const moved = truePairs(table, { holes: [{ hole: 1, tee: [100, 201], basket: [300, 203], bent: false }] });
  assert.equal(moved.missing.length, 1); assert.match(moved.missing[0].why, /no S2\/S4 basket within 12 px/);
});

test('feature report: groups, separation, lengths also in R1; a blind course has no groups', () => {
  const r = featureReport(table, testimony, 40), e = r.features.find((f) => f.feature === 'edgePassFrac'), l = r.features.find((f) => f.feature === 'segmentLengthPx');
  assert.deepEqual([e.groups.straight.median, e.groups.bent.median, e.groups.other.n, e.separation.auc], [0.95, 0.05, 2, 1]);
  assert.equal(e.normalised, null, 'a fraction is not normalised');
  assert.deepEqual([l.normalised.r1Px, l.normalised.straightMedianOfR1, l.normalised.bentMedianOfR1], [40, 10, 10.75]);
  assert.equal(r.samStraightCount, 1); assert.equal(r.samBentCount, 1);
  const blind = featureReport(table, null, 40);
  assert.equal(blind.features[0].groups.straight.n, 0); assert.equal(blind.features[0].separation.auc, null);
});

test('the render: one strip per feature with a true pair, valid and labelled', () => {
  const svg = featureSvg(featureReport(table, testimony, 40), { title: 't', note: 'n' });
  assert.match(svg, /^<svg/); assert.equal((svg.match(/font-weight="bold"/g) ?? []).length, 1 + 2, 'title + two feature names');
  assert.match(svg, /Sam straight hole, true pair/); assert.ok(!/NaN|undefined/.test(svg));
});
