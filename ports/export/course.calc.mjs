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
/** The distinct routes per hole: the primary first (its rule sets listed too), then the others; identical routes merged. */
function alternativesOf(hole, number, primaryVerts, primary, alternatives, toSource) {
  const key = (vs) => vs.map(([x, y]) => `${Math.round(x * 2) / 2},${Math.round(y * 2) / 2}`).join(';');
  const out = new Map(), add = (variant, vs, asg) => {
    if (!vs?.length) return;
    const k = key(vs);
    if (!out.has(k)) out.set(k, { verts: vs.map((p) => { const q = toSource(p); return [q.xPx, q.yPx]; }), ruleSets: [], sensor: asg ? { passFrac: r3(asg.sensor), stations: asg.stations ?? null } : null, bends: vs.length - 2 });
    out.get(k).ruleSets.push(variant);
  };
  add(primary, primaryVerts, null);
  for (const a of alternatives) {
    const r = a.solve?.holes?.[hole] ?? a.solve?.holes?.[number] ?? null;
    add(a.variant, r?.verts, (a.solve?.assignment ?? []).find((x) => String(x.hole) === String(hole)) ?? null);
  }
  const all = [...out.values()];
  // the primary is holes[i]: agree lists every rule set that drew exactly it; alternatives are the routes that differ
  return { agree: all[0]?.ruleSets ?? [], alternatives: all.slice(1) };
}

export function courseGeometryOf({ solve, primary = 'routeMatch', alternatives = [], holesPart, hallway, badges, crop, source, producer, capture = null, r1Px = null }) {
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
      trace: { outcome: verts.length ? 'basket' : 'none', lengthPx: verts.length ? r2(lengthOf(verts)) : null,
        lengthFt: verts.length && r1Px > 0 ? Math.round(lengthOf(verts) * 10 / r1Px / 0.3048) : null, bendCount: bends.length }, reasons,
      // every distinct route the profile's other rule sets produced for this hole (rounded to 0.5 px), with who produced it
      ...(() => { const r = alternativesOf(h.hole, number, verts, primary, alternatives, toSource); return { routeAgreement: r.agree, alternatives: r.alternatives }; })() });
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
    source: { fileName: source.fileName, sha256: source.sha256, widthPx: W, heightPx: H, frame: 'original-upload', s0Crop: { rowsRemovedTop: dy, rowsRemovedBottom: crop.lowerRowsRemoved }, ...(capture ? { capture } : {}) },
    holes, numberBadges, candidates, evidence, conditions,
    // the ground scale, from the screenshot itself: the C1 putting circle is 10 m in radius, so 10 m = rC1 px (Sam, 2026-10-20)
    ...(r1Px > 0 ? { scale: { rC1Px: r2(r1Px), metresPerPx: Math.round((10 / r1Px) * 1e6) / 1e6, feetPerPx: Math.round((10 / r1Px / 0.3048) * 1e6) / 1e6,
      rule: 'the C1 circle around every basket is 10 m in radius; rC1Px is its radius measured on this image (LOCAL)' } } : {}),
    units: { 'xPx/yPx': 'px in source.frame (the original upload, S0 crop added back)', corridorWidthPx: 'px in source.frame; the course hallway W (LOCAL, learned on this screenshot)', lengthPx: 'px in source.frame', lengthFt: 'ft along the route, from the C1 ground scale (10 m = rC1 px)', sensor: 'fraction of stations reading as hallway, 0..1', stations: 'count of sampled stations along the route' }
  };
}

/**
 * A capture's provenance for the export (null for a one-tile upload): the original upload of a capture is the course raster S0
 * stitched; each tile's transform maps ITS source px into that frame (ChainSpot's SourceTransform convention), so a point maps
 * back to its tile by the inverse (fn.q.stitch.sourcePoint: every covering tile, the one the overlap rule painted first).
 */
export function captureProvenanceOf(record) {
  if (!record) return null;
  return { schema: record.schema, overlapRule: record.overlapRule, convention: record.convention, coverage: record.coverage.text,
    tiles: record.tiles.map((t) => ({ fileName: t.name, sha256: t.sha256, widthPx: t.widthPx, heightPx: t.heightPx, crop: t.crop, placed: t.placed,
      ...(t.placed ? { transform: t.transform, coveragePolygon: t.coveragePolygon } : {}) })) };
}

export const exportCourse = ['fn.tk.export.course', {
  inParts: ['tk.s7.holes', 'tk.s7.hallway', 'tk.s7.sceneS4', 'px.badges', 'tk.source.cropReceipt', 'tk.source.sha256', 'tk.source.path', 'tk.source.captureProvenance', 'tk.export.producer', 'tk.export.ruleSet'],
  outParts: [EXPORT_COURSE_PART], calls: ['fn.q.trace.routeMatch'],
  note: 'the toolkit/app boundary: S7 routeMatch holes + S1 badges + unclaimed baskets as chainspot.course-geometry v1 (original-upload frame)',
  calculate: (io) => {
    const path = io.in('tk.source.path');
    const ruleSet = io.in('tk.export.ruleSet');   // the S7 rule set the pointer vote accepted (ports/export/run.mjs)
    const solveOf = (rules) => io.call('fn.q.trace.routeMatch', rules && Object.keys(rules).length ? { rules } : {}).value;
    const alternatives = (ruleSet?.wide ?? []).map((w) => ({ variant: w.variant, solve: solveOf(w.rules) }));
    const doc = courseGeometryOf({ solve: solveOf(ruleSet?.rules), primary: ruleSet?.variant ?? 'routeMatch', alternatives, holesPart: io.in('tk.s7.holes'), hallway: io.in('tk.s7.hallway'), badges: io.in('px.badges'),
      r1Px: io.in('tk.s7.sceneS4').R1, crop: io.in('tk.source.cropReceipt'), source: { fileName: String(path).split('/').pop(), sha256: io.in('tk.source.sha256') }, producer: io.in('tk.export.producer'), capture: io.in('tk.source.captureProvenance') });
    const n = (s) => doc.evidence.filter((e) => e.status === s).length;
    return { [EXPORT_COURSE_PART]: { ...doc, emits: { holesCount: doc.holes.length, resolvedHolesCount: n('resolved'), straightHolesCount: n('straight'), partialHolesCount: n('partial'), unresolvedHolesCount: n('unresolved'),
      numberBadgesCount: doc.numberBadges.length, candidatesCount: doc.candidates.length, corridorWidthPx: doc.holes[0]?.corridorWidthPx ?? null } } };
  }
}];
