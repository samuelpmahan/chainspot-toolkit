/**
 * fn.q.header.*: the UDisc course header bar, read (Sam, 2026-10-21: "Also read the UDisc header totals automatically").
 * Every UDisc course screenshot carries a header bar above the map: white text on a dark navy band, "N Holes • Par P • X ft".
 * S0's chrome crop removes it (tk.source.cropReceipt upperRowsRemoved); it lives in the uncropped px.source.fullImage. It is a
 * free answer key: N is the badge count, X the sum of the holes' lengths. Math written once behind the PxC boundary
 * (docs/agents/boundary.md); the Calculation fn.tk.source.header (fg/header/header.calc.mjs) asks these queries.
 *
 * The header is screen-fixed UI, but every size is measured on the image (Sam: no absolute px bounds; measure glyph height
 * and gaps per image): the band is found by colour, the glyph height (capH) from the glyphs, gaps and the template frame in
 * capH, the ink levels from the band itself.
 *
 *   fn.q.header.band    { image, rows }      the navy band: the longest run of rows in [0, rows) whose median colour is one
 *                                            dark blue (hue 190-250 deg, S >= 0.25, V 0.10-0.45: not the black chrome; equal within BAND.tolLevels)
 *                                            and that holds bright ink. rows = S0's upperRowsRemoved: the band is chrome S0 cut.
 *   fn.q.header.glyphs  { image, band }      the band's coverage on LOCAL levels (paper = the band's median colour, ink = its
 *                                            99.5th luma percentile), glyph cores (coverage >= 0.5, 8-connected, merged when
 *                                            their columns overlap), AA fringe owned by the nearest core (<= 2 px: the
 *                                            renderer's 1-px blend plus one), the line (capTop, baseline, capH from the tall
 *                                            glyphs), and the glyphs grouped into tokens by gap / capH (> GAP_SPLIT splits).
 *   fn.q.header.vectors { image, band }      each glyph sampled on the template frame: FRAME.cols x FRAME.rows cells of
 *                                            capH / 20, centred on the glyph's ink centroid (x) and the line (y), area-averaged
 *                                            coverage of the glyph's own pixels only (calls fn.q.header.glyphs).
 *   fn.q.header.read    { image, band }      each glyph against the class templates (readGlyphs; calls fn.q.header.vectors).
 * parseHeader turns the tokens and reads into fields (the grammar "N Holes • Par P • X ft"); the Calculation composes them.
 * Units: px (image frame: the original upload), capH (glyph cap height, px), coverage 0..1, NCC -1..1, levels 0..255.
 */

export const HEADER_SCHEMA = 'nctk-udisc-header@1';
/** the band's colour: one dark blue (UDisc navy measured 22/33/48 RGB on every training header, its top rule 26/45/69) */
export const BAND = Object.freeze({ hueMinDeg: 190, hueMaxDeg: 250, satMin: 0.25, valMin: 0.1, valMax: 0.45, tolLevels: 3, minInkContrast: 96 });
/** the template frame, in capH: FRAME.cols x FRAME.rows cells of capH / cellsPerCapH; rows from capTop - padCapH to baseline + padCapH */
export const FRAME = Object.freeze({ cellsPerCapH: 20, cols: 24, padCapH: 0.1, sub: 3, rows: 24 });   // rows = (1 + 2 x padCapH) x cellsPerCapH
/** a gap wider than this many capH starts a new token (training headers: gaps inside a token 0.02-0.26 capH, the widest 1|1 in 5511 and 1|7 in 2175; between tokens 0.36-0.88 capH; the cut is their midpoint) */
export const GAP_SPLIT = 0.31;
const LUMA = (r, g, b) => (r * 299 + g * 587 + b * 114) / 1000;
const r3 = (v) => (v == null ? null : Math.round(v * 1000) / 1000);

function hsv(r, g, b) {
  const v = Math.max(r, g, b), mn = Math.min(r, g, b), d = v - mn;
  if (!d) return { h: 0, s: 0, v: v / 255 };
  const hue = (v === r ? ((g - b) / d) % 6 : v === g ? 2 + (b - r) / d : 4 + (r - g) / d) * 60;
  return { h: hue < 0 ? hue + 360 : hue, s: d / v, v: v / 255 };
}

