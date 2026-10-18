/**
 * The fn.Hole.trace comparator (browser-safe): joins the branches' traces by geometric identity (contracts/s7.trace@1:
 * same badge, polylines within a 4 px ribbon of each other, ends within 4 px), names every disagreement, tabulates each
 * branch's judge, and emits legible frames:
 *   1. a ledger page: per branch reached / agreeing holes, bends hit / missed / extra, its overview raster
 *   2. one page per hole: a crop with every branch's polyline (its colour), Sam's corridor (dashed yellow) and bends
 *      (red crosses), the badge (white cross), with the legend and the per-branch numbers
 */
import { geometricJoin } from '../../fg/identity.mjs';
import { encodePngRgb, base64 } from '../../fg/png.mjs';
import { HOLE_TRACE_SLOT, ACCEPTANCE, STATUS } from './traceSpace.mjs';

export const BRANCH_COLORS = Object.freeze({ s3first: [0, 230, 0], s3firstS4: [0, 200, 255], badgeOnly: [255, 140, 0], endpoints: [255, 0, 255], pinned: [160, 160, 255] });
export const STATUS_COLORS = Object.freeze({ agrees: [40, 220, 60], reachedDisagrees: [255, 150, 0], notReached: [255, 40, 40], unjudged: [80, 200, 255] });
export const SAM_COLOR = [255, 225, 25], SAM_BEND = [255, 0, 0], WHITE = [255, 255, 255];
export const LEGEND = "per-hole crops: one polyline per implementation (green s3first, cyan s3firstS4, orange badgeOnly, magenta endpoints, lilac pinned), small squares = its vertices (tee cap, bends, end); dashed yellow = Sam's corridor tee -> bends -> basket; red cross = Sam's bend; white cross = the hole's S1 badge centre. Overviews: polylines coloured by the judge (green agrees with Sam: ends at his basket and stays within W / 2 of his corridor; orange reaches a basket but disagrees; red reaches none; blue no testimony)";

/** Draw marks over a crop of the raster: region { x0, y0, w, h } at scale (any > 0), nearest sampling. */
export function drawCrop({ rgba, widthPx: IW, heightPx: IH }, { x0, y0, w, h, scale }, marks, { deflate } = {}) {
  const CW = Math.max(1, Math.round(w * scale)), CH = Math.max(1, Math.round(h * scale)), rgb = new Uint8Array(CW * CH * 3).fill(64);
  for (let Y = 0; Y < CH; Y++) for (let X = 0; X < CW; X++) {
    const sx = Math.floor(x0 + (X + 0.5) / scale), sy = Math.floor(y0 + (Y + 0.5) / scale);
    if (sx < 0 || sy < 0 || sx >= IW || sy >= IH) continue;
    const k = (sy * IW + sx) * 4, d = (Y * CW + X) * 3; rgb[d] = rgba[k]; rgb[d + 1] = rgba[k + 1]; rgb[d + 2] = rgba[k + 2];
  }
  const P = ([x, y]) => [(x - x0 + 0.5) * scale, (y - y0 + 0.5) * scale];
  const put = (X, Y, c) => { X = Math.round(X); Y = Math.round(Y); if (X < 0 || Y < 0 || X >= CW || Y >= CH) return; const d = (Y * CW + X) * 3; rgb[d] = c[0]; rgb[d + 1] = c[1]; rgb[d + 2] = c[2]; };
  const dot = (X, Y, c, r) => { for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= r * r + 0.5) put(X + dx, Y + dy, c); };
  const seg = (a, b, c, width, dash) => {
    const [ax, ay] = P(a), [bx, by] = P(b), n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay)));
    for (let t = 0; t <= n; t++) { if (dash && Math.floor(t / dash) % 2) continue; dot(ax + (bx - ax) * t / n, ay + (by - ay) * t / n, c, width); }
  };
  for (const m of marks) {
    if (m.kind === 'line') for (let i = 1; i < m.pts.length; i++) seg(m.pts[i - 1], m.pts[i], m.color, m.width ?? 1, m.dash ?? 0);
    else if (m.kind === 'cross') { const [X, Y] = P(m.p), a = m.arm ?? 6; for (let d = -a; d <= a; d++) { dot(X + d, Y, m.color, 1); dot(X, Y + d, m.color, 1); } }
    else if (m.kind === 'square') { const [X, Y] = P(m.p), a = m.arm ?? 3; for (let d = -a; d <= a; d++) { put(X + d, Y - a, m.color); put(X + d, Y + a, m.color); put(X - a, Y + d, m.color); put(X + a, Y + d, m.color); } }
  }
  return { origin: [x0, y0], width: CW, height: CH, scale, png: base64(encodePngRgb({ width: CW, height: CH, rgb, ...(deflate ? { deflate } : {}) })) };
}

