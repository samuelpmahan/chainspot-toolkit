#!/usr/bin/env node
/**
 * S3 initial association runner (node-only):
 *
 *   node ports/s3assoc/run.mjs --specimen golden --attempt ATTEMPT_ID [--out DIR]
 *
 * Reads a completed early attempt's artifacts (never re-runs the provider):
 *   early/artifacts/s1/badgePx.rgba.bin       canonical RGB (alpha ignored)
 *   early/artifacts/s1/px.badges.json          badges: px, mute px, bright frame bbox (centre), label
 *   early/artifacts/s2/px.baskets.json         baskets: px, shell black px, bbox (BasketPoint)
 *   early/artifacts/s3fix/px.tees.refined.json visible tees (seed centre, angle) and px
 *   early/artifacts/s3fix/px.tees.family-refined.json pad model (seed size)
 * fits every visible pad as an AA render (fn.Tee.poseAA, ./padPose.mjs), takes the
 * course template as the median of the clean fits, associates each pad with its
 * badge and tests the straight-hole continuation (fn.Tee.associate,
 * ./associate.mjs), and judges against Sam's testimony when the specimen has one
 * (agreement is reported, never accepted). Writes <out>/px.tees.association.json
 * (default attempts/stages/<id>/fork/stage-output/s3assoc/).
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fitPadPose } from './padPose.mjs';
import { associate, basketPoint, pathSide, ASSOC_BOUNDS, ASSOC_UNITS, BASKET_POINT_OFFSET } from './associate.mjs';

const ROOT = resolve(import.meta.dirname, '..', '..');
/** annotation-frame -> canonical-frame row offsets (px), per testimony/<specimen>/README.md */
const TESTIMONY_DY = Object.freeze({ golden: 4, lenard: 2, townelake: 1, heritage: 2 });
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; };
const r3 = (v) => Math.round(v * 1000) / 1000;