/** the median of each channel of row y (histograms: exact, O(W)) */
function rowMedian(rgba, W, y) {
  const out = [0, 0, 0];
  for (let c = 0; c < 3; c++) {
    const hist = new Uint32Array(256);
    for (let x = 0, p = y * W * 4 + c; x < W; x++, p += 4) hist[rgba[p]]++;
    let acc = 0; const half = W >> 1;
    for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc > half) { out[c] = v; break; } }
  }
  return out;
}

/** The navy band in rows [0, rows) of the image (pure). */
export function headerBand({ widthPx: W, heightPx: H, rgba }, rows) {
  const limit = Math.min(H, Math.max(0, rows | 0));
  if (!limit) return { found: false, condition: 'no header bar: S0 removed no upper rows (the header is chrome S0 crops)', searchedRows: [0, 0] };
  const runs = [];
  let run = null;
  for (let y = 0; y < limit; y++) {
    const m = rowMedian(rgba, W, y);
    if (run && m.every((v, c) => Math.abs(v - run.colour[c]) <= BAND.tolLevels)) { run.y1 = y; continue; }
    run = { y0: y, y1: y, colour: m }; runs.push(run);
  }
  const blue = runs.filter((r) => { const { h, s, v } = hsv(...r.colour); return h >= BAND.hueMinDeg && h <= BAND.hueMaxDeg && s >= BAND.satMin && v >= BAND.valMin && v <= BAND.valMax; });
  // the band holds bright ink: its 99.5th luma percentile clears the band's own luma by minInkContrast levels
  const scored = blue.map((r) => {
    const paper = LUMA(...r.colour), hist = new Uint32Array(256); let n = 0;
    for (let y = r.y0; y <= r.y1; y++) for (let x = 0, p = y * W * 4; x < W; x++, p += 4) { hist[Math.round(LUMA(rgba[p], rgba[p + 1], rgba[p + 2]))]++; n++; }
    let acc = 0, ink = 0; for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= 0.995 * n) { ink = v; break; } }
    return { ...r, rowsTall: r.y1 - r.y0 + 1, paperLuma: r3(paper), inkLuma: ink, contrast: ink - paper };
  }).filter((r) => r.contrast >= BAND.minInkContrast).sort((a, b) => b.rowsTall - a.rowsTall || a.y0 - b.y0);
  if (!scored.length) return { found: false, condition: blue.length ? 'no header bar: the navy rows hold no bright text' : 'no header bar: no run of navy rows above the crop line', searchedRows: [0, limit], blueRuns: blue.length };
  const b = scored[0];
  return { found: true, rows: [b.y0, b.y1], rowsTall: b.rowsTall, colour: b.colour, paperLuma: b.paperLuma, inkLuma: b.inkLuma, searchedRows: [0, limit], candidates: scored.length };
}

/** coverage of the band rows on LOCAL levels (Float32Array, band-local rows) */
function bandCoverage({ widthPx: W, rgba }, band) {
  const [y0, y1] = band.rows, h = y1 - y0 + 1, cov = new Float32Array(W * h), span = band.inkLuma - band.paperLuma;
  for (let y = 0; y < h; y++) for (let x = 0, p = (y0 + y) * W * 4, i = y * W; x < W; x++, p += 4, i++) cov[i] = Math.min(1, Math.max(0, (LUMA(rgba[p], rgba[p + 1], rgba[p + 2]) - band.paperLuma) / span));
  return { cov, W, h, y0 };
}

