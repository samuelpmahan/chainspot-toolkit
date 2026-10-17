/**
 * ATTENTION projection: Δ stream -> attention packet for a vision agent
 * (fg/attention layer, browser-safe; takes (model, stream) like every
 * fg/delta projection and never branches on which model it reads).
 *
 *   analyze(model, stream, opts) -> { fold, steps, regions }
 *     fold     fg/delta fold with scenes (for rendering)
 *     steps    per step: changedPx, region count, nonGeometric changes
 *     regions  ranked; each { id, rank, k, step, tick, stage, lane, calcs,
 *              window, bbox, changedPx, subject, what, claims, question,
 *              claimsAbout, reasons, score, testimony, page }
 *   opts: { laneStatus: { lane: { status, oracle } }, testimony: { points },
 *           pad, maxSide, minSide, perStep (pages per step), maxPages }
 *   overlaysFor(region, fold, frame) -> { before, after, delta } drawCrop overlays
 *   toPacket(analysis, extra)        -> the JSON-safe attention.json body
 *   framesFor(packet, images)        -> fg/flipbook Frames, one page per region
 *
 * A region's id is k<step>@x,y,w,h of its crop window: it depends only on
 * the Δ, so answers recorded against one packet join any re-ranked packet.
 */
import { fold } from '../delta/project.mjs';
import { splitKey } from '../delta/kinds.mjs';
import { regionsForStep, bboxOf, overlaps, cropBox } from './regions.mjs';
import { describeRegion } from './describe.mjs';
import { reasonsOf, scoreOf, testimonyCheck, rankRegions, WEIGHTS } from './rank.mjs';
import { COLORS } from './render.mjs';

export const LEGEND = 'panels: context (1x, 3x the window, window in yellow) | raw | before (base Part claims: blue own, gray mute, cyan cand, magenta elim; blue boxes = objects) | after (same, the written Part) | Δ (green +own, teal +mute, red released / removed, orange re-owned across roles or owners, yellow split into sub-parts, cyan/magenta evidence; boxes: green added, red eliminated/removed, magenta dashed elimination record, white dashed = before, cyan = re-fit, yellow = changed). 3x nearest-neighbour; canonical frame. | focus (when present): the highest-weight small change class zoomed 4-12x with the Δ outlines. | exemplar: the first object the final scene still calls this subject (for comparison).';

export function analyze(model, stream, { laneStatus = {}, testimony = null, pad = 8, maxSide = 96, minSide = 40, perStep = 6, maxPages = 40 } = {}) {
  const f = fold(model, stream, { keepScenes: true });
  f._pxMaps = {};
  const steps = [], regions = [];
  for (const s of f.steps) {
    const meta = { k: s.k, step: s.step, tick: s.tick, stage: s.stage, lane: s.lane, calcs: s.by, verdicts: s.verdicts, violations: s.violations, laneStatus: s.lane ? laneStatus[s.lane] ?? null : null };
    const g = regionsForStep(s, stream.frame, { pad, maxSide, minSide });
    f._pxMaps[s.k] = g.pxMap;
    const mine = g.regions.map((reg) => {
      const d = describeRegion(reg, meta);
      const t = testimonyCheck(d.claimsAbout, reg.window, testimony);
      const reasons = reasonsOf(reg, meta, { testimonyRows: t?.rows });
      return {
        id: `k${s.k}@${reg.window.join(',')}`, k: s.k, step: s.step, tick: s.tick, stage: s.stage, lane: s.lane, calcs: s.by,
        window: reg.window, bbox: reg.bbox, changedPx: reg.changedPx, subject: d.subject, what: d.what, claims: d.claims, question: d.question,
        claimsAbout: d.claimsAbout, reasons, score: scoreOf(reasons, reg.changedPx), testimony: t, _region: reg
      };
    });
    regions.push(...mine);
    steps.push({ k: s.k, step: s.step, lane: s.lane, calcs: s.by, changedPx: g.changedPx, regions: mine.length, offFrame: g.offFrame, nonGeometric: g.nonGeometric });
  }
  const ranked = linkRepeats(rankRegions(regions));
  // pages: in rank order, at most perStep per step and maxPages in all; repeats ride on their primary
  const perStepUsed = {};
  let pages = 0;
  ranked.forEach((r, i) => {
    r.rank = i + 1;
    r.page = !r.repeatOf && (perStepUsed[r.k] ?? 0) < perStep && pages < maxPages;
    if (r.page) { perStepUsed[r.k] = (perStepUsed[r.k] ?? 0) + 1; pages++; }
  });
  for (const st of steps) {
    const mine = ranked.filter((r) => r.k === st.k);
    Object.assign(st, { pages: mine.filter((r) => r.page).length, repeats: mine.filter((r) => r.repeatOf).length, deferred: mine.filter((r) => !r.page && !r.repeatOf).length });
  }
  // what attention cannot show: testimony points no region's window touches (a miss is "no change")
  const inside = (p, [x, y, w, h]) => p.x >= x && p.x < x + w && p.y >= y && p.y < y + h;
  const blindSpots = testimony?.points ? testimony.points.filter((p) => !ranked.some((r) => inside(p, r.window))).map((p) => ({ ...p, x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 })) : null;
  const claimedTee = (p) => ranked.some((r) => r.claimsAbout.some((c) => c.subject === p.kind && c.says === 'is' && Math.hypot(c.center[0] - p.x, c.center[1] - p.y) <= 14));
  const neverClaimed = testimony?.points ? testimony.points.filter((p) => p.kind === 'tee' && !claimedTee(p)).map((p) => p.id) : null;
  return { fold: f, steps, regions: ranked, testimonyBlindSpots: blindSpots, testimonyTeesNeverClaimed: neverClaimed };
}

