/**
 * S7 FIRST LEGS OWNED FROM THE START (browser-safe). The coordinator, from the seatacFull 16 render (2026-10-22): the default's
 * route to Basket cc rides hole 17's hallway straight over badge 17. Every hole's first leg is known from the skeleton before any
 * route is solved: tee cap S -> badge -> B* (Sam: the tee -> badge segment is straight hallway; the badge sits at the middle of
 * the first leg, so it ends at B* = tee + 2 x the badge along the tee axis). So those segments are owned from the start:
 *
 *   runs along   a leg of hole h may cross another hole's first leg but may not run along it: the existing owned-corridor test
 *                (kbends.mjs legRunsAlong: more than half of the leg's samples, W/4 apart, within W/2 of it and within 30 deg of
 *                parallel)
 *   badge plate  a leg of hole h may not pass over another hole's badge plate (the S1 badge box, screen-fixed px: the sprite)
 *
 * Parts (Calculations, registerFirstLegs):
 *   tk.s7.firstLegs      per hole with a tee: S, B*, the first leg [S, B*], its badge plate box; every badge plate by label
 *   tk.s7.firstLegCheck  judging view (reads testimony when the course has it): Sam's routes and the S7 default's routes checked
 *                        against the other holes' first legs and badge plates; renders one crop per route that violates
 *                        (fg/s7route/firstLegRender.mjs). Recorded, never a gate.
 * The rule set routeMatchKBendsSeq3SearchWFirstLegs (match.mjs seqFirstLegs) applies both rules inside the default's search.
 */
import { legRunsAlong, segmentHitsBox } from './kbends.mjs';
export { segmentHitsBox };
import { ROUTE_START_PART, ROUTE_HALLWAY_PART, badgeMidOf } from './routeSpace.mjs';
import { RULE_SETS, S7_DEFAULT } from './match.mjs';
import { sha256Hex } from '../../fg/canon.mjs';
import { FIRST_LEG_CHECK_SCHEMA, FIRST_LEGS_SCHEMA } from '../../fg/s7route/firstLegRender.mjs';

export { FIRST_LEG_CHECK_SCHEMA, FIRST_LEGS_SCHEMA };
export const FIRST_LEGS_PART = 'tk.s7.firstLegs';
export const FIRST_LEG_CHECK_PART = 'tk.s7.firstLegCheck';
const r2 = (v) => (Number.isFinite(v) ? Math.round(v * 100) / 100 : v ?? null);

/** tk.s7.firstLegs: per hole with a tee, its first leg [S, B*] and badge plate; every badge plate by its label. */
export function firstLegsOf(start, badges) {
  const plates = badges.map((b) => ({ hole: String(b.label), box: b.bbox.slice() }));
  const holes = start.holes.map((s) => { const B = badgeMidOf(s); return { hole: String(s.hole), S: s.S.map(r2), Bstar: B.map(r2), leg: [s.S.map(r2), B.map(r2)], box: plates.find((p) => p.hole === String(s.hole))?.box ?? null }; });
  return { schema: FIRST_LEGS_SCHEMA, holes, plates, rule: 'first leg = tee cap S -> B* (tee + 2 x the badge along the tee axis: the badge at the middle of the first leg); badge plate = the S1 badge box (px)',
    units: { leg: 'px (canonical frame)', box: 'px [x, y, w, h] (canonical frame; the badge sprite, screen-fixed)' }, emits: { holes: holes.length, plates: plates.length } };
}

/**
 * The rules' violations of hole h's route V: [{ kind: 'runs along' | 'badge plate', of (the other hole), leg (index of V's leg) }].
 * exemptPlate(hole, legIndex) (optional): a plate the rule does not apply to.
 */
export function firstLegViolationsOf(V, hole, firstLegs, W, { exemptPlate = null } = {}) {
  const out = [], h = String(hole);
  for (let i = 0; i + 1 < V.length; i++) {
    for (const g of firstLegs.holes) if (g.hole !== h && legRunsAlong(V[i], V[i + 1], [g.leg], W)) out.push({ kind: 'runs along', of: g.hole, leg: i });
    for (const p of firstLegs.plates) if (p.hole !== h && segmentHitsBox(V[i], V[i + 1], p.box) && !exemptPlate?.(p.hole, i)) out.push({ kind: 'badge plate', of: p.hole, leg: i });
  }
  return out;
}

