/**
 * The fn.Tee.pairBadge comparator (browser-safe): joins the branches' tees by position (one-to-one, closest first,
 * within PAIR_SLOT.matchPx: the judge's tee rule), and per tee names each variant's badge and every disagreement.
 * Frames:
 *   1. the per-variant table (right / wrong / none / unjudged, unmatched badges) and the per-tee identity ledger
 *   2. one overview raster per variant: the course (dimmed, half scale), each tee's ray to the badge plate it pairs
 *      with, coloured by verdict (PAIRS_LEGEND); the labelled version is pairsSvg (the runner writes it per variant)
 */
import { encodePngRgb, base64 } from '../../fg/png.mjs';
import { PAIR_SLOT, ACCEPTANCE } from './pairBadge.mjs';

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
export const VERDICT_COLORS = Object.freeze({ right: '#3fb950', wrong: '#f85149', none: '#f85149', unjudged: '#8b949e', truth: '#ffe11a', unmatchedBadge: '#d29922', plate: '#ffffff' });
export const PAIRS_LEGEND = Object.freeze([
  ['line', VERDICT_COLORS.right, 'right: the tee pairs with the badge of its own hole (Sam\'s testimony, tee matched within 8 px)'],
  ['line', VERDICT_COLORS.wrong, 'wrong: the tee pairs with another hole\'s badge; dashed yellow to the badge of its own hole'],
  ['ring', VERDICT_COLORS.none, 'none: a judged tee paired with no badge'],
  ['line', VERDICT_COLORS.unjudged, 'unjudged: a tee matching no annotated tee point (or a course without testimony)'],
  ['box', VERDICT_COLORS.unmatchedBadge, 'a badge no tee pairs with (its plate)'],
  ['text', '#ffffff', 'label: tee candidate (Tee cX observed by S3, S4 Tee cX recovered by S4) -> Badge n, residual deg (tee long axis vs the ray to the plate centre)']
]);
const hex = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));

/** Tee identities across variants: greedy, variants in name order, one member per variant, within maxPx. */
export function joinTees(byVariant, maxPx = PAIR_SLOT.matchPx) {
  const ids = [];
  for (const n of Object.keys(byVariant).sort()) {
    const pairs = byVariant[n], cand = [];
    pairs.forEach((p, i) => ids.forEach((id, k) => { if (id.members[n] == null) { const e = dist(p.center, id.center); if (e <= maxPx) cand.push({ i, k, e }); } }));
    cand.sort((a, b) => a.e - b.e || a.i - b.i || a.k - b.k);
    const usedP = new Set();
    for (const c of cand) if (!usedP.has(c.i) && ids[c.k].members[n] == null) { ids[c.k].members[n] = c.i; usedP.add(c.i); }
    pairs.forEach((p, i) => { if (!usedP.has(i)) ids.push({ center: p.center, members: { [n]: i } }); });
  }
  return ids;
}

