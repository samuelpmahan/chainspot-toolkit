/**
 * fn.Hole.trace: S7 as a ComparableForkJoin slot, and the hallway math behind the PxC boundary (browser-safe).
 *
 * DOCTRINE S7 (Sam): "find the path signal and ride it; all holes resolve tee to badge to basket, trace stays in the
 * ribbon; perfection = bend points on the centreline"; judged by Sam's bends. The tee -> badge segment is straight
 * hallway. The math is the graduated prototype (docs/evidence/s7main, s7edge): ports/s7trace/hallway.mjs (the
 * follower), s3first.mjs (Sam's order), endpoints.mjs (badge -> basket pairs assigned, traced back).
 *
 * Parts (derived views, each its own Calculation, S7_CALCULATIONS):
 *   tk.s7.scene     the image's hallway scene: luminance, the opaque-sprite + C1/C2 ring mask, S2 BasketPoints, badge
 *                   centres, the pads (S3 association AA poses) and their template, R1 (course.py)
 *   tk.s7.sceneS4   the same scene with the S4 recovered baskets added (their BasketPoints, box and rings masked)
 *   tk.s7.hallway   the hallway model: width W learned on the TEE -> BADGE segments (LOCAL), the straight holes as fallback
 *   tk.s7.holes     per hole (S1 badge label): badge centre, the S3 association's tee (centre, unit ray to the badge, 3-point
 *                   verdict) or the accepted S4 recovered tee; every basket (S2 then S4 recovered) named `Basket cX`
 * Queries (fn.q.trace.* solves, fn.q.path.* primitives; answers cached by their arguments, profiled by the store):
 *   fn.q.trace.s3first({ s4 })   Sam's order; s4: also S4 recovered tees as seeds and S4 recovered baskets as endpoints
 *   fn.q.trace.badgeOnly()       every hole seeded from its badge (badgeseed.py)
 *   fn.q.trace.endpoints()       every badge -> basket pair scored, assigned one-to-one, traced back from the basket
 *   the primitives (profile, edge pair, station contrast) are S6's fn.q.path.* math (ports/s6straight/pathSpace.mjs)
 */
import { nameCandidates } from '../../fg/names.mjs';
import { ownedPx } from '../../fg/pxset.mjs';
import { BASKET_POINT_OFFSET } from '../../fg/s2/fg.s2.basketInvariants.observe.fg.mjs';
import { ringMask, dilate4, round } from './hallway.mjs';
import { sceneOf, hallwayModel, solveS3First, solveBadgeOnly } from './s3first.mjs';
import { solveEndpoints } from './endpoints.mjs';
import { routeTableOn, regionAssignTableOn } from '../s7route/routeSpace.mjs';
import { registerRegion, REGION_SCENE_PART } from '../s7route/regionSpace.mjs';
import { routeMatchOf, MATCH_STEPS, MATCH_RULES } from '../s7route/match.mjs';
import { routeMatchViewOf } from './traceView.mjs';

export const HOLE_TRACE_SLOT = Object.freeze({
  slot: 'fn.Hole.trace',
  part: 'px.holes.trace',
  materialize: 'fg.s7.holeTrace.materialize',
  testimony: 'fg.s7.holeTrace.testimony',
  basketMatchPx: 12,          // judging only: the one basket match rule (AGENTS.md)
  teeMatchPx: 8
});
export const ACCEPTANCE = "UNKNOWN: acceptance is Sam's; agreement with his corridors is evidence only";
export const STATUS = Object.freeze({ reached: 'reached', petered: 'petered out', fork: 'ambiguous fork', notTraced: 'not traced', laneNotRun: 'lane not run' });

const bpOf = ([x, y, w, h], off = BASKET_POINT_OFFSET) => [x + (w - 1) / 2 + off[0], y + h - 1 + off[1]];
const pathLength = (v) => { let s = 0; for (let i = 1; i < v.length; i++) s += Math.hypot(v[i][0] - v[i - 1][0], v[i][1] - v[i - 1][1]); return s; };

