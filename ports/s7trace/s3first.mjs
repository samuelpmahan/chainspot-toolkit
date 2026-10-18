/**
 * The S3-first hallway solve in Sam's order (graduated from docs/evidence/s7main/s3first.py; browser-safe):
 *   1. course width W from the TEE -> BADGE segments (always straight: the badge precedes the first bend); the 3-point
 *      STRAIGHT holes are the fallback
 *   2. every 3-point STRAIGHT hole: verify the one segment tee cap -> BasketPoint; pass = done, 0 bends
 *   3. every other hole with a tee: trace from the pad's cap along its axis (bends, close on a BasketPoint), then
 *      refine the inner vertices by render-and-score
 *   4. holes without a tee: badge-only seeding (badgeseed.py)
 * The scene (course.py) is built once per image from Parts (sceneOf); the steps are pure functions of it.
 */
import { BASKET_POINT_OFFSET } from '../../fg/s2/fg.s2.basketInvariants.observe.fg.mjs';
import { SCENE_SCHEMA } from '../../fg/s7trace/sceneRender.mjs';
import { lumPlane, spriteMasks, ringRadius, ringMask, widthFromStraight, teeBadgeLearn, verifyStraight, trace, refineVertices, seedOne, FRONT, round } from './hallway.mjs';

/**
 * The scene of one image: luminance, the opaque-sprite and ring mask, BasketPoints, badge centres, the pads and their
 * template. basketPointOffset: px from the sprite's bottom-centre pixel (DOCTRINE BasketPoint, default; the identity proof
 * passes the prototype's unrounded solve, docs/evidence/s7main). ownedLists: the px every S1 badge, S2 basket and S3 tee owns (fg/pxset.mjs ownedPx); baskets: S2 boxes
 * (BasketPoints index them: BP k is baskets[k]); pads: [{ label, cx, cy, thDeg }] with the template { L, W } (px).
 */
export function sceneOf({ raster, ownedLists, baskets, badges, pads, template, basketPointOffset = BASKET_POINT_OFFSET }) {
  const { widthPx: W, heightPx: H } = raster;
  const lum = lumPlane(raster), { sprite, occluder } = spriteMasks(W, H, ownedLists);
  const bp = baskets.map(({ bbox: [x, y, w, h] }) => [x + (w - 1) / 2 + basketPointOffset[0], y + h - 1 + basketPointOffset[1]]);
  const R1 = ringRadius(lum, sprite, W, H, bp), ring = ringMask(W, H, bp, R1);
  const mask = new Uint8Array(W * H); for (let i = 0; i < W * H; i++) mask[i] = sprite[i] | ring[i];
  const centre = {}, half = {};
  for (const b of badges) { const n = Number(b.label); centre[n] = [b.bbox[0] + (b.bbox[2] - 1) / 2, b.bbox[1] + (b.bbox[3] - 1) / 2]; half[n] = 0.5 * Math.hypot(b.bbox[2], b.bbox[3]); }
  return { schema: SCENE_SCHEMA, W, H, lum, mask, occluder, bp, badges: centre, badgeHalf: half, pads, L: template.L, Wd: template.W, R1,
    emits: { R1Px: round(R1, 2), baskets: bp.length, badges: badges.length, pads: pads.length, maskedPx: mask.reduce((s, v) => s + v, 0) } };
}

/** The hallway model of the image: W from the tee -> badge segments when at least 3 are usable, else the straight holes. */
export function hallwayModel(S, base) {
  const straight = widthFromStraight(S, base), tb = teeBadgeLearn(S, base);
  const fromTeeBadge = tb.widthPx && tb.segments >= 3;
  return { widthPx: fromTeeBadge ? tb.widthPx : straight.widthPx, source: fromTeeBadge ? `median of ${tb.segments} of ${tb.of} TEE -> BADGE segments` : `3-point STRAIGHT holes (${straight.holes}; tee -> badge gave ${tb.segments})`,
    teeBadge: tb, straight, emits: { widthPx: fromTeeBadge ? tb.widthPx : straight.widthPx, segments: tb.segments } };
}

const teesOf = (base) => Object.values(base).map((b) => [b.teeCenter, b.u]);
const cap = (T, u, L) => [T[0] + u[0] * FRONT * L, T[1] + u[1] * FRONT * L];

/** Step 2: a 3-point STRAIGHT hole verified as one segment (edge step >= 6 lum/px), else rejected with why. */
export function straightStep(S, hole, b, W) {
  const { e, nvis, k, start } = verifyStraight(S, b, W);
  if (e && e.score >= 6) return { hole, how: '3-point straight, verified', verts: [start.map((v) => round(v, 2)), S.bp[k].map((v) => round(v, 2))], end: k, bends: 0,
    widthPx: round(e.w, 2), centreOffPx: round(e.c, 2), edgeStep: round(e.score, 1), stationsVisible: nvis };
  return { hole, straightRejected: { edge: e ? round(e.score, 1) : null, width: e ? round(e.w, 2) : null } };
}

