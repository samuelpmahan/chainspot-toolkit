"use strict";
/**
 * G4 teeBadgeLock: an opt-in, independent tee↔badge ownership decision.
 *
 * The semantic set owns the executable operation.  The ABFeature is only its
 * default-OFF declaration and render seam; keeping those separate means a
 * caller can compose this deviation without changing the frozen engine plan.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.teeBadgeLockOperation = exports.teeBadgeLockUnit = exports.teeBadgeLockFeature = void 0;
const g4_scoring_1 = require("./g4.scoring");
const g4_teeBadgeLockMath_1 = require("./g4.teeBadgeLockMath");
const g4_teeBadgeLockReceipt_1 = require("./g4.teeBadgeLockReceipt");
function finite(value) {
    return typeof value === 'number' && Number.isFinite(value);
}
function scoringKnobs(ctx, measurement) {
    // CL-7: g4ScoringFeature is the shared DEFAULT-ON scoring knob set and is
    // never retuned by this lane; teeOrientationSigma/teeOrientationSigmaDeg
    // on it is dead to this feature (CL-4) -- bearing uncertainty now comes
    // from readImageSigma's per-image estimate (see executeTeeBadgeLock),
    // with a named conservative fallback, never a borrowed configured knob.
    void ctx.resolve(g4_scoring_1.g4ScoringFeature); // keep the declared feature dependency honest
    const alignmentPower = measurement.parameters?.alignmentPower;
    const worstWindowSrcPx = measurement.parameters?.worstWindowSrcPx;
    if (!finite(alignmentPower) || !finite(worstWindowSrcPx)) {
        throw new Error('teeBadgeLock: scoring provenance is incomplete; alignmentPower and worstWindowSrcPx must come from measurement.parameters.');
    }
    const configured = ctx.resolve(g4_scoring_1.g4ScoringFeature).knobs;
    const minWindowCells = configured.minWindowCells;
    if (!finite(minWindowCells)) {
        throw new Error('teeBadgeLock: minWindowCells must come from resolved scoring.');
    }
    return { alignmentPower, worstWindowSrcPx, minWindowCells };
}
function imageSigmaFor(measurement) {
    // CL-4: readImageSigma reads G3's published per-tee/per-image sigma when
    // present; measurement itself does not carry it in this worktree yet
    // (concurrent G3 build), so this degrades to the named conservative
    // fallback until that board slot lands -- never a silent guess.
    return (0, g4_teeBadgeLockMath_1.readImageSigma)(measurement);
}
function asBadgeOrder(badges) {
    return (badges ?? []).map((badge) => ({
        detId: badge.detId,
        label: badge.label,
        cxPx: badge.cxPx,
        cyPx: badge.cyPx
    }));
}
function asTeeOrder(tees) {
    return (tees ?? []).map((tee) => ({
        detId: tee.detId,
        tier: tee.tier,
        xPx: tee.xPx,
        yPx: tee.yPx,
        angleRad: tee.angleRad,
        pad: tee.pad
    }));
}
function disabledEvidence(measurement) {
    return (0, g4_teeBadgeLockMath_1.buildTeeBadgeLockEvidence)({ candidates: [], locks: [], unmatchedBadgeIds: [], unusedTeeIds: [] }, { measurement });
}
function axisSourceCode(source) {
    if (source === 'TeeEvidence.pad.minAreaPose.angleRad')
        return 0;
    if (source === 'TeeEvidence.angleRad')
        return 1;
    if (source === 'TeeEvidence.pad.angleRad')
        return 2;
    return 3;
}
function traceOutcomeCode(outcome) {
    if (outcome === 'basket')
        return 0;
    if (outcome === 'unknown')
        return 1;
    return undefined;
}
function numericLockValues(lock) {
    const values = {
        score: lock.score,
        weakAligned: lock.weakAlignedSupport,
        efficiency: lock.pathEfficiency,
        axisSourceCode: axisSourceCode(lock.axisSource),
        pathPoints: lock.teeBadgePath.length,
        recovered: lock.tier === 'recovered' ? 1 : 0
    };
    if (finite(lock.hole))
        values.hole = lock.hole;
    if (finite(lock.axisErrorDeg))
        values.axisErrorDeg = lock.axisErrorDeg;
    if (finite(lock.runnerUpMargin))
        values.margin = lock.runnerUpMargin;
    values.tierCode = lock.tier === 'recovered' ? 1 : 0;
    values.rayDegraded = lock.rayDegraded ? 1 : 0;
    if (lock.ray && finite(lock.ray.sigmaUsedDeg))
        values.sigmaUsedDeg = lock.ray.sigmaUsedDeg;
    if (lock.ray && finite(lock.ray.wideningDeg))
        values.wideningDeg = lock.ray.wideningDeg;
    if (lock.basketTrace) {
        const code = traceOutcomeCode(lock.basketTrace.outcome);
        if (finite(code))
            values.traceOutcomeCode = code;
        values.traceLengthPx = lock.basketTrace.lengthPx;
        values.tunneledSegments = lock.basketTrace.tunneledSegments.length;
        // 2026-08-29 gate-reorg: 0 = ran straight (new-G5-shaped), >0 = bent N
        // times (new-G6-shaped) -- visible in the receipt ahead of re-homing.
        values.bendCount = lock.basketTrace.bendCount;
    }
    return values;
}
function abstentionValues(abstention) {
    const values = {
        kindCode: abstention.kind === 'conflict' ? 1 : 0
    };
    if (finite(abstention.hole))
        values.hole = abstention.hole;
    if (finite(abstention.bestScore))
        values.bestScore = abstention.bestScore;
    if (finite(abstention.winningHole))
        values.winningHole = abstention.winningHole;
    if (finite(abstention.winningScore))
        values.winningScore = abstention.winningScore;
    return values;
}
/**
 * CL-9: one plain sentence a disc golfer could accept, covering both the
 * stage-A TeeBadgeClaim (2026-08-29 gate-reorg: this stage is the new G4's
 * mechanism -- a unique claim or a named abstention, no basket assignment)
 * and, when it ran, the stage-B path trace (the new G5/G6 mechanism family:
 * straight-to-basket vs bent N times, distinguished below so that split is
 * visible in the evidence ahead of any unit/gate re-homing).
 */