// ------------------------------------------------------------------------------------------------ derived views

/**
 * tk.s7.sceneS4: the scene with the S4 recovered baskets as further BasketPoints; their boxes and rings masked like S2's.
 * basketPointOffset: DOCTRINE's by default; a proof against a prototype passes the prototype's (as sceneOf takes it).
 */
export function sceneWithRecovered(S, boxes, { basketPointOffset = BASKET_POINT_OFFSET } = {}) {
  if (!boxes.length) return { ...S, recovered: 0, emits: { ...S.emits, recoveredBaskets: 0 } };
  const { W, H } = S, box = new Uint8Array(W * H);
  for (const [x, y, w, h] of boxes) for (let yy = Math.max(0, y); yy < Math.min(H, y + h); yy++) for (let xx = Math.max(0, x); xx < Math.min(W, x + w); xx++) box[yy * W + xx] = 1;
  const sprite = dilate4(box, W, H, 2), occluder = dilate4(box, W, H, 1), bpNew = boxes.map((b) => bpOf(b, basketPointOffset)), ring = ringMask(W, H, bpNew, S.R1);
  const mask = Uint8Array.from(S.mask), occ = Uint8Array.from(S.occluder);
  for (let i = 0; i < W * H; i++) { mask[i] |= sprite[i] | ring[i]; occ[i] |= occluder[i]; }
  return { ...S, mask, occluder: occ, bp: [...S.bp, ...bpNew], recovered: boxes.length, emits: { ...S.emits, recoveredBaskets: boxes.length } };
}

/** The unit ray along a pad's axis toward its badge. */
const rayToBadge = (t, badge) => {
  const c = [badge.bbox[0] + (badge.bbox[2] - 1) / 2, badge.bbox[1] + (badge.bbox[3] - 1) / 2], u = [Math.cos(t.angleRad), Math.sin(t.angleRad)];
  const s = (c[0] - t.center[0]) * u[0] + (c[1] - t.center[1]) * u[1] >= 0 ? 1 : -1;
  return [u[0] * s, u[1] * s];   // unrounded (a 2-decimal ray moved the tee cap start and the bend axis: review R12)
};

/** tk.s7.holes: per S1 badge label, its tee (S3 association first, else the accepted S4 recovered tee); the baskets named. */
export function holesView({ badges, baskets, recoveredBoxes, association, recovered }) {
  const all = [...baskets.map((b) => ({ bbox: b.bbox, source: 'S2' })), ...recoveredBoxes.map((bbox) => ({ bbox, source: 'S4 recovered' }))];
  const names = nameCandidates('Basket', all, (b) => bpOf(b.bbox));
  const holes = [...badges].map((b) => String(b.label)).sort((a, b) => Number(a) - Number(b)).map((label) => {
    const a = association.holes?.[label];
    const r = (recovered.tees ?? []).find((t) => String(t.hole) === label);
    const tee = a ? { teeCenter: a.teeCenter, u: a.u, straight3: a.straight3, source: 'S3 association (ports/s3assoc)' }
      : r ? { teeCenter: r.center, u: rayToBadge(r, badges.find((b) => String(b.label) === label)), straight3: null, source: `S4 recovered (${recovered.source})` } : null;
    return { hole: label, tee, condition: tee ? null : 'no tee (neither the S3 association nor S4 recovery gives one)' };
  });
  return { holes, baskets: all.map((b, k) => ({ index: k, name: names[k], bbox: b.bbox, point: bpOf(b.bbox).map((v) => round(v, 2)), source: b.source })),
    conditions: [association.condition, recovered.condition].filter(Boolean),
    emits: { holes: holes.length, s3Tees: holes.filter((h) => h.tee?.source.startsWith('S3')).length, s4Tees: holes.filter((h) => h.tee?.source.startsWith('S4')).length, baskets: all.length } };
}