/** A dimmed, downscaled course with each pair's ray coloured by verdict (no text: the ledger and pairsSvg label it). */
export function overviewRaster(raster, rows, { unmatched = [], plates = new Map(), scale = 0.5, deflate } = {}) {
  const { rgba, widthPx: W, heightPx: H } = raster, w = Math.max(1, Math.round(W * scale)), h = Math.max(1, Math.round(H * scale)), k = 1 / scale;
  const rgb = new Uint8Array(w * h * 3);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const sx = Math.min(W - 1, Math.floor(x * k)), sy = Math.min(H - 1, Math.floor(y * k)), i = (sy * W + sx) * 4, d = (y * w + x) * 3;
    for (let c = 0; c < 3; c++) rgb[d + c] = Math.round(rgba[i + c] * 0.55);
  }
  const put = (X, Y, col) => { X = Math.round(X); Y = Math.round(Y); if (X < 0 || Y < 0 || X >= w || Y >= h) return; const d = (Y * w + X) * 3; rgb[d] = col[0]; rgb[d + 1] = col[1]; rgb[d + 2] = col[2]; };
  const dot = (X, Y, col, r = 1) => { for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) put(X + a, Y + b, col); };
  const line = (a, b, col, dash = 0) => { const [ax, ay] = [a[0] * scale, a[1] * scale], [bx, by] = [b[0] * scale, b[1] * scale], n = Math.ceil(Math.hypot(bx - ax, by - ay)); for (let t = 0; t <= n; t++) { if (dash && Math.floor(t / dash) % 2) continue; dot(ax + (bx - ax) * t / n, ay + (by - ay) * t / n, col, 0); dot(ax + (bx - ax) * t / n + 0.5, ay + (by - ay) * t / n + 0.5, col, 0); } };
  const ring = (c, r, col) => { for (let t = 0; t < 64; t++) dot(c[0] * scale + r * Math.cos(t / 64 * 2 * Math.PI), c[1] * scale + r * Math.sin(t / 64 * 2 * Math.PI), col, 0); };
  for (const label of unmatched) { const p = plates.get(String(label)); if (p) { for (let a = -6; a <= 6; a++) { put(p[0] * scale + a, p[1] * scale - 6, hex(VERDICT_COLORS.unmatchedBadge)); put(p[0] * scale + a, p[1] * scale + 6, hex(VERDICT_COLORS.unmatchedBadge)); put(p[0] * scale - 6, p[1] * scale + a, hex(VERDICT_COLORS.unmatchedBadge)); put(p[0] * scale + 6, p[1] * scale + a, hex(VERDICT_COLORS.unmatchedBadge)); } } }
  for (const r of rows) {
    const col = hex(VERDICT_COLORS[r.verdict] ?? VERDICT_COLORS.unjudged);
    if (r.verdict === 'wrong' && r.truthCenter) line(r.point, r.truthCenter, hex(VERDICT_COLORS.truth), 4);
    if (r.saidCenter) { line(r.point, r.saidCenter, col); dot(r.saidCenter[0] * scale, r.saidCenter[1] * scale, col, 2); }
    if (r.verdict === 'none') ring(r.point, 7, col);
    dot(r.point[0] * scale, r.point[1] * scale, col, 2);
  }
  return { width: w, height: h, scale, png: base64(encodePngRgb({ width: w, height: h, rgb, ...(deflate ? { deflate } : {}) })) };
}

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/**
 * The labelled render of one variant's pairs: the course image, every tee's ray to its badge plate, coloured by
 * verdict, each tee labelled (name -> Badge n, residual deg, hole when judged), unmatched badges boxed, a legend.
 * image: { src, width, height, x, y } (the source image placed in the canonical frame) or null.
 */
export function pairsSvg({ title, rows, unmatched = [], plates = new Map(), widthPx, heightPx, image = null, totals = null, legend = PAIRS_LEGEND }) {
  const LEG = 26 * (legend.length + 2) + 20, H = heightPx + LEG, out = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${widthPx}" height="${H}" viewBox="0 0 ${widthPx} ${H}" font-family="DejaVu Sans, Helvetica, Arial, sans-serif">`);
  out.push(`<rect width="${widthPx}" height="${H}" fill="#0d1117"/>`);
  out.push(`<clipPath id="course"><rect width="${widthPx}" height="${heightPx}"/></clipPath>`);
  if (image) out.push(`<image clip-path="url(#course)" x="${image.x}" y="${image.y}" width="${image.width}" height="${image.height}" xlink:href="${image.src}" href="${image.src}" opacity="0.6"/>`);
  out.push(`<rect width="${widthPx}" height="${heightPx}" fill="#000" opacity="0.25"/>`, `<rect y="${heightPx}" width="${widthPx}" height="${LEG}" fill="#0d1117"/>`);
  const T = (x, y, t, col, size = 13, anchor = 'start') => `<text x="${x}" y="${y}" fill="${col}" font-size="${size}" font-weight="700" stroke="#000" stroke-width="3" paint-order="stroke" text-anchor="${anchor}">${esc(t)}</text>`;
  for (const label of unmatched) { const p = plates.get(String(label)); if (p) out.push(`<rect x="${p[0] - 14}" y="${p[1] - 11}" width="28" height="22" fill="none" stroke="${VERDICT_COLORS.unmatchedBadge}" stroke-width="3"/>`, T(p[0], p[1] - 16, `Badge ${label}: no tee`, VERDICT_COLORS.unmatchedBadge, 12, 'middle')); }
  for (const r of rows) {
    const col = VERDICT_COLORS[r.verdict] ?? VERDICT_COLORS.unjudged;
    if (r.verdict === 'wrong' && r.truthCenter) out.push(`<line x1="${r.point[0]}" y1="${r.point[1]}" x2="${r.truthCenter[0]}" y2="${r.truthCenter[1]}" stroke="${VERDICT_COLORS.truth}" stroke-width="2" stroke-dasharray="6 5"/>`);
    if (r.saidCenter) out.push(`<line x1="${r.point[0]}" y1="${r.point[1]}" x2="${r.saidCenter[0]}" y2="${r.saidCenter[1]}" stroke="${col}" stroke-width="3"/>`, `<circle cx="${r.saidCenter[0]}" cy="${r.saidCenter[1]}" r="4" fill="${col}"/>`);
    if (r.verdict === 'none') out.push(`<circle cx="${r.point[0]}" cy="${r.point[1]}" r="12" fill="none" stroke="${col}" stroke-width="3"/>`);
    out.push(`<circle cx="${r.point[0]}" cy="${r.point[1]}" r="4.5" fill="${col}" stroke="#000" stroke-width="1"/>`);
    // the label sits on the side of the tee away from its ray, so it never lies on a line
    const what = `${r.name} -> ${r.said != null ? `Badge ${r.said}, ${r.residualDeg ?? '?'} deg` : 'no badge'}${r.verdict === 'wrong' || r.verdict === 'none' ? ` (is hole ${r.hole})` : ''}`;
    const est = what.length * 7.2;   // px: label width at 12 px bold, so a label near an edge flips inside the frame
    let left = (r.saidCenter ? r.saidCenter[0] - r.point[0] : -1) > 0;
    if (left && r.point[0] - 9 - est < 0) left = false; else if (!left && r.point[0] + 9 + est > widthPx) left = true;
    out.push(T(r.point[0] + (left ? -9 : 9), r.point[1] + 4, what, col, 12, left ? 'end' : 'start'));
  }
  let y = heightPx + 24;
  out.push(T(12, y, title, '#ffffff', 15)); y += 24;
  if (totals) { out.push(T(12, y, `right ${totals.right} / wrong ${totals.wrong} / none ${totals.none} / unjudged ${totals.unjudged} tees; unmatched badges ${totals.unmatchedBadges}; holes with no tee ${totals.missingTees}`, '#ffffff', 13)); y += 24; }
  for (const [kind, col, text] of legend) {
    if (kind === 'line') out.push(`<line x1="14" y1="${y - 5}" x2="44" y2="${y - 5}" stroke="${col}" stroke-width="3"/>`);
    else if (kind === 'ring') out.push(`<circle cx="29" cy="${y - 5}" r="8" fill="none" stroke="${col}" stroke-width="3"/>`);
    else if (kind === 'box') out.push(`<rect x="18" y="${y - 14}" width="22" height="18" fill="none" stroke="${col}" stroke-width="3"/>`);
    else out.push(T(22, y, 'Aa', col, 12));
    out.push(T(54, y, text, '#e6edf3', 12)); y += 26;
  }
  out.push('</svg>');
  return out.join('\n');
}