const median = (a) => { const s = [...a].sort((u, v) => u - v); return s.length ? (s.length % 2 ? s[s.length >> 1] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null; };

/** Glyphs of the band (pure): cores, AA ownership, the line, tokens. Owner plane: band-local, 0 = none, k + 1 = glyph k. */
export function headerGlyphs(image, band) {
  const { cov, W, h, y0 } = bandCoverage(image, band);
  const n = W * h, label = new Int32Array(n).fill(-1), comps = [];
  // 8-neighbours of (x, y) inside the band, as [x, y, linear index]
  const around = (x, y, visit) => { for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < W && yy < h) visit(xx, yy, yy * W + xx); } };
  for (let sy = 0; sy < h; sy++) for (let sx = 0; sx < W; sx++) {
    const s = sy * W + sx; if (cov[s] < 0.5 || label[s] >= 0) continue;
    const id = comps.length, stack = [[sx, sy]]; label[s] = id;
    const c = { x0: W, x1: -1, y0: h, y1: -1, area: 0 };
    while (stack.length) {
      const [x, y] = stack.pop();
      c.area++; if (x < c.x0) c.x0 = x; if (x > c.x1) c.x1 = x; if (y < c.y0) c.y0 = y; if (y > c.y1) c.y1 = y;
      around(x, y, (xx, yy, j) => { if (cov[j] >= 0.5 && label[j] < 0) { label[j] = id; stack.push([xx, yy]); } });
    }
    comps.push(c);
  }
  if (!comps.length) return { glyphs: [], tokens: [], line: null, condition: 'no glyphs in the header band' };
  // specks: a core under 2 % of the largest core's area is not a glyph (JPEG noise); measured per image
  const maxArea = Math.max(...comps.map((c) => c.area));
  const live = comps.map((c, i) => ({ ...c, ids: [i] })).filter((c) => c.area >= 0.02 * maxArea).sort((a, b) => a.x0 - b.x0);
  // one glyph per column run: cores whose columns overlap by more than half the narrower are one glyph (none on training)
  const merged = [];
  for (const c of live) {
    const last = merged.at(-1), ov = last ? Math.min(last.x1, c.x1) - Math.max(last.x0, c.x0) + 1 : 0;
    if (last && ov > 0.5 * Math.min(last.x1 - last.x0 + 1, c.x1 - c.x0 + 1)) {
      last.x0 = Math.min(last.x0, c.x0); last.x1 = Math.max(last.x1, c.x1); last.y0 = Math.min(last.y0, c.y0); last.y1 = Math.max(last.y1, c.y1); last.area += c.area; last.ids.push(...c.ids);
    } else merged.push({ ...c, ids: [...c.ids] });
  }
  const glyphOfComp = new Int32Array(comps.length).fill(-1);
  merged.forEach((g, k) => g.ids.forEach((i) => { glyphOfComp[i] = k; }));
  // ownership: cores, then the AA fringe (coverage > 0.02) by breadth-first growth from the cores, at most 2 px
  const owner = new Int32Array(n);
  let frontier = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < W; x++) { const i = y * W + x; if (label[i] >= 0 && glyphOfComp[label[i]] >= 0) { owner[i] = glyphOfComp[label[i]] + 1; frontier.push([x, y, owner[i]]); } }
  for (let step = 0; step < 2; step++) {
    const next = [];
    for (const [x, y, o] of frontier) around(x, y, (xx, yy, j) => { if (!owner[j] && cov[j] > 0.02) { owner[j] = o; next.push([xx, yy, o]); } });
    frontier = next;
  }
  // per glyph: owned px, ink mass and centroid (image frame)
  const acc = merged.map(() => ({ m: 0, mx: 0, my: 0, px: 0 }));
  for (let y = 0; y < h; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, k = owner[i] - 1; if (k < 0) continue;
    const a = acc[k], c = cov[i];
    a.m += c; a.mx += c * x; a.my += c * y; a.px++;
  }
  const glyphs = merged.map((g, k) => ({ index: k, bbox: [g.x0, y0 + g.y0, g.x1 - g.x0 + 1, g.y1 - g.y0 + 1], coreAreaPx: g.area,
    ownedPx: acc[k].px, inkMass: r3(acc[k].m), centroid: [r3(acc[k].mx / acc[k].m), r3(y0 + acc[k].my / acc[k].m)] }));
  // the line: tall glyphs (core height >= 0.85 x the tallest) give capTop and baseline (image rows); capH = baseline - capTop + 1
  const tallest = Math.max(...glyphs.map((g) => g.bbox[3]));
  const tall = glyphs.filter((g) => g.bbox[3] >= 0.85 * tallest);
  const capTop = median(tall.map((g) => g.bbox[1])), baseline = median(tall.map((g) => g.bbox[1] + g.bbox[3] - 1)), capH = baseline - capTop + 1;
  // tokens: a gap (columns between cores) wider than GAP_SPLIT capH splits
  const tokens = [];
  glyphs.forEach((g, k) => {
    const gap = k ? g.bbox[0] - (glyphs[k - 1].bbox[0] + glyphs[k - 1].bbox[2]) : null;
    g.gapBeforePx = gap; g.gapBeforeCapH = gap == null ? null : r3(gap / capH);
    if (!k || gap / capH > GAP_SPLIT) tokens.push({ glyphs: [k] }); else tokens.at(-1).glyphs.push(k);
  });
  return { glyphs, tokens, line: { capTopPx: capTop, baselinePx: baseline, capHPx: capH, tallGlyphs: tall.length }, owner, coverage: cov, bandTopPx: y0, widthPx: W, bandRowsTall: h };
}

