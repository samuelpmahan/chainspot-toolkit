/**
 * S6 discrimination's measurement, as Parts (agent B of the S6 lane). What agent A's `pathLoss` implementation of
 * fn.Hole.straight calls; it imports the names from here and never the math.
 *
 *   fn.q.path.samples / overlayFraction / loss   the queries (ports/s6straight/pathSpace.mjs), registerPathQueries(store)
 *   fn.tk.s6.pairs      px.baskets + px.tees.association -> tk.s6.pairs
 *                       one tee -> basket segment per associated tee: the tee centre (S3 association pose) to the
 *                       BasketPoint of the basket its tee -> badge line reaches best (straight3.basket), with S3's
 *                       3-point verdict. Blind: no testimony. Candidates keep their Excel names (Tee cX, Basket cY).
 *   fn.tk.s6.pathLoss   per pair, the loss profile along tee -> basket (fn.q.path.loss), plus the course-local path
 *                       transparency LEARNED ON THE STRAIGHT HOLES (DOCTRINE S6): the median overlay fraction on the
 *                       pairs S3's 3-point test calls STRAIGHT. The loss threshold is half the ribbon's level: half the
 *                       profile's path alpha when tk.s7.alphaProfile has one, else half that learned level (proxy).
 *                       Testimony (testimony.s6.holes) only splits the emits into the holes Sam marks straight vs bent:
 *                       agreement, never acceptance.
 *
 * inParts of fn.tk.s6.pathLoss: px.image.cropped (the canonical pixels), tk.s4.evidence (its `occ`: opaque sprites
 * hide samples), tk.s4.hallway (the image's learned corridor width; w = widthPx / 2), tk.s6.pairs, tk.s7.alphaProfile
 * (contracts/alpha.profile@1; a `noProfile` condition when the S7 lane has not run: registerAlphaAbsent) and
 * testimony.s6.holes ({ path: null, holes: [] } on a course without testimony).
 * Data conditions are recorded, never thrown. Browser-safe.
 */
import { ALPHA_PROFILE_PART, hasOverlay, noProfile } from '../../contracts/alpha.profile@1.mjs';
import { registerQueries } from '../../fg/store.mjs';
import { sha256Hex } from '../../fg/canon.mjs';
import { nameCandidates } from '../../fg/names.mjs';
import { basketPoint } from '../../fg/s2/fg.s2.basketInvariants.observe.fg.mjs';
import { PATH_QUERIES, PATH_QUERY_NAMES, sampleSegment, overlayProfile, lossProfile } from './pathSpace.mjs';

export { PATH_QUERY_NAMES };
export const PATH_CALLS = Object.freeze({ samples: 'fn.q.path.samples', overlayFraction: 'fn.q.path.overlayFraction', loss: 'fn.q.path.loss' });
export const PATH_LOSS_PART = 'tk.s6.pathLoss';
export const PATH_PAIRS_PART = 'tk.s6.pairs';
export const TESTIMONY_PART = 'testimony.s6.holes';
export const MATCH_PX = Object.freeze({ tee: 8, basket: 12 });   // the one match rule per kind (AGENTS.md)
/** The loss threshold: a sample is lost when it carries less than half the ribbon's level (the midpoint of no ribbon and full ribbon). */
export const THRESHOLD_OF_LEVEL = 0.5;

const r3 = (v) => (v == null || Number.isNaN(v) ? null : Math.round(v * 1000) / 1000);
const median = (xs) => { const s = [...xs].sort((a, b) => a - b), n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : null; };
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const r2p = (p) => p.map((v) => Math.round(v * 100) / 100);

/** fn.q.path.* on a store. */
export const registerPathQueries = (store) => registerQueries(store, PATH_QUERIES, { note: 'hole-path overlay along a segment (ports/s6straight/pathSpace.mjs)' });

/** When no S7 profile can be produced, tk.s7.alphaProfile is the contract's recorded condition (never a throw). */
export function registerAlphaAbsent(store, reason) {
  let present = false;
  try { present = store.has(ALPHA_PROFILE_PART); } catch { present = false; }
  if (present) return false;
  store.constant('fn.tk.s6.noAlphaProfile', { [ALPHA_PROFILE_PART]: noProfile(reason) });
  return true;
}

// ------------------------------------------------------------------ fn.tk.s6.pairs