const iou = (a, b) => {
  const x0 = Math.max(a[0], b[0]), y0 = Math.max(a[1], b[1]), x1 = Math.min(a[0] + a[2], b[0] + b[2]), y1 = Math.min(a[1] + a[3], b[1] + b[3]);
  const i = Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
  return i / (a[2] * a[3] + b[2] * b[3] - i);
};
const objIds = (r) => new Set(r._region.objects.map((c) => c.id));
/**
 * The same pixels re-claimed by a later (or earlier) Calculation are one
 * look, not two: a region whose window overlaps a higher-ranked region's
 * (IoU >= 0.5) and names one of its objects is linked to it (repeatOf),
 * gets no page of its own, and its claims ride on the primary's alsoClaimed
 * so the page cross-verifies the whole sequence of Calculations at once.
 */
export function linkRepeats(ranked, { minIou = 0.5 } = {}) {
  const primaries = [];
  for (const r of ranked) {
    const ids = objIds(r);
    const p = primaries.find((q) => iou(q.window, r.window) >= minIou && [...objIds(q)].some((id) => ids.has(id)));
    if (!p) { primaries.push(r); r.alsoClaimed = []; continue; }
    r.repeatOf = p.id;
    r.page = false;
    p.alsoClaimed.push({ id: r.id, step: r.step, calcs: r.calcs, what: r.what, claims: r.claims });
  }
  return ranked;
}

function partClaims(value, window, width) {
  const roles = {};
  for (const [key, runs] of Object.entries(value?.px ?? {})) {
    const role = splitKey(key).role;
    const [wx, wy, ww, wh] = window;
    for (let i = 0; i < runs.length; i += 2) {
      const start = runs[i], len = runs[i + 1];
      if (Math.floor((start + len - 1) / width) < wy || Math.floor(start / width) >= wy + wh) continue;
      for (let p = start; p < start + len; p++) { const x = p % width, py = (p - x) / width; if (x >= wx && x < wx + ww && py >= wy && py < wy + wh) (roles[role] ??= new Set()).add(p); }
    }
  }
  return roles;
}
const ROLE_COLOR = { own: COLORS.own, mute: COLORS.mute, cand: COLORS.cand, elim: COLORS.elim };

function stateOverlays(value, window, width) {
  const out = [];
  const roles = partClaims(value, window, width);
  for (const role of ['mute', 'cand', 'elim', 'own']) if (roles[role]) out.push({ kind: 'px', px: roles[role], color: ROLE_COLOR[role], alpha: role === 'own' ? 0.35 : 0.3 });
  for (const facet of ['objects', 'elim']) for (const obj of Object.values(value?.[facet] ?? {})) {
    const bb = bboxOf(obj);
    if (bb && overlaps(bb, window)) out.push({ kind: 'box', bbox: bb, color: facet === 'elim' ? COLORS.objElim : COLORS.objBefore, dash: facet === 'elim' });
  }
  return out;
}

