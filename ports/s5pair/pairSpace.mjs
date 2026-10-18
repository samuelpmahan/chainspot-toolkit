/**
 * fn.q.pair.*: the S5 axis-residual math, written once behind the PxC boundary (docs/agents/boundary.md). DOCTRINE S5:
 * "a tee's long axis points directly at its badge; residual indicts the tee fit". Code outside asks by Part address;
 * registerPairQueries(store) offers the table where the store is built. Every answer is { value, unit }, cached by its
 * arguments, profiled by the store with its emits. Arguments that are strings are Part addresses, resolved by the store
 * (px.image.cropped, px.tees, px.badges, px.baskets, tk.s7.alphaProfile); everything else is state passed in.
 *
 *   fn.q.pair.axis({ raster, tees, badges, baskets, teeIndex, template?, alphaProfile? })
 *       a tee's long axis from its pad's frame pixels: the existing AA pad fit (ports/s3assoc/padPose.mjs fitPadPose,
 *       the S3 association's fitter, wrapped, never a second one). Seed: px.tees[teeIndex] centre and angle; seed shape
 *       from the extent of its frame px along / across that angle (template, when given, fixes the shape: the course's
 *       rigid pad). Occluders are never evidence: every badge and basket (what each owns, inferred by ownedPx) and every
 *       other tee, +1 px. alphaProfile (contracts/alpha.profile@1): when it carries fitted overlay classes, each pixel
 *       of the pad window under a C1 / C2 fill disc is un-composited (unmix) before fitting; emits unmixedPx.
 *       Answer: centre px, unit direction as an AXIS (mod pi: angle in (-90, 90] deg), shape px, rms, sigma.
 *   fn.q.pair.plate({ badges, index })   a badge's plate centre px (the S1 dark plate part's bbox, pixel centres)
 *   fn.q.pair.residual({ axis, badge })  angleResidualDeg (axis vs ray tee -> badge, signed), signedPerpPx (badge
 *       centre off the axis line; + = right of the axis on screen, y down), alongPx (tee centre -> badge along the axis)
 */
import { fitPadPose } from '../s3assoc/padPose.mjs';
import { basketPoint } from '../s3assoc/associate.mjs';
import { ownedPx, forEach } from '../../fg/pxset.mjs';
import { unmix, hasOverlay, noProfile, ALPHA_PROFILE_SCHEMA } from '../../contracts/alpha.profile@1.mjs';

const DEG = 180 / Math.PI;
const r3 = (v) => Math.round(v * 1000) / 1000;
/** Frame strokes seeded at the GLOBAL screen-px values (DOCTRINE: 3.53-3.62 px ends, 3.01-3.05 px sides). */
export const FRAME_STROKE_SEED_PX = Object.freeze({ se: 3.6, ss: 3.0 });
/** Fill classes an un-composite applies to a pad window, in compositing order (bottom first); unmixed in reverse. */
export const PAD_FILL_ORDER = Object.freeze(['c2Fill', 'c1Fill']);
export const PAD_ALPHA_RULE = 'C2 fill disc (radius 2 x r1Px) composited under the C1 fill disc (radius r1Px), both centred on the BasketPoint; '
  + 'a pixel is under a disc when its centre is; unmixed C1 first, then C2. path and c2Dash are not applied to a pad (no path geometry at S5; dashes are strokes, not fills)';

/** An axis mod pi: the angle in (-90, 90] deg and its unit direction. */
export function axisOf(thRad) {
  let a = ((thRad % Math.PI) + Math.PI) % Math.PI;   // [0, pi)
  if (a > Math.PI / 2) a -= Math.PI;                // (-pi/2, pi/2]
  return { angleDeg: a * DEG, dirUnit: [Math.cos(a), Math.sin(a)] };
}

