/**
 * contracts/export.course@1: the file the toolkit hands the app, and when two exported holes are the SAME hole.
 *
 * Format `chainspot.course-geometry` version 1 (docs/agents/boundary.md). One JSON file; screenshots in, course
 * geometry out, nothing else crosses. `holes` and `numberBadges` are exactly ChainSpot's ProjectState v7
 * `AnnotatedHole` and `HoleNumberBadgeAnchor` (src/lib/domain/project.ts), so the app parses them with its strict
 * reader. Everything the CV is unsure of lives OUTSIDE them, in `evidence` and `candidates` (the app's own rule:
 * no CV flags cross `AnnotatedRound`).
 *
 * Frame: every coordinate is in the ORIGINAL UPLOAD (S0's removed rows added back), px; `source.s0Crop` records the
 * mapping. Referent of every px quantity: the screenshot named by `source.sha256`.
 *
 * Identity of a hole (compare): same hole number; tee within teePx (8 px, the tee match rule); basket within basketPx
 * (12 px, the basket match rule); and each bend of one within bendHalfWidth * corridorWidthPx (half the corridor
 * width, LOCAL to the course) of a bend of the other, the same count of bends. Testimony is impeachable: this
 * reports agreement, never acceptance.
 *
 * Versioning: any change to the shape is export.course@2. Browser-safe (no node imports).
 */
import { defineContract } from '../fg/identity.mjs';

export const FORMAT = 'chainspot.course-geometry';
export const VERSION = 1;
export const STATUSES = Object.freeze(['resolved', 'straight', 'partial', 'unresolved']);
export const CONFIDENCE_LEVELS = Object.freeze(['confirmed', 'unconfirmed', 'noReading']);
export const CANDIDATE_KINDS = Object.freeze(['basket', 'tee', 'badge']);

const MISMATCH = 1000;
const r4 = (v) => Math.round(v * 1e4) / 1e4;
const dist = (p, q) => Math.hypot(p.xPx - q.xPx, p.yPx - q.yPx);

/** The pure comparison of two exported holes (AnnotatedHole shape). */
export function compareHole(a, b, { teePx, basketPx, bendHalfWidth }) {
  const sameNumber = a.number === b.number;
  const teeDistPx = a.tee && b.tee ? dist(a.tee, b.tee) : null;
  const basketDistPx = a.basket && b.basket ? dist(a.basket, b.basket) : null;
  const halfWidthPx = bendHalfWidth * Math.min(a.corridorWidthPx, b.corridorWidthPx);
  const sameBendCount = a.corridorBends.length === b.corridorBends.length;
  // each bend of a to the nearest bend of b, px
  const bendOffsetsPx = a.corridorBends.map((p) => (b.corridorBends.length ? Math.min(...b.corridorBends.map((q) => dist(p, q))) : null));
  const teeOk = (a.tee == null && b.tee == null) || (teeDistPx != null && teeDistPx <= teePx);
  const basketOk = (a.basket == null && b.basket == null) || (basketDistPx != null && basketDistPx <= basketPx);
  const bendsOk = sameBendCount && bendOffsetsPx.every((d) => d != null && d <= halfWidthPx);
  const ok = sameNumber && teeOk && basketOk && bendsOk;
  const ratios = [teeDistPx == null ? (teeOk ? 0 : 1) : teeDistPx / (teePx || 1), basketDistPx == null ? (basketOk ? 0 : 1) : basketDistPx / (basketPx || 1),
    ...bendOffsetsPx.map((d) => (d == null ? 1 : d / (halfWidthPx || 1))), sameBendCount ? 0 : 1];
  const score = (sameNumber ? 0 : MISMATCH) + Math.max(0, ...ratios);
  return { ok, score, sameNumber, teeDistPx: teeDistPx == null ? null : r4(teeDistPx), basketDistPx: basketDistPx == null ? null : r4(basketDistPx), bendOffsetsPx: bendOffsetsPx.map((d) => (d == null ? null : r4(d))), halfWidthPx: r4(halfWidthPx) };
}

const isPoint = (p) => p && typeof p === 'object' && Number.isFinite(p.xPx) && Number.isFinite(p.yPx);

/**
 * Structural validation of a document in this format (what the producer guarantees and the app's reader relies on).
 * Returns { ok, errors: [string] }; it never throws on bad data.
 */