/** Marks for one judged hole: the polyline coloured by its verdict, its vertices, Sam's bends. */
export function judgedMarks(trace, row, sam, { width = 2 } = {}) {
  const color = !row?.judged ? STATUS_COLORS.unjudged : row.ok ? STATUS_COLORS.agrees : trace?.status === STATUS.reached ? STATUS_COLORS.reachedDisagrees : STATUS_COLORS.notReached;
  const out = [];
  if (sam) out.push({ kind: 'line', pts: [sam.tee, ...(sam.bends ?? []), sam.basket], color: SAM_COLOR, width: 0, dash: 5 });
  if (trace?.path?.length > 1) out.push({ kind: 'line', pts: trace.path, color, width });
  for (const p of trace?.path ?? []) out.push({ kind: 'square', p, color, arm: 3 });
  for (const b of sam?.bends ?? []) out.push({ kind: 'cross', p: b, color: SAM_BEND, arm: 7 });
  return out;
}

export function compareTraces({ contract, parentStore, raster, deflate }) {
  return ({ branches, frame }) => {
    const names = Object.keys(branches).sort();
    const view = {};
    for (const n of names) {
      const b = branches[n], value = b.store?.has?.(HOLE_TRACE_SLOT.part) ? b.store.get(HOLE_TRACE_SLOT.part) : null;
      const judge = b.records?.[HOLE_TRACE_SLOT.testimony];
      view[n] = { error: b.error, value, traces: value?.traces ?? [], judge: judge?.status === 'held' ? judge : null };
    }
    const tp = parentStore.get('testimony.source.holePaths'), holesPart = parentStore.get('tk.s7.holes'), W = parentStore.get('tk.s7.hallway').widthPx;
    const samOf = (hole) => (tp.holes ?? []).find((h) => String(h.hole) === String(hole)) ?? null;
    const traced = (n) => view[n].traces.filter((t) => t.path.length >= 2).map((t) => ({ ...t, badgeLabel: t.hole }));
    const join = geometricJoin({ sets: Object.fromEntries(names.map((n) => [n, traced(n)])), contract });
    const perBranch = Object.fromEntries(names.map((n) => {
      const t = view[n].judge?.totals ?? null, tr = view[n].traces;
      return [n, { error: view[n].error?.message ?? null, rule: view[n].value?.rule ?? null, traces: tr.length, reached: tr.filter((x) => x.status === STATUS.reached).length,
        statuses: Object.fromEntries(Object.values(STATUS).map((s) => [s, tr.filter((x) => x.status === s).length])),
        judged: t?.judged ?? null, agree: t?.agree ?? null, reachedBasket: t?.reachedBasket ?? null, bendsSam: t?.bendsSam ?? null, bendsHit: t?.bendsHit ?? null, bendsMissed: t?.bendsMissed ?? null, extraBends: t?.extraBends ?? null,
        notAgreeing: t?.notAgreeing ?? [], rows: view[n].judge?.rows ?? [] }];
    }));
    // disagreements, named: per hole, the branches whose traces are not the same trace (contracts/s7.trace@1)
    const disagreements = [];
    for (const h of holesPart.holes) {
      const groups = join.identities.filter((id) => names.some((n) => id.members[n] !== null && traced(n)[id.members[n]].hole === h.hole))
        .map((id) => names.filter((n) => id.members[n] !== null && traced(n)[id.members[n]].hole === h.hole));
      const untraced = names.filter((n) => !traced(n).some((t) => t.hole === h.hole));
      if (groups.length > 1 || (groups.length && untraced.length)) disagreements.push({ hole: h.hole, sameTrace: groups.map((g) => g.join(' = ')), noPath: untraced });
    }
    // overview rasters: every branch's traces over the map, coloured by the judge
    const scale = Math.min(1, 640 / Math.max(raster.widthPx, raster.heightPx));
    const overview = (n) => drawCrop(raster, { x0: 0, y0: 0, w: raster.widthPx, h: raster.heightPx, scale },
      holesPart.holes.flatMap((h) => judgedMarks(view[n].traces.find((t) => t.hole === h.hole), perBranch[n].rows.find((r) => r.hole === h.hole), samOf(h.hole), { width: 1 })), { deflate });
    frame({
      title: `${HOLE_TRACE_SLOT.slot}: ${names.map((n) => `${n} ${perBranch[n].agree ?? '?'}/${perBranch[n].judged ?? '?'} agree, ${perBranch[n].reached} reach, bends ${perBranch[n].bendsHit ?? '?'}/${perBranch[n].bendsMissed ?? '?'}/${perBranch[n].extraBends ?? '?'}`).join('; ')}`,
      calculation: HOLE_TRACE_SLOT.slot,
      parts: [
        { address: `cmp.${HOLE_TRACE_SLOT.slot}.table`, kind: 'ledger', data: { rows: names.map((n) => ({ branch: n, traces: perBranch[n].traces, reached: perBranch[n].reached, judged: perBranch[n].judged, agree: perBranch[n].agree,
          bendsSam: perBranch[n].bendsSam, bendsHit: perBranch[n].bendsHit, bendsMissed: perBranch[n].bendsMissed, extraBends: perBranch[n].extraBends, notAgreeing: perBranch[n].notAgreeing.join(' '), error: perBranch[n].error })) } },
        { address: `cmp.${HOLE_TRACE_SLOT.slot}.disagreements`, kind: 'ledger', data: { rows: disagreements.map((d) => ({ hole: d.hole, sameTrace: d.sameTrace.join(' | '), noPath: d.noPath.join(' ') })) } },
        ...names.map((n) => ({ address: `cmp.${HOLE_TRACE_SLOT.slot}.overview.${n}`, kind: 'raster', data: overview(n) }))
      ],
      verdicts: names.map((n) => ({ name: `${n}: ${perBranch[n].agree ?? '?'} of ${perBranch[n].judged ?? '?'} judged holes agree with Sam`, ok: perBranch[n].judged != null && perBranch[n].agree === perBranch[n].judged })),
      receipt: { contract: join.contract, acceptance: ACCEPTANCE, legend: LEGEND, widthPx: W }
    });
    const pages = [];
    for (const h of holesPart.holes) {
      const sam = samOf(h.hole), pts = [...(sam ? [sam.tee, sam.basket, ...(sam.bends ?? [])] : []), ...names.flatMap((n) => view[n].traces.find((t) => t.hole === h.hole)?.path ?? [])];
      if (!pts.length) continue;
      const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]), m = W;
      const x0 = Math.floor(Math.min(...xs) - m), y0 = Math.floor(Math.min(...ys) - m), w = Math.ceil(Math.max(...xs) + m) - x0, hgt = Math.ceil(Math.max(...ys) + m) - y0;
      const scale = Math.min(2, 420 / Math.max(w, hgt));
      const marks = [];
      if (sam) marks.push({ kind: 'line', pts: [sam.tee, ...(sam.bends ?? []), sam.basket], color: SAM_COLOR, width: 0, dash: 5 });
      for (const n of names) { const t = view[n].traces.find((x) => x.hole === h.hole); if (t?.path?.length > 1) { marks.push({ kind: 'line', pts: t.path, color: BRANCH_COLORS[n] ?? WHITE, width: 1 }); for (const p of t.path) marks.push({ kind: 'square', p, color: BRANCH_COLORS[n] ?? WHITE, arm: 3 }); } }
      for (const b of sam?.bends ?? []) marks.push({ kind: 'cross', p: b, color: SAM_BEND, arm: 8 });
      const crop = drawCrop(raster, { x0, y0, w, h: hgt, scale }, marks, { deflate });
      const rows = names.map((n) => {
        const t = view[n].traces.find((x) => x.hole === h.hole), r = perBranch[n].rows.find((x) => x.hole === h.hole);
        return { branch: n, status: t?.status ?? '-', agrees: r?.judged ? r.ok : null, why: r?.why ?? null, endBasket: t?.end?.basket ?? null, endErrPx: r?.endErrPx ?? null, maxOffCentrelinePx: r?.maxOffCentrelinePx ?? null,
          bends: t?.bends.length ?? null, bendsHit: r?.bendsHit ?? null, bendsMissed: r?.bendsMissed ?? null, extraBends: r?.extraBends ?? null, bendOffPx: (r?.bendOffPx ?? []).join(', '), how: t?.how ?? null, condition: t?.condition ?? null };
      });
      pages.push({ hole: h.hole, rows });
      const d = disagreements.find((x) => x.hole === h.hole);
      frame({
        title: `hole ${h.hole}: ${rows.map((r) => `${r.branch} ${r.status}${r.agrees === true ? ' agrees' : r.agrees === false ? ' disagrees' : ''}`).join(' | ')}${d ? `; different traces: ${d.sameTrace.join(' vs ')}` : ''}`,
        calculation: HOLE_TRACE_SLOT.slot,
        parts: [{ address: `cmp.${HOLE_TRACE_SLOT.slot}.crop.hole${h.hole}`, kind: 'raster', data: crop }, { address: `cmp.${HOLE_TRACE_SLOT.slot}.hole${h.hole}`, kind: 'ledger', data: { rows } }],
        verdicts: rows.map((r) => ({ name: `${r.branch}: ${r.status}${r.why ? ` (${r.why})` : ''}`, ok: r.agrees === true })),
        receipt: { legend: LEGEND, origin: crop.origin, scale: crop.scale, samCorridor: sam ? [sam.tee, ...(sam.bends ?? []), sam.basket] : null, widthPx: W }
      });
    }
    return { slot: HOLE_TRACE_SLOT.slot, contract: join.contract, acceptance: ACCEPTANCE, widthPx: W, branches: perBranch, disagreements,
      matched: join.matched, only: join.only, partial: join.partial, collisions: join.collisions, ambiguous: join.ambiguous, holes: pages };
  };
}