/** Seed shape from a pad's frame px: extent along and across its angle (px, inclusive of the end pixels). */
export function seedShape(px, W, angleRad) {
  const c = Math.cos(angleRad), s = Math.sin(angleRad);
  let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
  for (const i of px) { const x = i % W, y = Math.floor(i / W), a = x * c + y * s, b = -x * s + y * c; if (a < a0) a0 = a; if (a > a1) a1 = a; if (b < b0) b0 = b; if (b > b1) b1 = b; }
  const L = a1 - a0 + 1, Wd = b1 - b0 + 1;
  return L >= Wd ? { L, W: Wd, ...FRAME_STROKE_SEED_PX } : { L: Wd, W: L, ...FRAME_STROKE_SEED_PX };
}

/** The fill discs a profile implies over a course's baskets (empty when the profile has no fitted fill class). */
export function fillDiscs(baskets, profile) {
  if (!profile || profile.status === 'no alpha profile' || !Number.isFinite(profile.r1Px)) return [];
  const out = [];
  for (const cls of PAD_FILL_ORDER) {
    if (!hasOverlay(profile, cls)) continue;
    const rPx = cls === 'c2Fill' ? 2 * profile.r1Px : profile.r1Px;
    baskets.forEach((k, i) => out.push({ cls, basket: i, center: basketPoint(k.bbox), rPx, overlay: profile.overlays[cls] }));
  }
  return out;   // compositing order: every C2 fill, then every C1 fill
}

/** What the profile argument says, as a recorded condition (never a throw). */
export function profileCondition(profile) {
  if (profile == null) return noProfile('no alphaProfile argument');
  if (profile.status === 'no alpha profile') return profile;
  if (profile.schema !== ALPHA_PROFILE_SCHEMA) return noProfile(`not ${ALPHA_PROFILE_SCHEMA}: ${profile.schema ?? 'no schema'}`);
  const fitted = PAD_FILL_ORDER.filter((c) => hasOverlay(profile, c));
  return fitted.length ? { status: 'applied', classes: fitted } : noProfile(`no fill class fitted (${PAD_FILL_ORDER.join(', ')})`);
}

/**
 * The pad window (2R x 2R px at origin) as a float raster, un-composited under the discs that cover each pixel centre.
 * Returns { raster, unmixedPx, opaquePx } with the window's rgba (Float32, so no re-quantisation) and counts in px.
 */
export function padWindow(src, x0, y0, n, discs) {
  const { rgba, widthPx: Wd } = src, out = new Float32Array(n * n * 4);
  let unmixedPx = 0, opaquePx = 0;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const g = ((y0 + y) * Wd + x0 + x) * 4, d = (y * n + x) * 4;
    let rgb = [rgba[g], rgba[g + 1], rgba[g + 2]], touched = false;
    for (let k = discs.length - 1; k >= 0 && rgb; k--) {   // reverse compositing order
      const D = discs[k];
      if (Math.hypot(x0 + x - D.center[0], y0 + y - D.center[1]) > D.rPx) continue;
      rgb = unmix(rgb, D.overlay); touched = true;
    }
    if (!rgb) { opaquePx++; rgb = [rgba[g], rgba[g + 1], rgba[g + 2]]; } else if (touched) unmixedPx++;
    out[d] = rgb[0]; out[d + 1] = rgb[1]; out[d + 2] = rgb[2]; out[d + 3] = 255;
  }
  return { raster: { rgba: out, widthPx: n, heightPx: n }, unmixedPx, opaquePx };
}

