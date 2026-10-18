/**
 * The pose search behind the PxC boundary (Sam, 2026-10-18: "move the pose search behind the PxC boundary"; "math gets
 * written ONCE inside the store and INVOKED from the outside").
 *
 * poseSpace(base) is the store-side state of one pose context (the rigid pad template over the S4 evidence plane). Its
 * questions take the list of pads already owned as an ARGUMENT, never as shared mutable state:
 *   overview()                                     who needs a tee, the template, the assignment, why nothing can run
 *   searchBadge({ owned, badge, badgeRay })        the best visible pose for a badge
 *   occluderSearch({ owned, badge })               the hidden-pad search under every occluder
 *   describe({ owned, badge, center, angleRad, extra })  the recovered-tee record of a pose, and its pad's px box
 *   evaluate({ owned, center, angleRad })          one pose's evidence
 * Inside: a view per owned list is derived from its prefix (one pad stamped into copies of the evidence and ownership
 * planes) and cached; zone stamps and component seeds are shared by every view; a badge's search is cached by only the
 * owned pads that touch its search area, so a round reuses every answer a new pad cannot change.
 *
 * registerPoseQueries(store) offers it as fn.q.pose.* (the store times each call with its emits); greedyLoop(q) is the
 * one recovery loop, over any implementation of those questions (the store's, or localQueries for direct use).
 */
import { createRecoveryContext, recoveryInputs, evaluatePose, recoveredTee, searchBadge, occluderSearch, learnHallwayWidth, ownPx, searchBox, pxBox, boxesMeet, seedWhiteOf } from './teeRecover.mjs';

const r3 = (v) => Math.round(v * 1000) / 1000;
const DEG = 180 / Math.PI;
const keyOf = (owned) => JSON.stringify(owned.map((p) => [p.center, p.angleRad]));

export function poseSpace(base, { hallway = null } = {}) {
  if (base.tpl) { base.stamps ??= new Map(); if (base.unowned) base.seedWhite ??= seedWhiteOf(base); }
  let hallwayMemo;
  const hallwayOf = (v) => (hallwayMemo ??= hallway ? hallway() : learnHallwayWidth(v));
  const views = new Map();
  const view = (owned = []) => {
    const k = keyOf(owned);
    if (views.has(k)) return views.get(k);
    let v;
    if (!owned.length) v = { ...base, owned: new Uint8Array(base.W * base.H), ev: Uint8Array.from(base.ev), padBoxes: [] };
    else {
      const prev = view(owned.slice(0, -1)), p = owned.at(-1);
      v = { ...prev, owned: Uint8Array.from(prev.owned), ev: Uint8Array.from(prev.ev) };
      const full = evaluatePose(v, p.center[0], p.center[1], p.angleRad, { collect: true });
      const pad = full.px.pad.filter((i) => i >= 0);
      for (const i of pad) ownPx(v, i);
      v.padBoxes = [...prev.padBoxes, pxBox(pad, v.W)];
    }
    views.set(k, v);
    return v;
  };
  const searches = new Map();
  return {
    overview: () => ({
      unavailable: base.tpl ? null : base.unavailable, template: base.tpl, assignment: base.assignment,
      badges: base.badges.map((b, index) => ({ index, label: b.label })), s3Tees: base.tees.length,
      need: Math.max(0, base.badges.length - base.tees.length), searchRadiusPx: base.searchRadiusPx, searchRule: base.searchRule
    }),
    searchBadge: ({ owned = [], badge, badgeRay = true }) => {
      const v = view(owned), box = searchBox(v, v.badges[badge]);
      // the answer depends only on the owned pads inside this badge's search area: cache by exactly those
      const relevant = owned.filter((_, k) => boxesMeet(box, v.padBoxes[k]));
      const sk = `${badge} ${badgeRay} ${keyOf(relevant)}`;
      if (searches.has(sk)) return { ...searches.get(sk), reused: true };
      const r = searchBadge(view(relevant), v.badges[badge], { badgeRay });
      const out = { best: r.best, evaluatedPoses: r.evaluatedPoses, candidateCenters: r.candidateCenters, seedsInDisk: r.seedsInDisk };
      searches.set(sk, out);
      return { ...out, reused: false };
    },
    occluderSearch: ({ owned = [], badge }) => {
      const v = view(owned);
      if (v.hallway === undefined) v.hallway = hallwayOf(v);
      return occluderSearch(v, badge);
    },
    describe: ({ owned = [], badge, center, angleRad, extra = {} }) => {
      const v = view(owned), full = evaluatePose(v, center[0], center[1], angleRad, { collect: true });
      return recoveredTee(v, badge, full, extra);
    },
    evaluate: ({ owned = [], center, angleRad }) => { const { px, ...rest } = evaluatePose(view(owned), center[0], center[1], angleRad); return rest; }
  };
}

/** The questions answered directly (unit tests, scripts): the same poseSpace, no store. */
export const localQueries = (ctx) => { const s = poseSpace(ctx); return (name, args) => s[name](args); };

