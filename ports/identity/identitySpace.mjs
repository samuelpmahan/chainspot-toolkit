/**
 * Course identity (ChainSpot Course Memory, graduated): the derived views of the labelled points of one course image.
 *   tk.identity.badgePoints   per S1 badge with a numeral label: { holeNumber, xPx, yPx } (the badge bbox centre), canonical frame
 *   tk.identity.points        the same plus `tees`: the tee of each hole where the S3 association (tk.s7.association) or the
 *                             accepted S4 recovery (tk.s7.recoveredTees) gives one. Baskets are NOT keyed here: S2 and S4
 *                             baskets carry no hole number (the hole -> basket pairing is S7's), so `baskets` stays empty.
 * The math is fn.q.identity.* (fg/queries/identity.mjs). A badge with no label (abstained), or a label that is not a
 * positive integer, is left out and counted; a label read twice keeps the more confident reading.
 */
const centre = (b) => [b.bbox[0] + (b.bbox[2] - 1) / 2, b.bbox[1] + (b.bbox[3] - 1) / 2];

export function badgePointsOf(badges) {
  const best = new Map(), left = [];
  for (const b of badges) {
    const n = /^\d+$/.test(String(b.label ?? '')) ? Number(b.label) : NaN;
    if (!(n >= 1)) { left.push({ label: b.label ?? null, why: 'no numeral label' }); continue; }
    const c = centre(b), prev = best.get(n);
    if (prev && prev.confidence >= (b.confidence ?? 0)) { left.push({ label: String(n), why: 'duplicate label, the more confident reading kept' }); continue; }
    if (prev) left.push({ label: String(n), why: 'duplicate label, the more confident reading kept' });
    best.set(n, { holeNumber: n, xPx: c[0], yPx: c[1], confidence: b.confidence ?? 0 });
  }
  const badges_ = [...best.values()].sort((a, b) => a.holeNumber - b.holeNumber).map(({ holeNumber, xPx, yPx }) => ({ holeNumber, xPx, yPx }));
  return { badges: badges_, baskets: [], tees: [], leftOut: left, unit: 'px (canonical frame of the image the badges were read in)' };
}

export function pointsOf({ badges, association, recovered }) {
  const v = badgePointsOf(badges), tees = [];
  for (const b of v.badges) {
    const a = association?.holes?.[String(b.holeNumber)], r = (recovered?.tees ?? []).find((t) => Number(t.hole) === b.holeNumber);
    if (a?.teeCenter) tees.push({ holeNumber: b.holeNumber, xPx: a.teeCenter[0], yPx: a.teeCenter[1], source: 'S3 association' });
    else if (r?.center) tees.push({ holeNumber: b.holeNumber, xPx: r.center[0], yPx: r.center[1], source: 'S4 recovered' });
  }
  return { ...v, tees };
}

export const IDENTITY_CALCULATIONS = Object.freeze([
  ['fn.tk.identity.badgePoints', { inParts: ['px.badges'], outParts: ['tk.identity.badgePoints'], note: 'S1 badges with a numeral label, as (hole number, centre px)',
    calculate: (io) => ({ 'tk.identity.badgePoints': badgePointsOf(io.in('px.badges')) }) }],
  ['fn.tk.identity.points', { inParts: ['px.badges', 'tk.s7.association', 'tk.s7.recoveredTees'], outParts: ['tk.identity.points'], note: 'badge points plus the tee of each hole (S3 association, else S4 recovered)',
    calculate: (io) => ({ 'tk.identity.points': pointsOf({ badges: io.in('px.badges'), association: io.in('tk.s7.association'), recovered: io.in('tk.s7.recoveredTees') }) }) }]
]);
