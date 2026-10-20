/**
 * fn.tk.export.course -> tk.export.course: the ONE boundary between the toolkit CV and the app (docs/agents/boundary.md,
 * contracts/export.course@1.mjs). A derived view with its own address: the Part is the whole `chainspot.course-geometry` v1
 * document (the file is that value, written once by the runner; consumers read the Part, not the file).
 *
 *   holes          S7 routeMatch, one per S1 badge number: tee = the hole's tee centre (S3 association, else S4 recovered),
 *                  basket = the route's end, corridorBends = the route's interior vertices, corridorWidthPx = the course
 *                  hallway W (LOCAL: learned on the tee -> badge segments). Shape = ChainSpot ProjectState v7 AnnotatedHole.
 *   numberBadges   the S1 badges that read a hole number (centre of the badge box, S1 confidence). = HoleNumberBadgeAnchor.
 *   candidates     S2/S4 baskets no hole claimed: 'Basket cX', never numbered.
 *   evidence       per hole OUTSIDE AnnotatedHole: status, confidence (the hallway sensor's reading), tee / basket / trace.
 * Frame: the ORIGINAL UPLOAD (S0's removed top rows added back to y); source.s0Crop records the mapping. Points are rounded to
 * 0.01 px. A point outside the frame is dropped and recorded in the hole's reasons (never clamped). Data conditions (no tee,
 * no route, no hallway width) are recorded results, never throws.
 */
import { confidenceOf } from '../s7trace/traceView.mjs';
import { FORMAT, VERSION } from '../../contracts/export.course@1.mjs';

export const EXPORT_COURSE_PART = 'tk.export.course';
const r2 = (v) => Math.round(v * 100) / 100;
const r3 = (v) => (v == null ? null : Math.round(v * 1000) / 1000);
const lengthOf = (V) => V.reduce((s, p, i) => (i ? s + Math.hypot(p[0] - V[i - 1][0], p[1] - V[i - 1][1]) : 0), 0);
const labelNumber = (label) => (/^[1-9][0-9]*$/.test(String(label)) ? Number(label) : null);

/**
 * The document. solve = fn.q.trace.routeMatch's value; holesPart = tk.s7.holes; hallway = tk.s7.hallway; badges = px.badges;
 * crop = tk.source.cropReceipt ({ originalPx: {width, height}, upperRowsRemoved, lowerRowsRemoved }); source = { fileName, sha256 };
 * producer = { name, recipe, attemptId, stagesRun }.
 */
