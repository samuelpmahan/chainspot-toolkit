/**
 * The inspector: the state matrix made drillable (Sam, 2026-10-18: "turn the state --retest results into a drillable
 * artifact"; "a judge can say 'X is expected, Y is result. Check render to see if it's reasonable or not'").
 *
 *   grid (course x cell, coloured by status)  ->  the cell's objects, one row per hole or detection, with a crop each
 *   ->  one object: the crop at 4x with Sam's mark, the match radius, the pipeline's point and object, the recovered
 *       pad outline, the badge ray; its numbers (signed dx, dy); the judge's reason; the frozen state drawn dashed.
 *
 * What it is for, in order: every FN and FP as a picture; every recovered object (the inferred ones); every near miss
 * (error above NEAR_MISS_PX, where testimony is impeachable); recoveries resting on little visible frame (below SPARSE_VISIBLE), listed as a look, not a verdict;
 * courses without testimony, so judging is a read; rows that changed against frozen.json (before dashed, after solid,
 * on one crop); the count closure. Every number keeps its unit and its course.
 *
 * Crops are deflated PNGs of the raster (one per row); marks are SVG over them at display scale, so labels stay
 * legible. attempts/state/inspector.html is one self-contained page, publishable as an artifact (no doctype of its own,
 * theme tokens, under 16 MB). Deep links are bare hash tokens: #<course>.<cell>[.<filter>][.r<row>], e.g.
 * #heritage.S4tees.rec.r5 (row = index in the cell's full row list; the filter only narrows the tiles).
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { deserialize } from 'node:v8';
import { deflateSync } from 'node:zlib';
import { cropWindow } from '../../fg/png.mjs';
import { CELLS, s4Accepted, s5Accepted, recoveredHoles } from './matrix.mjs';

export const NEAR_MISS_PX = 3;          // a presentation tag, not a rule: errors above it are worth a look (mark or result?)
export const SPARSE_VISIBLE = 0.25;     // a recovery with less of its frame visible than this is listed first for a look: it rests on less evidence, which is not a verdict
export const MOVED_PX = 0.5;            // against frozen: a center that moved more than this is a change
export const CROP = Object.freeze({ sizePx: 64, display: 4.5, wideSizePx: 112, wideDisplay: 2.6 });
export const COLORS = Object.freeze({
  TP: '#3fb950', recoveredTP: '#58a6ff', FN: '#f85149', FP: '#d29922', recoveredFP: '#d29922', unjudged: '#8b949e', recovered: '#58a6ff',
  right: '#3fb950', wrong: '#f85149', none: '#f85149', duplicate: '#d29922', unpaired: '#d29922', expected: '#ffe11a', pipeline: '#ff7bd6', frozen: '#c8c8c8',
  status: { met: '#238636', unmet: '#da3633', unjudged: '#6e7681', missing: '#8957e5', stale: '#bb8009' }
});
export const LEGEND = [
  ['cross', COLORS.expected, "Sam's mark (testimony); impeachable, often a few px off"],
  ['cross', COLORS.pipeline, "the pipeline's own point (basket point, pad center): what the error is measured from"],
  ['ring', '#ffffff', 'the match radius (tee 8 px, basket 12 px) around the mark'],
  ['rect', COLORS.TP, 'the pipeline\'s object (bbox): green TP, orange FP / duplicate, grey unjudged'],
  ['poly', COLORS.recovered, 'an S4 recovered pad (corners), with its ray to the badge it was recovered for'],
  ['line', COLORS.right, 'association: solid line to the badge chosen (green right, red wrong), dashed to the true badge'],
  ['line', COLORS.unjudged, 'S5 pair: the ray from the tee to the plate centre of the badge it pairs with (green right, red wrong, grey unjudged), dashed yellow to its own hole\'s badge when wrong; orange box: a badge no tee pairs with'],
  ['dashed', COLORS.frozen, 'the frozen state (before), when a row changed against frozen.json'],
  ['tag', '#f0883e', `near miss: error above ${NEAR_MISS_PX} px; visible N%: how much of a recovered pad's frame is visible (its evidence), contradicting M%: visible frame px that do not look like frame (a translucent ring across the pad does this)`]
];

const bboxCenter = (b) => [b[0] + (b[2] - 1) / 2, b[1] + (b[3] - 1) / 2];
const r2 = (v) => (v == null ? null : Math.round(v * 100) / 100);
const paren = (s) => { const i = s.indexOf(' ('); return i < 0 ? null : s.slice(i + 2, -1); };
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** One cell's rows: { hole, name, verdict, errorPx, dxPx, dyPx, near, weak, reason, numbers, center, marks, wide }. Marks are in raster coords. */
export function cellRows(cell, course) {
  const J = course.judgement, O = course.objects, judged = Boolean(course.testimony);
  const rows = [];
  const push = (r) => rows.push({ hole: null, name: null, errorPx: null, dxPx: null, dyPx: null, near: false, weak: false, recoveredByS4: false, reason: null, numbers: {}, marks: [], wide: false, ...r });
  const rect = (bbox, color, label) => ({ kind: 'rect', x: bbox[0], y: bbox[1], w: bbox[2], h: bbox[3], color, label });
  const cross = (p, color, label, small = false) => ({ kind: 'cross', x: p[0], y: p[1], color, label, small });
  const ring = (p, r, color) => ({ kind: 'ring', x: p[0], y: p[1], r, color });
  const poly = (pts, color, label) => ({ kind: 'poly', pts, color, label });
  const line = (a, b, color, dash) => ({ kind: 'line', a, b, color, dash });
  const badgeCenter = new Map(O.badges.map((b) => [Number(b.label), bboxCenter(b.bbox)]));
  const isBasket = cell.what.startsWith('baskets');
  const kindName = isBasket ? 'Basket' : 'Tee', stagePrefix = isBasket ? 'S2' : 'S3';

  if (cell.key === 'S1') {
    const annotated = new Set(course.testimony?.annotatedHoles ?? []);
    const seen = new Set();
    for (const b of O.badges) {
      const n = Number(b.label), dup = seen.has(n); seen.add(n);
      const verdict = !judged ? 'unjudged' : dup ? 'FP' : annotated.has(n) ? 'TP' : 'unjudged';
      push({ hole: Number.isFinite(n) ? n : null, name: `Badge ${b.label}`, verdict, center: bboxCenter(b.bbox), marks: [rect(b.bbox, COLORS[verdict], `Badge ${b.label}`)], reason: dup ? 'duplicate label' : null });
    }
    for (const m of J?.S1?.labelsMissing ?? []) push({ hole: Number(m.split(' ')[1]), name: m, verdict: 'FN', center: null, reason: 'no badge read with this label' });
    return rows.sort((a, b) => (a.hole ?? 99) - (b.hole ?? 99));
  }

  if (cell.key === 'S3association') {
    const src = judged ? (J?.S3association?.rows ?? []) : O.association.map((a) => ({ hole: null, name: null, point: a.center, said: a.said, saidCenter: a.said != null ? badgeCenter.get(a.said) ?? null : null, truthCenter: null, verdict: 'unjudged', best: null }));
    src.forEach((a, i) => {
      const color = COLORS[a.verdict] ?? COLORS.unjudged, name = a.name ?? `S3 Tee #${i}`, marks = [cross(a.point, color, name)];
      if (a.saidCenter) { const c = a.verdict === 'wrong' ? COLORS.wrong : COLORS.right; marks.push(line(a.point, a.saidCenter, c, 0)); marks.push(cross(a.saidCenter, c, `Badge ${a.said}`)); }
      if (a.verdict === 'wrong' && a.truthCenter) { marks.push(line(a.point, a.truthCenter, COLORS.expected, 6)); marks.push(cross(a.truthCenter, COLORS.expected, `Badge ${a.hole} (true)`)); }
      push({ hole: a.hole, name, verdict: a.verdict, center: a.point, marks, wide: true,
        reason: a.verdict === 'none' ? 'no badge associated' : a.verdict === 'wrong' ? `said Badge ${a.said}, is Tee ${a.hole}` : a.said != null ? `to Badge ${a.said}` : null,
        numbers: a.best ? { badge: a.said, zPx: a.best.z, lateralPx: a.best.latPx, residualDeg: a.best.resDeg, distancePx: a.best.distPx } : { badge: a.said ?? undefined } });
    });
    return rows;
  }

  if (cell.key === 'S5pairs') {
    // every tee after S4 (S3 observed + S4 recovered) and the badge it pairs with, from the accepted pairing variant
    const v = J?.S5pairs?.variants?.[s5Accepted(course)] ?? null;
    const src = judged && v ? v.rows : (O.pairs ?? []).map((p) => ({ hole: null, name: p.name, origin: p.origin, point: p.center, said: p.said, saidCenter: p.plateCenter, truthCenter: null, verdict: 'unjudged', teeErrorPx: null, residualDeg: p.residualDeg, signedPerpPx: p.signedPerpPx }));
    src.forEach((a, i) => {
      const color = COLORS[a.verdict] ?? COLORS.unjudged, name = a.name ?? `Tee #${i}`, marks = [cross(a.point, color, name)];
      if (a.saidCenter) { marks.push(line(a.point, a.saidCenter, color, 0)); marks.push(cross(a.saidCenter, color, `Badge ${a.said}`)); }
      if (a.verdict === 'wrong' && a.truthCenter) { marks.push(line(a.point, a.truthCenter, COLORS.expected, 6)); marks.push(cross(a.truthCenter, COLORS.expected, `Badge ${a.hole} (own hole)`)); }
      if (a.verdict === 'none') marks.push(ring(a.point, 8, COLORS.none));
      push({ hole: a.hole, name, verdict: a.verdict, center: a.point, marks, wide: true,
        reason: a.verdict === 'none' ? `paired with no badge (is Tee ${a.hole})` : a.verdict === 'wrong' ? `pairs with Badge ${a.said}, is Tee ${a.hole}` : a.said != null ? `${a.origin ?? ''} to Badge ${a.said}, axis residual ${a.residualDeg} deg`.trim() : 'paired with no badge',
        numbers: { badge: a.said ?? undefined, residualDeg: a.residualDeg ?? undefined, signedPerpPx: a.signedPerpPx ?? undefined, teeErrorPx: a.teeErrorPx ?? undefined, matchWithinPx: 8 } });
    });
    const plate = new Map((O.pairBadges ?? []).map((b) => [String(b.label), b.plateCenter]));
    const unpaired = judged && v ? v.unmatchedBadges.map((b) => b.replace(/^Badge /, '')) : (O.unpairedBadges ?? []);
    for (const b of unpaired) {
      const c = plate.get(String(b)) ?? null;
      push({ hole: null, name: `Badge ${b} (unpaired)`, verdict: 'unpaired', center: c, marks: c ? [rect([c[0] - 14, c[1] - 11, 28, 22], COLORS.unpaired, `Badge ${b}: no tee`)] : [], reason: 'no tee pairs with this badge' });
    }
    return rows;
  }

  const radius = isBasket ? 12 : 8;
  // the badge each observed tee was associated to (S3 association rows are in refined-tee order), for the ray
  const assocBadge = O.association.map((a) => a.said);
  const teeIndex = (p) => O.tees.findIndex((t) => t.center[0] === p[0] && t.center[1] === p[1]);
  const rayTo = (from, badge, recovered) => {
    const c = badge != null ? badgeCenter.get(Number(badge)) : null;
    const col = recovered ? COLORS.recovered : COLORS.right;
    return c ? [line(from, c, col, 4), cross(c, col, `Badge ${badge}`, true)] : [];
  };
  // a recovered pad's evidence, as numbers: how much of its frame is visible, and how much of that contradicts the template
  const evidenceOf = (d) => (d?.visibleFrameFrac != null ? { visible: d.visibleFrameFrac, contradicting: d.confidence != null && d.visibleFrameFrac > 0 ? r2(1 - d.confidence / d.visibleFrameFrac) : null } : null);
  const weakOf = (d) => Boolean(d?.recovered || d?.name?.startsWith('S4 ')) && d?.visibleFrameFrac != null && d.visibleFrameFrac < SPARSE_VISIBLE;
  const recoveredReason = (d) => { const e = evidenceOf(d); return `${d.rule ?? d.tier ?? 'recovered'}${d.forHole ? `, for Badge ${d.forHole}` : ''}${e ? `; visible ${Math.round(e.visible * 100)}%${e.contradicting ? `, contradicting ${Math.round(e.contradicting * 100)}%` : ''}` : ''}`; };

  if (!judged) {
    const dets = { S2: O.baskets.map((k) => ({ bbox: k.bbox })), S3: O.tees, S4baskets: [...O.baskets.map((k) => ({ bbox: k.bbox })), ...O.s4baskets.map((k) => ({ ...k, recovered: true }))], S4tees: [...O.tees, ...O.s4tees.map((t) => ({ ...t, recovered: true }))] }[cell.key] ?? [];
    dets.forEach((d, i) => {
      const center = d.center ?? bboxCenter(d.bbox), color = d.recovered ? COLORS.recovered : COLORS.unjudged, name = `${d.recovered ? 'S4' : stagePrefix} ${kindName} #${i}`;
      const marks = d.corners ? [poly(d.corners, color, name)] : d.bbox ? [rect(d.bbox, color, name)] : [cross(center, color, name)];
      const wide = cell.key === 'S4tees' && Boolean(d.center);
      if (wide) marks.push(...rayTo(center, d.recovered ? d.forHole : assocBadge[teeIndex(center)], d.recovered));
      const weak = weakOf(d);
      push({ name, verdict: d.recovered ? 'recovered' : 'unjudged', center, marks, wide, weak,
        reason: d.recovered ? recoveredReason(d) : null,
        numbers: { visibleFrameFrac: d.visibleFrameFrac ?? undefined, contradictingFrac: evidenceOf(d)?.contradicting ?? undefined, confidence: d.confidence ?? undefined, forBadge: d.forHole ?? undefined } });
    });
    if (cell.key === 'S4tees') for (const m of O.s4missed) push({ hole: Number(m.hole) || null, name: `Tee for Badge ${m.hole}`, verdict: 'FN', center: null, reason: m.reason });
    return rows;
  }

  const stage = cell.key === 'S4tees' ? J?.S4tees?.branches?.[s4Accepted(course)] : J?.[cell.key];
  const s4Recovered = cell.key === 'S2' || cell.key === 'S3' ? recoveredHoles(course, cell.key) : new Set();   // occlusion is expected: S4 recovers
  const fnWhy = new Map((J?.S3?.fn ?? []).map((s) => [Number(s.split(' ')[1]), paren(s)]));
  const missedWhy = new Map(O.s4missed.map((m) => [Number(m.hole), m.reason]));
  for (const r of stage?.rows ?? []) {
    const d = r.detection, recovered = Boolean(d?.name?.startsWith('S4 ')), color = COLORS[r.verdict] ?? COLORS.unjudged, marks = [];
    // names are unique per stage only ("Tee ca" and "S4 Tee ca" both exist in an S4 cell): say which stage observed it
    const name = d ? (recovered || !cell.key.startsWith('S4') ? d.name : `${stagePrefix} ${d.name}`) : null;
    if (r.expected) { marks.push(ring(r.expected, radius, '#ffffff')); marks.push(cross(r.expected, COLORS.expected, r.hole != null ? `mark ${r.hole}` : null)); }
    if (d) { if (d.corners) marks.push(poly(d.corners, color, name)); else if (d.bbox) marks.push(rect(d.bbox, color, name)); marks.push(cross(d.point, COLORS.pipeline, d.corners || d.bbox ? null : name, true)); }
    const wide = cell.key === 'S4tees' && Boolean(d);
    if (wide) marks.push(...rayTo(d.point, recovered ? d.forHole : assocBadge[teeIndex(d.point)], recovered));
    const dx = d && r.expected ? r2(d.point[0] - r.expected[0]) : null, dy = d && r.expected ? r2(d.point[1] - r.expected[1]) : null;
    const weak = weakOf(d);
    const recoveredByS4 = r.verdict === 'FN' && s4Recovered.has(r.hole);
    const reason = r.verdict === 'FN' ? `${cell.key === 'S3' ? fnWhy.get(r.hole) ?? '' : cell.key === 'S4tees' ? missedWhy.get(r.hole) ?? 'not recovered' : ''}${recoveredByS4 ? '; recovered by S4' : cell.key === 'S2' || cell.key === 'S3' ? '; NOT recovered by S4' : ''}`.replace(/^; /, '')
      : d?.rule ? recoveredReason(d) : null;
    push({ hole: r.hole, name: name ?? (r.hole != null ? `${kindName} ${r.hole}` : null), verdict: r.verdict, errorPx: r2(r.errorPx), dxPx: dx, dyPx: dy, recoveredByS4,
      near: r.errorPx != null && r.errorPx > NEAR_MISS_PX, weak, center: r.expected ?? d?.point ?? null, marks, wide, reason,
      numbers: { errorPx: r2(r.errorPx) ?? undefined, dxPx: dx ?? undefined, dyPx: dy ?? undefined, matchWithinPx: radius, visibleFrameFrac: d?.visibleFrameFrac ?? undefined, contradictingFrac: evidenceOf(d)?.contradicting ?? undefined, confidence: d?.confidence ?? undefined, forBadge: d?.forHole ?? undefined, angleDeg: d?.angleRad != null ? r2(d.angleRad * 180 / Math.PI) : undefined } });
  }
  return rows;
}

