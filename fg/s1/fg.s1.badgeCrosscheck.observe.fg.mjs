/**
 * fg.s1.badgeCrosscheck.observe (stages/s1.json; Sam, 2026-10-21: "Yes, make readers crosscheck"): the Part
 * px.badges.crosscheck (Calculation fn.Badge.crosscheck, provider g1.badgeCrosscheck) observed on every S1 run.
 * Per badge the per-digit label, the coverage digit reader's check, and the verdict: confirmed (the same label),
 * disagree (another label; both reads and both P recorded, the per-digit label kept), filled (no per-digit label; the
 * coverage digit read with P >= p* used), unread. The B+W digit and whole-number coverage reads are witnesses.
 * Recorded and published, never a gate: px.badges and the S1 labels are unchanged.
 */
import { guarantee, pipe, read, step } from '../compose.mjs';
import { framed, published, unitful } from '../mixins.mjs';

const ID = 'fg.s1.badgeCrosscheck.observe';
const PART = 'px.badges.crosscheck';
const UNITS = { badges: 'count (badges)', confirmed: 'count (badges)', disagree: 'count (badges)', filled: 'count (badges)', unread: 'count (badges)', p: 'fraction (learned confidence)', label: 'hole number' };

const observe = step('observe the crosscheck', (env, s) => {
  const x = s.parts[PART];
  if (!x || !Array.isArray(x.badges)) env.fail('px.badges.crosscheck is missing');
  const flagged = x.badges.filter((b) => b.verdict !== 'confirmed').map((b) => ({ detId: b.detId, verdict: b.verdict, label: b.label, perDigit: b.perDigit.label, perDigitP: b.perDigit.p, coverageDigit: b.coverageDigit.label, coverageDigitP: b.coverageDigit.p, note: b.note }));
  return { totals: x.totals, flagged };
});

const frames = framed((s) => [{
  title: `badge crosscheck: ${s.totals.confirmed} confirmed, ${s.totals.disagree} disagree, ${s.totals.filled} filled, ${s.totals.unread} unread of ${s.totals.badges}`,
  calculation: 'fn.Badge.crosscheck', tick: ID,
  parts: [
    { address: `${PART}#bbox`, kind: 'bbox', data: { boxes: s.parts[PART].badges.map((b) => [...b.bbox, `${b.label ?? '?'} ${b.verdict}`]) } },
    { address: `${PART}#flagged`, kind: 'ledger', data: { rows: s.flagged } }
  ],
  verdicts: s.parts[PART].badges.map((b) => ({ name: `${b.detId}: per-digit ${b.perDigit.label ?? '-'} / coverage digit ${b.coverageDigit.label ?? '-'} (P ${b.coverageDigit.p ?? '-'}): ${b.verdict}`, ok: b.verdict === 'confirmed' || b.verdict === 'filled' }))
}]);

export default guarantee({
  id: ID, guards: [PART], requires: ['fg.s1.pxBadges.materialize'], audit: [unitful({ units: UNITS })],
  result: (s) => ({ totals: s.totals })
}, pipe(read(PART), observe, frames,
  published({
    stage: 'S1', key: 'badgeCrosscheck', materialization: 'S1BadgeCrosscheck',
    header: () => ({ part: PART, observedBy: ID }),
    body: (s) => ({ totals: s.totals, flagged: s.flagged })
  })));
