/**
 * fg.s1.badgeInvariants.observe (stages/s1.json): the S1 checks that used to
 * be manual, now instrumented on every run. Observations are judged and
 * recorded (never gated): they say where the robust base holds and where an
 * image breaks it.
 *
 * Learned from the whole dev set (11 images, 140 badges, 2026-10-17):
 *   - GLOBAL (holds on the 6 full courses AND the 5 zoomed Lenard views;
 *     docs/evidence/ledger/): a badge sprite's size is a function of its
 *     LABEL only, in screen px (one size per label on every image;
 *     BADGE_SIZE_BY_LABEL), it does not scale with the map;
 *   - a badge whose size differs from its label's size is exactly a badge
 *     whose white frame merged into a touching white sprite (11 of 11, no
 *     exceptions either way): its frame is then not its own S1 bright part,
 *     and the first bright part is a digit (never use it as the centre);
 *   - the badge bbox centre and its dark plate centre agree within 1 px.
 * A full view carries every label 1..18 once; a partial (zoomed) view a
 * subset, each label at most once.
 */
import { guarantee, pipe, read, step } from '../compose.mjs';
import { framed, judged, published, unitful } from '../mixins.mjs';

const ID = 'fg.s1.badgeInvariants.observe';
const PART = 'px.badges';
/** px [width, height] per label, measured on 129 clean badges over the 11 dev images (one size per label, no spread). */
export const BADGE_SIZE_BY_LABEL = Object.freeze({
  1: [54, 42], 2: [54, 42], 3: [54, 42], 4: [54, 42], 5: [54, 42], 6: [54, 42], 7: [54, 42], 8: [54, 42], 9: [54, 42],
  10: [57, 42], 11: [54, 42], 12: [55, 42], 13: [55, 42], 14: [56, 42], 15: [55, 42], 16: [55, 42], 17: [54, 42], 18: [55, 42]
});
const UNITS = { plateOffsetPx: 'px (bbox centre to dark-plate centre)', expectedSize: 'px [width, height]', confidence: 'fraction (reader confidence)', badges: 'count (badges)', merged: 'count (badges)' };

export function observeBadges(badges) {
  const rows = badges.map((b) => {
    const label = b.label == null ? null : String(b.label), [x, y, w, h] = b.bbox;
    const parts = b.has?.findPx?.parts ?? b.findPx?.parts ?? [];
    const framePart = parts.some((p) => p.polarity === 'bright' && p.bbox[2] >= 40);
    const dark = parts.find((p) => p.polarity === 'dark');
    const plateOffsetPx = dark ? Math.hypot(dark.bbox[0] + (dark.bbox[2] - 1) / 2 - (x + (w - 1) / 2), dark.bbox[1] + (dark.bbox[3] - 1) / 2 - (y + (h - 1) / 2)) : null;
    const want = BADGE_SIZE_BY_LABEL[label] ?? null;
    const sizeMatches = want ? w === want[0] && h === want[1] : null;
    return { label, bbox: [x, y, w, h], confidence: b.confidence ?? null, abstention: b.abstentionReason ?? null, framePart, sizeMatches,
      expectedSize: want, plateOffsetPx: plateOffsetPx == null ? null : Math.round(plateOffsetPx * 100) / 100,
      mergedWithNeighbour: !framePart };
  });
  const labels = rows.map((r) => r.label);
  const dup = [...new Set(labels.filter((l, i) => labels.indexOf(l) !== i))];
  const outside = labels.filter((l) => !(l && /^\d+$/.test(l) && +l >= 1 && +l <= 18));
  const full = rows.length === 18;
  const missing = full ? Array.from({ length: 18 }, (_, i) => String(i + 1)).filter((l) => !labels.includes(l)) : null;
  const sizeOffButFramed = rows.filter((r) => r.sizeMatches === false && r.framePart).map((r) => r.label);
  const framelessButSized = rows.filter((r) => r.sizeMatches === true && !r.framePart).map((r) => r.label);
  return {
    rows,
    findings: {
      view: full ? 'full (18 badges)' : `partial (${rows.length} badges)`,
      labelsUnique: dup.length === 0, duplicates: dup, labelsInRange: outside.length === 0, outOfRange: outside,
      allLabelsPresent: full ? missing.length === 0 : null, missing,
      mergedWithNeighbour: rows.filter((r) => r.mergedWithNeighbour).map((r) => r.label),
      sizeExplainedByMerge: sizeOffButFramed.length === 0 && framelessButSized.length === 0, sizeOffButFramed, framelessButSized,
      plateCentreAgrees: rows.every((r) => r.plateOffsetPx == null || r.plateOffsetPx <= 1), plateOffsetMaxPx: Math.max(0, ...rows.map((r) => r.plateOffsetPx ?? 0)),
      lowConfidence: rows.filter((r) => (r.confidence ?? 0) < 0.9 || r.abstention).map((r) => r.label)
    }
  };
}

const observe = step('observe the badge invariants', (env, s) => {
  const badges = s.parts[PART];
  if (!Array.isArray(badges) || !badges.length) env.fail('px.badges is missing or empty');
  return observeBadges(badges);
});

const holds = judged('robustBase', {
  judge: (s) => {
    const f = s.findings;
    return { matches: f.labelsUnique && f.labelsInRange && f.allLabelsPresent !== false && f.sizeExplainedByMerge && f.plateCentreAgrees && f.lowConfidence.length === 0, findings: f };
  }
});

const frames = framed((s) => [{
  title: `badge invariants: ${s.findings.view}; merged frames ${s.findings.mergedWithNeighbour.length}; robust base ${s.judged.robustBase.matches ? 'holds' : 'BREAKS'}`,
  calculation: 'Badge.findPx', tick: 'fg.s1.badgeInvariants.observe',
  parts: [
    { address: `${PART}#invariants`, kind: 'bbox', data: { boxes: s.rows.map((r) => [...r.bbox, `${r.label}${r.mergedWithNeighbour ? ' merged' : ''}${r.sizeMatches === false ? ' off-size' : ''}`]) } },
    { address: `${PART}#invariantRows`, kind: 'ledger', data: { rows: s.rows.map(({ label, bbox, expectedSize, sizeMatches, framePart, plateOffsetPx, confidence }) => ({ label, bbox, expectedSize, sizeMatches, framePart, plateOffsetPx, confidence })) } }
  ],
  verdicts: s.rows.map((r) => ({ name: `badge ${r.label}: size ${r.bbox[2]}x${r.bbox[3]} vs ${r.expectedSize?.join('x') ?? '?'}${r.mergedWithNeighbour ? ', frame merged with a neighbour' : ''}`, ok: r.sizeMatches !== false || r.mergedWithNeighbour }))
}]);

export default guarantee({
  id: ID, guards: [PART], requires: ['fg.s1.pxBadges.materialize'], audit: [unitful({ units: UNITS })],
  result: (s) => ({ totals: { badges: s.rows.length, merged: s.findings.mergedWithNeighbour.length }, robustBaseHolds: s.judged.robustBase.matches })
}, pipe(read(PART), observe, holds, frames,
  published({
    stage: 'S1', key: 'badgeInvariants', materialization: 'S1BadgeInvariants',
    header: () => ({ part: PART, observedBy: ID }),
    body: (s) => ({ robustBaseHolds: s.judged.robustBase.matches, findings: s.findings })
  })));
