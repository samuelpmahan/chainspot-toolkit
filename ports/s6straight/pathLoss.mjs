/**
 * S6 discrimination's measurement, as Parts (agent B of the S6 lane). Agent A's fn.Hole.straight implementations
 * (segmentVerify, pathLoss) import the names from here and never the math (ports/s6straight/NOTES.md).
 *
 *   fn.q.path.*         the queries (ports/s6straight/pathSpace.mjs; ported from docs/evidence/s7main and s7edge and
 *                       proved identical: pathSpace.prove.mjs), registerPathQueries(store)
 *   fn.tk.s6.pathMask   course.py MASK: the board's OWNED pixel lists (px.baskets, px.badges by ownedPx; the S3
 *                       structural tees px.tees.refined), holes filled, dilated 2 px, OR the C1 / C2 rings around every
 *                       BasketPoint at R1 (course.py _r1, from the rings only) -> tk.s6.pathMask
 *   fn.tk.s6.hallway    teebadge.py learn: the course hallway width from every S3 tee -> badge segment (always straight:
 *                       the badge precedes the first bend) -> tk.s6.hallway (LOCAL, measured on this image)
 *   fn.tk.s6.pairs      per S3-associated tee: the tee cap S = T + u FRONT L (badgeseed.py FRONT = 10.6 / 25.02) ->
 *                       the BasketPoint its tee -> badge line reaches best (S3's 3-point test, straight3) -> tk.s6.pairs
 *   fn.tk.s6.pathLoss   per pair, on the stations 0.6 W .. |K - S| - 2 (s3first.py seg_fit's trims), side by side:
 *                       the EDGE TEST (proven: min-side contrast > 8 lum) and the ALPHA OVERLAY FRACTION (new) -> tk.s6.pathLoss
 *                       The overlay's course-local level is LEARNED ON THE STRAIGHT HOLES (DOCTRINE S6): the median
 *                       overlay fraction on the pairs straight3 calls STRAIGHT; its loss threshold is half the profile's
 *                       path alpha when tk.s7.alphaProfile has one, else half that learned level (PROXY units).
 *                       Testimony (testimony.s6.holes) only splits the emits into the holes Sam marks straight vs bent:
 *                       agreement, never acceptance.
 * Data conditions are recorded, never thrown. Browser-safe.
 */
import { ALPHA_PROFILE_PART, hasOverlay, noProfile } from '../../contracts/alpha.profile@1.mjs';
import { registerQueries } from '../../fg/store.mjs';
import { sha256Hex } from '../../fg/canon.mjs';
import { nameCandidates } from '../../fg/names.mjs';
import { ownedPx, forEach } from '../../fg/pxset.mjs';
import { basketPoint } from '../../fg/s2/fg.s2.basketInvariants.observe.fg.mjs';
import * as space from './pathSpace.mjs';
import { PATH_QUERIES, PATH_QUERY_NAMES, EVIDENCE, percentile } from './pathSpace.mjs';

export { PATH_QUERY_NAMES };
export const PATH_CALLS = Object.freeze(Object.fromEntries(PATH_QUERY_NAMES.map((fn) => [fn.split('.').at(-1), fn])));
export const PATH_MASK_PART = 'tk.s6.pathMask';
export const HALLWAY_PART = 'tk.s6.hallway';
export const PATH_PAIRS_PART = 'tk.s6.pairs';
export const PATH_LOSS_PART = 'tk.s6.pathLoss';
export const TESTIMONY_PART = 'testimony.s6.holes';
export const MATCH_PX = Object.freeze({ tee: 8, basket: 12 });   // the one match rule per kind (AGENTS.md)
export const FRONT = 10.6 / 25.02;                                // badgeseed.py: ribbon cap centre ahead of the pad centre, in pad lengths
/** The overlay loss threshold: half the ribbon's level (the midpoint of no ribbon and full ribbon). */
export const THRESHOLD_OF_LEVEL = 0.5;

const r2 = (v) => (v == null ? null : Math.round(v * 100) / 100);
const r3 = (v) => (v == null || Number.isNaN(v) ? null : Math.round(v * 1000) / 1000);
const median = (xs) => percentile(xs, 50);
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const badgeGeom = (b) => { const [x, y, w, h] = b.bbox; return { center: [x + (w - 1) / 2, y + (h - 1) / 2], halfPx: 0.5 * Math.hypot(w, h) }; };   // course.py badges, badgeHalf
const axisOf = (row) => { const th = (row.thDeg * Math.PI) / 180, s = row.best?.sense ?? 1; return [Math.cos(th) * s, Math.sin(th) * s]; };