/** fn.q.pose.* on a store: one poseSpace per set of Part addresses, built from the Parts on first use. */
export const POSE_QUERY_NAMES = Object.freeze(['overview', 'searchBadge', 'occluderSearch', 'describe', 'evaluate']);
export function registerPoseQueries(store) {
  let space = null;
  const spaceOf = () => (space ??= poseSpace(createRecoveryContext(recoveryInputs((a) => store.get(a))), { hallway: () => store.get('tk.s4.hallway') }));
  const emitsOf = (name, out) => (name === 'searchBadge' ? { poses: out.reused ? 0 : out.evaluatedPoses, reused: out.reused ? 1 : 0 }
    : name === 'occluderSearch' ? { poses: out.evaluatedPoses, occluders: out.regions.length } : {});
  for (const name of POSE_QUERY_NAMES) {
    store.register(`fn.q.pose.${name}`, { note: 'pose search behind the PxC boundary (ports/s4recover/poseSpace.mjs)',
      calculate: (io) => { const out = spaceOf()[name](io.args ?? {}); return { value: out, emits: emitsOf(name, out) }; } });
  }
}
/** The questions answered by a store (an implementation's scoped `parts.call`). */
export const storeQueries = (call) => (name, args) => call(`fn.q.pose.${name}`, args).value;
export const POSE_CALLS = Object.freeze(POSE_QUERY_NAMES.map((n) => `fn.q.pose.${n}`));

/** The greedy recovery, written once over the questions: it never touches a pixel. */
export function greedyLoop(q, { badgeRay = true } = {}) {
  const ov = q('overview', {});
  const N = ov.badges.length, assigned = new Set(ov.assignment.map((a) => a.badge));
  if (!ov.template) {
    return { overview: ov, recovered: [], log: [], rounds: 0, evaluatedPoses: 0, need: ov.need,
      missed: ov.badges.filter((b) => !assigned.has(b.index)).map((b) => ({ badgeIndex: b.index, hole: b.label, reason: `no pad template: ${ov.unavailable}` })) };
  }
  const pending = new Set(ov.badges.map((b) => b.index).filter((i) => !assigned.has(i)));
  const recovered = [], log = [], owned = [];
  let rounds = 0, evaluatedPoses = 0, reusedSearches = 0;
  while (pending.size && recovered.length < ov.need) {
    rounds++;
    let pick = null;
    for (const bi of [...pending].sort((a, b) => a - b)) {
      const r = q('searchBadge', { owned, badge: bi, badgeRay });
      if (r.reused) reusedSearches++; else evaluatedPoses += r.evaluatedPoses;
      log.push({ round: rounds, badge: bi, label: ov.badges[bi].label, candidateCenters: r.candidateCenters, seedsInDisk: r.seedsInDisk, best: r.best ? { center: r.best.center, angleDeg: r3(r.best.angleRad * DEG), score: r.best.score, accepted: r.best.accepted, fromSeed: r.best.seed ?? null } : null });
      if (r.best?.accepted && (!pick || r.best.score > pick.best.score)) pick = { bi, best: r.best };
    }
    if (!pick) break;
    recovered.push(q('describe', { owned, badge: pick.bi, center: pick.best.center, angleRad: pick.best.angleRad,
      extra: { round: rounds, fromSeed: pick.best.seed ?? null, rule: badgeRay ? 'greedy occluded template, badge-ray constrained' : 'greedy occluded template, free angle (ablation)' } }));
    owned.push({ center: pick.best.center, angleRad: pick.best.angleRad });
    pending.delete(pick.bi);
  }
  // Fast pass done; what is still missing is assumed occluded: search the occluders (entailment, not visibility).
  const hiddenSearch = {};
  for (const bi of [...pending].sort((a, b) => a - b)) {
    if (recovered.length >= ov.need) break;
    const o = q('occluderSearch', { owned, badge: bi }); evaluatedPoses += o.evaluatedPoses; hiddenSearch[ov.badges[bi].label] = o;
    // Direct evidence first: exactly one occluder with a peeking frame fragment pins the pad there. Otherwise exactly one
    // occluder with hallway to the badge. Otherwise recorded, not guessed.
    const peeking = o.regions.filter((r) => r.peek), hall = o.regions.filter((r) => r.feasibleCenters > 0);
    const g = peeking.length === 1 ? { ...peeking[0], centroid: peeking[0].peek.center, by: 'peeking frame fragment' } : !peeking.length && hall.length === 1 ? { ...hall[0], by: 'hallway to the badge' } : null;
    if (!g) continue;
    const plate = o.plateCenter, th = Math.atan2(plate[1] - g.centroid[1], plate[0] - g.centroid[0]);
    recovered.push(q('describe', { owned, badge: bi, center: g.centroid, angleRad: th, extra: { rule: `occluder search: hidden under ${g.occluder} (${g.by})`, hidden: g, accepted: true } }));
    owned.push({ center: g.centroid, angleRad: th });
    pending.delete(bi);
  }
  const missed = [...pending].sort((a, b) => a - b).map((bi) => {
    const last = [...log].reverse().find((l) => l.badge === bi), o = hiddenSearch[ov.badges[bi].label];
    const reason = recovered.length >= ov.need ? `stopped at cardinality N = ${N} badges` : !o ? 'no accepted pose' : o.regions.length ? `occluder search: ${o.regions.length} occluders fit (${o.regions.map((r) => r.occluder).join(', ')})` : 'no accepted pose; no occluder can hide it';
    return { badgeIndex: bi, hole: ov.badges[bi].label, lastBest: last?.best ?? null, hidden: o ?? null, reason };
  });
  return { overview: ov, recovered, missed, need: ov.need, rounds, evaluatedPoses, reusedSearches, log };
}