const CLS_COLOR = (cls) => (cls === '+own' ? COLORS.added : cls === '+mute' ? [0, 170, 140] : cls === '+elim' ? COLORS.elimAdded : cls.startsWith('+') ? COLORS.evidence
  : cls.startsWith('-') ? COLORS.removed : cls === 'split' ? COLORS.split : COLORS.reown);
const OP_STYLE = {
  added: [COLORS.objAdded, false], verdict: [COLORS.objChanged, false], relabel: [COLORS.objChanged, false], renamed: [COLORS.objAdded, false], edited: [COLORS.objChanged, false],
  moved: [COLORS.objChanged, false], refit: [COLORS.objRefit, false], removed: [COLORS.objRemoved, false], eliminated: [COLORS.objRemoved, false],
  elimRecorded: [COLORS.objElim, true], elimRetested: [COLORS.objElim, true], elimDropped: [COLORS.objPrev, true], row: [COLORS.objChanged, true]
};

export function overlaysFor(region, f, frame) {
  const reg = region._region;
  const st = f.steps[region.k];
  const addresses = [...new Set([...reg.objects.map((c) => c.address), ...Object.keys(reg.pxByAddress)])];
  const before = [], after = [];
  for (const A of addresses) {
    const v = st.view.find((x) => x.address === A);
    const B = v?.base ?? A;
    before.push(...stateOverlays(st.before.parts[B]?.value, region.window, frame.width));
    after.push(...stateOverlays(st.after.parts[A]?.value, region.window, frame.width));
  }
  const delta = [];
  const byCls = new Map();
  for (const p of reg.px) for (const c of f._pxMaps?.[region.k]?.get(p) ?? []) { if (!byCls.has(c.cls)) byCls.set(c.cls, new Set()); byCls.get(c.cls).add(p); }
  const order = ['split', '+mute', '+cand', '+elim', '-mute', '-cand', '-elim', '+own', '-own'];
  const classes = [...byCls.keys()].sort((a, b) => (order.indexOf(a) === -1 ? 50 : order.indexOf(a)) - (order.indexOf(b) === -1 ? 50 : order.indexOf(b)));
  // a refinement (split into sub-parts) is context when anything else changed here: faint, no outline
  const quiet = (cls) => cls === 'split' && classes.length > 1;
  for (const cls of classes) delta.push({ kind: 'px', px: byCls.get(cls), color: CLS_COLOR(cls), alpha: quiet(cls) ? 0.12 : 0.5, edge: !quiet(cls) });
  for (const c of reg.objects) {
    const [color, dash] = OP_STYLE[c.op] ?? [COLORS.objChanged, true];
    if (c.prevBbox) delta.push({ kind: 'box', bbox: c.prevBbox, color: COLORS.objPrev, dash: true });
    const bb = c.prevBbox ? bboxOf(c.obj) : c.bbox;
    if (bb) delta.push({ kind: 'box', bbox: bb, color, dash });
  }
  return { before, after, delta };
}

const pxWeight = (cls) => WEIGHTS[cls === 'split' ? 'px:split' : cls.endsWith(':reassigned') ? 'px:reassigned' : cls.includes('->') ? 'px:role-reown' : ['-own', '-mute', '+own', '+mute'].includes(cls) ? `px:${cls}` : 'px:evidence'] ?? 1;
/**
 * A zoom on the most informative SMALL change in a region: the px of the
 * highest-weight change class, when they are under a third of the region's
 * changed px (19 counter px inside a 2000 px badge vanish at 3x). Returns
 * { cls, px, window, scale } or null; scale makes the window ~240 px wide.
 */
export function focusOf(region, f, frame) {
  const reg = region._region;
  const byCls = new Map();
  for (const p of reg.px) for (const c of f._pxMaps?.[region.k]?.get(p) ?? []) { if (!byCls.has(c.cls)) byCls.set(c.cls, []); byCls.get(c.cls).push(p); }
  if (byCls.size < 2) return null;
  const [cls, px] = [...byCls.entries()].sort((a, b) => pxWeight(b[0]) - pxWeight(a[0]) || a[1].length - b[1].length)[0];
  if (px.length * 3 >= reg.changedPx) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of px) { const x = p % frame.width, y = (p - x) / frame.width; x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const window = cropBox([x0, y0, x1 - x0 + 1, y1 - y0 + 1], { pad: 3, minSide: 14, ...frame });
  return { cls, px: px.length, window, scale: Math.max(4, Math.min(12, Math.floor(240 / Math.max(window[2], window[3])))) };
}