export const S7_CALCULATIONS = Object.freeze([
  ['fn.tk.s7.scene', { inParts: ['px.image.cropped', 'px.badges', 'px.baskets', 'px.tees.refined', 'tk.s7.association'], outParts: ['tk.s7.scene'],
    note: 'the hallway scene of the image (ports/s7trace/s3first.mjs sceneOf)',
    calculate: (io) => {
      const raster = io.in('px.image.cropped'), W = raster.widthPx, H = raster.heightPx, a = io.in('tk.s7.association');
      // what each Part owns is inferred from its structure (ownedPx): badge + mute, basket + shell, tee pad
      const ownedLists = [...io.in('px.baskets').map((k) => ownedPx(W, H, k).px), ...io.in('px.badges').map((b) => ownedPx(W, H, b).px), ...io.in('px.tees.refined').map((t) => ownedPx(W, H, t).px)];
      return { 'tk.s7.scene': sceneOf({ raster, ownedLists, baskets: io.in('px.baskets'), badges: io.in('px.badges'), pads: a.pads, template: a.template }) };
    } }],
  ['fn.tk.s7.sceneS4', { inParts: ['tk.s7.scene', 'tk.s4.basketRecovery'], outParts: ['tk.s7.sceneS4'], note: 'the scene plus the S4 recovered baskets',
    calculate: (io) => ({ 'tk.s7.sceneS4': sceneWithRecovered(io.in('tk.s7.scene'), io.in('tk.s4.basketRecovery').recoveredBoxes ?? []) }) }],
  ['fn.tk.s7.hallway', { inParts: ['tk.s7.scene', 'tk.s7.association'], outParts: ['tk.s7.hallway'], note: 'hallway width W from the TEE -> BADGE segments (teebadge.py)',
    calculate: (io) => ({ 'tk.s7.hallway': hallwayModel(io.in('tk.s7.scene'), io.in('tk.s7.association').holes ?? {}) }) }],
  ['fn.tk.s7.holes', { inParts: ['px.badges', 'px.baskets', 'tk.s4.basketRecovery', 'tk.s7.association', 'tk.s7.recoveredTees'], outParts: ['tk.s7.holes'], note: 'per hole: its tee; every basket named',
    calculate: (io) => ({ 'tk.s7.holes': holesView({ badges: io.in('px.badges'), baskets: io.in('px.baskets'), recoveredBoxes: io.in('tk.s4.basketRecovery').recoveredBoxes ?? [], association: io.in('tk.s7.association'), recovered: io.in('tk.s7.recoveredTees') }) }) }],
  ['fn.tk.s7.routeMatchView', { inParts: ['tk.s7.holes', 'tk.s7.hallway', 'testimony.source.holePaths'], outParts: ['tk.s7.routeMatchView'], calls: ['fn.q.trace.routeMatch'],
    note: 'the routeMatch traces beside the testimony: route, bends before / after the placement, agreement (tee 8 px, basket 12 px, within W / 2 of the corridor); renders as the course picture',
    calculate: (io) => ({ 'tk.s7.routeMatchView': routeMatchViewOf({ solve: io.call('fn.q.trace.routeMatch', {}).value, holesPart: io.in('tk.s7.holes'), holePaths: io.in('testimony.source.holePaths'), widthPx: io.in('tk.s7.hallway').widthPx }) }) }],
]);

// ------------------------------------------------------------------------------------------------ the store boundary

export const TRACE_QUERY_NAMES = Object.freeze(['s3first', 'badgeOnly', 'endpoints', 'pinned', 'routeMatch']);