export function runAssociation({ attempt, specimen, root = ROOT }) {
  const A = join(root, 'attempts', 'stages', attempt, 'fork', 'stage-output', 'early', 'artifacts');
  const badgesArt = readJson(join(A, 's1', 'px.badges.json'));
  const { widthPx, heightPx } = badgesArt.image;
  const rgba = new Uint8Array(readFileSync(join(A, 's1', 'badgePx.rgba.bin')));
  const raster = { rgba, widthPx, heightPx };
  const baskets = readJson(join(A, 's2', 'px.baskets.json')).baskets;
  const tees = readJson(join(A, 's3fix', 'px.tees.refined.json')).tees;
  const model = readJson(join(A, 's3fix', 'px.tees.family-refined.json')).model;

  // Occluders: every badge (px + mute), every basket (px + shell, +1 px AA fringe); each pad also excludes the other pads (+1 px).
  const N = widthPx * heightPx, base = new Uint8Array(N);
  for (const b of badgesArt.badges) { for (const p of b.px) base[p] = 1; for (const p of b.mute?.px ?? []) base[p] = 1; }
  const bk = new Uint8Array(N);
  for (const k of baskets) { for (const p of k.px) bk[p] = 1; for (const p of k.shell?.blackPx ?? []) bk[p] = 1; }
  const dilate = (m) => { const o = new Uint8Array(m); for (let i = 0; i < N; i++) if (m[i]) { const x = i % widthPx; if (x > 0) o[i - 1] = 1; if (x < widthPx - 1) o[i + 1] = 1; if (i >= widthPx) o[i - widthPx] = 1; if (i < N - widthPx) o[i + widthPx] = 1; } return o; };
  const bkD = dilate(bk); for (let i = 0; i < N; i++) if (bkD[i]) base[i] = 1;
  const teeMasks = tees.map((t) => { const m = new Uint8Array(N); for (const p of t.px) m[p] = 1; return dilate(m); });

  const seedT = { L: model.major.median - 0.7, W: model.minor.median - 0.7, se: 3.6, ss: 3.0 };
  const fits = tees.map((t, i) => {
    const occ = new Uint8Array(base);
    teeMasks.forEach((m, j) => { if (j !== i) for (let k = 0; k < N; k++) if (m[k]) occ[k] = 1; });
    return { label: t.label, s3: { center: t.center, angleDeg: (t.angleRad * 180) / Math.PI }, ...fitPadPose({ raster, occ, seed: { cx: t.center[0], cy: t.center[1], th: t.angleRad }, tmpl: seedT }) };
  });
  const occAll = new Uint8Array(base); teeMasks.forEach((m) => { for (let k = 0; k < N; k++) if (m[k]) occAll[k] = 1; });
  const clean = fits.filter((f) => f.clean);
  const template = { L: median(clean.map((f) => f.L)), W: median(clean.map((f) => f.W)), se: median(clean.map((f) => f.se)), ss: median(clean.map((f) => f.ss)), fromCleanPads: clean.length };
  // Pass 2: pads are rigid per course, so refit pose only against the course template (size can no longer trade
  // against angle on small pads), and measure each pad's own pose uncertainty.
  const free = fits.slice();
  fits.forEach((f, i) => {
    const occ = new Uint8Array(base);
    teeMasks.forEach((m, j) => { if (j !== i) for (let k = 0; k < N; k++) if (m[k]) occ[k] = 1; });
    fits[i] = { ...f, ...fitPadPose({ raster, occ, seed: { cx: f.cx, cy: f.cy, th: f.thRad }, tmpl: { L: template.L, W: template.W, se: template.se, ss: template.ss }, fixShape: true }), freeShape: { L: f.L, W: f.W, thDeg: f.thDeg, cx: f.cx, cy: f.cy } };
  });

  const badges = badgesArt.badges.map((b) => {
    // Centre of the whole badge sprite (bbox; the dark plate shares it). Not the first bright part: on badges whose
    // white frame is not its own S1 part (lenard 12; heritage 12, 13, 15; alex 18) that part is the digit "1".
    const [x, y, w, h] = b.bbox;
    return { label: String(b.label), center: [x + (w - 1) / 2, y + (h - 1) / 2] };
  });
  const rows = associate({ tees: fits.map((f, i) => ({ label: f.label, center: [f.cx, f.cy], thRad: f.thRad, sigmaThRad: (f.sigma.thDeg * Math.PI) / 180, pathSide: pathSide({ raster, occ: occAll, center: [f.cx, f.cy], thRad: f.thRad, L: template.L, W: template.W }) })), badges, baskets: baskets.map((k, i) => ({ index: k.index ?? i, bbox: k.bbox })), padLengthPx: template.L });
  rows.forEach((r, i) => { const f = fits[i]; r.pose = { cx: r3(f.cx), cy: r3(f.cy), thDeg: r3(f.thDeg), sigmaRaw: { thDeg: r3(f.sigma.thDeg), xPx: r3(f.sigma.xPx), yPx: r3(f.sigma.yPx) }, freeShapeThDeg: r3(f.freeShape.thDeg), L: r3(f.L), W: r3(f.W), se: r3(f.se), ss: r3(f.ss), rmsRgb: r3(f.rms), clean: f.clean, s3AngleDiffDeg: r3(((f.thDeg - f.s3.angleDeg + 90) % 180 + 180) % 180 - 90) }; });

  // Judge against Sam's testimony (agreement only).
  let judgement = null;
  const tdir = join(root, 'testimony', specimen);
  if (specimen in TESTIMONY_DY && existsSync(tdir)) {
    const file = readdirSync(tdir).find((f) => f.endsWith('.annotation.json'));
    const holes = readJson(join(tdir, file)).holes.map((h) => ({ n: h.number, tee: [h.tee.xPx, h.tee.yPx - TESTIMONY_DY[specimen]], basket: [h.basket.xPx, h.basket.yPx - TESTIMONY_DY[specimen]], bent: (h.corridorBends ?? []).length > 0 }));
    const bps = baskets.map((k, i) => ({ index: k.index ?? i, p: basketPoint(k.bbox) }));
    const per = rows.map((r) => {
      const h = holes.reduce((a, b) => (Math.hypot(b.tee[0] - r.center[0], b.tee[1] - r.center[1]) < Math.hypot(a.tee[0] - r.center[0], a.tee[1] - r.center[1]) ? b : a));
      const d = Math.hypot(h.tee[0] - r.center[0], h.tee[1] - r.center[1]);
      if (d > 8) return { tee: r.tee, hole: null };
      const kb = bps.reduce((a, b) => (Math.hypot(b.p[0] - h.basket[0], b.p[1] - h.basket[1]) < Math.hypot(a.p[0] - h.basket[0], a.p[1] - h.basket[1]) ? b : a));
      const kbDist = Math.hypot(kb.p[0] - h.basket[0], kb.p[1] - h.basket[1]);
      return { tee: r.tee, hole: h.n, bent: h.bent, badgeAgrees: r.best?.badge === String(h.n), straightCandidate: r.straight?.verdict === 'STRAIGHT_CANDIDATE',
        straightBasketAgrees: r.straight?.verdict === 'STRAIGHT_CANDIDATE' ? (kbDist < 12 && r.straight.basket === kb.index) : null, samBasketSeenInS2: kbDist < 12,
        straight3: r.straight3?.verdict === 'STRAIGHT', straight3BasketAgrees: r.straight3?.verdict === 'STRAIGHT' ? (kbDist < 12 && r.straight3.basket === kb.index) : null };
    });
    const j = per.filter((p) => p.hole);
    judgement = { rule: 'agreement with Sam\'s annotation; never acceptance', canonicalDy: TESTIMONY_DY[specimen], perTee: per,
      badge: { agree: j.filter((p) => p.badgeAgrees).length, of: j.length },
      straight: { straightHolesCalledStraight: j.filter((p) => !p.bent && p.straightCandidate).length, straightHoles: j.filter((p) => !p.bent).length,
        straightHolesWithBasketUnseenInS2: j.filter((p) => !p.bent && !p.samBasketSeenInS2).length,
        bentHolesCalledStraight: j.filter((p) => p.bent && p.straightCandidate).map((p) => p.hole), basketAgrees: j.filter((p) => p.straightBasketAgrees === true).length, basketDisagrees: j.filter((p) => p.straightBasketAgrees === false).map((p) => p.hole) },
      straight3: { straightHolesCalledStraight: j.filter((p) => !p.bent && p.straight3).length, straightHolesWithBasketSeen: j.filter((p) => !p.bent && p.samBasketSeenInS2).length,
        bentHolesCalledStraight: j.filter((p) => p.bent && p.straight3).map((p) => p.hole), basketAgrees: j.filter((p) => p.straight3BasketAgrees === true).length, basketDisagrees: j.filter((p) => !p.bent && p.straight3BasketAgrees === false).map((p) => p.hole) } };
  }
  return {
    schema: 'nctk-s3-tee-association@1', part: 'px.tees.association', producedBy: 'fn.Tee.associate (+ fn.Tee.poseAA)', specimen, attempt,
    image: { widthPx, heightPx }, bounds: ASSOC_BOUNDS, units: { ...ASSOC_UNITS, pose: 'px, deg; rmsRgb RGB level' }, basketPointOffsetPx: BASKET_POINT_OFFSET,
    template: { ...Object.fromEntries(Object.entries(template).map(([k, v]) => [k, typeof v === 'number' && k !== 'fromCleanPads' ? r3(v) : v])), unit: 'px' },
    counts: { tees: rows.length, inspect: rows.filter((r) => r.inspect).map((r) => r.tee), associated: rows.filter((r) => r.verdict === 'ASSOCIATED').length, associatedByExclusivity: rows.filter((r) => r.verdict === 'ASSOCIATED_BY_EXCLUSIVITY').length, badgeOnPathSide: rows.filter((r) => r.badgeOnPathSide === true).length, badgeOffPathSide: rows.filter((r) => r.badgeOnPathSide === false).map((r) => r.tee), ambiguous: rows.filter((r) => r.verdict === 'AMBIGUOUS').length, noBadge: rows.filter((r) => !r.best).length, straightCandidates: rows.filter((r) => r.straight?.verdict === 'STRAIGHT_CANDIDATE').length },
    rows, judgement
  };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) {
  const arg = (k) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : null; };
  const attempt = arg('--attempt'), specimen = arg('--specimen');
  if (!attempt || !specimen) { console.error('Usage: node ports/s3assoc/run.mjs --specimen NAME --attempt ATTEMPT_ID [--out DIR]'); process.exit(2); }
  const out = arg('--out') ?? join(ROOT, 'attempts', 'stages', attempt, 'fork', 'stage-output', 's3assoc');
  const t0 = Date.now(); const res = runAssociation({ attempt, specimen });
  mkdirSync(out, { recursive: true }); writeFileSync(join(out, 'px.tees.association.json'), JSON.stringify(res, null, 1));
  console.log(JSON.stringify({ specimen, out, seconds: (Date.now() - t0) / 1000, template: res.template, counts: res.counts, badge: res.judgement?.badge ?? null, straight: res.judgement?.straight ?? null, straight3: res.judgement?.straight3 ?? null }));
}
