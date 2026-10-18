/**
 * fn.tk.s7.alphaProfile -> tk.s7.alphaProfile (contracts/alpha.profile@1.mjs; docs/agents/calculations.md).
 * Sam, 2026-10-18: "S7 alpha composition informs S5 learning and S6 discrimination".
 *
 * Per overlay class, the colour and alpha the app composites with (observed = alpha * rgb + (1 - alpha) * bg), fitted
 * on edges whose geometry is known:
 *   c1Fill  the C1 fill edge at R1 around every BasketPoint (inside: C1 fill over C2 fill over bg; outside: C2 fill over
 *           bg; so the fitted layer is exactly what separates a pixel inside C1 from its look outside C1, whatever the
 *           z-order of the two fills)
 *   c2Fill  the C2 fill edge at 2 x R1 (inside: C2 fill over bg; outside: bg)
 *   path    the hole path ribbon along the tee -> badge segment of every associated S3 tee (Sam: "the tee -> badge
 *           segment is straight hallway"), edge at half the hallway width learned by S4 (tk.s4.hallway)
 *   c2Dash  not fitted: the dash phase is not modelled (fg/scene/parts.mjs C2D dashPhaseModelled: false)
 * R1 comes from the rings only (DOCTRINE): fn.q.alpha.ringScale, the (R, 2R) radial luminance pair.
 *
 * Estimator (fg/alpha/alphaSpace.mjs fitOverlay, method 'contrast'): the overlay scales the background's texture by
 * (1 - alpha), so the slope is the square root of the pooled inside / outside texture variance, divided by the same
 * ratio on control edges of identical geometry that straddle no overlay edge (C1: inside the C2 annulus; C2: the
 * annulus and the terrain beyond it; path: parallel lines inside and outside the ribbon); the intercepts (alpha * rgb)
 * come from the means. Regression of inside on outside means is NOT used for the slope: the outside px is a neighbour
 * of the background, not the background, so it attenuates the slope (on golden OLS gives alpha 0.36-0.56 for C1 with
 * the gap; contrast 0.24-0.30). A fit whose rgb leaves 0..255 is bounded to the smallest alpha that keeps it inside.
 *
 * Total: every missing input is a recorded condition ({ status: 'not fitted', reason }), never a throw.
 */
import { ALPHA_PROFILE_PART, ALPHA_PROFILE_SCHEMA, OVERLAY_CLASSES } from '../../contracts/alpha.profile@1.mjs';
import { ALPHA_GEOMETRY } from './alphaSpace.mjs';
import { basketPoint } from '../s2/fg.s2.basketInvariants.observe.fg.mjs';
import { nameCandidates } from '../names.mjs';
import { padFromScale } from '../scene/invariants.mjs';

export const ALPHA_PROFILE_FN = 'fn.tk.s7.alphaProfile';
export const STRAIGHT_SEGMENTS_FN = 'fn.tk.s7.straightSegments';
export const STRAIGHT_SEGMENTS_PART = 'tk.s7.straightSegments';
/** Lane outputs that are not on the S3 board enter as one named constant (docs/agents/parts.md). */
export const ASSOCIATION_PART = 'tk.s3assoc.association';
export const COURSE_PART = 'tk.s7.course';
export const SPRITES = Object.freeze(['px.baskets', 'px.badges', 'px.tees', 'px.tees.refined']);   // opaque, drawn above every overlay
const RASTER = 'px.image.cropped';
const ALPHA_CALLS = Object.freeze(['fn.q.alpha.ringScale', 'fn.q.alpha.ringSamples', 'fn.q.alpha.ribbonSamples', 'fn.q.alpha.fitOverlay', 'fn.q.alpha.spritesInWindow']);
const RENDER_WINDOW_PX = 270;   // px: the render crops (<= 260 px) fit inside it