/** Douglas-Peucker: the vertices of a walked polyline that leave the chord by more than eps px. */
export function simplify(pts, eps) {
  const keep = new Set([0, pts.length - 1]);
  const segD = (p, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1e-9; let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2; t = Math.max(0, Math.min(1, t)); return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy); };
  const rec = (i0, i1) => { let w = -1, at = -1; for (let i = i0 + 1; i < i1; i++) { const d = segD(pts[i], pts[i0], pts[i1]); if (d > w) { w = d; at = i; } } if (w > eps) { keep.add(at); rec(i0, at); rec(at, i1); } };
  if (pts.length > 2) rec(0, pts.length - 1);
  return [...keep].sort((a, b) => a - b).map((i) => pts[i]);
}

/**
 * The pinned native tracer's output (ports/s7.mjs, routeBadgeLegs / traceBadgeToBasket on fresh S6 heading hints) as a
 * solve: per hole the hit that reached a basket, else the longest walk; its walk simplified at W / 4 (the native trace
 * reports a bend count, not bend points); the BasketPoint it ended on is the named basket within W / 2 of its end.
 */
export function pinnedSolve(pinned, holesPart, W) {
  if (pinned.condition) return { condition: pinned.condition, holes: {} };
  const out = {};
  for (const h of holesPart.holes) {
    const mine = pinned.traces.filter((t) => String(t.hole) === h.hole && t.points?.length);
    if (!mine.length) continue;
    const t = [...mine].sort((a, b) => Number(b.outcome === 'basket') - Number(a.outcome === 'basket') || b.lengthPx - a.lengthPx)[0];
    const walk = [t.teeCenter ?? t.points[0], ...t.points];
    const verts = simplify(walk, W / 4);
    const near = holesPart.baskets.map((k) => [Math.hypot(k.point[0] - walk.at(-1)[0], k.point[1] - walk.at(-1)[1]), k.index]).sort((a, b) => a[0] - b[0])[0];
    const end = t.outcome === 'basket' && near && near[0] <= W / 2 ? near[1] : null;
    if (end !== null) verts[verts.length - 1] = holesPart.baskets[end].point;
    out[h.hole] = { hole: Number(h.hole), how: `pinned native tracer (${t.hitId}: ${t.outcome}${t.reason ? `, ${t.reason}` : ''}; native bends ${t.bendCount})`, end, verts: verts.map((v) => v.map((x) => round(x, 2))),
      legs: [{ passFrac: null, stop: t.outcome === 'basket' ? null : t.reason }], native: { hitId: t.hitId, outcome: t.outcome, reason: t.reason, basketIdReached: t.basketIdReached, lengthPx: t.lengthPx, bendCount: t.bendCount } };
  }
  return { holes: out, scene: 'native' };
}
export const TRACE_CALLS = Object.freeze(TRACE_QUERY_NAMES.map((n) => `fn.q.trace.${n}`));
export const traceQueries = (call) => (name, args) => call(`fn.q.trace.${name}`, args).value;

/**
 * fn.q.trace.* on a store. matcher: the provider's maximumWeightTeeBadgeMatching (the node runner loads
 * the pinned provider; a test passes any exact matcher). Every answer is cached by its arguments.
 */
