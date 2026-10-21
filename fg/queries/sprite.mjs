/**
 * fn.q.sprite.*: the instances of one screen-fixed sprite, overlapped (Sam, 2026-10-21: "we need to learn and carry in the
 * frame shape by overlapping frames"; "overlapping may give a more precise shape to everything"). Math written once behind
 * the PxC boundary (docs/agents/boundary.md); any sprite, any anchor, either polarity.
 *
 * fn.q.sprite.overlap { source, instances, window, factor?, polarity?, level?, refinePx?, anchorRule? }
 *   source     a Part reference: a 0/1 mask { width, height, data }, the component fields { bright: { mask }, dark: { mask } }
 *              (polarity picks the mask), or a raster { widthPx, heightPx, rgba } (coverage from LOCAL levels, below)
 *   instances  [{ anchor: [x, y] } | { bbox: [x, y, w, h] }]: one per instance, in image px (pixel i's centre at i). A bbox is
 *              anchored by anchorRule: 'origin' (its top-left px) or 'centre'. Sub-pixel anchors are allowed.
 *   window     { width, height, anchorAt: [ax, ay] }: the sprite frame in px, and where the anchor sits in it
 *   factor     fine cells per px per axis (integer, default 1): at factor f the window is sampled at f x f cells per px,
 *              each instance bilinearly at its own sub-pixel position, so instances at different sub-pixel phases fill
 *              in a super-resolved shape
 *   polarity   'dark' | 'bright' (default 'dark'): which mask of component fields, which end of a raster's levels
 *   level      the agreement a cell needs to be in the shape: a fraction of the members (default 0.5)
 *   refinePx   re-register every instance by up to this many px (steps of 1 / factor) against the first consensus, keeping
 *              the shift with the least residual (default 0: registered exactly on the anchor)
 * Coverage of one instance at one cell is in 0..1: the mask's value, bilinear between px centres; for a raster, LOCAL
 * levels per instance: paper = the median luminance of its window, ink = its 5th (dark) / 95th (bright) percentile,
 * coverage = clamp((paper - v) / (paper - ink)) (dark; mirrored for bright). Outside the image, coverage is 0.
 *
 * Answer: { schema 'nctk-sprite-overlap@1', fineWidth, fineHeight, memberCount, mean (Float32Array, mean coverage per
 * cell), agree (Uint16Array, members with coverage >= 0.5 per cell), agreementCount (= ceil(level x members)), shape
 * (Uint8Array, agree >= agreementCount), members [{ anchor, phase, shift, residual }] }.
 * Units: px (anchors, phases, shifts; window), cells (fine grid, 1 / factor px), coverage fraction 0..1, members (count).
 */
export const SPRITE_OVERLAP_SCHEMA = 'nctk-sprite-overlap@1';
const LUMA = (r, g, b) => (r * 299 + g * 587 + b * 114) / 1000;

/** The 0..1 coverage sampler over a source (mask, component fields, or raster with per-instance local levels). */
function coverageOf(source, polarity) {
  const mask = source?.data && Number.isInteger(source.width) ? source : source?.[polarity]?.mask ?? null;
  if (mask) {
    const { width: W, height: H, data } = mask;
    const at = (x, y) => (x >= 0 && y >= 0 && x < W && y < H ? (data[y * W + x] ? 1 : 0) : 0);
    return { W, H, sampler: () => (x, y) => bilinear(at, x, y) };
  }
  if (source?.rgba && Number.isInteger(source.widthPx)) {
    const { widthPx: W, heightPx: H, rgba } = source;
    const lum = (x, y) => { const p = (y * W + x) * 4; return LUMA(rgba[p], rgba[p + 1], rgba[p + 2]); };
    return {
      W, H,
      sampler: (x0, y0, w, h) => {   // LOCAL levels: this instance's window
        const vals = [];
        for (let y = Math.max(0, Math.floor(y0)); y < Math.min(H, Math.ceil(y0 + h)); y++)
          for (let x = Math.max(0, Math.floor(x0)); x < Math.min(W, Math.ceil(x0 + w)); x++) vals.push(lum(x, y));
        vals.sort((a, b) => a - b);
        const q = (f) => (vals.length ? vals[Math.min(vals.length - 1, Math.floor(f * vals.length))] : 0);
        const paper = q(0.5), ink = polarity === 'dark' ? q(0.05) : q(0.95), span = paper - ink || 1;
        const cov = (x, y) => (x >= 0 && y >= 0 && x < W && y < H ? Math.min(1, Math.max(0, (paper - lum(x, y)) / span)) : 0);
        return (x, y) => bilinear(cov, x, y);
      }
    };
  }
  throw new Error('fn.q.sprite.overlap: source is not a mask, component fields or a raster');
}

function bilinear(at, x, y) {
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  if (fx === 0 && fy === 0) return at(x0, y0);
  return (1 - fx) * (1 - fy) * at(x0, y0) + fx * (1 - fy) * at(x0 + 1, y0) + (1 - fx) * fy * at(x0, y0 + 1) + fx * fy * at(x0 + 1, y0 + 1);
}

const anchorOf = (it, rule) => {
  if (Array.isArray(it.anchor)) return it.anchor;
  if (Array.isArray(it.bbox)) { const [x, y, w, h] = it.bbox; return rule === 'centre' ? [x + (w - 1) / 2, y + (h - 1) / 2] : [x, y]; }
  throw new Error('fn.q.sprite.overlap: an instance needs an anchor or a bbox');
};

