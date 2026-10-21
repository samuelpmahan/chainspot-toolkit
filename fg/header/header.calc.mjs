/**
 * The UDisc header Part (Sam, 2026-10-21: "Also read the UDisc header totals automatically"): "N Holes • Par P • X ft", read
 * from the header bar S0's crop removes. A free answer key: N should equal S1's badge count, X ft the sum of the export's hole
 * lengths. The math is fn.q.header.* (fg/queries/header.mjs); these Calculations compose it.
 *
 *   fn.tk.source.header         px.source.fullImage + tk.source.cropReceipt -> tk.source.header (one raster: the band is
 *                               searched in the rows S0 removed, [0, upperRowsRemoved))
 *   fn.tk.source.captureHeader  tk.source.captureTiles -> tk.source.header (a capture: every tile that has a header is read
 *                               the same way, and whether they agree is recorded; the course's fields are the agreed ones)
 *   fn.tk.s1.udiscHeader        tk.source.header + px.badges -> tk.s1.udiscHeader (holes vs the S1 badge count)
 *
 * tk.source.header = { schema 'nctk-udisc-header@1', source 'image' | 'tiles', found, holes, par, feet, text, tokens,
 *   perGlyph [[char, score, margin]], glyphs [...], unread [{ index, bbox, best, score, margin }], band, line, bandRaster,
 *   conditions, emits }. A capture adds tiles [per-tile header] and agree. Data conditions ("no header bar", "unread glyph",
 *   a grammar departure, tiles that disagree) are recorded, never thrown. The Part renders (fg/header/headerRender.mjs):
 *   the band, each glyph boxed with its read, coloured by confidence, with a legend.
 * Units: px (the original upload's frame; a tile's own frame for a tile), capH px, NCC -1..1 (score, margin), counts.
 */
import { HEADER_SCHEMA, parseHeader } from '../queries/header.mjs';
import TEMPLATES from './udisc-header-templates.json' with { type: 'json' };

export { TEMPLATES as HEADER_TEMPLATES };
export { rasterOfPng } from './raster.mjs';
export const HEADER_PART = 'tk.source.header';
export const HEADER_CHECK_PART = 'tk.s1.udiscHeader';
export const HEADER_CALLS = Object.freeze(['fn.q.header.band', 'fn.q.header.glyphs', 'fn.q.header.read']);
/** confidence tiers for the render and the record: high = score >= HIGH_SCORE (a pixel-identical render reads ~1.0) */
export const HIGH_SCORE = 0.98;
const r3 = (v) => (v == null ? null : Math.round(v * 1000) / 1000);

/** The band rows as RGB (the render's backdrop; a view of the raster, rows y0..y1). */
function bandRasterOf({ widthPx: W, rgba }, [y0, y1]) {
  const h = y1 - y0 + 1, rgb = new Uint8Array(W * h * 3);
  for (let y = 0; y < h; y++) for (let x = 0; x < W; x++) { const p = ((y0 + y) * W + x) * 4, q = (y * W + x) * 3; rgb[q] = rgba[p]; rgb[q + 1] = rgba[p + 1]; rgb[q + 2] = rgba[p + 2]; }
  return { origin: [0, y0], widthPx: W, heightPx: h, rgb };
}

/**
 * One raster's header through the store's queries. call = (fn, args) -> value; image = a Part reference to the raster;
 * rows = the rows S0 removed above the map. Pure apart from the calls.
 */