/** The judging view: Sam's routes (testimony) and the default's routes, each checked. */
export function firstLegCheckOf({ firstLegs, W, R1, holePaths, solve, holesPart }) {
  const routes = [];
  for (const p of holePaths?.holes ?? []) {
    const V = p.bends ? [p.tee, ...p.bends, p.basket] : p.centre;
    if (!V?.length || V.length < 2) continue;
    routes.push({ source: 'testimony', hole: String(p.hole), verts: V.map((q) => q.map(r2)), violations: firstLegViolationsOf(V, p.hole, firstLegs, W) });
  }
  for (const [h, r] of Object.entries(solve?.holes ?? {})) if (r.verts?.length >= 2) routes.push({ source: 'default', hole: String(h), basket: holesPart.baskets[r.end]?.name ?? null, verts: r.verts.map((q) => q.map(r2)), violations: firstLegViolationsOf(r.verts, h, firstLegs, W) });
  const n = (src, k) => routes.filter((r) => r.source === src && (!k || r.violations.some((v) => v.kind === k))).length;
  return { schema: FIRST_LEG_CHECK_SCHEMA, reference: S7_DEFAULT, widthPx: W, R1Px: R1, firstLegs, routes, baskets: holesPart.baskets.map((b) => ({ name: b.name, point: b.point })),
    rule: `a route of hole h may cross another hole's first leg but not run along it (> 1/2 of a leg within W/2 and within 30 deg of parallel), and may not pass over another hole's badge plate`,
    totals: { testimony: n('testimony'), testimonyRunsAlong: n('testimony', 'runs along'), testimonyBadgePlate: n('testimony', 'badge plate'), default: n('default'), defaultRunsAlong: n('default', 'runs along'), defaultBadgePlate: n('default', 'badge plate') },
    emits: { testimonyViolating: routes.filter((r) => r.source === 'testimony' && r.violations.length).length, defaultViolating: routes.filter((r) => r.source === 'default' && r.violations.length).length } };
}

const CODE = sha256Hex([segmentHitsBox, firstLegsOf, firstLegViolationsOf, firstLegCheckOf].map(String).join('\n'));
export const FIRST_LEG_CALCULATIONS = Object.freeze([
  ['fn.tk.s7.firstLegs', { inParts: [ROUTE_START_PART, 'px.badges'], outParts: [FIRST_LEGS_PART], code: CODE, note: 'every hole\'s first leg (S -> B*) and badge plate, known before any route',
    calculate: (io) => ({ [FIRST_LEGS_PART]: firstLegsOf(io.in(ROUTE_START_PART), io.in('px.badges')) }) }],
  ['fn.tk.s7.firstLegCheck', { inParts: [FIRST_LEGS_PART, ROUTE_HALLWAY_PART, 'tk.s7.sceneS4', 'tk.s7.holes', 'testimony.source.holePaths'], outParts: [FIRST_LEG_CHECK_PART], calls: ['fn.q.trace.routeMatch'], code: CODE,
    note: 'Sam\'s routes and the default\'s against the other holes\' first legs and badge plates (judging; recorded, never a gate)',
    calculate: (io) => ({ [FIRST_LEG_CHECK_PART]: firstLegCheckOf({ firstLegs: io.in(FIRST_LEGS_PART), W: io.in(ROUTE_HALLWAY_PART).widthPx, R1: io.in('tk.s7.sceneS4').R1, holePaths: io.in('testimony.source.holePaths'),
      solve: io.call('fn.q.trace.routeMatch', { rules: RULE_SETS[S7_DEFAULT] }).value, holesPart: io.in('tk.s7.holes') }) }) }]
]);
export function registerFirstLegs(store) { for (const [fn, spec] of FIRST_LEG_CALCULATIONS) if (!store.registered(fn)) store.register(fn, spec); }
