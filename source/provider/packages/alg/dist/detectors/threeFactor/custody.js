"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CHAIN_OF_CUSTODY_SCHEMA = void 0;
exports.buildChainOfCustody = buildChainOfCustody;
exports.findTeeCustody = findTeeCustody;
/**
 * Chain-of-custody is observability, not detector behavior.
 *
 * Evidence is never re-scored here and no selection can change. This module
 * only joins already-retained TeeEvidence, sealed trace testimony, and the
 * final assignment decision into one inspectable record keyed by the opaque
 * tee detId that downstream code already uses.
 */
exports.CHAIN_OF_CUSTODY_SCHEMA = 'chainspot-chain-of-custody@1';
function fixed(value) {
    return Number.isInteger(value) ? String(value) : value.toFixed(2);
}
function bboxRef(bbox) {
    return `bbox:${bbox.map(fixed).join(',')}`;
}
function ringRef(tee) {
    return tee.ring ? `ring:${tee.ring.bbox.map(fixed).join(',')}` : null;
}
/**
 * Current G4 recovery retains the accepted recovery result id only in the
 * provenance note (`teeRecovery support fit <id>:`). Parse it solely to join
 * historical trace testimony, and report the representation gap loudly.
 * Once RecoveryProvenance grows a structured source ref, this compatibility
 * seam can disappear without changing the custody schema.
 */