export function readHeaderOf(call, image, raster, rows, { name = null } = {}) {
  const base = { schema: HEADER_SCHEMA, ...(name ? { name } : {}), searchedRows: [0, rows ?? 0] };
  const band = call('fn.q.header.band', { image, rows });
  if (!band.found) return { ...base, found: false, holes: null, par: null, feet: null, text: null, tokens: [], perGlyph: [], glyphs: [], unread: [], band, conditions: [band.condition] };
  const g = call('fn.q.header.glyphs', { image, band });
  if (!g.glyphs.length) return { ...base, found: false, holes: null, par: null, feet: null, text: null, tokens: [], perGlyph: [], glyphs: [], unread: [], band, conditions: ['no header bar: the navy band holds no glyphs'], bandRaster: bandRasterOf(raster, band.rows) };
  const reads = call('fn.q.header.read', { image, band });
  const { tokens, fields, conditions } = parseHeader(g, reads);
  const glyphs = g.glyphs.map((x, k) => ({ index: k, bbox: x.bbox, centroid: x.centroid, gapBeforeCapH: x.gapBeforeCapH, ...reads[k],
    confidence: !reads[k].read ? 'unread' : reads[k].score >= HIGH_SCORE ? 'high' : 'read' }));
  const unread = glyphs.filter((x) => !x.read).map((x) => ({ index: x.index, bbox: x.bbox, best: x.best, score: x.score, margin: x.margin }));
  return {
    ...base, found: true, holes: fields.holes?.value ?? null, par: fields.par?.value ?? null, feet: fields.feet?.value ?? null, fields,
    text: tokens.map((t) => t.text).join(' '), tokens,
    perGlyph: glyphs.map((x) => [x.char, x.score, x.margin]), glyphs, unread,
    band: { rows: band.rows, rowsTall: band.rowsTall, colour: band.colour, paperLuma: band.paperLuma, inkLuma: band.inkLuma },
    line: g.line, conditions: [...unread.map((u) => `unread glyph ${u.index} at x ${u.bbox[0]}-${u.bbox[0] + u.bbox[2] - 1} px (best ${u.best} at NCC ${u.score}, margin ${u.margin})`), ...conditions],
    bandRaster: bandRasterOf(raster, band.rows)
  };
}

/** the read thresholds the Part was read with (the template asset's calibration), carried for its render and its record */
export const THRESHOLDS = Object.freeze({ scoreMin: TEMPLATES.read.scoreMin, marginMin: TEMPLATES.read.marginMin, high: HIGH_SCORE, unit: 'NCC -1..1' });
const emitsOf = (h) => ({ headerFound: h.found ? 1 : 0, glyphs: h.glyphs?.length ?? 0, unreadGlyphs: h.unread?.length ?? 0, holes: h.holes ?? -1, par: h.par ?? -1, feet: h.feet ?? -1, capHPx: h.line?.capHPx ?? -1 });

export const HEADER_CALCULATION = ['fn.tk.source.header', {
  inParts: ['px.source.fullImage', 'tk.source.cropReceipt'], outParts: [HEADER_PART], calls: HEADER_CALLS,
  note: 'the UDisc header bar "N Holes • Par P • X ft" read in the rows S0 removed (fn.q.header.*)',
  calculate: (io) => {
    const crop = io.in('tk.source.cropReceipt'), h = readHeaderOf((fn, a) => io.call(fn, a).value, 'px.source.fullImage', io.in('px.source.fullImage'), crop?.upperRowsRemoved ?? 0);
    return { [HEADER_PART]: { ...h, source: 'image', thresholds: THRESHOLDS, emits: emitsOf(h) } };
  }
}];

/** The course's fields from its tiles: a field is the value every tile that read it agrees on; a disagreement is recorded. */
export function agreeTiles(tiles) {
  const conditions = [], fields = {};
  for (const f of ['holes', 'par', 'feet']) {
    const vals = tiles.filter((t) => t.found && t[f] != null).map((t) => t[f]), distinct = [...new Set(vals)];
    fields[f] = distinct.length === 1 ? distinct[0] : null;
    if (distinct.length > 1) conditions.push(`tiles disagree on ${f}: ${tiles.filter((t) => t[f] != null).map((t) => `${t.name} ${t[f]}`).join(', ')}`);
  }
  const texts = [...new Set(tiles.filter((t) => t.found).map((t) => t.text))];
  return { fields, conditions, agree: tiles.some((t) => t.found) && texts.length === 1 && !conditions.length, texts };
}