/** Occluder plane for one course (badges and baskets own what ownedPx infers; tees separately, +1 px). */
function occluderPlanes(W, H, badges, baskets, tees) {
  const dilate = (m) => { const o = new Uint8Array(m); for (let i = 0; i < m.length; i++) if (m[i]) { const x = i % W; if (x > 0) o[i - 1] = 1; if (x < W - 1) o[i + 1] = 1; if (i >= W) o[i - W] = 1; if (i < m.length - W) o[i + W] = 1; } return o; };
  const base = new Uint8Array(W * H);
  for (const b of badges) forEach(ownedPx(W, H, b), (i) => { base[i] = 1; });
  const bk = new Uint8Array(W * H);
  for (const k of baskets) forEach(ownedPx(W, H, k), (i) => { bk[i] = 1; });
  const bkD = dilate(bk); for (let i = 0; i < bkD.length; i++) if (bkD[i]) base[i] = 1;
  const teeMasks = tees.map((t) => { const m = new Uint8Array(W * H); forEach(ownedPx(W, H, { px: t.px }), (i) => { m[i] = 1; }); return dilate(m); });
  return { base, teeMasks };
}

/** Plate centre of a badge: its S1 dark plate part's bbox (else the badge bbox), pixel centres (x + (w - 1) / 2). */
export function plateCenterOf(b) {
  const dark = (b.has?.findPx?.parts ?? []).find((p) => p.polarity === 'dark'), bb = dark?.bbox ?? b.bbox;
  return { center: [bb[0] + (bb[2] - 1) / 2, bb[1] + (bb[3] - 1) / 2], rule: dark ? 'S1 dark plate part bbox centre (pixel centres)' : 'S1 badge bbox centre (pixel centres; no dark plate part)' };
}

/** The residual of a badge centre against a tee axis (an axis mod pi: the sense facing the badge is chosen here). */
export function residualOf(axis, badge) {
  const v = [badge[0] - axis.center[0], badge[1] - axis.center[1]];
  let u = axis.dirUnit;
  if (u[0] * v[0] + u[1] * v[1] < 0) u = [-u[0], -u[1]];
  const alongPx = u[0] * v[0] + u[1] * v[1], signedPerpPx = u[0] * v[1] - u[1] * v[0];
  return { angleResidualDeg: Math.atan2(signedPerpPx, alongPx) * DEG, signedPerpPx, alongPx, distancePx: Math.hypot(v[0], v[1]), facing: u };
}

export const PAIR_UNITS = Object.freeze({
  axis: 'px (canonical S0-cropped frame: centre, shape); unitless dirUnit (an axis mod pi); deg (angleDeg, sigma); RGB level (rmsRgb); px (unmixedPx)',
  plate: 'px (canonical S0-cropped frame)',
  residual: 'deg (angleResidualDeg: tee axis to the ray tee centre -> badge plate centre, signed like signedPerpPx); px (signedPerpPx: badge centre off the axis line, + = right of the axis facing the badge, screen y down; alongPx, distancePx)'
});