/** The geometries the fit runs at: the first is the reported value, the spread of all enters the sigmas. */
export const FIT_GEOMETRIES = Object.freeze([{ binArcPx: 6, depthPx: 4 }, { binArcPx: 6, depthPx: 2 }, { binArcPx: 12, depthPx: 4 }, { binArcPx: 12, depthPx: 2 }]);

/**
 * The shot, called before the first full run (2026-10-18), graded by fg/alpha/run.mjs against every course:
 *   c1Fill and c2Fill were called after exploratory golden fits (so golden grades the method, the other courses the call);
 *   path was called blind.
 */
export const CALLED_SHOT = Object.freeze({
  c1Fill: { alpha: [0.22, 0.38], rgb: 'green, G the largest channel', note: 'exploratory golden fits gave 0.24-0.30 (contrast) and 0.36-0.46 (attenuated OLS)' },
  c2Fill: { alpha: [0.12, 0.28], rgb: 'green, G the largest channel', note: 'lighter than C1: the annulus is visibly less tinted than the C1 disc' },
  path: { alpha: [0.2, 0.45], rgb: 'light neutral grey, every channel within 20 levels of the others, >= 180', note: 'blind: DOCTRINE "semi-transparent grey hole path"' },
  scope: 'GLOBAL: the app draws one style, so alpha and rgb agree across courses and zoom scales within 2 sigma'
});

const r3 = (v) => Math.round(v * 1000) / 1000;
const r2 = (v) => Math.round(v * 100) / 100;
const notFitted = (reason) => ({ status: 'not fitted', reason });
const sd = (v) => { if (v.length < 2) return 0; const m = v.reduce((a, b) => a + b, 0) / v.length; return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / (v.length - 1)); };

/** The smallest alpha >= a that keeps rgb in 0..255 given the mean inside / outside colours (8-bit overlay colours). */
function boundAlpha(fit, pairs) {
  const n = pairs.length, mi = [0, 1, 2].map((c) => pairs.reduce((s, p) => s + p.in[c], 0) / n), mo = [0, 1, 2].map((c) => pairs.reduce((s, p) => s + p.out[c], 0) / n);
  let lo = 0, why = null;
  for (let c = 0; c < 3; c++) {
    const up = mo[c] < 255 ? (mi[c] - mo[c]) / (255 - mo[c]) : 0, dn = mo[c] > 0 ? (mo[c] - mi[c]) / mo[c] : 0;
    if (up > lo) { lo = up; why = `rgb[${c}] <= 255`; } if (dn > lo) { lo = dn; why = `rgb[${c}] >= 0`; }
  }
  if (fit.alpha >= lo) return { ...fit, bounded: null };
  const a = lo, rgb = [0, 1, 2].map((c) => (mi[c] - (1 - a) * mo[c]) / a);
  return { ...fit, alpha: r3(a), rgb: rgb.map(r2), bounded: `fitted alpha ${fit.alpha} put rgb outside 0..255; raised to ${r3(a)} (${why})` };
}

/**
 * Fit one class over every geometry: edge(g) and control(g) give { pairs, counts } from the queries. The first
 * geometry's fit is the value; sigma = sqrt(jackknife^2 + spread over geometries^2).
 */