export const CAPTURE_HEADER_CALCULATION = ['fn.tk.source.captureHeader', {
  inParts: ['tk.source.captureTiles'], outParts: [HEADER_PART], calls: HEADER_CALLS,
  note: 'a capture: every tile\'s UDisc header read (fn.q.header.*), and whether the tiles agree',
  calculate: (io) => {
    const tiles = io.in('tk.source.captureTiles').map((t, i) => readHeaderOf((fn, a) => io.call(fn, a).value, `tk.source.captureTiles#${i}`, t, t.crop?.yPx ?? 0, { name: t.name }));
    const { fields, conditions, agree, texts } = agreeTiles(tiles), reading = tiles.filter((t) => t.found);
    const first = reading[0] ?? null;
    const h = { schema: HEADER_SCHEMA, source: 'tiles', thresholds: THRESHOLDS, found: reading.length > 0, ...fields, text: texts.length === 1 ? texts[0] : null, agree,
      tilesRead: reading.length, tilesOf: tiles.length, tiles,
      perGlyph: first?.perGlyph ?? [], glyphs: first?.glyphs ?? [], tokens: first?.tokens ?? [], unread: tiles.flatMap((t) => (t.unread ?? []).map((u) => ({ tile: t.name, ...u }))), line: first?.line ?? null,
      conditions: [...(reading.length ? [] : ['no header bar on any tile']), ...tiles.filter((t) => !t.found).map((t) => `${t.name}: ${t.conditions[0]}`), ...conditions,
        ...tiles.flatMap((t) => (t.found ? t.conditions.map((c) => `${t.name}: ${c}`) : []))] };
    return { [HEADER_PART]: { ...h, emits: { ...emitsOf(h), tilesRead: reading.length, tiles: tiles.length, tilesAgree: agree ? 1 : 0 } } };
  }
}];

/** holes vs the S1 badge count (and the highest badge label): agree / disagree / unread / no header; never a gate. */
export function headerCheckOf(header, badges) {
  const labels = (badges ?? []).map((b) => b.label).filter((l) => /^[1-9][0-9]*$/.test(String(l))).map(Number);
  const count = (badges ?? []).length, maxLabel = labels.length ? Math.max(...labels) : null;
  const verdict = !header.found ? 'no header' : header.holes == null ? 'unread' : header.holes === count ? 'agree' : 'disagree';
  return { holes: header.holes, par: header.par, feet: header.feet, headerText: header.text, badges: count, maxBadgeLabel: maxLabel, verdict,
    note: verdict === 'disagree' ? (count < header.holes ? `S1 found ${count} badges, the header says ${header.holes} holes (a partial view, or badges S1 missed)` : `S1 found ${count} badges, more than the header's ${header.holes} holes`) : null,
    ...(header.source === 'tiles' ? { tilesAgree: header.agree, tilesRead: header.tilesRead, tilesOf: header.tilesOf } : {}),
    unreadGlyphs: header.unread?.length ?? 0, conditions: header.conditions ?? [] };
}

export const HEADER_CHECK_CALCULATION = ['fn.tk.s1.udiscHeader', {
  inParts: [HEADER_PART, 'px.badges'], outParts: [HEADER_CHECK_PART],
  note: 'the UDisc header\'s hole count against the S1 badge count (recorded, never a gate)',
  calculate: (io) => {
    const c = headerCheckOf(io.in(HEADER_PART), io.in('px.badges'));
    return { [HEADER_CHECK_PART]: { ...c, unit: 'holes, badges, maxBadgeLabel: count (holes / badges); feet: ft (the header\'s course length)', emits: { holes: c.holes ?? -1, badges: c.badges, agree: c.verdict === 'agree' ? 1 : 0 } } };
  }
}];
