/**
 * fn.Tee.poseAA: fit a rigid tee pad as an anti-aliased render, not a
 * thresholded mask (DOCTRINE: "Fit sprites as anti-aliased renders").
 *
 * Model (canonical px, pixel i's centre at i; pixel covers [i-0.5, i+0.5]):
 *   pose  (cx, cy, th)  th = long-axis angle, rad, image coords (y down)
 *   shape (L, W, se, ss) outer length/width, end/side frame stroke, px
 * Each pixel's colour = B·(1 - aFrame - aInner) + aFrame·Cframe + aInner·Cinner,
 * where a* are supersampled coverages (8 x 8 per pixel), B is the local
 * background (normalized Gaussian convolution of the window outside the pad),
 * and Cframe/Cinner are solved per channel by least squares. The pose and
 * shape minimise the squared residual (Nelder-Mead). Ported from the
 * scratchpad numpy prototype that measured Alex pads to 0.23 deg median
 * badge-ray residual (docs/evidence/ac12/README.md).
 */

const NS = 8;
const OFF = Array.from({ length: NS }, (_, i) => (i + 0.5) / NS - 0.5);

/** Supersampled soft coverage of the outer rectangle and the inner (interior) rectangle at one pixel centre. */
export function coverageAt(x, y, cx, cy, th, L, W, se, ss) {
  const c = Math.cos(th), s = Math.sin(th);
  let ao = 0, ai = 0;
  for (const oy of OFF) for (const ox of OFF) {
    const X = x + ox - cx, Y = y + oy - cy;
    const u = Math.abs(X * c + Y * s), v = Math.abs(-X * s + Y * c);
    const clip = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);
    ao += clip((L / 2 - u) * NS + 0.5) * clip((W / 2 - v) * NS + 0.5);
    ai += clip((L / 2 - se - u) * NS + 0.5) * clip((W / 2 - ss - v) * NS + 0.5);
  }
  return [ao / (NS * NS), ai / (NS * NS)];
}

const inRect = (x, y, cx, cy, th, L, W, m) => {
  const c = Math.cos(th), s = Math.sin(th), dx = x - cx, dy = y - cy;
  return Math.abs(dx * c + dy * s) <= L / 2 + m && Math.abs(-dx * s + dy * c) <= W / 2 + m;
};

function gaussKernel(sig) {
  const r = Math.ceil(3 * sig), k = [];
  for (let i = -r; i <= r; i++) k.push(Math.exp(-(i * i) / (2 * sig * sig)));
  const t = k.reduce((a, b) => a + b, 0);
  return k.map((v) => v / t);
}

/** Separable convolution of a (n x n x ch) Float64Array with zero padding. */
function convSep(img, n, ch, k) {
  const r = (k.length - 1) / 2, tmp = new Float64Array(img.length), out = new Float64Array(img.length);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) for (let c = 0; c < ch; c++) {
    let a = 0;
    for (let i = -r; i <= r; i++) { const yy = y + i; if (yy >= 0 && yy < n) a += k[i + r] * img[(yy * n + x) * ch + c]; }
    tmp[(y * n + x) * ch + c] = a;
  }
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) for (let c = 0; c < ch; c++) {
    let a = 0;
    for (let i = -r; i <= r; i++) { const xx = x + i; if (xx >= 0 && xx < n) a += k[i + r] * tmp[(y * n + xx) * ch + c]; }
    out[(y * n + x) * ch + c] = a;
  }
  return out;
}

/** Local background: normalized convolution over `keep` pixels, widening sigma (1.6, 3, 6 px) where support is thin. */
function background(obs, keep, n) {
  const B = new Float64Array(n * n * 3), done = new Uint8Array(n * n);
  for (const sig of [1.6, 3.0, 6.0]) {
    const k = gaussKernel(sig), wimg = new Float64Array(n * n * 3), w = new Float64Array(n * n);
    for (let i = 0; i < n * n; i++) { w[i] = keep[i]; for (let c = 0; c < 3; c++) wimg[i * 3 + c] = obs[i * 3 + c] * keep[i]; }
    const num = convSep(wimg, n, 3, k), den = convSep(w, n, 1, k);
    for (let i = 0; i < n * n; i++) if (!done[i] && den[i] > 0.05) { for (let c = 0; c < 3; c++) B[i * 3 + c] = num[i * 3 + c] / den[i]; done[i] = 1; }
  }
  return B;
}

export function nelderMead(f, x0, steps, iters = 500, tol = 1e-6) {
  const n = x0.length;
  let P = [x0.slice()];
  for (let i = 0; i < n; i++) { const p = x0.slice(); p[i] += steps[i]; P.push(p); }
  let F = P.map(f);
  const add = (a, b, t) => a.map((v, i) => v + t * (b[i] - v));
  for (let it = 0; it < iters; it++) {
    const o = F.map((v, i) => i).sort((a, b) => F[a] - F[b]); P = o.map((i) => P[i]); F = o.map((i) => F[i]);
    if (Math.abs(F[n] - F[0]) <= tol * (Math.abs(F[0]) + 1e-12) && it > 30) break;
    const cen = Array.from({ length: n }, (_, j) => P.slice(0, n).reduce((a, p) => a + p[j], 0) / n);
    const xr = add(cen, P[n], -1), fr = f(xr);
    if (fr < F[0]) { const xe = add(cen, P[n], -2), fe = f(xe); if (fe < fr) { P[n] = xe; F[n] = fe; } else { P[n] = xr; F[n] = fr; } }
    else if (fr < F[n - 1]) { P[n] = xr; F[n] = fr; }
    else {
      const xc = add(cen, P[n], 0.5), fc = f(xc);
      if (fc < F[n]) { P[n] = xc; F[n] = fc; }
      else { P = [P[0], ...P.slice(1).map((p) => add(P[0], p, 0.5))]; F = [F[0], ...P.slice(1).map(f)]; }
    }
  }
  let b = 0; for (let i = 1; i <= n; i++) if (F[i] < F[b]) b = i;
  return { x: P[b], f: F[b] };
}

