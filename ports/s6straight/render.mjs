/**
 * The S6 report render (browser-safe): one SVG over the course image, legible by eye (AGENTS.md: labelled, coloured by
 * status, with a legend). Per tee-badge pair, the accepted variant's segment coloured by its verdict (green straight:
 * tee -> the basket it names; orange bent and grey unknown: tee -> badge), labelled `hole: verdict (outcome)` and, where
 * another live variant calls it differently, that call; Sam's path (his tee point, each corridorBend, his basket point)
 * dashed yellow with his bend points ringed. Coordinates are canonical px; the image is placed at its source offset.
 */
import { samPath } from './compare.mjs';

const COLOR = { straight: '#2ecc40', bent: '#ff851b', unknown: '#aaaaaa', sam: '#ffe119', fp: '#ff4136', fn: '#b10dc9' };
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const f1 = (v) => Math.round(v * 10) / 10;

export function straightSvg({ widthPx, heightPx, image = null, title, accepted, rows, holes = [], others = {}, judged = false, note = '' }) {
  const out = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${widthPx}" height="${heightPx}" viewBox="0 0 ${widthPx} ${heightPx}" font-family="Helvetica, Arial, sans-serif">`);
  out.push(`<rect width="${widthPx}" height="${heightPx}" fill="#202020"/>`);
  if (image) out.push(`<image href="${image.src}" x="${image.x}" y="${image.y}" width="${image.width}" height="${image.height}" opacity="0.8"/>`);
  for (const h of holes) {
    const pts = samPath(h);
    out.push(`<polyline points="${pts.map((p) => p.map(f1).join(',')).join(' ')}" fill="none" stroke="${COLOR.sam}" stroke-width="2" stroke-dasharray="7 5"/>`);
    for (const b of h.bends ?? []) out.push(`<circle cx="${f1(b[0])}" cy="${f1(b[1])}" r="6" fill="none" stroke="${COLOR.sam}" stroke-width="2"/>`);
  }
  for (const r of rows) {
    const to = r.verdict === 'straight' && r.basket ? r.basket.point : r.badge.center ?? r.tee.center, c = COLOR[r.verdict] ?? COLOR.unknown;
    const bad = r.outcome === 'FP' ? COLOR.fp : r.outcome === 'FN' ? COLOR.fn : null;
    if (bad) out.push(`<line x1="${f1(r.tee.center[0])}" y1="${f1(r.tee.center[1])}" x2="${f1(to[0])}" y2="${f1(to[1])}" stroke="${bad}" stroke-width="9" stroke-opacity="0.55"/>`);
    out.push(`<line x1="${f1(r.tee.center[0])}" y1="${f1(r.tee.center[1])}" x2="${f1(to[0])}" y2="${f1(to[1])}" stroke="${c}" stroke-width="4"/>`);
    out.push(`<circle cx="${f1(r.tee.center[0])}" cy="${f1(r.tee.center[1])}" r="5" fill="#ffffff" stroke="#000" stroke-width="1"/>`);
    if (r.verdict === 'straight' && r.basket) out.push(`<circle cx="${f1(to[0])}" cy="${f1(to[1])}" r="5" fill="${c}" stroke="#000" stroke-width="1"/>`);
    const other = (others[r.pair] ?? []).map((o) => `${o.name}: ${o.verdict}`).join(', ');
    const label = `${r.hole}: ${r.verdict}${r.verdict === 'straight' && r.basket ? ` -> ${r.basket.name}` : ''}${r.outcome ? ` (${r.outcome}${r.basketAgrees === false ? ', wrong basket' : ''})` : ''}${other ? ` | ${other}` : ''}`;
    const right = r.tee.center[0] > widthPx - 420;   // near the right edge the label reads leftward, so it stays on the image
    out.push(`<text x="${f1(r.tee.center[0] + (right ? -9 : 9))}" y="${f1(r.tee.center[1] - 9)}" text-anchor="${right ? 'end' : 'start'}" font-size="17" font-weight="700" fill="${bad ?? c}" stroke="#000" stroke-width="4" paint-order="stroke">${esc(label)}</text>`);
  }
  const legend = [
    [COLOR.straight, 'solid', `straight (${accepted}): tee centre -> the basket it names`],
    [COLOR.bent, 'solid', 'bent: tee centre -> badge (not straight; S7 rides the path)'],
    [COLOR.unknown, 'solid', 'unknown: tee centre -> badge (no verdict, a recorded condition)'],
    [COLOR.sam, 'dash', "Sam's path: his tee point -> each corridorBend (ringed) -> his basket point"],
    ...(judged ? [[COLOR.fp, 'halo', 'halo red: FP (Sam bent, called straight)'], [COLOR.fn, 'halo', 'halo purple: FN (Sam straight, not called straight)']] : []),
    ['#ffffff', 'text', 'label: hole: verdict (outcome vs Sam) | other variants that call it differently']
  ];
  const lh = 24, bw = 640, bh = 46 + lh * legend.length + (note ? lh : 0);
  out.push(`<g transform="translate(12,12)"><rect width="${bw}" height="${bh}" fill="#000" fill-opacity="0.78" stroke="#888"/>`);
  out.push(`<text x="12" y="28" font-size="18" font-weight="700" fill="#fff">${esc(title)}</text>`);
  legend.forEach(([c, kind, t], i) => {
    const y = 52 + i * lh;
    if (kind === 'text') out.push(`<text x="12" y="${y + 5}" font-size="14" font-weight="700" fill="${c}">A</text>`);
    else out.push(`<line x1="12" y1="${y}" x2="52" y2="${y}" stroke="${c}" stroke-width="${kind === 'halo' ? 9 : 4}" ${kind === 'dash' ? 'stroke-dasharray="7 5"' : ''} ${kind === 'halo' ? 'stroke-opacity="0.55"' : ''}/>`);
    out.push(`<text x="62" y="${y + 5}" font-size="14" fill="#fff">${esc(t)}</text>`);
  });
  if (note) out.push(`<text x="12" y="${52 + legend.length * lh + 5}" font-size="13" fill="#ccc">${esc(note)}</text>`);
  out.push('</g></svg>');
  return out.join('\n');
}
