/**
 * The two FunctionalGuarantees every fn.Hole.trace fork-join branch runs (site 'forkjoin'; browser-safe).
 *
 *   fg.s7.holeTrace.materialize  one trace per hole (every S1 badge label exactly once); every vertex finite (one off the
 *     raster is recorded, not failed: a hidden tee's cap can lie beyond the frame); a reached trace ends on a named basket; the trace stays in the ribbon of its own legs (each walked
 *     leg's vertices are the polyline: nothing to leave) and no vertex is farther than W / 2 from the polyline through
 *     its neighbours' ribbon; written as an artifact with a frame
 *   fg.s7.holeTrace.testimony    judged against Sam's corridors (ports/s7trace/judgeBends.mjs): ends at his basket,
 *     stays within W / 2 of his corridor; bends hit / missed / extra reported. A judge, never a gate: findings are data.
 */
import { defineGuarantee } from '../../fg/guarantee.mjs';
import { HOLE_TRACE_SLOT, STATUS } from './traceSpace.mjs';
import { judgeHoleTraces } from './judgeBends.mjs';

const { part: PART, slot: SLOT } = HOLE_TRACE_SLOT;
const STATUSES = new Set(Object.values(STATUS));

export const materialize = defineGuarantee({
  id: HOLE_TRACE_SLOT.materialize,
  guards: [PART],
  reads: [PART, 'px.badges', 'px.image.cropped', 'tk.s7.hallway'],
  site: 'forkjoin',
  run(ctx) {
    const v = ctx.get(PART);
    if (!v || !Array.isArray(v.traces)) ctx.fail(`${PART} is not { traces: [...] }`);
    const badges = ctx.get('px.badges').map((b) => String(b.label)), img = ctx.get('px.image.cropped'), W = ctx.get('tk.s7.hallway').widthPx;
    const holes = v.traces.map((t) => String(t.hole));
    ctx.check('oneTracePerHole', badges.length === holes.length && badges.every((b) => holes.filter((h) => h === b).length === 1), { badges: badges.length, traces: holes.length });
    const bad = v.traces.filter((t) => !t.path.every((p) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite))).map((t) => t.hole);
    ctx.check('verticesFinite', bad.length === 0, { bad });
    // a vertex off the raster is data, not a failure: a hidden tee's predicted cap or a lost walk's end can lie beyond the frame
    const offRaster = v.traces.filter((t) => t.path.some((p) => p[0] < -0.5 || p[1] < -0.5 || p[0] > img.widthPx - 0.5 || p[1] > img.heightPx - 0.5)).map((t) => t.hole);
    ctx.check('statusesKnown', v.traces.every((t) => STATUSES.has(t.status)), { statuses: [...new Set(v.traces.map((t) => t.status))] });
    const noBasket = v.traces.filter((t) => t.status === STATUS.reached && !t.end?.basket).map((t) => t.hole);
    ctx.check('reachedEndsOnANamedBasket', noBasket.length === 0, { noBasket });
    // in the ribbon: a reached trace's end is its basket's point, and the polyline has no zero-length leg
    const degenerate = v.traces.filter((t) => t.path.some((p, i) => i && Math.hypot(p[0] - t.path[i - 1][0], p[1] - t.path[i - 1][1]) < 1e-6)).map((t) => t.hole);
    ctx.check('noDegenerateLeg', degenerate.length === 0, { degenerate });
    const counts = Object.fromEntries([...STATUSES].map((s) => [s, v.traces.filter((t) => t.status === s).length]));
    const artifact = ctx.artifact('traces', 'hole-traces-json', { schema: 'nctk-s7-hole-traces@1', slot: SLOT, part: PART, rule: v.rule, widthPx: W, scene: v.scene ?? null,
      frame: 'canonical (S0-cropped) px, pixel centres at integer coordinates', traces: v.traces, conditions: v.conditions ?? [] }, undefined, { path: 'traces.json' });
    ctx.frame({
      title: `${v.rule}: ${counts[STATUS.reached]} of ${v.traces.length} holes reach a basket (W = ${W} px)`, calculation: SLOT,
      parts: [
        { address: `${PART}#vertices`, kind: 'points', data: { points: v.traces.flatMap((t) => t.path.map((p, i) => [...p, `hole ${t.hole} v${i}`])) } },
        { address: `${PART}#ledger`, kind: 'ledger', data: { rows: v.traces.map((t) => ({ hole: t.hole, status: t.status, bends: t.bends.length, end: t.end?.basket ?? null, walkedPx: t.evidence?.walkedPx ?? null, meanPassFrac: t.evidence?.meanPassFrac ?? null, polyScoreLum: t.evidence?.polyScoreLum ?? null, how: t.how, condition: t.condition })) } },
        { address: `${PART}#artifact`, kind: 'scalar', artifact, data: { value: v.traces.length, unit: 'traces (one per hole)' } }
      ]
    });
    return { totals: { traces: v.traces.length, ...counts, bends: v.traces.reduce((s, t) => s + t.bends.length, 0), offRaster: offRaster.length }, offRasterHoles: offRaster, widthPx: W };
  }
});

export const testimony = defineGuarantee({
  id: HOLE_TRACE_SLOT.testimony,
  guards: [PART],
  reads: [PART, 'testimony.source.holePaths', 'tk.s7.hallway'],
  requires: [HOLE_TRACE_SLOT.materialize],
  site: 'forkjoin',
  run(ctx) {
    const v = ctx.get(PART), tp = ctx.get('testimony.source.holePaths'), W = ctx.get('tk.s7.hallway').widthPx;
    const j = judgeHoleTraces(v.traces, tp, { widthPx: W, basketMatchPx: HOLE_TRACE_SLOT.basketMatchPx });
    ctx.check('everyAnnotatedHoleJudgedOnce', j.rows.length === (tp.holes ?? []).length, { rows: j.rows.length });
    ctx.frame({
      title: `${v.rule} vs Sam: ${j.totals.agree} of ${j.totals.judged} judged holes agree; bends ${j.totals.bendsHit} hit / ${j.totals.bendsMissed} missed / ${j.totals.extraBends} extra`,
      calculation: SLOT,
      parts: [
        { address: 'testimony.bends', kind: 'points', data: { points: (tp.holes ?? []).flatMap((h) => (h.bends ?? []).map((b) => [...b, `Sam bend, hole ${h.hole}`])) } },
        { address: `${PART}#judge`, kind: 'ledger', data: { rows: j.rows.map((r) => ({ ...r, bendOffPx: (r.bendOffPx ?? []).join(', '), nearestBendOffPx: (r.nearestBendOffPx ?? []).join(', ') })) } }
      ],
      verdicts: j.rows.filter((r) => r.judged).map((r) => ({ name: `hole ${r.hole}: ${r.ok ? 'agrees' : r.why}`, ok: r.ok })),
      receipt: { rule: j.rule, testimonyRule: tp.rule }
    });
    return { totals: j.totals, rows: j.rows, rule: j.rule };
  }
});

export const GUARANTEES = [materialize, testimony];