/** fn.q.path.* on a store. */
export const registerPathQueries = (store) => registerQueries(store, PATH_QUERIES, { note: 'hole-path measurement along a centreline (ports/s6straight/pathSpace.mjs)' });

/** When no S7 profile can be produced, tk.s7.alphaProfile is the contract's recorded condition (never a throw). */
export function registerAlphaAbsent(store, reason) {
  let present = false;
  try { present = store.has(ALPHA_PROFILE_PART); } catch { present = false; }
  if (present) return false;
  store.constant('fn.tk.s6.noAlphaProfile', { [ALPHA_PROFILE_PART]: noProfile(reason) });
  return true;
}

// ------------------------------------------------------------------ fn.tk.s6.pathMask

export function pathMaskPart(raster, { baskets, badges, tees }) {
  const W = raster.widthPx, H = raster.heightPx, lists = [];
  const own = (part) => { const px = []; forEach(ownedPx(W, H, part), (i) => px.push(i)); lists.push(px); };
  baskets.forEach(own); badges.forEach(own); (tees ?? []).forEach(own);
  const bps = baskets.map((k) => basketPoint(k.bbox));
  const m = space.pathMaskOf(raster, lists, bps);
  return { ...m, basketPoints: bps.map((p) => p.map(r3)), ownedFrom: { basketsCount: baskets.length, badgesCount: badges.length, teesCount: (tees ?? []).length },
    emits: { r1Px: m.r1Px, maskedPx: m.maskedCount, spritePx: m.spriteCount, ringPx: m.ringCount } };
}

// ------------------------------------------------------------------ fn.tk.s6.hallway (teebadge.py learn)

export function hallwayOf(q, { association, badges }) {
  const rows = association?.rows ?? [], L = association?.template?.L;
  if (!rows.length || !(L > 0)) return { schema: 'nctk-s6-hallway@1', condition: !rows.length ? 'no S3 association rows' : 'no pad template length', widthPx: null, segments: [], emits: { segmentsCount: 0 } };
  const byLabel = new Map(badges.map((b) => [String(b.label), badgeGeom(b)]));
  const segs = rows.filter((r) => r.best).map((r) => {
    const T = r.center, u = axisOf(r), S = [T[0] + u[0] * FRONT * L, T[1] + u[1] * FRONT * L], B = byLabel.get(String(r.best.badge));
    const base = { candidate: r.candidate ?? r.tee, badge: String(r.best.badge) };
    if (!B) return { ...base, usable: false, why: `badge ${r.best.badge} not in px.badges` };
    const stop = (B.center[0] - S[0]) * u[0] + (B.center[1] - S[1]) * u[1] - B.halfPx - 2;   // stop before the badge sprite
    if (stop < 25) return { ...base, usable: false, why: `only ${Math.round(stop)} px between tee cap and badge` };
    const phi = Math.atan2(u[1], u[0]), a = { raster: 'px.image.cropped', mask: PATH_MASK_PART, originPx: S, phiRad: phi, t0Px: 2, t1Px: stop };
    const best = q('width', a);
    if (best.condition) return { ...base, usable: false, why: best.condition, lenPx: r2(stop) };
    const sc = q('stationContrast', { ...a, widthPx: best.wPx }), m = [];
    sc.leftLum.forEach((cl, k) => { if (sc.okLeft[k] && sc.okRight[k]) m.push(Math.min(cl, sc.rightLum[k])); });
    return { ...base, usable: true, capPx: S.map(r3), phiRad: r3(phi), lenPx: r2(stop), widthPx: r2(best.wPx), centreOffPx: r2(best.cPx), edgeStep: r2(best.score),
      stationsVisible: m.length, contrastMedianLum: m.length ? r2(median(m)) : null, contrastP10Lum: m.length ? r2(percentile(m, 10)) : null };
  });
  const use = segs.filter((s) => s.usable && Math.abs(s.centreOffPx) <= 3);
  const W = use.length ? median(use.map((s) => s.widthPx)) : null;
  return {
    schema: 'nctk-s6-hallway@1', condition: W ? null : 'no usable tee -> badge segment', widthPx: W,
    widthIqrPx: use.length ? [r2(percentile(use.map((s) => s.widthPx), 25)), r2(percentile(use.map((s) => s.widthPx), 75))] : null,
    contrastMedianLum: use.length ? median(use.filter((s) => s.contrastMedianLum != null).map((s) => s.contrastMedianLum)) : null,
    rule: 'teebadge.py: per S3 tee -> badge segment, S = T + u FRONT L, profile(S, phi, 2, stop), best edge pair over Wg 18..59 px (tol 0.75, lat 3); median width over usable segments with |centre| <= 3 px',
    padLengthPx: L, segments: segs, emits: { widthPx: W, segmentsCount: use.length, ofSegmentsCount: segs.length }
  };
}