/** Step 3: trace from the tee's cap along its axis, then refine the inner vertices. used: BasketPoints already taken. */
export function fromTeeStep(S, hole, b, W, { used, tees, how = 'traced from the S3 tee', prior = {} }) {
  const T = b.teeCenter, u = b.u, St = cap(T, u, S.L);
  const r = trace(S, St, Math.atan2(u[1], u[0]), W, { excludeBp: used, selfC: T, tees });
  const rec = { hole, how, end: r.end, legs: r.legs, verts: r.verts.map((v) => v.map((x) => round(x, 2))), ...prior };
  if (r.end !== null && r.verts.length > 2) { const [Vr, s1] = refineVertices(S, r.verts, W, u); rec.verts = Vr.map((v) => v.map((x) => round(x, 2))); rec.polyScore = round(s1, 2); }
  rec.bends = r.end !== null ? rec.verts.length - 2 : null;
  return rec;
}

/**
 * The whole solve. base: { [hole]: { teeCenter, u, straight3 } } (the S3 association, hole = badge label); seeds: extra
 * tee seeds { [hole]: { teeCenter, u, source } } for holes the association has none (S4 recovered tees), traced like
 * step 3. Returns { widthPx, model, holes: { [hole]: record } }.
 */
export function solveS3First(S, base, { seeds = {}, model = null } = {}) {
  model = model ?? hallwayModel(S, base);
  const W = model.widthPx, tees = teesOf(base), out = {}, used = [];
  for (const [h, b] of Object.entries(base)) {
    if (!b.straight3 || b.straight3.verdict !== 'STRAIGHT') continue;
    const rec = straightStep(S, Number(h), b, W); out[h] = rec;
    if (rec.how && !used.includes(rec.end)) used.push(rec.end);
  }
  for (const [h, b] of Object.entries(base)) {
    if (out[h]?.how) continue;
    const prior = Object.fromEntries(Object.entries(out[h] ?? {}).filter(([k]) => k !== 'hole'));
    const rec = fromTeeStep(S, Number(h), b, W, { used: [...used], tees, prior });
    if (rec.end !== null && !used.includes(rec.end)) used.push(rec.end);
    out[h] = rec;
  }
  for (const [h, s] of Object.entries(seeds)) {
    if (out[h]) continue;
    const rec = fromTeeStep(S, Number(h), s, W, { used: [...used], tees, how: `traced from the S4 recovered tee (${s.source})` });
    if (rec.end !== null && !used.includes(rec.end)) used.push(rec.end);
    out[h] = rec;
  }
  for (const n of Object.keys(S.badges).map(Number).sort((a, b) => a - b)) {
    if (out[n]) continue;
    out[n] = { ...seedOne(S, n, W, S.pads, { tees }), how: 'badge-only seed (no S3 tee)' };
  }
  return { widthPx: W, model, holes: out };
}

/** Badge-only (badgeseed.py main): every hole seeded from its badge, two holes never ending at one BasketPoint. */
export function solveBadgeOnly(S, base, { model = null } = {}) {
  model = model ?? hallwayModel(S, base);
  const W = model.widthPx, tees = S.pads.map((p) => [[p.cx, p.cy], [Math.cos(p.thDeg * Math.PI / 180), Math.sin(p.thDeg * Math.PI / 180)]]);
  const out = {};
  for (const n of Object.keys(S.badges).map(Number).sort((a, b) => a - b)) out[n] = seedOne(S, n, W, S.pads, { tees });
  for (let it = 0; it < 2; it++) {
    const byEnd = new Map();
    for (const [n, r] of Object.entries(out)) if (!('fail' in r) && r.end !== null) { if (!byEnd.has(r.end)) byEnd.set(r.end, []); byEnd.get(r.end).push(Number(n)); }
    let changed = false;
    for (const [k, ns] of byEnd) {
      if (ns.length < 2) continue;
      ns.sort((a, b) => (Number(out[b].padOnLine ?? false) - Number(out[a].padOnLine ?? false)) || ((out[b].polyScore ?? 0) - (out[a].polyScore ?? 0)));
      for (const n of ns.slice(1)) {
        const ex = [...(out[n].excluded ?? []), out[n].lineDeg];
        const r = seedOne(S, n, W, S.pads, { excludeDirs: ex, tees }); r.excluded = ex; r.retryReason = `BP${k} conflict with hole ${ns[0]}`; out[n] = r; changed = true;
      }
    }
    if (!changed) break;
  }
  for (const r of Object.values(out)) r.how = 'badge-only seed';
  return { widthPx: W, model, holes: out };
}