/** The table (math once): (resolved args, raw args, memo) -> { value, unit, emits }. */
export function pairQueries() {
  const occMemo = new WeakMap();
  const occOf = (raster, badges, baskets, tees) => {
    if (!occMemo.has(tees)) occMemo.set(tees, occluderPlanes(raster.widthPx, raster.heightPx, badges, baskets, tees));
    return occMemo.get(tees);
  };
  return {
    'fn.q.pair.axis': ({ raster, tees, badges, baskets, teeIndex, template = null, alphaProfile = null }) => {
      const t = tees[teeIndex], { widthPx: Wd, heightPx: Ht } = raster;
      if (!t) return { value: { teeIndex, condition: `no tee ${teeIndex} in px.tees` }, unit: PAIR_UNITS.axis, emits: { missing: 1 } };
      const shape0 = template ?? seedShape(t.px, Wd, t.angleRad);
      const R = Math.max(28, Math.ceil(Math.hypot(shape0.L, shape0.W) / 2 + 6)), n = 2 * R;
      const x0 = Math.max(0, Math.min(Wd - n, Math.round(t.center[0]) - R)), y0 = Math.max(0, Math.min(Ht - n, Math.round(t.center[1]) - R));
      const cond = profileCondition(alphaProfile);
      const discs = cond.status === 'applied' ? fillDiscs(baskets, alphaProfile) : [];
      const win = padWindow(raster, x0, y0, n, discs);
      const { base, teeMasks } = occOf(raster, badges, baskets, tees);
      const occ = new Uint8Array(n * n);
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        const g = (y0 + y) * Wd + x0 + x;
        if (base[g] || teeMasks.some((m, j) => j !== teeIndex && m[g])) occ[y * n + x] = 1;
      }
      const f = fitPadPose({ raster: win.raster, occ, seed: { cx: t.center[0] - x0, cy: t.center[1] - y0, th: t.angleRad }, tmpl: shape0, fixShape: Boolean(template), R });
      const ax = axisOf(f.thRad);
      return {
        value: {
          teeIndex, center: [f.cx + x0, f.cy + y0], dirUnit: ax.dirUnit, angleDeg: ax.angleDeg,
          shape: { L: f.L, W: f.W, se: f.se, ss: f.ss, fixed: Boolean(template) }, rmsRgb: f.rms, clean: f.clean, nEvalPx: f.nEval,
          sigma: { thDeg: f.sigma.thDeg, xPx: f.sigma.xPx, yPx: f.sigma.yPx, raw: true },
          alpha: cond.status === 'applied' ? { status: 'applied', classes: cond.classes, discsCrossing: discs.filter((D) => Math.hypot(t.center[0] - D.center[0], t.center[1] - D.center[1]) <= D.rPx + R * Math.SQRT2).length, rule: PAD_ALPHA_RULE } : cond,
          unmixedPx: win.unmixedPx, opaqueUnderOverlayPx: win.opaquePx, windowPx: [x0, y0, n, n],
          fitter: 'ports/s3assoc/padPose.mjs fitPadPose (AA render fit)'
        },
        unit: PAIR_UNITS.axis,
        emits: { unmixedPx: win.unmixedPx, evaluatedPx: f.nEval }
      };
    },
    'fn.q.pair.plate': ({ badges, index }) => {
      const b = badges[index];
      return b ? { value: { index, label: String(b.label), ...plateCenterOf(b) }, unit: PAIR_UNITS.plate, emits: {} } : { value: { index, condition: `no badge ${index} in px.badges` }, unit: PAIR_UNITS.plate, emits: { missing: 1 } };
    },
    'fn.q.pair.residual': ({ axis, badge }) => {
      const r = residualOf(axis, badge);
      return { value: { angleResidualDeg: r.angleResidualDeg, signedPerpPx: r.signedPerpPx, alongPx: r.alongPx, distancePx: r.distancePx }, unit: PAIR_UNITS.residual, emits: { pairs: 1 } };
    }
  };
}

export const PAIR_QUERY_NAMES = Object.freeze(['fn.q.pair.axis', 'fn.q.pair.plate', 'fn.q.pair.residual']);

/**
 * Register fn.q.pair.* on a store. Each call is profiled by the store with its emits (unmixedPx for the axis), and
 * answered once per arguments. String arguments are Part addresses (resolved with store.get); the rest is state.
 */
export function registerPairQueries(store) {
  const table = pairQueries(), answers = new Map();
  for (const [fn, q] of Object.entries(table)) {
    store.register(fn, { note: 'S5 axis-residual math behind the PxC boundary (ports/s5pair/pairSpace.mjs)',
      calculate: (io) => {
        const args = io.args ?? {}, key = `${fn} ${JSON.stringify(args)}`;
        if (answers.has(key)) { const a = answers.get(key); return { value: a.value, unit: a.unit, emits: { cached: 1 } }; }
        const resolved = Object.fromEntries(Object.entries(args).map(([k, v]) => [k, typeof v === 'string' ? store.get(v) : v]));
        const ans = q(resolved);
        answers.set(key, ans);
        return { value: ans.value, unit: ans.unit, emits: { computed: 1, ...ans.emits } };
      } });
  }
  return PAIR_QUERY_NAMES;
}

export { r3 };