export function registerTraceQueries(store, { matcher = null, board = null } = {}) {
  const get = (a) => store.get(a);
  const base = () => get('tk.s7.association').holes ?? {};
  const W = () => get('tk.s7.hallway').widthPx;
  const holeList = (S) => get('tk.s7.holes').holes.map((h) => ({ n: Number(h.hole), c: S.badges[Number(h.hole)], half: S.badgeHalf[Number(h.hole)], tee: h.tee }));
  const seedsS4 = () => Object.fromEntries(get('tk.s7.holes').holes.filter((h) => h.tee?.source.startsWith('S4')).map((h) => [h.hole, { ...h.tee }]));
  const teesOf = () => [...Object.values(base()).map((b) => [b.teeCenter, b.u]), ...Object.values(seedsS4()).map((s) => [s.teeCenter, s.u])];
  const table = {
    'fn.q.trace.s3first': ({ s4 = false } = {}) => {
      const S = get(s4 ? 'tk.s7.sceneS4' : 'tk.s7.scene');
      const r = solveS3First(S, base(), { model: get('tk.s7.hallway'), seeds: s4 ? seedsS4() : {} });
      return { value: { ...r, model: undefined, scene: s4 ? 'tk.s7.sceneS4' : 'tk.s7.scene' }, unit: 'px (canonical frame)', emits: { holes: Object.keys(r.holes).length, reached: Object.values(r.holes).filter((h) => h.end != null).length } };
    },
    'fn.q.trace.badgeOnly': () => {
      const r = solveBadgeOnly(get('tk.s7.scene'), base(), { model: get('tk.s7.hallway') });
      return { value: { ...r, model: undefined, scene: 'tk.s7.scene' }, unit: 'px (canonical frame)', emits: { holes: Object.keys(r.holes).length, reached: Object.values(r.holes).filter((h) => h.end != null).length } };
    },
    'fn.q.trace.endpoints': () => {
      if (!matcher) return { value: { condition: 'no exact matcher on this store (the provider is not loaded)', holes: {}, scene: 'tk.s7.sceneS4' }, unit: 'px (canonical frame)', emits: { holes: 0 } };
      const S = get('tk.s7.sceneS4'), r = solveEndpoints(S, holeList(S), W(), { tees: teesOf(), matcher });
      return { value: { ...r, scene: 'tk.s7.sceneS4' }, unit: 'px (canonical frame)', emits: { holes: Object.keys(r.holes).length, pairs: r.pairs.length, reached: Object.values(r.holes).filter((h) => h.end != null).length } };
    },
    'fn.q.trace.routeMatch': ({ secondBends = true, refineBends = true, rules = undefined } = {}) => {
      // S7 after S5 (docs/evidence/s7after): scoring = tk.s7.routeTable (cached rows), matching = ports/s7route/match.mjs
      // rule set sensor (ports/s7route/regionSpace.mjs): 'region' = the assignment reads the hallway REGION (tk.s7.sceneRegion), the
      // routes and the per-hole steps read edges; 'regionAll' = every measure reads the region
      const region = rules?.sensor === 'region' || rules?.sensor === 'regionAll';
      if (region) registerRegion(store);
      const scene = rules?.sensor === 'regionAll' ? REGION_SCENE_PART : 'tk.s7.sceneS4', tableOpts = { board: board ?? null, units: rules?.tableUnits ?? 'r1', search: rules?.tableSearch ?? 'full' };
      const table = rules?.sensor === 'region' ? regionAssignTableOn(store, { ...tableOpts, regionScene: REGION_SCENE_PART }) : routeTableOn(store, { ...tableOpts, ...(region ? { scene } : {}) }), S = get(scene);
      // rule 1 of the bend placement reads S6's accepted straight verdict (tk.s7.straight, a root input of the S7 runner)
      const straight = !refineBends ? undefined : store.has('tk.s7.straight') ? get('tk.s7.straight').verdicts : null;
      // every per-hole step is its own profiled store call (fn.q.match.*); the scene is passed by address
      const steps = Object.fromEntries(Object.keys(MATCH_STEPS).map((k) => [k, (_S, ...a) => store.call(`fn.q.match.${k}`, { scene, a }).value]));
      const r = routeMatchOf(table, S, get('tk.s7.routeStart'), { secondBends, straight, steps, ...(rules ? { rules: { ...MATCH_RULES, ...rules } } : {}) });
      const regionCondition = region ? get(REGION_SCENE_PART).regionCondition : null;
      return { value: { ...r, scene, ...(region ? { sensor: rules.sensor } : {}), ...(regionCondition ? { condition: regionCondition } : {}) }, unit: 'px (canonical frame)', emits: { holes: Object.keys(r.holes).length, reached: Object.values(r.holes).filter((h) => h.end != null).length, secondBends: Object.values(r.holes).filter((h) => (h.verts?.length ?? 0) === 4).length } };
    },
    'fn.q.trace.pinned': () => {
      const r = pinnedSolve(get('tk.s7.pinnedTraces'), get('tk.s7.holes'), W());
      return { value: r, unit: 'px (canonical frame)', emits: { holes: Object.keys(r.holes).length, reached: Object.values(r.holes).filter((h) => h.end != null).length } };
    },
  };
  const units = { refine: 'px (canonical frame): the refined vertices', sensor: 'passFrac / stations', secondBendScan: 'lum (edge contrast): the best 2-bend candidates [contrast, t px, B2 px] and the routes read', secondBendRefine: 'lum (edge contrast) and px (canonical frame): one candidate refined',
    placeBends: 'px (canonical frame): the placed bends and their reading', contrast: 'lum (edge contrast) and visible px' };
  for (const [k, f] of Object.entries(MATCH_STEPS)) if (!store.registered(`fn.q.match.${k}`)) store.register(`fn.q.match.${k}`, { note: `routeMatch step: ${k} (ports/s7route/match.mjs)`,
    calculate: (io) => { const v = f(get(io.args.scene), ...io.args.a); return { value: v, unit: units[k], emits: { computed: 1, ...(Number.isFinite(v?.read) ? { routes: v.read } : {}) } }; } });
  const answers = new Map();
  for (const [fn, q] of Object.entries(table)) store.register(fn, { note: 'S7 hallway math behind the PxC boundary (ports/s7trace)',
    calculate: (io) => {
      const key = `${fn} ${JSON.stringify(io.args ?? {})}`;
      if (answers.has(key)) return { ...answers.get(key), emits: { cached: 1 } };
      const ans = q(io.args ?? {}); answers.set(key, ans); return ans;
    } });
}