/** The residual a cell's judged rows share: mean and spread of signed dx, dy (a constant residual is a convention, not noise). */
export function residualSummary(rows) {
  const xs = rows.filter((r) => r.dxPx != null);
  if (xs.length < 3) return null;
  const mean = (a) => a.reduce((n, v) => n + v, 0) / a.length, sd = (a) => { const m = mean(a); return Math.sqrt(mean(a.map((v) => (v - m) ** 2))); };
  const dx = xs.map((r) => r.dxPx), dy = xs.map((r) => r.dyPx);
  // the dominant offset: the most common (dx, dy) at 0.25 px; a convention when most rows share it and it is over 1 px
  const bins = new Map(); for (const r of xs) { const k = `${Math.round(r.dxPx * 4) / 4},${Math.round(r.dyPx * 4) / 4}`; bins.set(k, (bins.get(k) ?? 0) + 1); }
  const [modeKey, modeN] = [...bins].sort((a, b) => b[1] - a[1])[0], [modeDx, modeDy] = modeKey.split(',').map(Number);
  const constant = modeN / xs.length >= 0.6 && Math.hypot(modeDx, modeDy) > 1;
  return { rows: xs.length, meanDxPx: r2(mean(dx)), meanDyPx: r2(mean(dy)), sdDxPx: r2(sd(dx)), sdDyPx: r2(sd(dy)), modeDxPx: modeDx, modeDyPx: modeDy, modeRows: modeN, constant };
}