export function courseGeometryOf({ solve, holesPart, hallway, badges, crop, source, producer }) {
  const dy = crop.upperRowsRemoved, W = crop.originalPx.width, H = crop.originalPx.height;
  const toSource = ([x, y]) => ({ xPx: r2(x), yPx: r2(y + dy) });
  const inFrame = (p) => p.xPx >= 0 && p.yPx >= 0 && p.xPx < W && p.yPx < H;
  const widthPx = hallway?.widthPx > 0 ? r2(hallway.widthPx) : null;
  const conditions = [...(holesPart.conditions ?? []), ...(solve.condition ? [solve.condition] : []), ...(widthPx ? [] : ['no hallway width W: corridorWidthPx is unknown, so no hole is exported'])];
  const assigned = new Set(), holes = [], evidence = [];
  for (const h of holesPart.holes) {
    const number = labelNumber(h.hole);
    if (number == null) { conditions.push(`badge label '${h.hole}' is not a hole number: not exported`); continue; }
    const r = solve.holes?.[h.hole] ?? solve.holes?.[number] ?? null, verts = r?.verts ?? [];
    const asg = (solve.assignment ?? []).find((a) => String(a.hole) === String(h.hole)) ?? null;
    if (asg) assigned.add(asg.basket);
    if (!widthPx) continue;
    const reasons = [], keep = (p, what) => { if (!p) return null; const q = toSource(p); if (inFrame(q)) return q; reasons.push(`${what} (${q.xPx}, ${q.yPx}) is outside the ${W} x ${H} px source frame: dropped`); return null; };
    const tee = keep(h.tee?.teeCenter, 'tee');
    const basket = verts.length ? keep(verts.at(-1), 'basket') : null;
    const bends = verts.slice(1, -1).map((p) => keep(p, 'bend')).filter(Boolean);
    const level = confidenceOf(verts, asg?.sensor, asg?.stations);
    if (!h.tee) reasons.push(h.condition ?? 'no tee');
    if (!verts.length) reasons.push('no route from the tee to a basket');
    if (level === 'unconfirmed') reasons.push(`the hallway sensor reads ${r3(asg.sensor)} on ${asg.stations} stations (confirmed needs >= 0.75 on >= 20)`);
    if (r?.how && level !== 'confirmed') reasons.push(r.how);
    const dropped = reasons.some((s) => s.endsWith('dropped'));
    const status = !tee || !verts.length ? 'unresolved' : level !== 'confirmed' || dropped ? 'partial' : bends.length ? 'resolved' : 'straight';
    const id = `hole-${number}`;
    holes.push({ id, number, ...(tee ? { tee } : {}), ...(basket ? { basket } : {}), shots: [], corridorBends: bends, corridorWidthPx: widthPx });
    evidence.push({ holeId: id, status, confidence: { level, sensor: r3(asg?.sensor), stations: asg?.stations ?? null, marginLum: r3(r?.pair?.marginLum) },
      tee: { state: tee ? 'placed' : 'none', source: h.tee?.source ?? null }, basket: { state: basket ? 'matched' : 'none', ...(asg ? { candidate: (holesPart.baskets[asg.basket]?.name ?? null) } : {}) },
      trace: { outcome: verts.length ? 'basket' : 'none', lengthPx: verts.length ? r2(lengthOf(verts)) : null, bendCount: bends.length }, reasons });
  }
  holes.sort((a, b) => a.number - b.number);
  evidence.sort((a, b) => Number(a.holeId.slice(5)) - Number(b.holeId.slice(5)));
  // badges: one anchor per hole number (the most confident box), the centre of its S1 box; a number the S1 read found twice keeps the better read
  const best = new Map();
  for (const b of badges) {
    const number = labelNumber(b.label); if (number == null || !(b.confidence >= 0 && b.confidence <= 1)) continue;
    const p = toSource([b.bbox[0] + (b.bbox[2] - 1) / 2, b.bbox[1] + (b.bbox[3] - 1) / 2]);
    if (inFrame(p) && (!best.has(number) || b.confidence > best.get(number).confidence)) best.set(number, { number, ...p, confidence: r3(b.confidence) });
  }
  const numberBadges = [...best.values()].sort((a, b) => a.number - b.number);
  const candidates = holesPart.baskets.filter((b) => !assigned.has(b.index)).map((b) => ({ label: b.name, ...toSource(b.point), kind: 'basket' })).filter(inFrame);
  return {
    format: FORMAT, version: VERSION, producer,
    source: { fileName: source.fileName, sha256: source.sha256, widthPx: W, heightPx: H, frame: 'original-upload', s0Crop: { rowsRemovedTop: dy, rowsRemovedBottom: crop.lowerRowsRemoved } },
    holes, numberBadges, candidates, evidence, conditions,
    units: { 'xPx/yPx': 'px in source.frame (the original upload, S0 crop added back)', corridorWidthPx: 'px in source.frame; the course hallway W (LOCAL, learned on this screenshot)', lengthPx: 'px in source.frame', sensor: 'fraction of stations reading as hallway, 0..1', stations: 'count of sampled stations along the route' }
  };
}

export const exportCourse = ['fn.tk.export.course', {
  inParts: ['tk.s7.holes', 'tk.s7.hallway', 'px.badges', 'tk.source.cropReceipt', 'tk.source.sha256', 'tk.source.path', 'tk.export.producer'],
  outParts: [EXPORT_COURSE_PART], calls: ['fn.q.trace.routeMatch'],
  note: 'the toolkit/app boundary: S7 routeMatch holes + S1 badges + unclaimed baskets as chainspot.course-geometry v1 (original-upload frame)',
  calculate: (io) => {
    const path = io.in('tk.source.path');
    const doc = courseGeometryOf({ solve: io.call('fn.q.trace.routeMatch', {}).value, holesPart: io.in('tk.s7.holes'), hallway: io.in('tk.s7.hallway'), badges: io.in('px.badges'),
      crop: io.in('tk.source.cropReceipt'), source: { fileName: String(path).split('/').pop(), sha256: io.in('tk.source.sha256') }, producer: io.in('tk.export.producer') });
    const n = (s) => doc.evidence.filter((e) => e.status === s).length;
    return { [EXPORT_COURSE_PART]: { ...doc, emits: { holesCount: doc.holes.length, resolvedHolesCount: n('resolved'), straightHolesCount: n('straight'), partialHolesCount: n('partial'), unresolvedHolesCount: n('unresolved'),
      numberBadgesCount: doc.numberBadges.length, candidatesCount: doc.candidates.length, corridorWidthPx: doc.holes[0]?.corridorWidthPx ?? null } } };
  }
}];
