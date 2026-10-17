/**
 * fg.s2.basketInvariants.observe (stages/s2.json): the S2 checks that used to
 * be manual, now instrumented on every run; judged and recorded, never gated.
 *
 * Baskets are named as candidates (`Basket ca`, `Basket cb`, ...; fg/names.mjs) until S5 proves which hole each ends.
 *
 * Learned from the 6 single-image dev courses (98 baskets, 2026-10-17):
 *   - the basket sprite is 46 x 72 px on every course (BASKET_SIZE);
 *   - its BasketPoint (where every C1 spoke meets the stem's bottom edge) is
 *     bbox (x + 22.5, y + 71) + BASKET_POINT_OFFSET, solved from 59 spokes on
 *     5 courses; Sam's basket points sit at a median 0.88-1.09 px from it;
 *   - S2 has no false positive on any annotated course; what it misses
 *     (stacked or covered baskets) is S4's to recover: the deficit against
 *     S1's badge count is recorded as the hand-off.
 */
import { guarantee, pipe, read, step } from '../compose.mjs';
import { framed, judged, published, unitful } from '../mixins.mjs';
import { nameCandidates } from '../names.mjs';

const ID = 'fg.s2.basketInvariants.observe';
const PART = 'px.baskets';
export const BASKET_SIZE = Object.freeze([46, 72]);                 // px [width, height]
export const BASKET_POINT_OFFSET = Object.freeze([0.34, 0.73]);     // px from the sprite's bottom-centre pixel
export const basketPoint = ([x, y, w, h]) => [x + (w - 1) / 2 + BASKET_POINT_OFFSET[0], y + h - 1 + BASKET_POINT_OFFSET[1]];
const UNITS = { basketPoint: 'px', basketPoints: 'px', basketIndices: 'ordinal (S2 basket index)', duplicates: 'ordinal (S2 basket index pairs)', offSize: 'ordinal (S2 basket index)', expectedSize: 'px [width, height]', duplicateWithinPx: 'px', baskets: 'count (baskets)', badges: 'count (badges)', deficit: 'count (baskets S4 must recover)' };
const DUPLICATE_WITHIN_PX = 10;
const touch = (a, b) => !(a[0] + a[2] < b[0] || b[0] + b[2] < a[0] || a[1] + a[3] < b[1] || b[1] + b[3] < a[1]);

export function observeBaskets(baskets, badges) {
  const names = nameCandidates('Basket', baskets, (k) => basketPoint(k.bbox));
  const rows = baskets.map((k, i) => {
    const bbox = [...k.bbox], p = basketPoint(bbox);
    return {
      index: i, name: names[i], bbox, basketPoint: p.map((v) => Math.round(v * 100) / 100), sizeMatches: bbox[2] === BASKET_SIZE[0] && bbox[3] === BASKET_SIZE[1],
      touchesBadges: badges.filter((b) => touch(bbox, b.bbox)).map((b) => `Badge ${b.label}`),
      touchesBaskets: baskets.map((o, j) => j).filter((j) => j !== i && touch(bbox, baskets[j].bbox)).map((j) => names[j])
    };
  });
  const dup = [];
  for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++)
    if (Math.hypot(rows[i].basketPoint[0] - rows[j].basketPoint[0], rows[i].basketPoint[1] - rows[j].basketPoint[1]) < DUPLICATE_WITHIN_PX) dup.push([rows[i].name, rows[j].name]);
  return {
    rows,
    findings: {
      baskets: rows.length, badges: badges.length, deficit: Math.max(0, badges.length - rows.length),
      sizeConstant: rows.every((r) => r.sizeMatches), offSize: rows.filter((r) => !r.sizeMatches).map((r) => r.name),
      duplicates: dup, overBadgeCount: rows.length > badges.length,
      touchingBadges: rows.filter((r) => r.touchesBadges.length).map((r) => ({ basket: r.name, badges: r.touchesBadges })),
      touchingBaskets: rows.filter((r) => r.touchesBaskets.length).map((r) => ({ basket: r.name, baskets: r.touchesBaskets }))
    }
  };
}

const observe = step('observe the basket invariants', (env, s) => {
  const baskets = s.parts[PART], badges = s.parts['px.badges'];
  if (!Array.isArray(baskets)) env.fail('px.baskets is missing');
  return observeBaskets(baskets, Array.isArray(badges) ? badges : []);
});

const holds = judged('robustBase', {
  judge: (s) => { const f = s.findings; return { matches: f.sizeConstant && f.duplicates.length === 0 && !f.overBadgeCount, findings: f }; }
});

const frames = framed((s) => [{
  title: `basket invariants: ${s.findings.baskets} baskets for ${s.findings.badges} badges (S4 recovers ${s.findings.deficit}); robust base ${s.judged.robustBase.matches ? 'holds' : 'BREAKS'}`,
  calculation: 'Basket.findPx', tick: ID,
  parts: [
    { address: `${PART}#invariants`, kind: 'bbox', data: { boxes: s.rows.map((r) => [...r.bbox, `${r.name}${r.sizeMatches ? '' : ' off-size'}${r.touchesBadges.length ? ' touches ' + r.touchesBadges.join('/') : ''}`]) } },
    { address: `${PART}#basketPoints`, kind: 'points', data: { points: s.rows.map((r) => [...r.basketPoint, `${r.name} point`]) } }
  ],
  verdicts: s.rows.map((r) => ({ name: `${r.name}: ${r.bbox[2]}x${r.bbox[3]} px, BasketPoint (${r.basketPoint.join(', ')})`, ok: r.sizeMatches }))
}]);

export default guarantee({
  id: ID, guards: [PART], requires: ['fg.s2.pxBaskets.materialize'], audit: [unitful({ units: UNITS })],
  result: (s) => ({ totals: { baskets: s.findings.baskets, badges: s.findings.badges, deficit: s.findings.deficit }, robustBaseHolds: s.judged.robustBase.matches })
}, pipe(read(PART, 'px.badges'), observe, holds, frames,
  published({
    stage: 'S2', key: 'basketInvariants', materialization: 'S2BasketInvariants',
    header: () => ({ part: PART, observedBy: ID }),
    body: (s) => ({ robustBaseHolds: s.judged.robustBase.matches, findings: s.findings, basketPoints: Object.fromEntries(s.rows.map((r) => [r.name, r.basketPoint])) })
  })));