/** Least-squares frame/interior colours per channel; returns the squared residual and the colours. */
function solve(obs, B, af, ai, idx) {
  let g00 = 1e-6, g01 = 0, g11 = 1e-6; const r0 = [0, 0, 0], r1 = [0, 0, 0];
  for (const i of idx) {
    g00 += af[i] * af[i]; g01 += af[i] * ai[i]; g11 += ai[i] * ai[i];
    for (let c = 0; c < 3; c++) { const y = obs[i * 3 + c] - B[i * 3 + c] * (1 - af[i] - ai[i]); r0[c] += af[i] * y; r1[c] += ai[i] * y; }
  }
  const det = g00 * g11 - g01 * g01, Cf = [0, 0, 0], Ci = [0, 0, 0];
  for (let c = 0; c < 3; c++) { Cf[c] = (g11 * r0[c] - g01 * r1[c]) / det; Ci[c] = (g00 * r1[c] - g01 * r0[c]) / det; }
  let sse = 0;
  for (const i of idx) for (let c = 0; c < 3; c++) {
    const p = B[i * 3 + c] * (1 - af[i] - ai[i]) + af[i] * Cf[c] + ai[i] * Ci[c]; sse += (obs[i * 3 + c] - p) ** 2;
  }
  return { sse, Cf, Ci };
}

/**
 * Fit one pad. raster: { rgba, widthPx, heightPx }; occ: Uint8Array (1 = owned by another sprite, never evidence);
 * seed: { cx, cy, th }; tmpl: { L, W, se, ss } starting shape; fixShape: fit pose only with tmpl's shape.
 * Returns pose/shape in px and rad plus the residual rms (RGB level) and whether any evaluated pixel was occluded.
 */
export function fitPadPose({ raster, occ, seed, tmpl, fixShape = false, R = 28 }) {
  const { rgba, widthPx: Wd, heightPx: Ht } = raster, n = 2 * R;
  const x0 = Math.max(0, Math.min(Wd - n, Math.round(seed.cx) - R)), y0 = Math.max(0, Math.min(Ht - n, Math.round(seed.cy) - R));
  const obs = new Float64Array(n * n * 3), occW = new Uint8Array(n * n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const g = (y0 + y) * Wd + x0 + x, i = y * n + x;
    for (let c = 0; c < 3; c++) obs[i * 3 + c] = rgba[g * 4 + c];
    occW[i] = occ ? occ[g] : 0;
  }
  const X = (i) => x0 + (i % n), Y = (i) => y0 + Math.floor(i / n);
  let q = [seed.cx, seed.cy, seed.th, tmpl.L, tmpl.W, tmpl.se, tmpl.ss];
  const af = new Float64Array(n * n), ai = new Float64Array(n * n);
  let B, idx;
  const objective = (p) => {
    const full = fixShape ? [...p, ...q.slice(3)] : p;
    const [cx, cy, th, L, W, se, ss] = full;
    if (L < 4 || W < 4 || se < 0.3 || ss < 0.3 || 2 * se > L - 1 || 2 * ss > W - 1) return 1e18;
    for (const i of idx) { const [a, b] = coverageAt(X(i), Y(i), cx, cy, th, L, W, se, ss); af[i] = a - b; ai[i] = b; }
    return solve(obs, B, af, ai, idx).sse;
  };
  for (let outer = 0; outer < 3; outer++) {
    const keep = new Uint8Array(n * n); idx = [];
    for (let i = 0; i < n * n; i++) {
      if (!occW[i] && !inRect(X(i), Y(i), q[0], q[1], q[2], q[3], q[4], 1.5)) keep[i] = 1;
      if (!occW[i] && inRect(X(i), Y(i), q[0], q[1], q[2], q[3], q[4], 3.0)) idx.push(i);
    }
    B = background(obs, keep, n);
    if (fixShape) {
      q = [...nelderMead(objective, q.slice(0, 3), [0.4, 0.4, 0.02], 400).x, ...q.slice(3)];
      q = [...nelderMead(objective, q.slice(0, 3), [0.2, 0.2, 0.01], 300).x, ...q.slice(3)];
    } else {
      q = nelderMead(objective, q, [0.4, 0.4, 0.02, 0.6, 0.6, 0.3, 0.3], 700).x;
      q = nelderMead(objective, q, [0.2, 0.2, 0.01, 0.3, 0.3, 0.15, 0.15], 500).x;
    }
  }
  const sse = objective(fixShape ? q.slice(0, 3) : q);
  let clean = true;
  for (let i = 0; i < n * n; i++) if (occW[i] && inRect(X(i), Y(i), q[0], q[1], q[2], q[3], q[4], 3.0)) { clean = false; break; }
  if (q[4] > q[3]) q = [q[0], q[1], q[2] + Math.PI / 2, q[4], q[3], q[6], q[5]];
  q[2] = ((q[2] + Math.PI / 2) % Math.PI + Math.PI) % Math.PI - Math.PI / 2;
  return { cx: q[0], cy: q[1], thRad: q[2], thDeg: (q[2] * 180) / Math.PI, L: q[3], W: q[4], se: q[5], ss: q[6], rms: Math.sqrt(sse / (idx.length * 3)), nEval: idx.length, clean };
}