/** A wider look around a window (factor x its size, same center, clipped): rendered at 1x with the window outlined. */
export function contextWindow([x, y, w, h], frame, factor = 3) {
  const W = Math.min(frame.width, Math.max(w * factor, 120)), H = Math.min(frame.height, Math.max(h * factor, 120));
  const cx = x + w / 2, cy = y + h / 2;
  const x0 = Math.max(0, Math.min(frame.width - W, Math.round(cx - W / 2))), y0 = Math.max(0, Math.min(frame.height - H, Math.round(cy - H / 2)));
  return [x0, y0, W, H];
}

/**
 * A reference crop for the subject: one object the FINAL scene still holds
 * as that subject (the first by id of the admitted tees, badges, baskets),
 * so "is this a tee pad?" is asked next to what the receipt itself calls a
 * tee pad. Returns { address, id, window } or null.
 */
const EXEMPLAR_PARTS = { tee: ['px.tees.refined', 'px.tees'], 'tee-ring': ['px.tees.refined', 'px.tees'], badge: ['px.badges'], 'digit-counter': ['px.badges'], basket: ['px.baskets'] };
export function exemplarFor(subject, scene, frame, { pad = 8, minSide = 40 } = {}) {
  const first = String(subject).split('+')[0];
  for (const address of EXEMPLAR_PARTS[first] ?? []) {
    const objs = scene.parts[address]?.value.objects ?? {};
    const id = Object.keys(objs).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))[0];
    const bb = id ? bboxOf(objs[id]) : null;
    if (bb) return { address, id, window: cropBox(bb, { pad, minSide, ...frame }) };
  }
  return null;
}

const strip = (r) => { const { _region, ...rest } = r; return rest; };
export function toPacket(analysis, extra = {}) {
  const totalChangedPx = analysis.steps.reduce((s, x) => s + x.changedPx, 0);
  return {
    kind: 'fg.attention@1', ...extra, legend: LEGEND,
    stats: {
      steps: analysis.steps.length, stepsWithRegions: analysis.steps.filter((s) => s.regions).length, totalChangedPx, regions: analysis.regions.length,
      pages: analysis.regions.filter((r) => r.page).length, repeats: analysis.regions.filter((r) => r.repeatOf).length,
      deferred: analysis.regions.filter((r) => !r.page && !r.repeatOf).length,
      nonGeometricChanges: analysis.steps.reduce((s, x) => s + x.nonGeometric.length, 0)
    },
    ...(analysis.testimonyBlindSpots ? { testimonyBlindSpots: analysis.testimonyBlindSpots, testimonyTeesNeverClaimed: analysis.testimonyTeesNeverClaimed } : {}),
    steps: analysis.steps,
    regions: analysis.regions.map(strip)
  };
}

export function framesFor(packet, images = {}) {
  return packet.regions.filter((r) => r.page).map((r, i) => ({
    fg: 'fg.attention', branch: r.lane ?? 'main', seq: i, tick: r.step, calculation: r.calcs.join(', '),
    title: `#${r.rank} · score ${r.score} · ${r.question?.text ?? ''}`,
    parts: [
      ...(images[r.id] ? [{ address: `crop raw | before | after | Δ · window ${r.window.join(',')}`, kind: 'raster', data: images[r.id] }] : []),
      { address: 'QUESTION', kind: 'ledger', data: { rows: [{ question: r.question?.text ?? '' }] } },
      { address: 'what changed', kind: 'ledger', data: { rows: r.what.map((line) => ({ line })) } },
      { address: 'receipt claims', kind: 'ledger', data: { rows: r.claims.map((claim) => ({ claim })) } },
      { address: 'why this region ranks here', kind: 'ledger', data: { rows: r.reasons.map((x) => ({ reason: x.reason, weight: x.weight, detail: x.detail.join('; ') })) } },
      ...(r.alsoClaimed?.length ? [{ address: 'same pixels, other Calculations', kind: 'ledger', data: { rows: r.alsoClaimed.map((a) => ({ step: a.step, by: a.calcs.join(', '), what: a.what.join(' | '), claims: a.claims.join(' | ') })) } }] : []),
      ...(r.testimony?.rows?.length ? [{ address: 'testimony (comparison only)', kind: 'ledger', data: { rows: r.testimony.rows } }] : [])
    ],
    verdicts: [],
    receipt: { regionId: r.id, window: r.window, step: r.step, stage: r.stage, changedPx: r.changedPx, legend: packet.legend }
  }));
}