function legacyRecoveryResultRef(tee) {
    if (tee.tier !== 'recovered' || !tee.recovery)
        return null;
    const match = /teeRecovery support fit ([^:]+):/.exec(tee.recovery.note);
    return match?.[1] ?? null;
}
function originKind(tee) {
    if (tee.tier === 'recovered')
        return 'recovered';
    if (tee.tier === 'ring')
        return 'visible-ring';
    return 'visible-component';
}
function retainedEvidenceRefs(tee) {
    const refs = [`tee:${tee.detId}`, bboxRef(tee.bbox)];
    const ring = ringRef(tee);
    if (ring)
        refs.push(ring);
    if (tee.pad)
        refs.push(`bright-component:${tee.pad.componentLabel}`);
    const recoveryRef = legacyRecoveryResultRef(tee);
    if (recoveryRef)
        refs.push(`tee-recovery-result:${recoveryRef}`);
    return refs;
}
function custodyGaps(tee) {
    const gaps = [];
    if (tee.tier === 'component' && !tee.pad) {
        gaps.push('visible component-tier TeeEvidence no longer retains the source bright-component label; bbox/center/area/fill survive but component identity is UNKNOWN');
    }
    if (tee.tier === 'recovered') {
        if (legacyRecoveryResultRef(tee)) {
            gaps.push('recovery result identity survives only inside RecoveryProvenance.note; custody correlated the trace through the legacy note format rather than a structured source ref');
        }
        else {
            gaps.push('recovered TeeEvidence has no structured recovery-result ref and its provenance note does not expose one; recovery trace correlation is UNKNOWN');
        }
    }
    return gaps;
}
function teeSummary(tee) {
    const center = `center=(${fixed(tee.xPx)},${fixed(tee.yPx)})`;
    if (tee.tier === 'recovered') {
        const resultRef = legacyRecoveryResultRef(tee) ?? 'UNKNOWN';
        return `${tee.detId}: recovered tee ${center} ${bboxRef(tee.bbox)} via ${tee.recovery?.source ?? 'UNKNOWN'}; recoveryResult=${resultRef}`;
    }
    if (tee.pad) {
        return `${tee.detId}: visible ${tee.tier} tee ${center} ${bboxRef(tee.bbox)}; brightComponent=${tee.pad.componentLabel}`;
    }
    return `${tee.detId}: visible ${tee.tier} tee ${center} ${bboxRef(tee.bbox)}; sourceComponent=UNKNOWN`;
}
function physicalSnapshot(tee) {
    const ring = tee.ring
        ? {
            bbox: [...tee.ring.bbox],
            area: tee.ring.area,
            elongation: tee.ring.elongation,
            ringFrac: tee.ring.ringFrac
        }
        : undefined;
    return {
        tier: tee.tier,
        centerXPx: tee.xPx,
        centerYPx: tee.yPx,
        bbox: [...tee.bbox],
        angleRad: tee.angleRad,
        area: tee.area,
        fill: tee.fill,
        onRing: tee.onRing,
        ...(ring ? { ring } : {}),
        ...(tee.pad ? { pad: tee.pad } : {}),
        ...(tee.recovery ? { recovery: { ...tee.recovery } } : {})
    };
}
function drawableMatchesRef(drawable, ref) {
    if (drawable.ref === ref || drawable.ref?.startsWith(`${ref}:`))
        return true;
    if (drawable.metadata?.targetRef === ref)
        return true;
    return false;
}
function traceRefs(tee) {
    const refs = [tee.detId];
    const recoveryRef = legacyRecoveryResultRef(tee);
    if (recoveryRef)
        refs.push(recoveryRef);
    return refs;
}
function traceEvents(tee, trace) {
    if (!trace)
        return [];
    const refs = traceRefs(tee);
    const events = [];
    for (const [unitIndex, unit] of trace.units.entries()) {
        for (const [drawableIndex, drawable] of unit.drawables.entries()) {
            if (!refs.some((ref) => drawableMatchesRef(drawable, ref)))
                continue;
            events.push({
                kind: 'trace',
                sequence: unitIndex * 1_000_000 + drawableIndex,
                unitId: unit.id,
                gate: unit.gate,
                featureIds: [...unit.featureIds],
                verdict: drawable.verdict,
                drawableType: drawable.type,
                ...(drawable.ref ? { ref: drawable.ref } : {}),
                ...(drawable.visualRole ? { visualRole: drawable.visualRole } : {}),
                ...(drawable.reason ? { reason: drawable.reason } : {}),
                ...(drawable.values ? { values: { ...drawable.values } } : {}),
                ...(drawable.metadata ? { metadata: { ...drawable.metadata } } : {})
            });
        }
    }
    return events;
}
function finalAssignmentProducer(trace) {
    if (!trace)
        return 'UNKNOWN';
    const zfit = [...trace.units].reverse().find((unit) => unit.id === 'zfit');
    if (zfit?.enabled)
        return 'zfit';
    return trace.units.some((unit) => unit.id === 'assignment') ? 'assignment' : 'UNKNOWN';
}
function assignmentEvent(assignment, tee, trace, sequence) {
    const selected = assignment.assignments.find((row) => row.teeId === tee.detId);
    if (!selected)
        return null;
    const badge = assignment.measurement.badges.find((candidate) => candidate.detId === selected.badgeId);
    return {
        kind: 'assignment',
        sequence,
        producerUnit: finalAssignmentProducer(trace),
        hole: badge?.label ?? null,
        badgeId: selected.badgeId,
        basketId: selected.basketId,
        score: selected.score,
        rank: selected.rank,
        ownership: selected.ownership,
        alternatives: selected.alternatives.map((alternative) => ({ ...alternative }))
    };
}
/**
 * Build the first structural custody ledger from one completed detector run.
 * The function is deliberately pure and deterministic; callers can rebuild it
 * from persisted assignment + trace without rerunning CV.
 */
function buildChainOfCustody(assignment, trace) {
    const tees = [...assignment.tees]
        .sort((a, b) => a.detId.localeCompare(b.detId))
        .map((tee) => {
        const events = traceEvents(tee, trace);
        const assigned = assignmentEvent(assignment, tee, trace, Number.MAX_SAFE_INTEGER);
        if (assigned)
            events.push(assigned);
        return {
            teeId: tee.detId,
            originKind: originKind(tee),
            summary: teeSummary(tee),
            evidenceRefs: retainedEvidenceRefs(tee),
            gaps: custodyGaps(tee),
            physical: physicalSnapshot(tee),
            events
        };
    });
    return {
        schema: exports.CHAIN_OF_CUSTODY_SCHEMA,
        ...(trace?.runId ? { runId: trace.runId } : {}),
        ...(trace?.imageId ? { imageId: trace.imageId } : {}),
        ...(trace?.paramsHash ? { paramsHash: trace.paramsHash } : {}),
        ...(trace?.traceHash ? { traceHash: trace.traceHash } : {}),
        traceAvailable: Boolean(trace),
        tees
    };
}
function findTeeCustody(ledger, teeId) {
    return ledger.tees.find((record) => record.teeId === teeId);
}
//# sourceMappingURL=custody.js.map