export function comparePairs({ parentStore, deflate } = {}) {
  return ({ branches, frame }) => {
    const names = Object.keys(branches).sort();
    const view = {};
    for (const n of names) {
      const b = branches[n];
      const value = b.store?.has?.(PAIR_SLOT.part) ? b.store.get(PAIR_SLOT.part) : null;
      const judge = b.records?.[PAIR_SLOT.testimony];
      view[n] = { error: b.error, value, pairs: value?.pairs ?? [], judge: judge?.status === 'held' ? judge : null };
    }
    const plates = parentStore.get('tk.s4.badgePlates'), plateOf = new Map(plates.map((p) => [String(p.label), p.plateCenter]));
    const raster = parentStore.get('px.image.cropped');
    const live = names.filter((n) => !view[n].error && !view[n].value?.laneNotRun);   // a variant whose lane did not run has no tees to compare
    const perVariant = Object.fromEntries(names.map((n) => [n, {
      error: view[n].error?.message ?? null, laneNotRun: view[n].value?.laneNotRun ?? null,
      tees: view[n].pairs.length, paired: view[n].pairs.filter((p) => p.badge != null).length,
      ...(view[n].judge?.totals ?? {}), judged: view[n].judge?.judged ?? false,
      unmatchedBadgeLabels: view[n].judge?.unmatchedBadges ?? null, missingTeeHoles: view[n].judge?.missingTees ?? null
    }]));
    const ids = joinTees(Object.fromEntries(live.map((n) => [n, view[n].pairs])));
    const identities = ids.map((id, k) => {
      const at = live.find((n) => id.members[n] != null), first = view[at].pairs[id.members[at]];
      const holes = live.map((n) => (id.members[n] != null ? view[n].judge?.rows?.[id.members[n]]?.hole : null)).filter((h) => h != null);
      const badgeOf = Object.fromEntries(live.map((n) => [n, id.members[n] != null ? (view[n].pairs[id.members[n]].badge ?? 'none') : 'absent']));
      const residualOf = Object.fromEntries(live.map((n) => [n, id.members[n] != null ? view[n].pairs[id.members[n]].angleResidualDeg ?? null : null]));
      const present = live.filter((n) => badgeOf[n] !== 'absent');
      const agree = new Set(present.map((n) => badgeOf[n])).size <= 1 && present.length === live.length;
      return { identity: k, tee: first.tee, origin: first.origin, centerPx: first.center, hole: holes[0] ?? null, badges: badgeOf, residualDeg: residualOf, agree,
        disagreement: agree ? null : `${first.tee}${holes[0] != null ? ` (hole ${holes[0]})` : ''}: ${live.map((n) => `${n} ${badgeOf[n] === 'absent' ? 'no such tee' : badgeOf[n] === 'none' ? 'no badge' : `Badge ${badgeOf[n]}`}`).join(', ')}` };
    });
    const disagreements = identities.filter((i) => !i.agree).map((i) => i.disagreement);
    frame({
      title: `${PAIR_SLOT.slot}: ${names.map((n) => `${n} ${perVariant[n].right ?? '?'} right / ${perVariant[n].wrong ?? '?'} wrong / ${perVariant[n].none ?? '?'} none${perVariant[n].laneNotRun ? ' (lane not run)' : ''}`).join('; ')}; ${disagreements.length} disagreement(s)`,
      calculation: PAIR_SLOT.slot,
      parts: [
        { address: `cmp.${PAIR_SLOT.slot}.table`, kind: 'ledger', data: { rows: names.map((n) => ({ variant: n, tees: perVariant[n].tees, paired: perVariant[n].paired, right: perVariant[n].right, wrong: perVariant[n].wrong, none: perVariant[n].none, unjudged: perVariant[n].unjudged, unmatchedBadges: (perVariant[n].unmatchedBadgeLabels ?? []).join(' '), holesWithNoTee: (perVariant[n].missingTeeHoles ?? []).join(' '), laneNotRun: perVariant[n].laneNotRun, error: perVariant[n].error })) } },
        { address: `cmp.${PAIR_SLOT.slot}.identities`, kind: 'ledger', data: { rows: identities.map((i) => ({ tee: i.tee, origin: i.origin, hole: i.hole, centerPx: i.centerPx.map((v) => Math.round(v * 100) / 100).join(', '), ...Object.fromEntries(live.flatMap((n) => [[`${n} badge`, i.badges[n]], [`${n} residualDeg`, i.residualDeg[n]]])), agree: i.agree })) } }
      ],
      verdicts: [...names.map((n) => ({ name: `${n}: ${perVariant[n].right ?? '?'} of ${perVariant[n].tees} tees pair with their own hole's badge`, ok: perVariant[n].wrong === 0 && perVariant[n].none === 0 })),
        ...disagreements.map((d) => ({ name: `disagreement: ${d}`, ok: false }))],
      receipt: { matchPx: PAIR_SLOT.matchPx, acceptance: ACCEPTANCE, legend: PAIRS_LEGEND.map(([, , t]) => t) }
    });
    for (const n of live) {
      const rows = view[n].judge?.rows ?? view[n].pairs.map((p) => ({ name: p.tee, point: p.center, said: p.badge != null ? Number(p.badge) : null, saidCenter: p.plateCenter, truthCenter: null, verdict: 'unjudged', hole: null, residualDeg: p.angleResidualDeg }));
      const unmatched = view[n].judge?.unmatchedBadges ?? [];
      const ras = overviewRaster(raster, rows, { unmatched, plates: plateOf, deflate });
      frame({
        title: `${n}: every tee's ray to its badge plate (green right, red wrong / none, grey unjudged, yellow dashed to the true badge, orange box: badge with no tee)`,
        calculation: PAIR_SLOT.slot,
        parts: [
          { address: `cmp.${PAIR_SLOT.slot}.${n}.overview`, kind: 'raster', data: ras },
          { address: `cmp.${PAIR_SLOT.slot}.${n}.rows`, kind: 'ledger', data: { rows: rows.map((r) => ({ tee: r.name, hole: r.hole, verdict: r.verdict, badge: r.said, residualDeg: r.residualDeg, signedPerpPx: r.signedPerpPx ?? null })) } }
        ],
        verdicts: rows.filter((r) => r.verdict !== 'unjudged').map((r) => ({ name: `${r.name} (hole ${r.hole}): ${r.verdict}`, ok: r.verdict === 'right' })),
        receipt: { legend: PAIRS_LEGEND.map(([, , t]) => t), scale: ras.scale, frame: 'canonical px; raster at half scale' }
      });
    }
    return { slot: PAIR_SLOT.slot, acceptance: ACCEPTANCE, matchPx: PAIR_SLOT.matchPx, variants: perVariant, identities, disagreements };
  };
}