/** The overlap of the instances of one sprite (pure; the query below is how stages ask for it). */
export function spriteOverlap({ source, instances, window, factor = 1, polarity = 'dark', level = 0.5, refinePx = 0, anchorRule = 'origin' }) {
  if (!Number.isInteger(factor) || factor < 1) throw new Error('fn.q.sprite.overlap: factor must be an integer >= 1');
  const { W, H, sampler } = coverageOf(source, polarity);
  const fw = window.width * factor, fh = window.height * factor, n = fw * fh, [ax, ay] = window.anchorAt;
  const cell = (u) => (u + 0.5) / factor - 0.5;   // fine cell centre, in window px
  const members = instances.map((it) => {
    const anchor = anchorOf(it, anchorRule), x0 = anchor[0] - ax, y0 = anchor[1] - ay;
    return { anchor, x0, y0, sample: sampler(x0, y0, window.width, window.height) };
  });
  const coverage = (m, sx, sy, out) => { for (let v = 0, i = 0; v < fh; v++) for (let u = 0; u < fw; u++, i++) out[i] = m.sample(m.x0 + cell(u) + sx, m.y0 + cell(v) + sy); return out; };
  const accumulate = (shifts) => {
    const mean = new Float32Array(n), agree = new Uint16Array(n), buf = new Float64Array(n), sum = new Float64Array(n);
    members.forEach((m, k) => { coverage(m, shifts[k][0], shifts[k][1], buf); for (let i = 0; i < n; i++) { sum[i] += buf[i]; if (buf[i] >= 0.5) agree[i]++; } });
    for (let i = 0; i < n; i++) mean[i] = members.length ? sum[i] / members.length : 0;
    return { mean, agree };
  };
  const residual = (m, sx, sy, mean, buf) => { coverage(m, sx, sy, buf); let s = 0; for (let i = 0; i < n; i++) s += Math.abs(buf[i] - mean[i]); return s / n; };
  let shifts = members.map(() => [0, 0]), acc = accumulate(shifts);
  const buf = new Float64Array(n);
  if (refinePx > 0 && members.length > 1) {
    const steps = Math.round(refinePx * factor);
    shifts = members.map((m) => {
      let best = [0, 0], bestR = residual(m, 0, 0, acc.mean, buf);
      for (let j = -steps; j <= steps; j++) for (let i = -steps; i <= steps; i++) {
        if (!i && !j) continue;
        const r = residual(m, i / factor, j / factor, acc.mean, buf);
        if (r < bestR - 1e-12) { bestR = r; best = [i / factor, j / factor]; }
      }
      return best;
    });
    acc = accumulate(shifts);
  }
  const agreementCount = Math.ceil(level * members.length);
  const shape = new Uint8Array(n);
  if (members.length) for (let i = 0; i < n; i++) shape[i] = acc.agree[i] >= agreementCount ? 1 : 0;
  return {
    schema: SPRITE_OVERLAP_SCHEMA, polarity, factor, level, window: { width: window.width, height: window.height, anchorAt: [ax, ay] },
    fineWidth: fw, fineHeight: fh, memberCount: members.length, agreementCount, sourceSize: [W, H],
    mean: acc.mean, agree: acc.agree, shape,
    members: members.map((m, k) => ({
      anchor: m.anchor, phase: [m.anchor[0] - Math.floor(m.anchor[0]), m.anchor[1] - Math.floor(m.anchor[1])], shift: shifts[k],
      residual: residual(m, shifts[k][0], shifts[k][1], acc.mean, buf)
    }))
  };
}

/** Several overlaps of the same sprite frame (e.g. one per course) as one: agreement and mean coverage pooled over members. */
export function poolOverlaps(overlaps) {
  const [first] = overlaps;
  if (!first) throw new Error('poolOverlaps: nothing to pool');
  for (const o of overlaps) if (o.fineWidth !== first.fineWidth || o.fineHeight !== first.fineHeight || o.factor !== first.factor || o.polarity !== first.polarity)
    throw new Error('poolOverlaps: overlaps of different frames');
  const n = first.fineWidth * first.fineHeight, total = overlaps.reduce((s, o) => s + o.memberCount, 0);
  const mean = new Float32Array(n), agree = new Uint16Array(n);
  for (const o of overlaps) for (let i = 0; i < n; i++) { agree[i] += o.agree[i]; mean[i] += total ? (o.mean[i] * o.memberCount) / total : 0; }
  const agreementCount = Math.ceil(first.level * total), shape = new Uint8Array(n);
  if (total) for (let i = 0; i < n; i++) shape[i] = agree[i] >= agreementCount ? 1 : 0;
  return { ...first, memberCount: total, agreementCount, mean, agree, shape, members: overlaps.flatMap((o) => o.members) };
}

export const SPRITE_UNIT = 'mean: coverage fraction 0..1 per fine cell (1/factor px); agree, memberCount, agreementCount: members; anchor, phase, shift: px; residual: mean |coverage - consensus| per cell';
/** The string arguments that are words, not Part references: polarity and anchorRule. Every other string is a Part reference. */
export const SPRITE_WORDS = Object.freeze(['dark', 'bright', 'origin', 'centre']);
/** Register fn.q.sprite.* on a store: its word arguments pass through, every other string resolves as a Part reference. */
export function registerSpriteQueries(store, registerQueries) {
  registerQueries(store, SPRITE_QUERIES, { resolve: (ref) => (SPRITE_WORDS.includes(ref) ? ref : store.get(ref)) });
}
export const SPRITE_QUERIES = Object.freeze({
  // source is a Part reference (resolved before the math runs); everything else is given inline
  'fn.q.sprite.overlap': ({ source, ...rest }) => ({ value: spriteOverlap({ source, ...rest }), unit: SPRITE_UNIT })
});
