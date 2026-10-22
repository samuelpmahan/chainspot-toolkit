/**
 * Render case for tk.s7.cellEvidence (S7 evidence block of fg/render.mjs; browser-safe): one crop per hole the S7 default does not
 * claim straight, every perspective's route in its own colour over the image, the candidate baskets named, the default's pick and the
 * evidence ranking's pick, the meeting points, and a header band with the legend and each cell's readings (support -1 .. 1, '?' =
 * UNKNOWN). The drawing kit is fg/s7route/laneRender.mjs draw (the 5 x 7 font canvas of fg/render.mjs, passed in).
 *   candidate routes   the default's route of each candidate cell: white dashed; the default's pick solid white; the evidence pick,
 *                      when it differs, solid green
 *   forward            four-lane track orange, three-lane track magenta dashed, hallway follower cyan (from the tee cap)
 *   backward           lane exits from each candidate basket light green; the backward follower's exits yellow (basket backwards)
 *   B*                 red disc (tee + 2 x the badge along the tee axis); meetings: white ring with a black casing
 */
import { encodePngRgb, base64 } from '../png.mjs';
import { draw } from './laneRender.mjs';

export const CELL_EVIDENCE_SCHEMA = 'nctk-s7-cell-evidence@1';
export const isCellEvidence = (v) => Boolean(v && typeof v === 'object' && v.schema === CELL_EVIDENCE_SCHEMA);
const COL = Object.freeze({ cand: [235, 235, 235], pick: [255, 255, 255], evidence: [40, 230, 90], four: [255, 140, 0], three: [255, 60, 230], follow: [0, 220, 255],
  laneBack: [150, 255, 150], followBack: [255, 230, 0], bstar: [255, 40, 40], meet: [255, 255, 255], casing: [0, 0, 0], basket: [120, 220, 255], ink: [255, 255, 255] });
const ABBR = Object.freeze({ backbone: 'BB', edge: 'EDGE', region: 'REG', badgeMid: 'B*', laneFwd: 'LANEF', followFwd: 'FOLF', laneBack: 'LANEB', followBack: 'FOLB', meet: 'MEET' });
const f2 = (v) => (v == null ? '?' : String(Math.round(v * 100) / 100));

