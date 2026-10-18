/**
 * The two FunctionalGuarantees every fn.Hole.straight fork-join branch runs (site 'forkjoin'; browser-safe), the shape
 * of ports/s4recover/guarantees.mjs:
 *
 *   fg.s6.holeStraight.materialize  one verdict per tee-badge pair (every pair of tk.s6.holePairs exactly once), each one of
 *     straight / bent / unknown, and a straight verdict names a basket that exists in tk.s6.baskets; written as an
 *     artifact (straight.json) with a frame
 *   fg.s6.holeStraight.testimony    judged against Sam's testimony (a hole with no corridorBends is straight): a pair is
 *     judged when its hole is annotated and its tee lies within the tee match rule (8 px) of Sam's tee point for that
 *     hole. TP straight called straight; FP bent called straight; FN straight not called straight (bent or unknown:
 *     sent to pathfinding, safe); TN bent not called straight. A TP whose basket is not within the basket match rule
 *     (12 px) of Sam's basket point is a straight with the wrong basket. A judge, never a pass gate: findings are data.
 */
import { defineGuarantee } from '../../fg/guarantee.mjs';
import { HOLE_STRAIGHT_SLOT, ACCEPTANCE, VERDICTS, verdictCounts } from './holeStraight.mjs';

const { part: PART, slot: SLOT } = HOLE_STRAIGHT_SLOT;
const r3 = (v) => Math.round(v * 1000) / 1000;
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

export const materialize = defineGuarantee({
  id: HOLE_STRAIGHT_SLOT.materialize,
  guards: [PART],
  reads: [PART, 'tk.s6.holePairs', 'tk.s6.baskets'],
  site: 'forkjoin',
  run(ctx) {
    const value = ctx.get(PART);
    if (!value || !Array.isArray(value.verdicts)) ctx.fail(`${PART} is not { implementation, verdicts: [...] }`);
    const pairs = ctx.get('tk.s6.holePairs'), baskets = ctx.get('tk.s6.baskets'), rows = value.verdicts;
    const ids = rows.map((r) => r.pair);
    const missing = pairs.map((p) => p.id).filter((id) => !ids.includes(id)), twice = ids.filter((id, i) => ids.indexOf(id) !== i);
    ctx.check('oneVerdictPerPair', missing.length === 0 && twice.length === 0 && rows.length === pairs.length, { pairs: pairs.length, verdicts: rows.length, missing, twice });
    const badVerdict = rows.filter((r) => !VERDICTS.includes(r.verdict)).map((r) => r.pair);
    ctx.check('verdictIsStraightBentUnknown', badVerdict.length === 0, { badVerdict });
    const noBasket = rows.filter((r) => r.verdict === 'straight' && !(r.basket && baskets[r.basket.index]?.name === r.basket.name)).map((r) => r.pair);
    ctx.check('straightNamesAnExistingBasket', noBasket.length === 0, { noBasket });
    const counts = verdictCounts(rows);
    const artifact = ctx.artifact('straight', 'hole-straight-json', {
      schema: 'nctk-s6-hole-straight@1', slot: SLOT, part: PART, implementation: value.implementation, guarantee: HOLE_STRAIGHT_SLOT.materialize,
      frame: 'canonical (S0-cropped) px, pixel centres at integer coordinates', rule: value.rule, laneNotRun: Boolean(value.laneNotRun),
      counts, verdicts: rows
    }, undefined, { path: 'straight.json' });
    ctx.frame({
      title: `${value.implementation}: ${counts.straight} straight, ${counts.bent} bent, ${counts.unknown} unknown of ${counts.pairs} tee-badge pairs${value.laneNotRun ? ' (lane not run)' : ''}`,
      calculation: SLOT,
      parts: [
        { address: `${PART}#tees`, kind: 'points', data: { points: rows.map((r) => [...r.tee.center, `${r.hole} ${r.verdict}`]) } },
        { address: `${PART}#baskets`, kind: 'points', data: { points: rows.filter((r) => r.basket).map((r) => [...r.basket.point, `${r.hole} -> ${r.basket.name}`]) } },
        { address: `${PART}#ledger`, kind: 'ledger', data: { rows: rows.map((r) => ({ pair: r.pair, hole: r.hole, source: r.source, tee: r.tee.name, verdict: r.verdict, basket: r.basket?.name ?? null, condition: r.condition, ...Object.fromEntries(Object.entries(r.evidence ?? {}).filter(([, x]) => x === null || typeof x !== 'object')) })) } },
        { address: `${PART}#artifact`, kind: 'scalar', artifact, data: { value: counts.straight, unit: 'pairs called straight' } }
      ]
    });
    return { totals: counts, implementation: value.implementation, laneNotRun: Boolean(value.laneNotRun) };
  }
});