// ------------------------------------------------------------------------------------------------ the slot's Part

/** A solve's records as px.holes.trace rows: per hole tee -> bends -> end, its status, its evidence; baskets by name. */
export function tracesOf(solve, holesPart, { rule }) {
  const names = holesPart.baskets;
  const traces = holesPart.holes.map((h) => {
    const r = solve.holes?.[h.hole] ?? solve.holes?.[Number(h.hole)] ?? null;
    if (!r) return { hole: h.hole, badgeLabel: h.hole, status: STATUS.notTraced, how: null, path: [], bends: [], end: null, evidence: null, condition: solve.condition ?? 'not traced by this implementation' };
    const verts = r.verts ?? [], reached = r.end != null;
    const legs = r.legs ?? [];
    return {
      hole: h.hole, badgeLabel: h.hole, status: reached ? STATUS.reached : r.fail ? STATUS.notTraced : STATUS.petered, how: r.how ?? null,
      path: verts, bends: reached ? verts.slice(1, -1) : verts.slice(1, -1),
      end: reached ? { basket: names[r.end]?.name ?? `BP${r.end}`, point: verts.at(-1), source: names[r.end]?.source ?? null } : verts.length ? { basket: null, point: verts.at(-1), source: null } : null,
      evidence: { legs: legs.length, meanPassFrac: legs.length ? round(legs.reduce((s, l) => s + (l.passFrac ?? 0), 0) / legs.length, 3) : null, polyScoreLum: r.polyScore ?? null,
        walkedPx: round(pathLength(verts), 1), edgeStepLumPerPx: r.edgeStep ?? null, pair: r.pair ?? null, straightRejected: r.straightRejected ?? null, placement: r.bendsRefined ?? null },
      condition: r.fail ?? r.condition ?? (reached ? null : legs.at(-1)?.stop ? `the follower lost the ribbon (${legs.at(-1).stop})` : null)
    };
  });
  return { rule, widthPx: solve.widthPx ?? null, scene: solve.scene ?? null, traces, conditions: solve.condition ? [solve.condition] : [] };
}