export function pairsOf(baskets, association) {
  const rows = association?.rows ?? [];
  if (!rows.length) return { schema: 'nctk-s6-pairs@1', condition: association?.condition ?? 'no S3 association rows', rule: null, pairs: [], emits: { pairsCount: 0 } };
  const bps = baskets.map((k) => basketPoint(k.bbox));
  const kNames = nameCandidates('Basket', baskets, (k) => basketPoint(k.bbox));
  const pairs = [], skipped = [];
  rows.forEach((r, i) => {
    const name = r.candidate ?? `row ${i}`;
    if (!r.best) { skipped.push({ candidate: name, reason: 'no badge associated' }); return; }
    const k = r.straight3?.basket;
    if (k == null || !bps[k]) { skipped.push({ candidate: name, reason: 'no basket beyond the badge on the tee -> badge line' }); return; }
    pairs.push({
      pair: `${name} -> ${kNames[k]} (via Badge ${r.best.badge})`, candidate: name, row: i, badge: String(r.best.badge),
      teePx: r2p(r.center), basketIndex: k, basketCandidate: kNames[k], basketPx: r2p(bps[k]),
      straight3: r.straight3.verdict, straight3TlsMaxPx: r.straight3.tlsMaxPx ?? null
    });
  });
  return {
    schema: 'nctk-s6-pairs@1', condition: null,
    rule: 'per S3-associated tee: tee centre (px.tees.association row centre) -> BasketPoint of straight3.basket (the basket its tee -> badge line reaches best: the 3-point TLS test), canonical px',
    pairs, skipped, emits: { pairsCount: pairs.length, skippedCount: skipped.length, straight3Count: pairs.filter((p) => p.straight3 === 'STRAIGHT').length }
  };
}

// ------------------------------------------------------------------ fn.tk.s6.pathLoss

/**
 * The measurement over pairs, given a query function q(name, args) (the store's calls, or localPathQueries for direct
 * use): learn the path level on the straight3 pairs, then the loss of every pair at half that level (or half the
 * profile's alpha). Pure: everything it reads is an argument.
 */
export function measurePairs(q, { pairs, hallway, profile, testimony }) {
  const alphaOk = hasOverlay(profile, 'path');
  const alpha = alphaOk
    ? { condition: 'alpha profile', mode: 'profile', pathAlphaFrac: profile.overlays.path.alpha, overlayRgbLevel: profile.overlays.path.rgb, fitOn: profile.overlays.path.fitOn ?? null }
    : { condition: 'no alpha profile', mode: 'proxy', reason: profile?.reason ?? 'tk.s7.alphaProfile has no fitted path overlay', proxy: 'least-squares alpha against a white overlay: brightness over the lateral background, labelled PROXY' };
  const windowPx = hallway?.widthPx ? hallway.widthPx / 2 : null;
  const corridor = windowPx
    ? { windowPx: r3(windowPx), corridorWidthPx: r3(hallway.widthPx), rule: 'w = half the image\'s learned hallway width (tk.s4.hallway: LOCAL, from this image\'s own tee -> badge edges)' }
    : { windowPx: null, corridorWidthPx: null, rule: 'no corridor width (tk.s4.hallway absent): nothing measured' };
  const base = { schema: 'nctk-s6-path-loss@1', alpha, corridor };
  const list = pairs?.pairs ?? [];
  if (!windowPx || !list.length) {
    const condition = !list.length ? (pairs?.condition ?? 'no pairs') : 'no corridor width';
    return { ...base, condition, threshold: null, pathLevel: null, pairs: [], agreement: null, emits: { pairsCount: 0, alphaProfileCount: alphaOk ? 1 : 0, alphaCondition: alpha.condition, condition } };
  }
  const args = (p) => ({ raster: 'px.image.cropped', opaque: 'tk.s4.evidence', segment: { fromPx: p.teePx, toPx: p.basketPx }, windowPx, profile: alphaOk ? profile : null });

  // the course-local path transparency, learned on the straight holes (S3's 3-point test; blind)
  const straight = list.filter((p) => p.straight3 === 'STRAIGHT');
  const levels = straight.flatMap((p) => q('overlayFraction', args(p)).overlayFrac.filter((v) => v != null));
  const learned = median(levels);
  const pathLevel = { learnedLevelFrac: r3(learned), fromPairsCount: straight.length, fromSamplesCount: levels.length,
    rule: 'median overlay fraction of the visible samples on the pairs S3\'s 3-point test calls STRAIGHT (tee -> basket)', ...(alphaOk ? { profileAlphaFrac: alpha.pathAlphaFrac } : {}) };
  const level = alphaOk ? alpha.pathAlphaFrac : learned;
  const threshold = level != null
    ? { frac: r3(THRESHOLD_OF_LEVEL * level), rule: alphaOk ? `${THRESHOLD_OF_LEVEL} x the profile's path alpha (tk.s7.alphaProfile)` : `${THRESHOLD_OF_LEVEL} x the level learned on the straight holes (PROXY units)` }
    : null;

  const T = testimony?.holes?.length ? testimony.holes : null;
  const rows = list.map((p) => {
    const L = q('loss', { ...args(p), threshold });
    // testimony: the hole whose tee Sam marked within 8 px of this pair's tee (agreement only; impeachable)
    const h = T ? T.filter((t) => dist(t.teePx, p.teePx) <= MATCH_PX.tee).sort((a, b) => dist(a.teePx, p.teePx) - dist(b.teePx, p.teePx))[0] ?? null : null;
    return {
      ...p, condition: L.condition, segmentLengthPx: L.segmentLengthPx ?? null, visiblePx: L.visiblePx ?? null, hiddenPx: L.hiddenPx ?? null,
      meanOverlayFrac: L.meanOverlayFrac ?? null, medianOverlayFrac: L.medianOverlayFrac ?? null, lossFrac: L.lossFrac, longestGapPx: L.longestGapPx, gapsCount: L.gapsCount ?? 0,
      gapsPx: (L.gapsPx ?? []).slice(0, 8),
      samHole: h ? h.hole : null, samBent: h ? h.bent : null, samTeeErrorPx: h ? r3(dist(h.teePx, p.teePx)) : null,
      samBasketAgrees: h ? dist(h.basketPx, p.basketPx) <= MATCH_PX.basket : null,
      overlayFrac: L.profile?.overlayFrac ?? [], corridor: L.profile?.corridor ?? null
    };
  });

  const judged = rows.filter((r) => r.samHole != null && r.lossFrac != null);
  const group = (bent) => {
    const g = judged.filter((r) => r.samBent === bent);
    return { pairsCount: g.length, holes: g.map((r) => r.samHole).sort((a, b) => a - b), meanLossFrac: r3(mean(g.map((r) => r.lossFrac))), meanOverlayFrac: r3(mean(g.map((r) => r.meanOverlayFrac))), meanLongestGapPx: r3(mean(g.map((r) => r.longestGapPx))) };
  };
  const agreement = T ? { testimony: testimony.path, rule: `pairs whose tee lies within ${MATCH_PX.tee} px of Sam's tee point; Sam's bent = his corridorBends are non-empty; agreement only, never acceptance`, straight: group(false), bent: group(true), unjudgedPairsCount: rows.length - judged.length } : null;
  const S = agreement?.straight, B = agreement?.bent;
  return {
    ...base, condition: threshold ? null : 'no threshold: no straight holes to learn the path level on and no alpha profile', threshold, pathLevel, pairs: rows, agreement,
    emits: {
      pairsCount: rows.length, measuredCount: rows.filter((r) => r.lossFrac != null).length, alphaProfileCount: alphaOk ? 1 : 0, alphaCondition: alpha.condition,
      windowPx: r3(windowPx), learnedLevelFrac: r3(learned), thresholdFrac: threshold?.frac ?? null,
      ...(agreement ? { samStraightCount: S.pairsCount, samBentCount: B.pairsCount, meanLossSamStraightFrac: S.meanLossFrac, meanLossSamBentFrac: B.meanLossFrac,
        meanOverlaySamStraightFrac: S.meanOverlayFrac, meanOverlaySamBentFrac: B.meanOverlayFrac } : { testimonyCount: 0 })
    }
  };
}