function lockReasonSentence(lock) {
    const rayPart = lock.rayDegraded
        ? `poor/no axis on this tee -- corroboration-only TeeBadgeClaim (route weakAligned=${lock.weakAlignedSupport.toFixed(3)}, efficiency=${lock.pathEfficiency.toFixed(3)})`
        : `TeeBadgeClaim: points at its badge within ${finite(lock.axisErrorDeg) ? lock.axisErrorDeg.toFixed(1) : 'UNKNOWN'}°` +
            `${lock.ray && finite(lock.ray.sigmaUsedDeg) ? ` (sigma ${lock.ray.sigmaUsedDeg.toFixed(2)}° -- ${lock.ray.sigmaProvenance})` : ''}`;
    if (!lock.basketTrace)
        return `tee ${rayPart}; no basket path trace ran.`;
    if (lock.basketTrace.outcome === 'basket') {
        const shapeNote = lock.basketTrace.bendCount === 0
            ? 'ran straight to the basket'
            : `bent ${lock.basketTrace.bendCount} time${lock.basketTrace.bendCount === 1 ? '' : 's'} to the basket`;
        const tunnelNote = lock.basketTrace.tunneledSegments.length > 0
            ? `, tunneling under ${lock.basketTrace.tunneledSegments.map((s) => s.overId).join(', ')}`
            : '';
        return `tee ${rayPart}; followed the path ${lock.basketTrace.lengthPx.toFixed(0)}px from the badge and ${shapeNote}${tunnelNote}; it ends at ${lock.basketTrace.basketId}.`;
    }
    return `tee ${rayPart}; path traced ${lock.basketTrace.lengthPx.toFixed(0)}px from the badge (bent ${lock.basketTrace.bendCount} time${lock.basketTrace.bendCount === 1 ? '' : 's'} so far) then ${lock.basketTrace.reason} -- UNKNOWN basket, partial trace kept as evidence.`;
}
function emitDrawables(ctx, evidence, badges) {
    const badgeById = new Map(badges.map((badge) => [badge.detId, badge]));
    for (const abstention of evidence.abstentions) {
        const badge = badgeById.get(abstention.badgeId);
        const ref = `teeBadgeLockAbstention:${encodeURIComponent(abstention.badgeId)}`;
        ctx.overlay('teeBadgeLock', {
            type: 'point',
            xPx: badge?.cxPx ?? 0,
            yPx: badge?.cyPx ?? 0,
            verdict: 'rejected',
            visualRole: 'tee-badge-abstention',
            ref,
            reason: abstention.reason,
            values: abstentionValues(abstention)
        });
    }
    for (const lock of evidence.locks) {
        const ref = `teeBadgeLock:${encodeURIComponent(lock.badgeId)}:${encodeURIComponent(lock.teeId)}`;
        // lock.hole is the exact-label hole number this lock is already tied to
        // (buildTeeBadgeLockEvidence copies it from the badge's G1 digit read).
        // The CLI receipt (g4.teeBadgeLockReceipt.ts) surfaces it as its own
        // `hole` column, but this reason string is what a human actually reads
        // on hover in the LAB SVG viewer (src/routes/lab/+page.svelte renders
        // `<title>{unit.id} {d.verdict}: {d.reason} {d.ref}</title>` verbatim),
        // so it must not leave the raw badge/tee detector ids unexplained there.
        const holeNote = typeof lock.hole === 'number' ? `hole=H${lock.hole}; ` : '';
        ctx.overlay('teeBadgeLock', {
            type: 'polyline',
            path: lock.teeBadgePath,
            verdict: 'accepted',
            visualRole: 'tee-badge-path',
            ref,
            reason: `${holeNote}${lockReasonSentence(lock)}`,
            values: numericLockValues(lock)
        });
    }
}
/**
 * CL-6b: for each stage-A lock, trace the painted path onward from its badge
 * -- away from the tee side -- to discover the basket it claims. Baskets are
 * read here ONLY as footprint-arrival testimony (S6): they are never
 * enumerated as candidates, never routed toward, never a "nearest" guess.
 */