// ------------------------------------------------------------------ fn.tk.s6.pairs

export function pairsOf(baskets, association) {
  const rows = association?.rows ?? [], L = association?.template?.L;
  if (!rows.length) return { schema: 'nctk-s6-pairs@1', condition: association?.condition ?? 'no S3 association rows', rule: null, pairs: [], skipped: [], emits: { pairsCount: 0 } };
  const bps = baskets.map((k) => basketPoint(k.bbox)), kNames = nameCandidates('Basket', baskets, (k) => basketPoint(k.bbox));
  const pairs = [], skipped = [];
  rows.forEach((r, i) => {
    const name = r.candidate ?? `row ${i}`;
    if (!r.best) { skipped.push({ candidate: name, reason: 'no badge associated' }); return; }
    const k = r.straight3?.basket;
    if (k == null || !bps[k]) { skipped.push({ candidate: name, reason: 'no basket beyond the badge on the tee -> badge line' }); return; }
    const u = axisOf(r), S = [r.center[0] + u[0] * FRONT * L, r.center[1] + u[1] * FRONT * L], K = bps[k];
    pairs.push({
      pair: `${name} -> ${kNames[k]} (via Badge ${r.best.badge})`, candidate: name, row: i, badge: String(r.best.badge),
      teePx: r.center.map(r3), capPx: S.map(r3), basketIndex: k, basketCandidate: kNames[k], basketPx: K.map(r3),
      phiRad: Math.atan2(K[1] - S[1], K[0] - S[0]), lengthPx: r3(dist(S, K)), straight3: r.straight3.verdict, straight3TlsMaxPx: r.straight3.tlsMaxPx ?? null
    });
  });
  return {
    schema: 'nctk-s6-pairs@1', condition: null, padLengthPx: L ?? null,
    rule: 'per S3-associated tee: the tee cap S = T + u FRONT L (L: association template) -> BasketPoint of straight3.basket (the 3-point TLS test), canonical px',
    pairs, skipped, emits: { pairsCount: pairs.length, skippedCount: skipped.length, straight3Count: pairs.filter((p) => p.straight3 === 'STRAIGHT').length }
  };
}

// ------------------------------------------------------------------ fn.tk.s6.pathLoss

/**
 * Both measures over the pairs, given a query function q(name, args) (the store's calls, or localPathQueries for direct
 * use). Pure: everything it reads is an argument.
 */