export function renderCellEvidence(address, v, dims, { canvas, deflate = null }) {
  if (!(dims?.widthPx > 0) || !dims?.rgba) return { kind: 'cellEvidence', parts: [{ address, kind: 'ledger', data: { rows: [{ field: 'condition', value: v.condition ?? 'no image raster (px.image.cropped) to draw over' }] } }] };
  const parts = [], wR = 1.5, names = v.baskets.map((b) => b.name);
  const legend = [
    [null, `S7 EVIDENCE ON THE DEFAULT'S CANDIDATE CELLS (${v.reference}); W = ${f2(v.widthPx)} PX, R1 = ${f2(v.R1Px)} PX; READINGS -1..1, ? = UNKNOWN`],
    [COL.cand, 'CANDIDATE CELL ROUTES (DASHED); DEFAULT PICK SOLID WHITE', true], [COL.evidence, 'EVIDENCE PICK WHEN IT DIFFERS'],
    [COL.four, 'FORWARD FOUR-LANE TRACK'], [COL.three, 'FORWARD THREE-LANE TRACK (DASHED)', true], [COL.follow, 'FORWARD HALLWAY FOLLOWER'],
    [COL.laneBack, 'BASKET BACKWARDS: LANE EXITS'], [COL.followBack, 'BASKET BACKWARDS: FOLLOWER EXITS'], [COL.bstar, 'B* (BADGE MIDPOINT)'], [COL.meet, 'MEETING (RING)'], [COL.basket, 'BASKETPOINTS']
  ];
  for (const r of v.rows) {
    if (!r.cells?.length) continue;
    const ks = r.cells.map((x) => x.k), backs = ks.map((k) => v.backTracks[k]).filter(Boolean);
    const T = r.tracks, pts = [...r.cells.flatMap((x) => x.route), ...(T.follower?.verts ?? [])];
    for (const p of [T.fourLane?.path, T.threeLane?.path]) if (p) pts.push(...p);
    if (!pts.length) continue;
    const m = 2 * v.widthPx, xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    let xa = Math.min(...xs) - m, xb = Math.max(...xs) + m, ya = Math.min(...ys) - m, yb = Math.max(...ys) + m;
    if (xb - xa < 0.75 * (yb - ya)) { const g = (0.75 * (yb - ya) - (xb - xa)) / 2; xa -= g; xb += g; }
    if (yb - ya < 0.75 * (xb - xa)) { const g = (0.75 * (xb - xa) - (yb - ya)) / 2; ya -= g; yb += g; }
    const x0 = Math.max(0, Math.floor(xa)), y0 = Math.max(0, Math.floor(ya)), x1 = Math.min(dims.widthPx, Math.ceil(xb)), y1 = Math.min(dims.heightPx, Math.ceil(yb));
    const w = x1 - x0, h = y1 - y0, s = Math.max(1, Math.min(4, 1100 / Math.max(w, h)));
    const pickD = r.defaultBasket, pickE = r.evidenceBasket;
    const head = [[null, `HOLE ${r.hole}: DEFAULT PICKS ${pickD == null ? 'NONE' : names[pickD]}; EVIDENCE PICKS ${pickE == null ? 'NONE' : names[pickE]}${pickD !== pickE ? '  (CHANGED)' : ''}`],
      ...r.cells.map((x) => [x.k === pickE && pickE !== pickD ? COL.evidence : COL.cand, `${x.basket}: VALUE ${f2(x.value)} LUM, P ${f2(x.P)}; ${Object.entries(ABBR).map(([f, a]) => `${a} ${f2(x.readings[f])}`).join(' ')}${x.meetAt ? `; MET AT ${x.meetAt.alongFwdR1} R1` : ''}`])];
    const crop = draw(canvas, dims, { x0, y0, w, h, scale: s, bandLines: [...head, ...legend] }, (g) => {
      for (const b of v.baskets) { const [x, y] = g.P(b.point); g.ring(x, y, Math.max(4, v.R1Px * g.S * 0.25), 2, COL.basket); g.label(x + 6, y + 6, b.name.replace('Basket ', ''), COL.basket, 2); }
      for (const bk of backs) { for (const t of bk.lane) if (t.path?.length > 1) g.poly(t.path, wR * 0.8, COL.laneBack, 5); for (const t of bk.follow.tried ?? []) if (t.verts?.length > 1) g.poly(t.verts, wR * 0.8, COL.followBack, 7); }
      for (const x of r.cells) if (x.k !== pickD && x.k !== pickE) { g.poly(x.route, wR + 1, COL.casing, 10); g.poly(x.route, wR * 0.7, COL.cand, 10); }
      const cd = r.cells.find((x) => x.k === pickD), ce = r.cells.find((x) => x.k === pickE);
      if (cd) { g.poly(cd.route, wR + 2.5, COL.casing); g.poly(cd.route, wR + 1, COL.pick); }
      if (ce && pickE !== pickD) { g.poly(ce.route, wR + 2.5, COL.casing); g.poly(ce.route, wR + 1, COL.evidence); }
      // the forward tracks on top, thin: where they ride the route they show as a coloured core in the white
      if (T.threeLane?.path?.length > 1) g.poly(T.threeLane.path, wR * 0.6, COL.three, 8);
      if (T.fourLane?.path?.length > 1) g.poly(T.fourLane.path, wR * 0.6, COL.four);
      if (T.follower?.verts?.length > 1) g.poly(T.follower.verts, wR * 0.5, COL.follow, 4);
      if (r.bStar) { const [x, y] = g.P(r.bStar); g.disk(x, y, 5, COL.casing); g.disk(x, y, 4, COL.bstar); }
      for (const x of r.cells) if (x.meetAt) { const [mx, my] = g.P(x.meetAt.at); g.ring(mx, my, 9, 4, COL.casing); g.ring(mx, my, 9, 2, COL.meet); }
      const at = r.cells[0]?.route?.[0]; if (at) { const [x, y] = g.P(at); g.label(x + 10, y - 26, `${r.hole}${pickD !== pickE ? ' !' : ''}`, pickD !== pickE ? COL.evidence : COL.ink, 3); }
    });
    parts.push({ address: `${address}#hole${r.hole}`, kind: 'raster', data: { width: crop.width, height: crop.height, scale: s, origin: [x0, y0], headerBandPx: crop.bandH, png: base64(encodePngRgb({ width: crop.width, height: crop.height, rgb: crop.rgb, ...(deflate ? { deflate } : {}) })) } });
  }
  const ledger = v.rows.flatMap((r) => (r.claimed !== undefined ? [{ hole: r.hole, basket: r.claimedName, claimed: 'straight' }] : r.cells.map((x) => ({ hole: r.hole, basket: x.basket, value: x.value, P: x.P, ...Object.fromEntries(Object.entries(x.readings).map(([f, y]) => [f, y ?? 'UNKNOWN'])), defaultPick: r.defaultBasket === x.k, evidencePick: r.evidenceBasket === x.k }))));
  parts.push({ address: `${address}#cells`, kind: 'ledger', data: { rows: ledger } }, { address: `${address}#legend`, kind: 'ledger', data: { rows: legend.map(([, t]) => ({ legend: t })) } });
  return { kind: 'cellEvidence', parts };
}