function fitClass(call, { edge, control, fitOn }) {
  const runs = FIT_GEOMETRIES.map((g) => {
    const e = edge(g), c = control(g);
    const f = call('fn.q.alpha.fitOverlay', { pairs: e.pairs, options: { method: 'auto', control: c.pairs } }).value;
    return { g, e, c, f: f.status ? f : boundAlpha(f, e.pairs) };
  });
  const main = runs[0];
  if (main.f.status) return { overlay: notFitted(main.f.reason), diag: { counts: main.e.counts, rule: main.e.rule } };
  const ok = runs.filter((r) => !r.f.status);
  const spreadA = sd(ok.map((r) => r.f.alpha)), spreadRgb = [0, 1, 2].map((c) => sd(ok.map((r) => r.f.rgb[c])));
  const f = main.f;
  const overlay = {
    rgb: f.rgb, alpha: f.alpha,
    sigmaRgb: f.sigmaRgb.map((s, c) => r2(Math.hypot(s ?? 0, spreadRgb[c]))), sigmaAlpha: r3(Math.hypot(f.sigmaAlpha ?? 0, spreadA)),
    samplesPx: main.e.counts.keptPx, fitOn, residualRms: f.residualRms
  };
  const diag = {
    estimator: f.method, estimatorWhy: f.methodWhy, pairs: f.n, trimmedPairs: f.trimmedPairs, controlPairs: f.controlPairs, controlRatio: f.reliability, groups: f.groups, jackknife: f.jackknife,
    sigmaAlphaJackknife: f.sigmaAlpha, alphaSpreadOverGeometries: r3(spreadA), alphaByGeometry: ok.map((r) => ({ binArcPx: r.g.binArcPx, depthPx: r.g.depthPx, alpha: r.f.alpha, rgb: r.f.rgb })),
    alphaOls: f.alphaOls, bounded: f.bounded, counts: main.e.counts, controlCounts: main.c.counts, rule: main.e.rule, residualHistogram: f.residualHistogram
  };
  return { overlay, diag };
}

/** fn.tk.s7.straightSegments: the tee -> badge segment of every associated tee (Sam: straight hallway). */
export const straightSegments = [STRAIGHT_SEGMENTS_FN, {
  inParts: [ASSOCIATION_PART, 'px.badges'], outParts: [STRAIGHT_SEGMENTS_PART],
  calculate: (io) => {
    const assoc = io.in(ASSOCIATION_PART), badges = io.in('px.badges');
    const rule = 'tee -> badge segment of every S3 tee with an associated badge (ports/s3assoc best.badge): Sam, "the tee -> badge segment is straight hallway"; tee = S3 refined pad centre, badge = plate bbox centre (canonical px)';
    if (!assoc || !Array.isArray(assoc.rows)) return { [STRAIGHT_SEGMENTS_PART]: { segments: [], rule, condition: assoc?.absent ?? 'no S3 association: lane not run', emits: { segments: 0 } } };
    const centre = new Map(badges.map((b) => [String(b.label), [b.bbox[0] + (b.bbox[2] - 1) / 2, b.bbox[1] + (b.bbox[3] - 1) / 2]]));
    const segments = assoc.rows.filter((r) => r.best && Array.isArray(r.center) && centre.has(String(r.best.badge)))
      .map((r) => ({ name: `${r.candidate ?? 'Tee'} -> Badge ${r.best.badge}`, tee: r.candidate ?? null, badge: String(r.best.badge), a: r.center, b: centre.get(String(r.best.badge)), lengthPx: r2(Math.hypot(centre.get(String(r.best.badge))[0] - r.center[0], centre.get(String(r.best.badge))[1] - r.center[1])) }));
    return { [STRAIGHT_SEGMENTS_PART]: { segments, rule, condition: segments.length ? null : 'no associated tee: no straight segment', emits: { segments: segments.length } } };
  }
}];