/** The geometry of a row, for freezing and comparing (labels and colours dropped). */
export const rowGeometry = (r) => ({ hole: r.hole, name: r.name, verdict: r.verdict, errorPx: r.errorPx, center: r.center, confidence: r.numbers?.confidence ?? null,
  marks: r.marks.filter((m) => m.kind !== 'ring').map(({ kind, x, y, w, h, pts, a, b }) => ({ kind, x, y, w, h, pts, a, b })) });

function compareWithFrozen(rows, frozenRows) {
  if (!frozenRows) return { rows: rows.map((r) => ({ ...r, vsFrozen: null })), gone: [] };
  const key = (r) => (r.hole != null ? `h${r.hole}` : `n${r.name}`), was = new Map(frozenRows.map((f) => [key(f), f])), used = new Set();
  const out = rows.map((r) => {
    const f = was.get(key(r)); if (!f) return { ...r, vsFrozen: 'new' };
    used.add(key(r));
    const moved = r.center && f.center ? dist(r.center, f.center) : 0;
    const changes = [];
    if (f.verdict !== r.verdict) changes.push(`${f.verdict} -> ${r.verdict}`);
    if (moved > MOVED_PX) changes.push(`moved ${r2(moved)} px`);
    if (f.errorPx != null && r.errorPx != null && Math.abs(f.errorPx - r.errorPx) > 0.05) changes.push(`error ${f.errorPx} -> ${r.errorPx} px`);
    return { ...r, vsFrozen: changes.length ? changes.join(', ') : 'same', before: changes.length ? f.marks : null };
  });
  return { rows: out, gone: frozenRows.filter((f) => !used.has(key(f))).map((f) => `${f.name ?? ''}${f.hole != null ? ` (hole ${f.hole})` : ''} ${f.verdict}`) };
}