export function validateCourseGeometry(doc) {
  const errors = [], bad = (m) => errors.push(m);
  if (!doc || typeof doc !== 'object') return { ok: false, errors: ['document is not an object'] };
  if (doc.format !== FORMAT) bad(`format must be ${FORMAT}`);
  if (doc.version !== VERSION) bad(`version must be ${VERSION}`);
  const s = doc.source;
  if (!s || typeof s !== 'object') bad('source missing');
  else {
    if (s.frame !== 'original-upload') bad('source.frame must be original-upload');
    if (!/^[0-9a-f]{64}$/.test(s.sha256 ?? '')) bad('source.sha256 must be 64 hex chars');
    if (!(Number.isInteger(s.widthPx) && s.widthPx > 0 && Number.isInteger(s.heightPx) && s.heightPx > 0)) bad('source.widthPx / heightPx must be positive integers');
    if (!s.s0Crop || !Number.isInteger(s.s0Crop.rowsRemovedTop) || !Number.isInteger(s.s0Crop.rowsRemovedBottom)) bad('source.s0Crop rows must be integers');
  }
  const inFrame = (p) => isPoint(p) && s && p.xPx >= 0 && p.yPx >= 0 && p.xPx < s.widthPx && p.yPx < s.heightPx;
  const holes = Array.isArray(doc.holes) ? doc.holes : (bad('holes must be an array'), []);
  const numbers = new Set(), ids = new Set();
  for (const h of holes) {
    if (!(Number.isInteger(h.number) && h.number > 0)) bad(`hole ${h.id}: number must be a positive integer`);
    if (numbers.has(h.number)) bad(`hole number ${h.number} duplicated`);
    numbers.add(h.number);
    if (typeof h.id !== 'string' || !h.id || ids.has(h.id)) bad(`hole id ${JSON.stringify(h.id)} missing or duplicated`);
    ids.add(h.id);
    if (h.tee != null && !inFrame(h.tee)) bad(`hole ${h.number}: tee outside the source frame`);
    if (h.basket != null && !inFrame(h.basket)) bad(`hole ${h.number}: basket outside the source frame`);
    if (!Array.isArray(h.shots) || h.shots.length) bad(`hole ${h.number}: shots must be [] (the toolkit never produces shots)`);
    if (!Array.isArray(h.corridorBends) || !h.corridorBends.every(inFrame)) bad(`hole ${h.number}: corridorBends must be points inside the source frame`);
    if (!(h.corridorWidthPx > 0)) bad(`hole ${h.number}: corridorWidthPx must be > 0`);
    for (const k of Object.keys(h)) if (!['id', 'number', 'par', 'tee', 'basket', 'shots', 'corridorBends', 'corridorWidthPx'].includes(k)) bad(`hole ${h.number}: field ${k} is not an AnnotatedHole field`);
  }
  const badges = Array.isArray(doc.numberBadges) ? doc.numberBadges : (bad('numberBadges must be an array'), []);
  for (const b of badges) {
    if (!(Number.isInteger(b.number) && b.number > 0 && inFrame(b) && b.confidence >= 0 && b.confidence <= 1)) bad(`numberBadges ${b?.number}: needs positive integer number, in-frame xPx/yPx, confidence in [0, 1]`);
    for (const k of Object.keys(b)) if (!['number', 'xPx', 'yPx', 'confidence'].includes(k)) bad(`numberBadges ${b.number}: field ${k} is not a HoleNumberBadgeAnchor field`);
  }
  for (const c of Array.isArray(doc.candidates) ? doc.candidates : (bad('candidates must be an array'), [])) {
    if (!CANDIDATE_KINDS.includes(c.kind) || typeof c.label !== 'string' || !inFrame(c)) bad(`candidate ${c?.label}: needs a label, a kind in ${CANDIDATE_KINDS.join('|')} and an in-frame point`);
  }
  for (const e of Array.isArray(doc.evidence) ? doc.evidence : (bad('evidence must be an array'), [])) {
    if (!ids.has(e.holeId)) bad(`evidence for unknown hole ${e.holeId}`);
    if (!STATUSES.includes(e.status)) bad(`evidence ${e.holeId}: status ${e.status} not in ${STATUSES.join('|')}`);
    if (!CONFIDENCE_LEVELS.includes(e.confidence?.level)) bad(`evidence ${e.holeId}: confidence.level not in ${CONFIDENCE_LEVELS.join('|')}`);
  }
  return { ok: errors.length === 0, errors };
}

export default defineContract({
  id: 'export.course',
  version: 1,
  subject: 'exported hole (AnnotatedHole): number + tee + basket + corridor bends + corridor width, px in the original-upload frame',
  tolerances: { teePx: 8, basketPx: 12, bendHalfWidth: 0.5 },
  describe: 'same hole iff same number, tee within 8 px, basket within 12 px, and every bend within half the corridor width of a bend of the other (same bend count)',
  compare: compareHole
});