/** The template-frame vector of glyph k (pure): area-averaged coverage of its own pixels on FRAME cells of capH / 20. */
export function glyphVector(glyphsPart, k) {
  const { owner, coverage: cov, widthPx: W, bandRowsTall: h, bandTopPx: y0, line, glyphs } = glyphsPart, g = glyphs[k];
  const cell = line.capHPx / FRAME.cellsPerCapH, left = g.centroid[0] - (FRAME.cols / 2) * cell, top = line.capTopPx - 0.5 - FRAME.padCapH * line.capHPx;
  const at = (x, y) => { const yy = y - y0; if (x < 0 || yy < 0 || x >= W || yy >= h) return 0; const i = yy * W + x; return owner[i] === k + 1 ? cov[i] : 0; };
  const bil = (x, y) => { const xa = Math.floor(x), ya = Math.floor(y), fx = x - xa, fy = y - ya;
    return (1 - fx) * (1 - fy) * at(xa, ya) + fx * (1 - fy) * at(xa + 1, ya) + (1 - fx) * fy * at(xa, ya + 1) + fx * fy * at(xa + 1, ya + 1); };
  const v = new Float32Array(FRAME.cols * FRAME.rows), S = FRAME.sub;
  for (let r = 0; r < FRAME.rows; r++) for (let c = 0; c < FRAME.cols; c++) {
    let s = 0;
    for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) s += bil(left - 0.5 + (c + (i + 0.5) / S) * cell, top + (r + (j + 0.5) / S) * cell);
    v[r * FRAME.cols + c] = s / (S * S);
  }
  return v;
}

/** Normalised cross-correlation of two vectors (-1..1; 0 when either is flat). */
export function ncc(a, b) {
  const n = a.length; let ma = 0, mb = 0;
  for (let i = 0; i < n; i++) { ma += a[i]; mb += b[i]; }
  ma /= n; mb /= n;
  let sab = 0, saa = 0, sbb = 0;
  for (let i = 0; i < n; i++) { const da = a[i] - ma, db = b[i] - mb; sab += da * db; saa += da * da; sbb += db * db; }
  return saa > 0 && sbb > 0 ? sab / Math.sqrt(saa * sbb) : 0;
}

/**
 * Each glyph's read (pure): NCC against every class template; best, its score, its margin over the best OTHER class. A glyph is
 * read when score >= read.scoreMin and margin >= read.marginMin (calibrated by scripts/header-templates.mjs, recorded in the
 * template asset); otherwise it is unread ('?'), its best guess and scores kept. A glyph with no template (a 0 on training) must
 * come out unread: it never guesses.
 */
export function readGlyphs(vectors, templates) {
  const classes = Object.keys(templates.classes), { scoreMin, marginMin } = templates.read;
  return vectors.map((v) => {
    const scored = classes.map((c) => [c, ncc(v, templates.classes[c].vector)]).sort((a, b) => b[1] - a[1]);
    const [best, score] = scored[0] ?? [null, 0], second = scored[1] ?? [null, 0], margin = score - second[1];
    const read = score >= scoreMin && margin >= marginMin;
    return { char: read ? best : '?', best, score: r3(score), margin: r3(margin), second: second[0], secondScore: r3(second[1]), read };
  });
}

const DIGITS = /^[0-9?]+$/;
/** the grammar of the header: three segments split by bullets, "N Holes", "Par P", "X ft" */
export const GRAMMAR = Object.freeze([
  { field: 'holes', number: 0, word: 1, words: ['Holes', 'Hole'] },
  { field: 'par', number: 1, word: 0, words: ['Par'] },
  { field: 'feet', number: 0, word: 1, words: ['ft'] }
]);
/**
 * Tokens -> fields (pure). A number token fully read gives its value; one with an unread glyph gives null and its pattern
 * ('2?'). Every departure from the grammar is a recorded condition, never a throw.
 */
