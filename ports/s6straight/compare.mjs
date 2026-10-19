/**
 * The fn.Hole.straight comparator (browser-safe): per tee-badge pair, every variant's verdict side by side with Sam's
 * (when there is testimony), the disagreements named, and frames:
 *   1. a ledger page: per variant TP / FP / FN / TN, straight with the wrong basket, unknown, lane not run
 *   2. one course page per variant: the canonical raster at half scale, each pair's segment drawn and coloured by that
 *      variant's verdict (green straight: tee -> its basket; orange bent and grey unknown: tee -> badge), Sam's path
 *      (tee -> each corridorBend -> basket) dashed yellow, with the per-pair ledger beside it
 * Disagreements (live variants that call a pair differently) are named in the first page's verdicts.
 */
import { encodePngRgb, base64 } from '../../fg/png.mjs';
import { HOLE_STRAIGHT_SLOT, ACCEPTANCE, verdictCounts } from './holeStraight.mjs';

export const VERDICT_COLORS = Object.freeze({ straight: [46, 204, 64], bent: [255, 133, 27], unknown: [170, 170, 170], sam: [255, 225, 25], tee: [255, 255, 255] });
export const LEGEND = 'segments by verdict: green straight (tee centre -> the basket it names), orange bent (tee -> badge), grey unknown (tee -> badge); dashed yellow: Sam\'s path from his tee point through each corridorBend to his basket point (straight when he marked no bend); white dot: the pair\'s tee centre';

/** A course raster at 1/step scale with segments drawn (thickness in output px). */
export function drawCourse(raster, { step = 2, segments = [], deflate }) {
  const { rgba, widthPx: W, heightPx: H } = raster, w = Math.ceil(W / step), h = Math.ceil(H / step);
  const rgb = new Uint8Array(w * h * 3);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const s = ((y * step) * W + x * step) * 4, d = (y * w + x) * 3; rgb[d] = rgba[s] * 0.75; rgb[d + 1] = rgba[s + 1] * 0.75; rgb[d + 2] = rgba[s + 2] * 0.75; }
  const put = (X, Y, c) => { X = Math.round(X); Y = Math.round(Y); if (X < 0 || Y < 0 || X >= w || Y >= h) return; const d = (Y * w + X) * 3; rgb[d] = c[0]; rgb[d + 1] = c[1]; rgb[d + 2] = c[2]; };
  const line = (a, b, c, { width = 2, dash = 0 } = {}) => {
    const ax = a[0] / step, ay = a[1] / step, bx = b[0] / step, by = b[1] / step, n = Math.ceil(Math.hypot(bx - ax, by - ay)) || 1;
    for (let t = 0; t <= n; t++) { if (dash && Math.floor(t / dash) % 2) continue; const x = ax + (bx - ax) * t / n, y = ay + (by - ay) * t / n; for (let dy = -width + 1; dy < width; dy++) for (let dx = -width + 1; dx < width; dx++) put(x + dx, y + dy, c); }
  };
  const dot = (p, c, r = 3) => { for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= r * r) put(p[0] / step + dx, p[1] / step + dy, c); };
  for (const s of segments) if (s.kind === 'sam') for (let k = 0; k + 1 < s.points.length; k++) line(s.points[k], s.points[k + 1], VERDICT_COLORS.sam, { width: 1, dash: 5 });
  for (const s of segments) if (s.kind !== 'sam') { line(s.from, s.to, VERDICT_COLORS[s.verdict] ?? VERDICT_COLORS.unknown, { width: 2 }); dot(s.from, VERDICT_COLORS.tee); }
  return { origin: [0, 0], width: w, height: h, scale: 1 / step, png: base64(encodePngRgb({ width: w, height: h, rgb, deflate })) };
}

/** Sam's path of a hole as a polyline: tee, bends, basket (canonical px). */
export const samPath = (h) => [h.tee, ...(h.bends ?? []), h.basket];

/** A verdict row's segment: straight -> its basket; otherwise tee -> badge (the pair). */
export const segmentOf = (r) => ({ kind: 'verdict', verdict: r.verdict, from: r.tee.center, to: r.verdict === 'straight' && r.basket ? r.basket.point : r.badge.center ?? r.tee.center, hole: r.hole });

