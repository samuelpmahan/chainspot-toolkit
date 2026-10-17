const byId = (a, b) => String(a).localeCompare(String(b));

/**
 * Pure fixed-point singleton propagation over pre-winner eligible tee/support→hole fits.
 * A supportId identifies one physical tee/support group (the caller supplies merged groups).
 */
export function propagateSingletonQueues({ queues }) {
  if (!Array.isArray(queues)) throw new TypeError('queues must be an array');
  const supportIds = queues.map(q => q?.supportId);
  if (supportIds.some(id => typeof id !== 'string' || !id) || new Set(supportIds).size !== supportIds.length)
    throw new TypeError('each queue requires a unique non-empty supportId');

  const teeIds = queues.map(q => q?.teeId);
  if (teeIds.some(id => typeof id !== 'string' || !id) || new Set(teeIds).size !== teeIds.length)
    throw new TypeError('each support queue must have a unique non-empty teeId');

  const rawCandidates = [];
  const state = queues.map(queue => {
    if (typeof queue.teeId !== 'string' || !queue.teeId || !Array.isArray(queue.candidates))
      throw new TypeError(`queue ${queue.supportId} requires teeId and candidates[]`);
    const candidates = queue.candidates.map((candidate, index) => {
      if (typeof candidate?.candidateId !== 'string' || !candidate.candidateId ||
          typeof candidate?.holeId !== 'string' || !candidate.holeId)
        throw new TypeError(`queue ${queue.supportId} has a candidate without candidateId/holeId`);
      const entry = { ...candidate, supportId: queue.supportId, teeId: queue.teeId,
        originalIndex: index, active: true };
      rawCandidates.push(entry);
      return entry;
    });
    if (new Set(candidates.map(c => c.candidateId)).size !== candidates.length)
      throw new TypeError(`queue ${queue.supportId} has duplicate candidateId values`);
    return { supportId: queue.supportId, teeId: queue.teeId, candidates, assigned: false,
      removedHoleIds: new Set(), originalCandidateIds: candidates.map(c => c.candidateId) };
  });
  if (new Set(rawCandidates.map(c => c.candidateId)).size !== rawCandidates.length)
    throw new TypeError('candidateId values must be globally unique');

  const locks = [];
  const conflictClaimants = new Map();
  const rounds = [];
  let round = 0;
  while (true) {
    const activeQueues = state.filter(q => !q.assigned);
    const proposals = activeQueues.flatMap(q => {
      const holes = [...new Set(q.candidates.filter(c => c.active).map(c => c.holeId))].sort(byId);
      return holes.length === 1 ? [{ queue: q, holeId: holes[0], candidates: q.candidates.filter(c => c.active && c.holeId === holes[0]) }] : [];
    });
    const byHole = new Map();
    for (const proposal of proposals) {
      const group = byHole.get(proposal.holeId) ?? [];
      group.push(proposal);
      byHole.set(proposal.holeId, group);
    }
    const roundConflicts = [...byHole].filter(([, group]) => group.length > 1)
      .map(([holeId, group]) => ({ holeId, claimants: group.map(p => p.queue.supportId).sort(byId) }))
      .sort((a,b)=>byId(a.holeId,b.holeId));
    for (const conflict of roundConflicts) {
      const claimants = conflictClaimants.get(conflict.holeId) ?? new Map();
      for (const proposal of byHole.get(conflict.holeId)) {
        claimants.set(proposal.queue.supportId, { teeId: proposal.queue.teeId,
          candidateIds: proposal.candidates.map(c => c.candidateId).sort(byId),
          reason: 'Multiple singleton supports claim the same hole in this round.' });
      }
      conflictClaimants.set(conflict.holeId, claimants);
      conflict.claimants = byHole.get(conflict.holeId).map(proposal => ({ supportId: proposal.queue.supportId,
        teeId: proposal.queue.teeId, candidateIds: proposal.candidates.map(c => c.candidateId).sort(byId),
        reason: 'Multiple singleton supports claim the same hole in this round.' })).sort((a,b)=>byId(a.supportId,b.supportId));
    }
    const roundLocks = [...byHole].filter(([, group]) => group.length === 1)
      .map(([holeId, [proposal]]) => ({ holeId, proposal }))
      .sort((a, b) => byId(a.holeId, b.holeId) || byId(a.proposal.queue.supportId, b.proposal.queue.supportId));
    if (!roundLocks.length) {
      if (proposals.length || activeQueues.some(q => q.candidates.some(c => c.active))) {
        rounds.push({ round: ++round, proposals: proposals.map(p => ({ supportId: p.queue.supportId, holeId: p.holeId })).sort((a,b)=>byId(a.holeId,b.holeId)||byId(a.supportId,b.supportId)), locks: [], conflicts: roundConflicts });
      }
      break;
    }

    const lockedHoleIds = new Set(roundLocks.map(x => x.holeId));
    const lockedSupportIds = new Set(roundLocks.map(x => x.proposal.queue.supportId));
    const removed = [];
    for (const q of state) {
      if (lockedSupportIds.has(q.supportId)) {
        q.assigned = true;
        continue;
      }
      for (const candidate of q.candidates) {
        if (candidate.active && lockedHoleIds.has(candidate.holeId)) {
          candidate.active = false;
          q.removedHoleIds.add(candidate.holeId);
          removed.push({ supportId: q.supportId, candidateId: candidate.candidateId, holeId: candidate.holeId });
        }
      }
    }
    for (const { holeId, proposal } of roundLocks) {
      locks.push({ supportId: proposal.queue.supportId, teeId: proposal.queue.teeId, holeId,
        candidateIds: proposal.candidates.map(c => c.candidateId).sort(byId), round: round + 1 });
    }
    rounds.push({ round: ++round,
      proposals: proposals.map(p => ({ supportId: p.queue.supportId, holeId: p.holeId })).sort((a,b)=>byId(a.holeId,b.holeId)||byId(a.supportId,b.supportId)),
      locks: roundLocks.map(x => ({ supportId: x.proposal.queue.supportId, holeId: x.holeId })),
      conflicts: roundConflicts,
      removed: removed.sort((a,b)=>byId(a.holeId,b.holeId)||byId(a.supportId,b.supportId)||byId(a.candidateId,b.candidateId)) });
  }

  const conflicts = [...conflictClaimants].map(([holeId, claimantMap]) => ({ holeId,
    claimants: [...claimantMap].sort(([a],[b])=>byId(a,b)).map(([supportId, claim]) => {
      const q = state.find(x => x.supportId === supportId);
      const stillEligibleCandidateIds = q.candidates.filter(c => c.active && c.holeId === holeId).map(c => c.candidateId).sort(byId);
      return { supportId, teeId: claim.teeId, candidateIds: claim.candidateIds, stillEligibleCandidateIds, reason: claim.reason,
        resolution: stillEligibleCandidateIds.length ? 'PERSISTENT_CONFLICT' : 'RESOLVED_BY_REMOVAL' };
    }) })).sort((a,b)=>byId(a.holeId,b.holeId));
  const residualQueues = state.filter(q => !q.assigned && q.candidates.some(c => c.active))
    .map(q => ({ supportId: q.supportId, teeId: q.teeId,
      candidates: q.candidates.filter(c => c.active).map(publicCandidate).sort((a,b)=>byId(a.candidateId,b.candidateId)) }))
    .sort((a,b)=>byId(a.supportId,b.supportId));
  const exhausted = state.filter(q => !q.assigned && !q.candidates.some(c => c.active))
    .map(q => ({ supportId: q.supportId, teeId: q.teeId, removedHoleIds: [...q.removedHoleIds].sort(byId) }))
    .sort((a,b)=>byId(a.supportId,b.supportId));
  const hasPersistentConflict = conflicts.some(conflict => conflict.claimants.some(c => c.resolution === 'PERSISTENT_CONFLICT'));
  const status = hasPersistentConflict ? 'CONFLICT' : residualQueues.length || exhausted.length ? 'PARTIAL' : 'FULL';
  return { status, fixedPointReached: true, locks: locks.sort((a,b)=>a.round-b.round||byId(a.holeId,b.holeId)||byId(a.supportId,b.supportId)),
    conflicts, residualQueues, exhausted, rounds,
    rawCandidates: rawCandidates.map(publicCandidate).sort((a,b)=>byId(a.candidateId,b.candidateId)),
    explanation: `${locks.length} uncontested singleton locks; ${conflicts.length} conflicted holes; ${residualQueues.length} residual queues; ${exhausted.length} exhausted queues; fixed point reached.` };
}

function publicCandidate(candidate) {
  const { active, originalIndex, ...raw } = candidate;
  return raw;
}