export function measurePairs(q, { pairs, hallway, profile, testimony }) {
  const alphaOk = hasOverlay(profile, 'path');
  const alpha = alphaOk
    ? { condition: 'alpha profile', mode: 'profile', pathAlphaFrac: profile.overlays.path.alpha, overlayRgbLevel: profile.overlays.path.rgb, fitOn: profile.overlays.path.fitOn ?? null }
    : { condition: 'no alpha profile', mode: 'proxy', reason: profile?.reason ?? 'tk.s7.alphaProfile has no fitted path overlay', proxy: space.PROXY_OVERLAY.rule };
  const W = hallway?.widthPx ?? null;
  const corridor = { widthPx: W, rule: W ? 'W = tk.s6.hallway widthPx (teebadge.py, LOCAL: this image\'s own tee -> badge segments)' : 'no corridor width (tk.s6.hallway has none): nothing measured' };
  const base = { schema: 'nctk-s6-path-loss@1', alpha, corridor, edgeTest: { tauLum: EVIDENCE.tauLum, rule: 'min-side station contrast > 8 lum (docs/evidence/s7edge: golden 80% on-ribbon vs 1% off-ribbon stations)' } };
  const list = pairs?.pairs ?? [];
  if (!W || !list.length) {
    const condition = !list.length ? (pairs?.condition ?? 'no pairs') : 'no corridor width';
    return { ...base, condition, threshold: null, pathLevel: null, pairs: [], agreement: null, emits: { pairsCount: 0, alphaProfileCount: alphaOk ? 1 : 0, alphaCondition: alpha.condition, condition } };
  }
  const args = (p) => ({ raster: 'px.image.cropped', mask: PATH_MASK_PART, originPx: p.capPx, phiRad: p.phiRad, t0Px: 0.6 * W, t1Px: p.lengthPx - 2, stepPx: 1, widthPx: W, profile: alphaOk ? profile : null });

  // the course-local path transparency, learned on the straight holes (S3's 3-point test; blind)
  const straight = list.filter((p) => p.straight3 === 'STRAIGHT');
  const levels = straight.flatMap((p) => { const o = q('overlayFraction', args(p)); return (o.overlayFrac ?? []).filter((v) => v != null); });
  const learned = levels.length ? median(levels) : null;
  const pathLevel = { learnedLevelFrac: r3(learned), fromPairsCount: straight.length, fromStationsCount: levels.length, ...(alphaOk ? { profileAlphaFrac: alpha.pathAlphaFrac } : {}),
    rule: 'median overlay fraction of the visible stations on the pairs S3\'s 3-point test calls STRAIGHT' + (alphaOk ? '' : ' (PROXY units: white-overlay brightness)') };
  const level = alphaOk ? alpha.pathAlphaFrac : learned;
  const threshold = level != null ? { frac: r3(THRESHOLD_OF_LEVEL * level), rule: alphaOk ? `${THRESHOLD_OF_LEVEL} x the profile's path alpha (tk.s7.alphaProfile)` : `${THRESHOLD_OF_LEVEL} x the level learned on the straight holes (PROXY units)` } : null;

  const T = testimony?.holes?.length ? testimony.holes : null;
  const rows = list.map((p) => {
    const L = q('loss', { ...args(p), threshold });
    const h = T ? T.filter((t) => dist(t.teePx, p.teePx) <= MATCH_PX.tee).sort((a, b) => dist(a.teePx, p.teePx) - dist(b.teePx, p.teePx))[0] ?? null : null;
    return {
      ...p, condition: L.condition, stationsCount: L.stationsCount, t0Px: r3(0.6 * W), t1Px: r3(p.lengthPx - 2),
      edgePassFrac: L.edge?.passFrac ?? null, edgeLossFrac: L.edge?.lossFrac ?? null, edgeLongestGapPx: L.edge?.longestGapPx ?? null, edgeVisibleCount: L.edge?.visibleCount ?? 0, edgeMedianContrastLum: L.edge?.medianContrastLum ?? null,
      meanOverlayFrac: L.overlay?.meanOverlayFrac ?? null, overlayPassFrac: L.overlay?.passFrac ?? null, overlayLossFrac: L.overlay?.lossFrac ?? null, overlayLongestGapPx: L.overlay?.longestGapPx ?? null, overlayVisibleCount: L.overlay?.visibleCount ?? 0,
      agreementCounts: L.agreementCounts ?? null,
      samHole: h ? h.hole : null, samBent: h ? h.bent : null, samTeeErrorPx: h ? r3(dist(h.teePx, p.teePx)) : null, samBasketAgrees: h ? dist(h.basketPx, p.basketPx) <= MATCH_PX.basket : null,
      stations: L.stations ?? null, corridor: L.corridor ?? null
    };
  });

  const judged = rows.filter((r) => r.samHole != null && r.condition == null);
  const group = (bent) => {
    const g = judged.filter((r) => r.samBent === bent), m = (k) => r3(mean(g.map((r) => r[k]).filter((v) => v != null)));
    return { pairsCount: g.length, holes: g.map((r) => r.samHole).sort((a, b) => a - b), meanEdgePassFrac: m('edgePassFrac'), meanEdgeLongestGapPx: m('edgeLongestGapPx'),
      meanOverlayFrac: m('meanOverlayFrac'), meanOverlayLossFrac: m('overlayLossFrac'), meanOverlayLongestGapPx: m('overlayLongestGapPx') };
  };
  const agreement = T ? { testimony: testimony.path, rule: `pairs whose tee lies within ${MATCH_PX.tee} px of Sam's tee point; Sam's bent = his corridorBends are non-empty; agreement only, never acceptance`, straight: group(false), bent: group(true), unjudgedPairsCount: rows.length - judged.length } : null;
  const tot = rows.reduce((a, r) => { const c = r.agreementCounts; if (c) for (const k of Object.keys(c)) a[k] = (a[k] ?? 0) + c[k]; return a; }, {});
  const jointN = Object.values(tot).reduce((a, b) => a + b, 0);
  const measuresAgreeFrac = jointN ? r3(((tot.edgePassOverlayPass ?? 0) + (tot.edgeFailOverlayFail ?? 0)) / jointN) : null;
  const S = agreement?.straight, B = agreement?.bent;
  return {
    ...base, condition: threshold ? null : 'no overlay threshold: no straight holes to learn the path level on and no alpha profile', threshold, pathLevel, pairs: rows, agreement,
    measures: { stationCounts: tot, measuresAgreeFrac, rule: 'stations visible to both measures: edge test pass/fail vs overlay fraction >= / < threshold' },
    emits: {
      pairsCount: rows.length, measuredCount: rows.filter((r) => r.condition == null).length, alphaProfileCount: alphaOk ? 1 : 0, alphaCondition: alpha.condition,
      widthPx: W, learnedLevelFrac: r3(learned), thresholdFrac: threshold?.frac ?? null, measuresAgreeFrac,
      ...(agreement ? { samStraightCount: S.pairsCount, samBentCount: B.pairsCount, edgePassSamStraightFrac: S.meanEdgePassFrac, edgePassSamBentFrac: B.meanEdgePassFrac,
        meanOverlaySamStraightFrac: S.meanOverlayFrac, meanOverlaySamBentFrac: B.meanOverlayFrac, overlayLossSamStraightFrac: S.meanOverlayLossFrac, overlayLossSamBentFrac: B.meanOverlayLossFrac } : { testimonyCount: 0 })
    }
  };
}