export function compareStraight({ parentStore, deflate = undefined }) {
  return ({ branches, frame }) => {
    const names = Object.keys(branches).sort();
    const pairs = parentStore.get('tk.s6.holePairs'), T = parentStore.get('testimony.source.holes'), raster = parentStore.get('px.image.cropped');
    const view = Object.fromEntries(names.map((n) => {
      const b = branches[n], value = b.store?.has?.(HOLE_STRAIGHT_SLOT.part) ? b.store.get(HOLE_STRAIGHT_SLOT.part) : null;
      const judge = b.records?.[HOLE_STRAIGHT_SLOT.testimony];
      return [n, { error: b.error?.message ?? null, value, verdicts: value?.verdicts ?? [], laneNotRun: Boolean(value?.laneNotRun), judge: judge?.status === 'held' ? judge : null }];
    }));
    const judged = Boolean(T.path);
    const perBranch = Object.fromEntries(names.map((n) => [n, {
      error: view[n].error, laneNotRun: view[n].laneNotRun, ...verdictCounts(view[n].verdicts),
      ...(view[n].judge?.totals ?? {}), conditions: [...new Set(view[n].verdicts.map((v) => v.condition).filter(Boolean))].slice(0, 4)
    }]));
    const truthOf = new Map(T.holes.map((h) => [String(h.hole), h]));
    const perPair = pairs.map((p, i) => {
      const said = Object.fromEntries(names.map((n) => { const v = view[n].verdicts.find((x) => x.pair === p.id); return [n, v ? { verdict: v.verdict, basket: v.basket?.name ?? null, condition: v.condition ?? null } : null]; }));
      const outcome = Object.fromEntries(names.map((n) => [n, view[n].judge?.rows?.find((r) => r.pair === p.id)?.outcome ?? null]));
      const live = names.filter((n) => said[n] && !view[n].laneNotRun && !view[n].error);
      const calls = new Set(live.map((n) => `${said[n].verdict}${said[n].verdict === 'straight' ? ` ${said[n].basket}` : ''}`));
      const h = truthOf.get(p.hole);
      return { pair: p.id, hole: p.hole, source: p.source, tee: p.tee.name, said, outcome, truth: h ? (h.bent ? `bent (${h.bends?.length ?? '?'} bends)` : 'straight') : null,
        disagree: calls.size > 1 ? live.map((n) => `${n}: ${said[n].verdict}${said[n].basket ? ` -> ${said[n].basket}` : ''}`).join('; ') : null, index: i };
    });
    const disagreements = perPair.filter((r) => r.disagree).map((r) => `Hole ${r.hole} (${r.tee}): ${r.disagree}`);

    frame({
      title: `${HOLE_STRAIGHT_SLOT.slot}: ${names.map((n) => `${n} ${perBranch[n].laneNotRun ? 'lane not run' : judged ? `TP ${perBranch[n].TP ?? '?'} / FP ${perBranch[n].FP ?? '?'} / FN ${perBranch[n].FN ?? '?'} / TN ${perBranch[n].TN ?? '?'}` : `${perBranch[n].straight} straight of ${perBranch[n].pairs}`}`).join('; ')}`,
      calculation: HOLE_STRAIGHT_SLOT.slot,
      parts: [
        { address: `cmp.${HOLE_STRAIGHT_SLOT.slot}.table`, kind: 'ledger', data: { rows: names.map((n) => ({ variant: n, ...Object.fromEntries(Object.entries(perBranch[n]).map(([k, v]) => [k, Array.isArray(v) ? v.join(' | ') : v])) })) } },
        { address: `cmp.${HOLE_STRAIGHT_SLOT.slot}.pairs`, kind: 'ledger', data: { rows: perPair.map((r) => ({ pair: r.pair, hole: r.hole, tee: r.tee, source: r.source, sam: r.truth, ...Object.fromEntries(names.map((n) => [n, r.said[n] ? `${r.said[n].verdict}${r.said[n].basket ? ` -> ${r.said[n].basket}` : ''}${r.outcome[n] ? ` (${r.outcome[n]})` : ''}` : '-'])), disagree: r.disagree })) } }
      ],
      verdicts: [...names.map((n) => ({ name: `${n}: ${perBranch[n].laneNotRun ? 'lane not run (excluded from acceptance)' : judged ? `FP ${perBranch[n].FP}, FN ${perBranch[n].FN} on ${perBranch[n].judgedPairs} judged pairs` : 'no testimony'}`, ok: !perBranch[n].error && (!judged || perBranch[n].laneNotRun || (perBranch[n].FP === 0 && perBranch[n].FN === 0)) })),
        ...disagreements.map((d) => ({ name: `disagree: ${d}`, ok: false }))],
      receipt: { acceptance: ACCEPTANCE, testimonyRule: T.rule, legend: LEGEND }
    });

    const sam = T.holes.map((h) => ({ kind: 'sam', points: samPath(h), hole: String(h.hole) }));
    for (const n of names) {
      if (view[n].error) continue;
      const crop = drawCourse(raster, { segments: [...sam, ...view[n].verdicts.map(segmentOf)], deflate });
      frame({
        title: `${n}: segments by verdict over the course (${perBranch[n].straight} straight, ${perBranch[n].bent} bent, ${perBranch[n].unknown} unknown)${view[n].laneNotRun ? ', lane not run' : ''}`,
        calculation: HOLE_STRAIGHT_SLOT.slot,
        parts: [
          { address: `cmp.${HOLE_STRAIGHT_SLOT.slot}.${n}.course`, kind: 'raster', data: crop },
          { address: `cmp.${HOLE_STRAIGHT_SLOT.slot}.${n}.ends`, kind: 'points', data: { points: view[n].verdicts.map((v) => [...v.tee.center, `${v.hole} ${v.verdict}${v.basket ? ` -> ${v.basket.name}` : ''}`]) } },
          { address: `cmp.${HOLE_STRAIGHT_SLOT.slot}.${n}.ledger`, kind: 'ledger', data: { rows: view[n].verdicts.map((v) => ({ hole: v.hole, tee: v.tee.name, source: v.source, verdict: v.verdict, basket: v.basket?.name ?? null, outcome: view[n].judge?.rows?.find((r) => r.pair === v.pair)?.outcome ?? null, condition: v.condition })) } }
        ],
        verdicts: view[n].verdicts.map((v) => { const o = view[n].judge?.rows?.find((r) => r.pair === v.pair)?.outcome; return { name: `hole ${v.hole}: ${v.verdict}${o ? ` (${o})` : ''}`, ok: o ? o === 'TP' || o === 'TN' : v.verdict !== 'unknown' }; }),
        receipt: { legend: LEGEND, scale: crop.scale, frame: 'canonical px; the raster is the course at half scale, darkened to 75%' }
      });
    }

    return { slot: HOLE_STRAIGHT_SLOT.slot, acceptance: ACCEPTANCE, judged, branches: perBranch, pairs: perPair.map(({ index, ...r }) => r), disagreements };
  };
}