/**
 * Where to look first (Sam: "can that artifact maybe tell YOU where to look for stuff?"): ranked, each with a deep link.
 *   1 an S2/S3 FN that S4 did not recover, or an S4 FN; 2 an FP, a wrong or missing association, a missing or duplicate badge;
 *   3 a row that changed against frozen; 4 a recovery resting on little visible frame (below SPARSE_VISIBLE), least first;
 *   5 a recovered object on a course without testimony (needs eye);
 *   6 a cell whose near misses share a constant offset (a convention, one item), else each near miss.
 */
export function attention(courses) {
  const items = [];
  const link = (c, k, ri) => `#${c.course}.${k.key}${ri != null ? `.r${ri}` : ''}`;
  for (const c of courses) for (const k of c.cells) {
    k.rows.forEach((r, ri) => {
      const at = { course: c.course, cell: k.key, name: r.name, hole: r.hole, link: link(c, k, ri) };
      if (r.verdict === 'FN' && !r.recoveredByS4) items.push({ rank: 1, why: `FN${r.reason ? `: ${r.reason}` : ''}`, ...at });
      else if (/FP|wrong|none|unpaired/.test(r.verdict)) items.push({ rank: 2, why: `${r.verdict}${r.reason ? `: ${r.reason}` : ''}`, ...at });
      if (r.vsFrozen && r.vsFrozen !== 'same') items.push({ rank: 3, why: `changed vs frozen: ${r.vsFrozen}`, ...at });
      if (r.weak) items.push({ rank: 4, visible: r.numbers?.visibleFrameFrac ?? 0, why: `recovered from ${Math.round((r.numbers?.visibleFrameFrac ?? 0) * 100)}% visible frame${r.numbers?.contradictingFrac ? `, ${Math.round(r.numbers.contradictingFrac * 100)}% of it contradicting` : ''}: a look, not a verdict`, ...at });
      if (c.testimony === 'none' && r.verdict === 'recovered') items.push({ rank: 5, why: `recovered without testimony: judge by eye (${r.reason ?? ''})`, ...at });
    });
    if (k.gone.length) items.push({ rank: 3, course: c.course, cell: k.key, name: null, hole: null, link: link(c, k), why: `gone since frozen: ${k.gone.join('; ')}` });
    if (k.residual?.constant) items.push({ rank: 6, course: c.course, cell: k.key, name: null, hole: null, link: link(c, k), why: `${k.residual.modeRows} of ${k.residual.rows} judged rows share one offset (dx ${k.residual.modeDxPx}, dy ${k.residual.modeDyPx} px, pipeline minus mark): a convention differs, the mark or the point definition` });
    else k.rows.forEach((r, ri) => { if (r.near && !/FN|FP/.test(r.verdict)) items.push({ rank: 6, why: `near miss ${r.errorPx} px (dx ${r.dxPx}, dy ${r.dyPx})`, course: c.course, cell: k.key, name: r.name, hole: r.hole, link: link(c, k, ri) }); });
  }
  return items.sort((a, b) => a.rank - b.rank || (a.rank === 4 ? (a.visible ?? 0) - (b.visible ?? 0) : 0));
}

