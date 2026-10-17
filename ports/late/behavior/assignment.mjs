import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const nativeMatcherPath = fileURLToPath(new URL('../../../source/provider/packages/alg/dist/detectors/threeFactor/features/g4.teeBadgeLockMath.js', import.meta.url));
const { maximumWeightTeeBadgeMatching } = require(nativeMatcherPath);

const finite = n => typeof n === 'number' && Number.isFinite(n);
const point = p => Array.isArray(p) && p.length === 2 && p.every(finite);

/**
 * Assign S1 badge plates to fitted S5 axes from existing S5 rayBadgeHits only.
 * The provider's exact sparse matcher maximizes real-edge cardinality first,
 * then total score. No hit is synthesized and no geometry threshold removes it.
 */
export function resolveS5GlobalAssignment({ sealedAxes, badgePlates, sourceWidth, sourceHeight, rayBadgeHits }) {
  if (!sealedAxes || !Array.isArray(sealedAxes.visible) || !Array.isArray(sealedAxes.recovered) || !Array.isArray(sealedAxes.unknown))
    throw new TypeError('sealedAxes must contain visible, recovered, and unknown arrays');
  if (!Array.isArray(badgePlates) || !Array.isArray(rayBadgeHits) || !finite(sourceWidth) || sourceWidth <= 0 || !finite(sourceHeight) || sourceHeight <= 0)
    throw new TypeError('badgePlates, rayBadgeHits, and positive source dimensions are required');
  const axes = [...sealedAxes.visible, ...sealedAxes.recovered];
  const axisIds = axes.map(a => a.detId);
  const badgeIds = badgePlates.map(b => b.detId);
  if (axisIds.some(id => !id) || badgeIds.some(id => !id) || new Set(axisIds).size !== axisIds.length || new Set(badgeIds).size !== badgeIds.length)
    throw new TypeError('fitted tee and badge IDs must be present and unique');

  const diagonalPx = Math.hypot(sourceWidth, sourceHeight);
  const bestByPair = new Map();
  const candidateRows = rayBadgeHits.map((hit, originalIndex) => {
    const valid = hit && typeof hit.id === 'string' && axisIds.includes(hit.teeId) && badgeIds.includes(hit.badgeId) &&
      point(hit.teeCenter) && point(hit.badgeCenter) && point(hit.u) && finite(hit.rayHitOrdinal);
    if (!valid) return { id: hit?.id ?? `invalid-hit-${originalIndex}`, teeId: hit?.teeId ?? null, badgeId: hit?.badgeId ?? null,
      hit, originalIndex, selected: false, disposition: 'REJECTED_INVALID', reason: 'Hit does not reference known fitted tee and S1 badge with finite geometry.' };
    const dx = hit.badgeCenter[0] - hit.teeCenter[0], dy = hit.badgeCenter[1] - hit.teeCenter[1];
    const distancePx = Math.hypot(dx, dy);
    const distanceDiagonalFraction = distancePx / diagonalPx;
    const axisResidualPx = Math.abs(-hit.u[1] * dx + hit.u[0] * dy);
    const normalizedAxisResidual = axisResidualPx / diagonalPx;
    const ordinal = Math.max(0, hit.rayHitOrdinal);
    // Weighted geometric cost keeps normalized distance dominant; tiny scales make ordinal/order deterministic.
    const score = -(distanceDiagonalFraction + normalizedAxisResidual * 1e-3 + ordinal * 1e-9 + originalIndex * 1e-12);
    const row = { id: hit.id, teeId: hit.teeId, badgeId: hit.badgeId, hit, originalIndex, distancePx,
      distanceDiagonalFraction, axisResidualPx, normalizedAxisResidual, rayHitOrdinal: ordinal, score,
      selected: false, disposition: 'ALTERNATIVE', reason: null };
    const key = `${hit.teeId}\u0000${hit.badgeId}`;
    const prior = bestByPair.get(key);
    if (!prior || compareRows(row, prior) < 0) bestByPair.set(key, row);
    return row;
  });

  const matchingCandidates = [...bestByPair.values()].map(row => ({ teeId: row.teeId, badgeId: row.badgeId, score: row.score, sourceHitId: row.id }));
  const match = maximumWeightTeeBadgeMatching(matchingCandidates, {
    badges: badgePlates.map((b, i) => ({ detId: b.detId, label: String(b.holeRead ?? ''), cxPx: b.center[0], cyPx: b.center[1], order: i })),
    tees: axes.map((a, i) => ({ detId: a.detId, order: i }))
  });
  const selectedPairs = new Map(match.locks.map(lock => [`${lock.teeId}\u0000${lock.badgeId}`, lock]));
  const selected = [];
  for (const row of candidateRows) {
    const key = `${row.teeId}\u0000${row.badgeId}`;
    const lock = selectedPairs.get(key);
    if (lock && bestByPair.get(key) === row) {
      row.selected = true;
      row.disposition = 'SELECTED';
      row.reason = 'Selected by exact maximum-cardinality global matching, then minimum weighted geometric cost.';
      row.assignmentMargin = lock.runnerUpMargin;
      selected.push(row);
    }
  }
  for (const row of candidateRows) {
    if (row.selected || row.disposition === 'REJECTED_INVALID') continue;
    const key = `${row.teeId}\u0000${row.badgeId}`;
    const winner = bestByPair.get(key);
    if (winner !== row) {
      row.disposition = 'DUPLICATE_HIT';
      row.reason = winner ? `Superseded by higher-scoring duplicate hit ${winner.id} for the same tee/badge pair.` : 'Rejected invalid graph edge.';
      if (winner) row.winnerHitId = winner.id;
    } else {
      const competing = selected.find(s => s.teeId === row.teeId || s.badgeId === row.badgeId);
      row.reason = competing
        ? `Not selected because global one-to-one assignment gave tee/badge capacity to ${competing.id}; this real edge remains an alternative.`
        : 'Not selected by the global optimum; retained as a real alternative.';
      if (competing) row.conflictingSelectedHitId = competing.id;
    }
  }
  const matchedBadgeIds = new Set(selected.map(x => x.badgeId));
  const selectedTeeIds = new Set(selected.map(x => x.teeId));
  const unmatchedBadgeIds = badgeIds.filter(id => !matchedBadgeIds.has(id));
  const unusedTeeIds = axisIds.filter(id => !selectedTeeIds.has(id));
  const completeGraph = unmatchedBadgeIds.length === 0 && selected.length === badgeIds.length && selectedTeeIds.size === badgeIds.length;
  return {
    processStatus: 'SUCCESS', status: completeGraph ? 'FULL' : 'PARTIAL', physicalStatus: 'UNKNOWN',
    selected, candidateRows, unknownAxes: sealedAxes.unknown.map(a => ({ ...a, status: 'UNKNOWN_NO_FITTED_AXIS' })),
    unmatchedBadgeIds, unusedTeeIds, fittedAxisIds: axisIds, badgeIds,
    overcompleteAxisInventory: axisIds.length > selectedTeeIds.size,
    explanation: completeGraph
      ? `All ${badgeIds.length} S1 badges are assigned to ${selectedTeeIds.size} distinct fitted tees by existing ray-hit evidence; physical course acceptance remains unknown.`
      : `${selected.length} of ${badgeIds.length} S1 badges are assigned to distinct fitted tees from existing ray-hit evidence; unmatched badges remain explicit and physical course acceptance remains unknown.`,
    scorePolicy: { primary: 'maximum real-edge cardinality', secondary: 'minimum summed weighted cost: center distance normalized by full image diagonal plus 0.001 times normalized axis residual',
      tieBreak: 'ray-hit ordinal at 1e-9 scale, then original hit order at 1e-12 scale',
      threshold: null, diagonalPx }
  };
}

function compareRows(a, b) {
  return b.score - a.score;
}