export const alphaProfile = [ALPHA_PROFILE_FN, {
  inParts: [RASTER, 'px.baskets', 'px.badges', 'px.tees', 'px.tees.refined', 'tk.s4.hallway', STRAIGHT_SEGMENTS_PART, COURSE_PART], outParts: [ALPHA_PROFILE_PART],
  calls: ALPHA_CALLS,
  calculate: (io) => {
    const call = (fn, args) => io.call(fn, args);
    const baskets = io.in('px.baskets') ?? [], course = io.in(COURSE_PART);
    const names = nameCandidates('Basket', baskets, (k) => basketPoint(k.bbox));
    const centres = baskets.map((k) => basketPoint(k.bbox).map(r3));
    const overlays = {}, fit = { perClass: {}, geometry: { ...ALPHA_GEOMETRY }, geometries: FIT_GEOMETRIES };
    const scale = centres.length ? call('fn.q.alpha.ringScale', { raster: RASTER, centres, sprites: SPRITES }).value : notFitted('no baskets on the board: no rings');
    fit.scale = scale;
    const r1Px = scale.status ? null : scale.r1Px;
    // geometry of every sample: GLOBAL screen px (never map-scaled), C2 = 2 x R1 exactly
    const ringEdge = (ring, edgeRadiusPx = null) => (g) => call('fn.q.alpha.ringSamples', { raster: RASTER, centres, sprites: SPRITES, r1Px, ring, names, geometry: g, edgeRadiusPx }).value;
    const merge = (...fs) => (g) => { const rs = fs.map((f) => f(g)); return { pairs: rs.flatMap((r) => r.pairs), counts: Object.fromEntries(Object.keys(rs[0].counts).map((k) => [k, rs.reduce((s, r) => s + r.counts[k], 0)])), rule: rs.map((r) => r.rule).join('; ') }; };
    const gapOf = (ring, g) => ((ring === 'c1' ? ALPHA_GEOMETRY.c1StrokeFwhmPx : ALPHA_GEOMETRY.c2StrokeFwhmPx) / 2 + ALPHA_GEOMETRY.aaBandPx + g.depthPx);
    if (r1Px == null) {
      overlays.c1Fill = notFitted(`no ring scale: ${scale.reason}`); overlays.c2Fill = notFitted(`no ring scale: ${scale.reason}`);
    } else {
      const fitOn = `${centres.length} BasketPoints (${names.join(', ')}), fill edge at R1 = ${r1Px} px`;
      const c1 = fitClass(call, { edge: ringEdge('c1'), control: (g) => merge(ringEdge('c1', 1.5 * r1Px))(g), fitOn });
      const c2 = fitClass(call, { edge: ringEdge('c2'), control: (g) => merge(ringEdge('c1', 1.5 * r1Px), ringEdge('c2', 2 * r1Px + 2 * gapOf('c2', g) + 1))(g), fitOn: fitOn.replace('at R1 =', 'at 2 x R1, R1 =') });
      overlays.c1Fill = c1.overlay; fit.perClass.c1Fill = { ...c1.diag, control: 'the C1 control edge at 1.5 x R1 (C2 fill on both sides)' };
      overlays.c2Fill = c2.overlay; fit.perClass.c2Fill = { ...c2.diag, control: 'control edges at 1.5 x R1 (C2 fill both sides) and beyond 2 x R1 (terrain both sides)' };
      // the render's crop anchor: the most isolated basket (largest distance to its nearest neighbour)
      const img = io.in(RASTER), half = 2.2 * r1Px;
      const inside = (c) => c[0] - half >= 0 && c[1] - half >= 0 && c[0] + half < img.widthPx && c[1] + half < img.heightPx;
      const iso = centres.map((c, i) => (inside(c) ? 1e6 : 0) + Math.min(1e5, ...centres.filter((_, j) => j !== i).map((o) => Math.hypot(o[0] - c[0], o[1] - c[1]))));
      const k = iso.indexOf(Math.max(...iso));
      fit.anchors = { basket: { name: names[k], centre: centres[k], rule: 'most isolated BasketPoint (largest nearest-neighbour distance) whose C2 disc lies inside the image',
        spritesInWindow: call('fn.q.alpha.spritesInWindow', { raster: RASTER, sprites: SPRITES, centre: centres[k], size: RENDER_WINDOW_PX }).value } };
    }
    overlays.c2Dash = notFitted('dash phase not modelled (fg/scene/parts.mjs C2D dashPhaseModelled: false); its stroke and AA band are excluded from every fill sample instead');
    const hall = io.in('tk.s4.hallway'), seg = io.in(STRAIGHT_SEGMENTS_PART);
    if (!hall?.widthPx) overlays.path = notFitted('no hallway width (tk.s4.hallway null: no pad template or no tee -> badge segment)');
    else if (!seg?.segments?.length) overlays.path = notFitted(seg?.condition ?? 'no straight segment');
    else {
      const W = hall.widthPx, padHalf = r1Px ? padFromScale(r1Px).lengthPx / 2 : 0;
      const segments = seg.segments.map((s) => ({ ...s, from: padHalf, to: s.lengthPx }));
      const ribbon = (offset) => (g) => call('fn.q.alpha.ribbonSamples', { raster: RASTER, segments, widthPx: W, sprites: SPRITES, centres, r1Px: r1Px ?? 0, geometry: g, edgeOffsetPx: offset == null ? null : offset(g) }).value;
      const e = ALPHA_GEOMETRY.ribbonAaBandPx;
      const controls = (g) => { const out = [ribbon((gg) => W / 2 + 2 * (e + gg.depthPx) + 1)]; if (W / 2 - 2 * (e + g.depthPx) - 1 > e + g.depthPx) out.push(ribbon((gg) => W / 2 - 2 * (e + gg.depthPx) - 1)); return merge(...out)(g); };
      const p = fitClass(call, { edge: ribbon(null), control: controls, fitOn: `straight holes (tee -> badge segments): ${segments.map((s) => s.name).join(', ')}; ribbon edge at W/2, W = ${W} px (tk.s4.hallway)` });
      overlays.path = p.overlay; fit.perClass.path = { ...p.diag, control: 'parallel lines outside the ribbon (terrain both sides) and inside it (path both sides, when wide enough)', widthPx: W, widthRule: 'tk.s4.hallway: the W maximising the luminance step at +-W/2 on S3 tee -> badge segments, median' };
      const longest = [...segments].sort((a, b) => b.lengthPx - a.lengthPx)[0];
      const mid = [(longest.a[0] + longest.b[0]) / 2, (longest.a[1] + longest.b[1]) / 2];
      fit.anchors = { ...(fit.anchors ?? {}), segment: { name: longest.name, a: longest.a, b: longest.b, widthPx: W, rule: 'the longest straight tee -> badge segment',
        spritesInWindow: call('fn.q.alpha.spritesInWindow', { raster: RASTER, sprites: SPRITES, centre: mid, size: RENDER_WINDOW_PX }).value } };
    }
    const value = {
      schema: ALPHA_PROFILE_SCHEMA, course: course ?? null, r1Px,
      overlays: Object.fromEntries(OVERLAY_CLASSES.map((c) => [c, overlays[c]])),
      method: 'Per class, pairs of bin means straddle an edge of known geometry (C1 fill at R1, C2 fill at 2 x R1 around every BasketPoint; the path ribbon at half the learned hallway width along the straight tee -> badge segments), inside vs outside at the same angle / station; AA px excluded by geometry (stroke +- AA band, ribbon edge +- AA band, opaque sprites + 2 px fringe), never muted. The overlay scales background texture by (1 - alpha): slope = sqrt(pooled inside / outside texture variance), divided by the same ratio on control edges straddling no overlay edge; rgb = (mean inside - slope x mean outside) / alpha; bounded to rgb in 0..255. Outlier bins (spokes, crossing paths) trimmed at median + 3 MAD; sigma = sqrt(group jackknife (one group per basket / segment)^2 + spread over 4 sample geometries^2). R1 from the rings only (radial (R, 2R) luminance pair).',
      fit
    };
    const em = { r1Px: r1Px ?? -1, classesFitted: OVERLAY_CLASSES.filter((c) => overlays[c]?.alpha != null).length };
    for (const c of OVERLAY_CLASSES) { const o = overlays[c]; if (o?.alpha != null) { em[`${c}AlphaFraction`] = o.alpha; em[`${c}ResidualRmsLevels`] = o.residualRms; em[`${c}SamplesPx`] = o.samplesPx; } }
    return { [ALPHA_PROFILE_PART]: { ...value, emits: em } };
  }
}];

export const ALPHA_CALCULATIONS = Object.freeze([straightSegments, alphaProfile]);