function openRaster(course) {
  if (!course.paths?.snap || !existsSync(course.paths.snap)) return null;
  const img = new Map(deserialize(readFileSync(course.paths.snap))).get('px.image.cropped');
  return img ? { rgba: img.rgba, width: img.widthPx, height: img.heightPx } : null;
}

/** The whole inspector's data: per course, per cell, rows with crops. frozen: a frozen.json value or null. */
export function inspectorData(matrix, inputs, { root, frozen = null }) {
  const courses = [];
  for (const c of inputs.courses) {
    const raster = openRaster(c), cells = [];
    for (const cell of CELLS) {
      const m = matrix.rows.find((r) => r.course === c.course && r.key === cell.key);
      const { rows: compared, gone } = compareWithFrozen(cellRows(cell, c), frozen?.objects?.[c.course]?.[cell.key] ?? null);
      const rows = compared.map((r) => {
        const size = r.wide ? CROP.wideSizePx : CROP.sizePx, display = r.wide ? CROP.wideDisplay : CROP.display;
        const crop = raster && r.center ? cropWindow(raster, { cx: r.center[0], cy: r.center[1], size, deflate: (raw) => deflateSync(raw) }) : null;
        return { ...r, crop: crop ? { png: crop.png, x0: crop.origin[0], y0: crop.origin[1], size, display } : null };
      });
      const summary = { rows: rows.length, FN: rows.filter((r) => r.verdict === 'FN').length, FP: rows.filter((r) => /FP|wrong|none|unpaired/.test(r.verdict)).length,
        recovered: rows.filter((r) => /recovered/.test(r.verdict) || /^S4 /.test(r.name ?? '')).length, near: rows.filter((r) => r.near).length, weak: rows.filter((r) => r.weak).length,
        changed: rows.filter((r) => r.vsFrozen && r.vsFrozen !== 'same').length + gone.length };
      cells.push({ key: cell.key, what: cell.what, status: m?.status, result: m?.result, expected: m?.expected, freshness: m?.freshness, changedPaths: m?.changedPaths ?? [], vsFrozen: m?.vsFrozen, goal: m?.goal,
        rows, summary, residual: residualSummary(rows), gone });
    }
    courses.push({ course: c.course, attempt: c.attempt, N: c.N, testimony: c.testimony ? (c.testimony.complete ? 'all 18 holes' : `holes ${c.testimony.annotatedHoles.join(', ')}`) : 'none',
      flipbook: c.paths?.s4run ? join(c.paths.s4run, 's4recover.flipbook.html').replace(root + '/', '') : null, cells, imageSize: raster ? [raster.width, raster.height] : null });
  }
  return { at: new Date().toISOString(), emits: matrix.emits, cells: CELLS.map((c) => ({ key: c.key, what: c.what })), courses, legend: LEGEND, colors: COLORS,
    nearMissPx: NEAR_MISS_PX, sparseVisible: SPARSE_VISIBLE, frozenAt: frozen?.at ?? null, attention: attention(courses) };
}