function traceBasketsForLocks(measurement, locks) {
    const field = measurement.field;
    const viewportTopPx = measurement.viewport?.topPx ?? 0;
    const supportTau = measurement.parameters?.supportTau;
    const corridorWidthPx = measurement.parameters?.corridorWidthPx;
    const badgesByDetId = new Map((measurement.badges ?? []).map((badge) => [badge.detId, badge]));
    const baskets = (measurement.baskets ?? []).map((basket) => ({
        basketId: basket.detId,
        bbox: basket.bbox
    }));
    if (!finite(supportTau) || !finite(corridorWidthPx))
        return new Map();
    const maxTraceLengthPx = Math.hypot(field.width * field.scale, field.height * field.scale);
    const traces = new Map();
    for (const lock of locks) {
        const badge = badgesByDetId.get(lock.badgeId);
        if (!badge || !finite(badge.cxPx) || !finite(badge.cyPx) || !badge.bbox)
            continue;
        // Heading away from the tee side: continue the routed testimony's own
        // final approach direction into the badge (teeBadgePath is already in
        // tee->badge order -- see collapseTeeBadgePaths), rather than recomputing
        // geometry this feature does not own.
        const path = lock.teeBadgePath;
        const last = path[path.length - 1];
        const priorIndex = [...path.keys()].reverse().find((index) => {
            const point = path[index];
            return point[0] !== last?.[0] || point[1] !== last?.[1];
        });
        const prior = priorIndex !== undefined ? path[priorIndex] : undefined;
        const dx = last && prior ? last[0] - prior[0] : 1;
        const dy = last && prior ? last[1] - prior[1] : 0;
        const headingRad = Math.hypot(dx, dy) > 0 ? Math.atan2(dy, dx) : 0;
        const occluders = (measurement.badges ?? [])
            .filter((other) => other.detId !== lock.badgeId)
            .map((other) => ({ id: other.detId, bbox: other.bbox }));
        const outcome = (0, g4_teeBadgeLockMath_1.traceBadgeToBasket)({
            badgeId: lock.badgeId,
            startPx: [badge.cxPx, badge.cyPx],
            headingRad,
            field,
            viewportTopPx,
            supportTau: supportTau,
            corridorWidthPx: corridorWidthPx,
            startBadgeBbox: badge.bbox,
            occluders,
            baskets,
            maxTraceLengthPx
        });
        traces.set(lock.badgeId, outcome);
    }
    return traces;
}
function executeTeeBadgeLock(board, ctx, measurement, tees, rawPairs) {
    const stop = ctx.span('teeBadgeLock');
    const state = ctx.resolve(exports.teeBadgeLockFeature);
    const badges = asBadgeOrder(measurement.badges);
    const teeOrder = asTeeOrder(tees);
    const collapseStop = ctx.span('teeBadgeLock.candidateCollapse');
    const collapsed = state.enabled ? (0, g4_teeBadgeLockMath_1.collapseTeeBadgePaths)(rawPairs) : [];
    collapseStop();
    const scoreStop = ctx.span('teeBadgeLock.score');
    const scored = state.enabled && collapsed.length > 0
        ? (0, g4_teeBadgeLockMath_1.scoreTeeBadgeCandidates)({
            candidates: collapsed,
            field: measurement.field,
            tees: teeOrder,
            badges,
            viewportTopPx: measurement.viewport?.topPx ?? 0,
            knobs: scoringKnobs(ctx, measurement),
            imageSigma: imageSigmaFor(measurement)
        })
        : [];
    scoreStop();
    const matchStop = ctx.span('teeBadgeLock.match');
    const selected = state.enabled
        ? (0, g4_teeBadgeLockMath_1.maximumWeightTeeBadgeMatching)(scored, { badges, tees: teeOrder })
        : undefined;
    matchStop();
    const traceStop = ctx.span('teeBadgeLock.trace');
    const basketTraces = state.enabled && selected
        ? traceBasketsForLocks(measurement, selected.locks)
        : new Map();
    traceStop();
    const publishStop = ctx.span('teeBadgeLock.publish');
    const evidence = selected
        ? (0, g4_teeBadgeLockMath_1.buildTeeBadgeLockEvidence)(selected, { badges, tees: teeOrder, measurement, basketTraces })
        : disabledEvidence(measurement);
    if (state.enabled)
        emitDrawables(ctx, evidence, badges);
    ctx.measure('teeBadgeLock', 'candidates', evidence.candidates.length);
    ctx.measure('teeBadgeLock', 'locks', evidence.locks.length);
    ctx.measure('teeBadgeLock', 'visibleLocks', evidence.locks.filter((lock) => lock.tier === 'visible').length);
    ctx.measure('teeBadgeLock', 'recoveredLocks', evidence.locks.filter((lock) => lock.tier === 'recovered').length);
    ctx.measure('teeBadgeLock', 'unmatchedBadges', evidence.unmatchedBadgeIds.length);
    ctx.measure('teeBadgeLock', 'unusedTees', evidence.unusedTeeIds.length);
    ctx.measure('teeBadgeLock', 'basketsFollowed', evidence.locks.filter((lock) => lock.basketTrace?.outcome === 'basket').length);
    ctx.measure('teeBadgeLock', 'basketsUnknown', evidence.locks.filter((lock) => lock.basketTrace?.outcome === 'unknown').length);
    board.set('teeBadgeLock', evidence);
    publishStop();
    stop();
}
function measurementTable(board) {
    const evidence = board.get('teeBadgeLock');
    return [
        {
            kind: 'measurementTable',
            id: 'teeBadgeLock.evidence',
            bytes: new TextEncoder().encode(JSON.stringify(evidence))
        }
    ];
}
/** Default-OFF G4 deviation.  Operation ownership remains with the semantic
 * set, hence `operations` is deliberately undefined. */