/** The questions answered directly (unit tests, scripts): the same math, no store. */
export const localPathQueries = (parts) => (name, a) => {
  const raster = parts['px.image.cropped'], opaque = parts['tk.s4.evidence'] ?? null;
  const s = sampleSegment(raster, { segment: a.segment, windowPx: a.windowPx, opaque });
  if (name === 'samples') return s;
  const p = overlayProfile(s, { windowPx: a.windowPx, profile: a.profile });
  return name === 'overlayFraction' ? p : lossProfile(p, { threshold: a.threshold });
};

const CODE = sha256Hex([pairsOf, measurePairs, sampleSegment, overlayProfile, lossProfile].map(String).join('\n'));   // the helpers the calculations wrap

export const S6_PATH_CALCULATIONS = Object.freeze([
  ['fn.tk.s6.pairs', { inParts: ['px.baskets', 'px.tees.association'], outParts: [PATH_PAIRS_PART], code: CODE,
    note: 'tee -> basket segments from the S3 association rows (ports/s6straight/pathLoss.mjs)',
    calculate: (io) => ({ [PATH_PAIRS_PART]: pairsOf(io.in('px.baskets'), io.in('px.tees.association')) }) }],
  ['fn.tk.s6.pathLoss', { inParts: ['px.image.cropped', 'tk.s4.evidence', 'tk.s4.hallway', PATH_PAIRS_PART, ALPHA_PROFILE_PART, TESTIMONY_PART],
    outParts: [PATH_LOSS_PART], calls: [PATH_CALLS.overlayFraction, PATH_CALLS.loss], code: CODE,
    note: 'path loss along tee -> basket per pair; path level learned on straight holes (ports/s6straight/pathLoss.mjs)',
    calculate: (io) => {
      const q = (name, a) => io.call(PATH_CALLS[name], a).value;
      return { [PATH_LOSS_PART]: measurePairs(q, { pairs: io.in(PATH_PAIRS_PART), hallway: io.in('tk.s4.hallway'), profile: io.in(ALPHA_PROFILE_PART), testimony: io.in(TESTIMONY_PART) }) };
    } }]
]);

/** Register the queries and the Calculations on a store (the runner, a test, agent A's harness). */
export function registerPathLoss(store) {
  registerPathQueries(store);
  for (const [fn, spec] of S6_PATH_CALCULATIONS) store.register(fn, spec);
}