/**
 * Judge verdict rows against testimony holes [{ hole, tee: [x, y], basket: [x, y], bent, bends }] (canonical px).
 * Returns { rows, totals } with one row per verdict; the one judging rule (ports/judge S6straight calls it too).
 */
export function judgeStraight(verdicts, holes, { teePx = HOLE_STRAIGHT_SLOT.teeMatchPx, basketPx = HOLE_STRAIGHT_SLOT.basketMatchPx } = {}) {
  const byHole = new Map(holes.map((h) => [String(h.hole), h]));
  const rows = verdicts.map((v) => {
    const h = byHole.get(String(v.hole));
    const base = { pair: v.pair, hole: v.hole, source: v.source, tee: v.tee.name, verdict: v.verdict, basketSaid: v.basket?.name ?? null, basketSaidPoint: v.basket?.point ?? null, condition: v.condition ?? null };
    if (!h) return { ...base, outcome: 'unjudged', why: 'hole not annotated', truthBent: null, pass: null };
    const teeErrorPx = r3(dist(v.tee.center, h.tee));
    const truth = { truthBent: h.bent, truthBends: h.bends?.length ?? null, basketTruthPoint: h.basket, teeErrorPx };
    if (teeErrorPx > teePx) return { ...base, ...truth, outcome: 'unjudged', why: `the pair's tee is ${teeErrorPx} px from Sam's tee ${v.hole} (> ${teePx} px): not hole ${v.hole}'s tee`, pass: null };
    const said = v.verdict === 'straight';
    const outcome = said ? (h.bent ? 'FP' : 'TP') : (h.bent ? 'TN' : 'FN');
    const basketErrorPx = said && v.basket ? r3(dist(v.basket.point, h.basket)) : null;
    const basketAgrees = said ? basketErrorPx !== null && basketErrorPx <= basketPx : null;
    return { ...base, ...truth, outcome, basketErrorPx, basketAgrees, pass: outcome === 'TN' || (outcome === 'TP' && basketAgrees) };
  });
  const n = (o) => rows.filter((r) => r.outcome === o).length;
  const judged = rows.filter((r) => r.outcome !== 'unjudged');
  return {
    teeMatchPx: teePx, basketMatchPx: basketPx, rows,
    totals: { judgedPairs: judged.length, TP: n('TP'), FP: n('FP'), FN: n('FN'), TN: n('TN'), unknownJudged: judged.filter((r) => r.verdict === 'unknown').length,
      straightWithWrongBasket: rows.filter((r) => r.outcome === 'TP' && !r.basketAgrees).length, unjudged: n('unjudged') }
  };
}

export const testimony = defineGuarantee({
  id: HOLE_STRAIGHT_SLOT.testimony,
  guards: [PART],
  reads: [PART, 'testimony.source.holes'],
  requires: [HOLE_STRAIGHT_SLOT.materialize],
  site: 'forkjoin',
  run(ctx) {
    const value = ctx.get(PART), T = ctx.get('testimony.source.holes');
    const j = judgeStraight(value.verdicts, T.holes);
    ctx.check('everyVerdictJudgedOnce', j.rows.length === value.verdicts.length, { rows: j.rows.length });
    const t = j.totals;
    ctx.frame({
      title: `${value.implementation} vs Sam: TP ${t.TP} / FP ${t.FP} / FN ${t.FN} / TN ${t.TN} on ${t.judgedPairs} judged pairs; straight with wrong basket ${t.straightWithWrongBasket}; ${t.unjudged} unjudged`,
      calculation: SLOT,
      parts: [
        { address: 'testimony.holes.tees', kind: 'points', data: { points: T.holes.map((h) => [...h.tee, `Sam tee ${h.hole} ${h.bent ? 'bent' : 'straight'}`]) } },
        { address: 'testimony.holes.baskets', kind: 'points', data: { points: T.holes.map((h) => [...h.basket, `Sam basket ${h.hole}`]) } },
        { address: `${PART}#judge`, kind: 'ledger', data: { rows: j.rows.map(({ basketSaidPoint, basketTruthPoint, ...r }) => r) } }
      ],
      verdicts: j.rows.map((r) => ({ name: `hole ${r.hole} (${r.tee}): ${r.verdict}, Sam ${r.truthBent == null ? '-' : r.truthBent ? `bent (${r.truthBends} bends)` : 'straight'}: ${r.outcome}${r.basketAgrees === false ? ', wrong basket' : ''}`, ok: r.pass !== false })),
      receipt: { testimonyRule: T.rule, teeMatchPx: j.teeMatchPx, basketMatchPx: j.basketMatchPx, acceptance: ACCEPTANCE }
    });
    return { totals: t, rows: j.rows, testimonyRule: T.rule };
  }
});

export const GUARANTEES = [materialize, testimony];