/** The questions answered directly (unit tests, scripts): the same queries, no store. parts: address -> value. */
export const localPathQueries = (parts) => (name, a) => {
  const resolved = Object.fromEntries(Object.entries(a).map(([k, v]) => [k, typeof v === 'string' ? parts[v] ?? null : v]));
  return PATH_QUERIES[`fn.q.path.${name}`](resolved, a).value;
};

const CODE = sha256Hex([pathMaskPart, hallwayOf, pairsOf, measurePairs, ...Object.values(space).filter((f) => typeof f === 'function')].map(String).join('\n'));   // the helpers the calculations wrap

export const S6_PATH_CALCULATIONS = Object.freeze([
  ['fn.tk.s6.pathMask', { inParts: ['px.image.cropped', 'px.baskets', 'px.badges', 'px.tees.refined'], outParts: [PATH_MASK_PART], code: CODE,
    note: 'course.py MASK from the board\'s owned pixel lists and the rings (ports/s6straight/pathLoss.mjs)',
    calculate: (io) => ({ [PATH_MASK_PART]: pathMaskPart(io.in('px.image.cropped'), { baskets: io.in('px.baskets'), badges: io.in('px.badges'), tees: io.in('px.tees.refined') }) }) }],
  ['fn.tk.s6.hallway', { inParts: ['px.image.cropped', PATH_MASK_PART, 'px.badges', 'px.tees.association'], outParts: [HALLWAY_PART], calls: [PATH_CALLS.width, PATH_CALLS.stationContrast], code: CODE,
    note: 'teebadge.py: the course hallway width from the tee -> badge segments',
    calculate: (io) => ({ [HALLWAY_PART]: hallwayOf((n, a) => io.call(PATH_CALLS[n], a).value, { association: io.in('px.tees.association'), badges: io.in('px.badges') }) }) }],
  ['fn.tk.s6.pairs', { inParts: ['px.baskets', 'px.tees.association'], outParts: [PATH_PAIRS_PART], code: CODE,
    note: 'tee cap -> straight3 BasketPoint per associated tee',
    calculate: (io) => ({ [PATH_PAIRS_PART]: pairsOf(io.in('px.baskets'), io.in('px.tees.association')) }) }],
  ['fn.tk.s6.pathLoss', { inParts: ['px.image.cropped', PATH_MASK_PART, HALLWAY_PART, PATH_PAIRS_PART, ALPHA_PROFILE_PART, TESTIMONY_PART], outParts: [PATH_LOSS_PART], calls: [PATH_CALLS.overlayFraction, PATH_CALLS.loss], code: CODE,
    note: 'edge test and alpha overlay fraction along tee cap -> basket per pair',
    calculate: (io) => ({ [PATH_LOSS_PART]: measurePairs((n, a) => io.call(PATH_CALLS[n], a).value, { pairs: io.in(PATH_PAIRS_PART), hallway: io.in(HALLWAY_PART), profile: io.in(ALPHA_PROFILE_PART), testimony: io.in(TESTIMONY_PART) }) }) }]
]);

/** Register the queries and the Calculations on a store (the runner, a test, agent A's harness). */
export function registerPathLoss(store) {
  registerPathQueries(store);
  for (const [fn, spec] of S6_PATH_CALCULATIONS) store.register(fn, spec);
}