exports.teeBadgeLockFeature = {
    id: 'teeBadgeLock',
    gate: 'G4',
    kind: 'deviation',
    defaultEnabled: false,
    resolveOnlyWhenConfigured: true,
    knobs: {},
    render: g4_teeBadgeLockReceipt_1.TEE_BADGE_LOCK_RENDER
};
/** Legacy engine descriptor used by the chronology seam.  Production ABFeature
 * sets use teeBadgeLockOperation below, whose dotted slots make custody
 * explicit and never expose the mutable assignment object. */
exports.teeBadgeLockUnit = {
    id: 'teeBadgeLock',
    gate: 'G4',
    consumes: ['measurement', 'assignment'],
    produces: ['teeBadgeLock'],
    note: 'tee↔badge ownership from exact reversed routed testimony; production custody is owned by teeBadgeLockOperation',
    run(board, ctx) {
        const measurement = board.get('measurement');
        const assignment = board.get('assignment');
        const tees = assignment.tees;
        const rawPairs = assignment.scoredPairs.map((pair) => pair.raw);
        executeTeeBadgeLock(board, ctx, measurement, tees, rawPairs);
    }
};
/** Semantic-set operation.  It reads exactly the three declared dotted slots,
 * including while OFF, and writes only `teeBadgeLock`. */
exports.teeBadgeLockOperation = {
    spec: {
        id: 'teeBadgeLock',
        kind: 'decide',
        gate: 'G4',
        unit: 'teeBadgeLock',
        consumes: ['measurement', 'assignment.tees', 'assignment.rawPairs'],
        produces: ['teeBadgeLock'],
        calculations: ['fn.lockTeeBadgePairsFromReversedRoutes'],
        features: ['teeBadgeLock', 'scoring'],
        note: 'maximum-weight independent tee↔badge matching over exact reversed routed testimony; no basket evidence is read'
    },
    run(board, ctx) {
        const measurement = board.get('measurement');
        const tees = board.get('assignment.tees');
        const rawPairs = board.get('assignment.rawPairs');
        // Reads above are intentionally unconditional: the gateway receipt can
        // prove OFF custody rather than hiding a missing dependency.
        executeTeeBadgeLock(board, ctx, measurement, tees, rawPairs);
    },
    calculationBindings: [
        { address: 'fn.lockTeeBadgePairsFromReversedRoutes', calculate: executeTeeBadgeLock }
    ],
    extractArtifacts: measurementTable
};
//# sourceMappingURL=g4.teeBadgeLock.js.map