export function parseHeader(glyphsPart, reads) {
  const tokens = glyphsPart.tokens.map(({ glyphs }) => {
    const text = glyphs.map((k) => reads[k].char).join(''), xs = glyphs.map((k) => glyphsPart.glyphs[k].bbox);
    const x0 = Math.min(...xs.map((b) => b[0])), y0 = Math.min(...xs.map((b) => b[1])), x1 = Math.max(...xs.map((b) => b[0] + b[2])), y1 = Math.max(...xs.map((b) => b[1] + b[3]));
    const kind = text === '\u2022' ? 'bullet' : DIGITS.test(text) && /[0-9]/.test(text) ? 'number' : /^\?+$/.test(text) ? 'unread' : 'word';
    return { text, kind, glyphs, bbox: [x0, y0, x1 - x0, y1 - y0] };
  });
  const segments = [[]];
  tokens.forEach((t, i) => { if (t.kind === 'bullet') segments.push([]); else segments.at(-1).push(i); });
  const conditions = [], fields = {};
  if (segments.length !== GRAMMAR.length) conditions.push(`header grammar: ${segments.length} segments between bullets, expected ${GRAMMAR.length} ("N Holes \u2022 Par P \u2022 X ft"); read "${tokens.map((t) => t.text).join(' ')}"`);
  GRAMMAR.forEach((g, s) => {
    const seg = segments[s] ?? [];
    if (seg.length !== 2) { fields[g.field] = { value: null, text: null, condition: `segment ${s + 1} has ${seg.length} tokens, expected 2` }; conditions.push(`header grammar: ${g.field}: segment ${s + 1} has ${seg.length} tokens, expected 2`); return; }
    const num = tokens[seg[g.number]], word = tokens[seg[g.word]];
    const wordOk = g.words.includes(word.text);
    const full = num.kind === 'number' && !num.text.includes('?');
    fields[g.field] = { value: full ? Number(num.text) : null, text: num.text, word: word.text, wordAgrees: wordOk, token: seg[g.number] };
    if (!wordOk) conditions.push(`header grammar: ${g.field}: the word reads "${word.text}", expected ${g.words.map((w) => `"${w}"`).join(' or ')}`);
    if (num.kind !== 'number') conditions.push(`header grammar: ${g.field}: "${num.text}" is not a number`);
    else if (!full) conditions.push(`unread glyph: ${g.field} reads "${num.text}" (an unread digit is never guessed)`);
  });
  return { tokens, fields, conditions };
}

export const HEADER_UNIT = 'px (image frame: the original upload; capH = glyph cap height in px), coverage 0..1, levels 0..255 (luma)';
const SCORE_UNIT = 'score, margin, secondScore: NCC -1..1 against the class templates; char: the read (? = unread)';
/** The query table; templates: the class templates and read thresholds (fg/header/udisc-header-templates.json). */
export function headerQueries(templates = null) {
  const vectors = Object.assign((_, args, call) => {
    const g = call('fn.q.header.glyphs', args);
    return { value: g.glyphs.map((_, k) => glyphVector(g, k)), unit: `coverage 0..1 per template-frame cell (${FRAME.cols} x ${FRAME.rows} cells of capH / ${FRAME.cellsPerCapH})` };
  }, { calls: ['fn.q.header.glyphs'] });
  const read = Object.assign((_, args, call) => {
    if (!templates) throw new Error('fn.q.header.read: no templates registered');
    return { value: readGlyphs(call('fn.q.header.vectors', args), templates), unit: SCORE_UNIT };
  }, { calls: ['fn.q.header.vectors'] });
  return {
    'fn.q.header.band': ({ image, rows }) => ({ value: headerBand(image, rows), unit: HEADER_UNIT }),
    'fn.q.header.glyphs': ({ image, band }) => ({ value: headerGlyphs(image, band), unit: HEADER_UNIT }),
    'fn.q.header.vectors': vectors,
    'fn.q.header.read': read
  };
}
/** Register fn.q.header.* on a store. A reference 'address#k' is item k of the list at address (a capture's tiles). */
export function registerHeaderQueries(store, registerQueries, { templates = null } = {}) {
  registerQueries(store, headerQueries(templates), { note: 'PxC query: the UDisc header bar (fg/queries/header.mjs)',
    resolve: (ref) => { const m = /^(.+)#(\d+)$/.exec(ref); return m ? store.get(m[1])[Number(m[2])] : store.get(ref); } });
}