export function inspectorHtml(data) {
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  return `<title>ChainSpot State Inspector</title>
<meta name="claude:viewport-fit-sides" content="cover">
<style>
/* layout: a status grid on top (scrolls sideways if it must), then two panes: the cell's objects, the one object; one column on a phone */
:root{--bg:#0d1117;--panel:#161b22;--line:#30363d;--fg:#c9d1d9;--muted:#8b949e;--accent:#58a6ff;--select:#ffe11a;--near:#f0883e;--mono:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;--sans:-apple-system,"Segoe UI",Helvetica,Arial,sans-serif;color-scheme:dark}
@media (prefers-color-scheme: light){:root:not([data-theme="dark"]){--bg:#f6f8fa;--panel:#ffffff;--line:#d0d7de;--fg:#1f2328;--muted:#57606a;--accent:#0969da;--select:#9a6700;--near:#bc4c00;color-scheme:light}}
:root[data-theme="light"]{--bg:#f6f8fa;--panel:#ffffff;--line:#d0d7de;--fg:#1f2328;--muted:#57606a;--accent:#0969da;--select:#9a6700;--near:#bc4c00;color-scheme:light}
body{margin:0;background:var(--bg);color:var(--fg);font:13px/1.45 var(--sans);padding-block:0;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px))}
header{padding-block:12px;border-bottom:1px solid var(--line)}h1{font-size:16px;margin:0 0 4px;text-wrap:balance}h3{font-size:14px;margin:0 0 6px}
#grid{padding-block:12px;overflow-x:auto}
main{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:16px;border-top:1px solid var(--line)}
@media (max-width:900px){main{grid-template-columns:minmax(0,1fr)}}
section{padding-block:12px;min-width:0}
table{border-collapse:collapse;font-variant-numeric:tabular-nums}th,td{border:1px solid var(--line);padding:4px 6px;text-align:left;vertical-align:top}
td.cell{cursor:pointer;min-width:120px}td.cell:hover{outline:2px solid var(--accent)}td.cell.sel{outline:2px solid var(--select)}
.st{display:inline-block;padding:0 6px;border-radius:9px;color:#fff;font-weight:600}
.chip{display:inline-block;padding:0 5px;border-radius:9px;font-size:11px;font-weight:600;background:var(--panel);border:1px solid var(--line)}
.thumbs{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}
.thumb{width:150px;cursor:pointer;background:var(--panel);border:1px solid var(--line);border-radius:4px;padding:4px}
.thumb.sel{border-color:var(--select)}.thumb .cap{font-size:11px;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.v{font-weight:700}.near{color:var(--near)}
img{image-rendering:pixelated;display:block;max-width:100%}
.wrap{position:relative;display:inline-block;max-width:100%}.wrap svg{position:absolute;left:0;top:0;pointer-events:none}
.num{font-family:var(--mono);font-size:12px}
.legend li{margin:2px 0}.legend i{display:inline-block;width:12px;height:12px;margin-right:6px;vertical-align:middle;border-radius:2px}
button{background:var(--panel);color:var(--fg);border:1px solid var(--line);border-radius:4px;padding:2px 8px;cursor:pointer;margin:0 4px 4px 0;font:inherit}button.on{border-color:var(--accent);color:var(--accent)}button:focus-visible{outline:2px solid var(--accent)}
a{color:var(--accent)}small{color:var(--muted)}p{max-width:70ch}
details{padding-block:8px;border-bottom:1px solid var(--line)}details ol{margin:6px 0 0;padding-left:22px}details li{margin:2px 0}
</style>
<header><h1>ChainSpot State Inspector</h1><div id="hdr"></div></header>
<details id="look" open><summary><b>Look here first</b> <span id="lookn"></span></summary><ol id="looklist"></ol></details>
<div id="grid"></div>
<main><section id="left"><div id="cellpanel"><small>Pick a cell above.</small></div></section><section id="right"><div id="detail"><small>Pick a cell, then an object.</small></div>
<div class="legend" style="margin-top:24px"><b>Legend</b><ul id="legend"></ul></div></section></main>
<script type="application/json" id="data">${json}</script>
<script>
const D=JSON.parse(document.getElementById('data').textContent);const $=(s)=>document.querySelector(s);const esc=(s)=>String(s??'').replace(/[&<>"]/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const st=(s)=>'<span class="st" style="background:'+(D.colors.status[s]||'#444')+'">'+esc(s)+'</span>';
$('#hdr').innerHTML='derived '+esc(D.at)+' &middot; '+D.emits.cells+' cells: '+D.emits.met+' met, '+D.emits.unmet+' unmet, '+D.emits.unjudged+' unjudged, '+D.emits.missing+' missing, '+D.emits.stale+' stale'+(D.frozenAt?' &middot; compared with frozen.json of '+esc(D.frozenAt):' &middot; nothing frozen yet');
$('#legend').innerHTML=D.legend.map(([k,c,t])=>'<li><i style="background:'+c+'"></i>'+esc(k)+': '+esc(t)+'</li>').join('');
const RANK={1:'miss',2:'wrong',3:'changed',4:'sparse',5:'needs eye',6:'offset'};
$('#lookn').textContent='('+D.attention.length+' items, ranked: misses, wrong, changed, weak, needs eye, offsets)';
$('#looklist').innerHTML=D.attention.slice(0,40).map((a)=>'<li><a href="'+esc(a.link)+'">'+esc(a.course)+' &middot; '+esc(a.cell)+(a.name?' &middot; '+esc(a.name):'')+(a.hole!=null?' (hole '+a.hole+')':'')+'</a> <span class="chip">'+RANK[a.rank]+'</span> '+esc(a.why)+'</li>').join('')+(D.attention.length>40?'<li>... '+(D.attention.length-40)+' more</li>':'');
const FILTERS={all:'all',miss:'FN / FP / wrong',rec:'recovered',near:'near misses',weak:'sparse evidence',changed:'changed vs frozen'};
let sel={ci:null,ki:null,ri:null,filter:'all'};
// deep links are bare tokens: #course.cell[.filter][.rN]
function readHash(){const t=location.hash.slice(1).split('.');const ci=D.courses.findIndex((c)=>c.course===t[0]);const ki=D.cells.findIndex((c)=>c.key===t[1]);if(ci<0||ki<0)return;sel={ci,ki,ri:null,filter:'all'};for(const x of t.slice(2)){if(FILTERS[x])sel.filter=x;else if(/^r\\d+$/.test(x))sel.ri=+x.slice(1);}}
function writeHash(){if(sel.ci==null)return;const t=[D.courses[sel.ci].course,D.cells[sel.ki].key];if(sel.filter!=='all')t.push(sel.filter);if(sel.ri!=null)t.push('r'+sel.ri);history.replaceState(null,'','#'+t.join('.'));}
function render(){writeHash();grid();cellpanel();detail();}
function grid(){let h='<table><tr><th>course</th>'+D.cells.map((c)=>'<th>'+esc(c.key)+'<br><small>'+esc(c.what)+'</small></th>').join('')+'</tr>';
D.courses.forEach((c,ci)=>{h+='<tr><th>'+esc(c.course)+'<br><small>N = '+c.N+' &middot; testimony: '+esc(c.testimony)+'</small></th>';c.cells.forEach((k,ki)=>{const s=k.summary;h+='<td class="cell'+(sel.ci===ci&&sel.ki===ki?' sel':'')+'" data-ci="'+ci+'" data-ki="'+ki+'">'+st(k.status)+' <small>'+esc(k.freshness)+'</small>'+(s.changed?' <span class="chip" style="color:#bb8009">'+s.changed+' changed</span>':(D.frozenAt&&k.vsFrozen?' <span class="chip">'+esc(k.vsFrozen==='same'?'same':'cell '+k.vsFrozen)+'</span>':''))+'<br>'+esc(k.result||'-')+'<br><small>'+s.rows+' objects'+(s.FN?', <b style="color:#f85149">'+s.FN+' FN</b>':'')+(s.FP?', <b style="color:#d29922">'+s.FP+' FP/wrong</b>':'')+(s.recovered?', <b style="color:#58a6ff">'+s.recovered+' recovered</b>':'')+(s.near?', <b class="near">'+s.near+' near</b>':'')+(s.weak?', <b class="near">'+s.weak+' sparse</b>':'')+'</small></td>';});h+='</tr>';});
$('#grid').innerHTML=h+'</table>';document.querySelectorAll('td.cell').forEach((td)=>td.onclick=()=>{sel={ci:+td.dataset.ci,ki:+td.dataset.ki,ri:null,filter:sel.filter};render();});}
const show=(r)=>sel.filter==='all'||(sel.filter==='miss'&&/FN|FP|wrong|none|unpaired/.test(r.verdict))||(sel.filter==='rec'&&(/recovered/.test(r.verdict)||/^S4 /.test(r.name||'')))||(sel.filter==='near'&&r.near)||(sel.filter==='weak'&&r.weak)||(sel.filter==='changed'&&r.vsFrozen&&r.vsFrozen!=='same');
function cellpanel(){if(sel.ci==null){$('#cellpanel').innerHTML='<small>Pick a cell above.</small>';return;}const c=D.courses[sel.ci],k=c.cells[sel.ki];
let h='<h3>'+esc(c.course)+' &middot; '+esc(k.key)+' '+esc(k.what)+' '+st(k.status)+'</h3><div><b>expected:</b> '+esc(k.expected)+'<br><b>result:</b> '+esc(k.result||'-')+'<br><small>goal: '+esc(k.goal)+'</small>';
if(k.freshness==='STALE')h+='<br><b class="near">stale:</b> <span class="num">'+esc(k.changedPaths.slice(0,8).join(', '))+(k.changedPaths.length>8?' ... ('+k.changedPaths.length+' paths)':'')+'</span>';
if(k.residual)h+='<br><b>residual over '+k.residual.rows+' judged rows:</b> <span class="num">mean dx '+k.residual.meanDxPx+', dy '+k.residual.meanDyPx+' px; most common dx '+k.residual.modeDxPx+', dy '+k.residual.modeDyPx+' px on '+k.residual.modeRows+' rows</span>'+(k.residual.constant?' <b class="near">a constant offset: a convention differs (the mark or the point definition), not noise</b>':'');
if(k.gone.length)h+='<br><b class="near">gone since frozen:</b> '+esc(k.gone.join('; '));
if(c.testimony==='none')h+='<br><small>no testimony: judge by eye; calibrate on an annotated course first (docs/evidence/crossval/)</small>';
if(c.flipbook)h+='<br><small>S4 flipbook: <span class="num">'+esc(c.flipbook)+'</span></small>';
h+='</div><div style="margin-top:6px">'+Object.entries(FILTERS).map(([f,label])=>'<button class="'+(sel.filter===f?'on':'')+'" data-f="'+f+'">'+label+'</button>').join('')+'</div><div class="thumbs">';
k.rows.forEach((r,ri)=>{if(!show(r))return;const col=D.colors[r.verdict]||'#8b949e';h+='<div class="thumb'+(sel.ri===ri?' sel':'')+'" data-ri="'+ri+'">'+(r.crop?pic(r,144/r.crop.size,false):'<div style="height:144px;display:flex;align-items:center;justify-content:center;color:var(--muted)">no geometry</div>')+'<div class="cap"><span class="v" style="color:'+col+'">'+esc(r.verdict)+'</span> '+esc(r.name||'')+(r.hole!=null?' <small>hole '+r.hole+'</small>':'')+(r.errorPx!=null?' <span class="num'+(r.near?' near':'')+'">'+r.errorPx+' px</span>':'')+(r.weak?' <span class="near">sparse</span>':'')+(r.vsFrozen&&r.vsFrozen!=='same'?' <span class="chip">'+esc(r.vsFrozen)+'</span>':'')+'</div></div>';});
$('#cellpanel').innerHTML=h+'</div>';document.querySelectorAll('.thumb').forEach((t)=>t.onclick=()=>{sel.ri=+t.dataset.ri;render();});document.querySelectorAll('button[data-f]').forEach((b)=>b.onclick=()=>{sel.filter=b.dataset.f;sel.ri=null;render();});}
function marksSvg(marks,P,scale,labels,dashAll){let s='';const T=(x,y,c,t)=>labels&&t?'<text x="'+x+'" y="'+y+'" fill="'+c+'" font-size="11" font-weight="700" stroke="#000" stroke-width="3" paint-order="stroke">'+esc(t)+'</text>':'';const da=dashAll?' stroke-dasharray="4 3" opacity=".9"':'';
for(const m of marks){const col=dashAll?D.colors.frozen:m.color;
if(m.kind==='cross'){const[x,y]=P(m.x,m.y),a=m.small?4:6;s+='<path d="M'+(x-a)+' '+y+'H'+(x+a)+'M'+x+' '+(y-a)+'V'+(y+a)+'" stroke="'+col+'" stroke-width="2"'+da+'/>'+T(x+8,y-8,col,m.label);}
else if(m.kind==='ring'){const[x,y]=P(m.x,m.y);s+='<circle cx="'+x+'" cy="'+y+'" r="'+(m.r*scale)+'" fill="none" stroke="'+col+'" stroke-width="1" stroke-dasharray="3 3" opacity=".8"/>';}
else if(m.kind==='rect'){const[x,y]=P(m.x-0.5,m.y-0.5);s+='<rect x="'+x+'" y="'+y+'" width="'+(m.w*scale)+'" height="'+(m.h*scale)+'" fill="none" stroke="'+col+'" stroke-width="2"'+da+'/>'+T(x+2,y-4,col,m.label);}
else if(m.kind==='poly'){const pts=m.pts.map(([x,y])=>P(x,y).join(',')).join(' ');s+='<polygon points="'+pts+'" fill="none" stroke="'+col+'" stroke-width="2"'+da+'/>';const[x,y]=P(m.pts[0][0],m.pts[0][1]);s+=T(x,y-6,col,m.label);}
else if(m.kind==='line'){const[ax,ay]=P(m.a[0],m.a[1]),[bx,by]=P(m.b[0],m.b[1]);s+='<line x1="'+ax+'" y1="'+ay+'" x2="'+bx+'" y2="'+by+'" stroke="'+col+'" stroke-width="2"'+(m.dash||dashAll?' stroke-dasharray="'+(m.dash||4)+' '+(m.dash||4)+'"':'')+'/>';}}
return s;}
function pic(r,scale,labels){const c=r.crop,S=Math.round(c.size*scale),P=(x,y)=>[(x-c.x0+0.5)*scale,(y-c.y0+0.5)*scale];
let s='<svg width="'+S+'" height="'+S+'" viewBox="0 0 '+S+' '+S+'">'+(r.before?marksSvg(r.before,P,scale,false,true):'')+marksSvg(r.marks,P,scale,labels,false)+'</svg>';
return '<div class="wrap"><img width="'+S+'" height="'+S+'" alt="crop of '+esc(r.name||'')+'" src="data:image/png;base64,'+c.png+'">'+s+'</div>';}
function detail(){if(sel.ri==null){$('#detail').innerHTML='<small>Pick a cell, then an object.</small>';return;}const c=D.courses[sel.ci],k=c.cells[sel.ki],r=k.rows[sel.ri],col=D.colors[r.verdict]||'#8b949e';
let h='<h3>'+esc(c.course)+' &middot; '+esc(k.key)+' &middot; <span style="color:'+col+'">'+esc(r.verdict)+'</span> '+esc(r.name||'')+(r.hole!=null?' (hole '+r.hole+')':'')+'</h3>';
h+=r.crop?pic(r,r.crop.display,true):'<div><small>no geometry to show</small></div>';
if(r.crop)h+='<div><small>crop origin ('+r.crop.x0+', '+r.crop.y0+') px, '+r.crop.size+' px at '+r.crop.display+'x, canonical frame of '+esc(c.course)+'</small></div>';
h+='<p><b>expected:</b> '+esc(k.expected)+'<br><b>this object:</b> '+esc(r.verdict)+(r.errorPx!=null?', '+r.errorPx+' px from the mark (dx '+r.dxPx+', dy '+r.dyPx+' px, pipeline minus mark)'+(r.near?' <span class="near">near miss: above '+D.nearMissPx+' px; is the mark or the result off?</span>':''):'')+(r.weak?' <span class="near">rests on little visible frame</span>':'')+(r.reason?'<br><b>reason:</b> '+esc(r.reason):'')+'</p>';
const nums=Object.entries(r.numbers||{}).filter(([,v])=>v!==undefined&&v!==null);if(nums.length)h+='<table class="num">'+nums.map(([k2,v])=>'<tr><td>'+esc(k2)+'</td><td>'+esc(typeof v==='number'?Math.round(v*1000)/1000:v)+'</td></tr>').join('')+'</table>';
if(r.vsFrozen)h+='<p><b>vs frozen:</b> '+esc(r.vsFrozen)+(r.before?' (before drawn dashed)':'')+'</p>';
if(r.hole!=null){const links=[];c.cells.forEach((k2,ki2)=>{if(ki2===sel.ki)return;const ri2=k2.rows.findIndex((x)=>x.hole===r.hole);if(ri2>=0)links.push('<a href="#'+c.course+'.'+k2.key+'.r'+ri2+'">'+esc(k2.key)+': '+esc(k2.rows[ri2].verdict)+'</a>');});if(links.length)h+='<p><b>hole '+r.hole+' elsewhere:</b> '+links.join(' &middot; ')+'</p>';}
$('#detail').innerHTML=h;}
readHash();grid();cellpanel();detail();window.addEventListener('hashchange',()=>{readHash();grid();cellpanel();detail();});
</script>`;
}

export function writeInspector(root, matrix, inputs, frozen = null) {
  const data = inspectorData(matrix, inputs, { root, frozen });
  const dir = join(root, 'attempts', 'state'); mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'inspector.html'), inspectorHtml(data));
  return { path: 'attempts/state/inspector.html', attention: data.attention };
}

/** What freeze records per object (ports/state/matrix.mjs freeze): the rows' geometry per course and cell. */
export function frozenObjects(inputs) {
  const objects = {};
  for (const c of inputs.courses) { objects[c.course] = {}; for (const cell of CELLS) objects[c.course][cell.key] = cellRows(cell, c).map(rowGeometry); }
  return objects;
}
