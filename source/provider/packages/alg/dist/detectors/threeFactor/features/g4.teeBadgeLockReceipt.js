"use strict";
// Trace-only receipt and render seam for G4 tee↔badge ownership locks.
//
// The teeBadgeLock producer owns all matching, scoring, tiering, path
// sampling, and (CL-6b) badge->basket path tracing. This module deliberately
// does not inspect pixels, re-read baskets itself, rebuild IDs, or derive
// geometry from a path -- it carries the producer's testimony (including its
// drawable `values.traceOutcomeCode`/`traceLengthPx`/`tunneledSegments` and
// the CL-9 plain-sentence `reason`) into a literal CLI receipt and a
// declarative FeatureRender plan.
Object.defineProperty(exports, "__esModule", { value: true });
exports.teeBadgeLockRender = exports.TEE_BADGE_LOCK_RENDER = exports.TEE_BADGE_LOCK_FEATURE_ID = void 0;
exports.buildTeeBadgeLockReceipt = buildTeeBadgeLockReceipt;
exports.TEE_BADGE_LOCK_FEATURE_ID = 'teeBadgeLock';
const UNKNOWN = 'UNKNOWN';
const TEE_BADGE_LOCK_UNIT = exports.TEE_BADGE_LOCK_FEATURE_ID;
const TEE_BADGE_PATH_ROLE = 'tee-badge-path';
function nonEmpty(value) {
    return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}
function runMetadata(run, unitFeatureId) {
    const source = run;
    return {
        runId: nonEmpty(source.runId) ?? UNKNOWN,
        imageId: nonEmpty(source.imageId) ?? UNKNOWN,
        paramsHash: nonEmpty(source.paramsHash) ?? UNKNOWN,
        // A compatibility run-level feature id takes precedence over the unit
        // id.  Do not fall back to this module's constant: UNKNOWN is required
        // when both trace sources omit it.
        featureId: nonEmpty(source.featureId) ?? nonEmpty(unitFeatureId) ?? UNKNOWN,
        traceHash: nonEmpty(source.traceHash) ?? UNKNOWN,
        canonicalFrame: nonEmpty(source.canonicalFrame) ?? UNKNOWN
    };
}
function finite(values, name) {
    const value = values?.[name];
    return typeof value === 'number' && Number.isFinite(value) ? value : UNKNOWN;
}
function valueText(value) {
    return typeof value === 'number' ? String(Number(value.toFixed(6))) : value;
}
function holeText(value) {
    return typeof value === 'number' ? `H${valueText(value)}` : UNKNOWN;
}
function textValue(value) {
    return typeof value === 'string' ? value : UNKNOWN;
}
function isTeeBadgePath(drawable) {
    // The shared Drawable role union predates this feature in some worktrees;
    // keep the local guard narrow until that shared vocabulary is widened.
    return (drawable.type === 'polyline' &&
        drawable.verdict === 'accepted' &&
        drawable.visualRole === TEE_BADGE_PATH_ROLE);
}
function teeBadgePaths(unit) {
    return unit.drawables.filter(isTeeBadgePath);
}
const TEE_BADGE_ABSTENTION_ROLE = 'tee-badge-abstention';
function isTeeBadgeAbstention(drawable) {
    return (drawable.type === 'point' &&
        drawable.visualRole ===
            TEE_BADGE_ABSTENTION_ROLE);
}
function teeBadgeAbstentions(unit) {
    return unit.drawables.filter(isTeeBadgeAbstention);
}
function decodeAbstentionBadgeId(ref) {
    if (typeof ref !== 'string')
        return UNKNOWN;
    const prefix = 'teeBadgeLockAbstention:';
    if (!ref.startsWith(prefix))
        return UNKNOWN;
    try {
        const badgeId = decodeURIComponent(ref.slice(prefix.length));
        return badgeId || UNKNOWN;
    }
    catch {
        return UNKNOWN;
    }
}
function abstentionKindFor(code) {
    if (code === 0)
        return 'orphan';
    if (code === 1)
        return 'conflict';
    return UNKNOWN;
}
function abstentionRowFor(drawable) {
    return {
        badgeId: decodeAbstentionBadgeId(drawable.ref),
        hole: finite(drawable.values, 'hole'),
        kind: abstentionKindFor(finite(drawable.values, 'kindCode')),
        bestTeeId: UNKNOWN, // pathless: the tee id lives only in the human reason string
        bestScore: finite(drawable.values, 'bestScore'),
        winningHole: finite(drawable.values, 'winningHole'),
        winningScore: finite(drawable.values, 'winningScore'),
        verdict: drawable.verdict,
        reason: typeof drawable.reason === 'string' ? drawable.reason : UNKNOWN
    };
}
/**
 * Decode only the exact canonical form emitted by the producer.  In
 * particular, a malformed percent escape, an unescaped colon, a non-canonical
 * escape, or an empty ID is not repaired or guessed.
 */
function decodeLockRef(ref) {
    if (typeof ref !== 'string')
        return undefined;
    const prefix = `${exports.TEE_BADGE_LOCK_FEATURE_ID}:`;
    if (!ref.startsWith(prefix))
        return undefined;
    const encoded = ref.slice(prefix.length).split(':');
    if (encoded.length !== 2 || encoded.some((part) => part.length === 0))
        return undefined;
    try {
        const badgeId = decodeURIComponent(encoded[0]);
        const teeId = decodeURIComponent(encoded[1]);
        if (!badgeId || !teeId)
            return undefined;
        // Exact producer format: accepting a differently escaped spelling would
        // make the visual ref and receipt identity disagree.
        if (encodeURIComponent(badgeId) !== encoded[0] || encodeURIComponent(teeId) !== encoded[1]) {
            return undefined;
        }
        return { badgeId, teeId };
    }
    catch {
        return undefined;
    }
}
function lockId(drawable) {
    return textValue(drawable.ref);
}
function tierFor(code) {
    if (code === 0)
        return 'visible';
    if (code === 1)
        return 'recovered';
    return UNKNOWN;
}
function traceOutcomeText(code) {
    if (code === 0)
        return 'basket';
    if (code === 1)
        return 'unknown';
    return UNKNOWN;
}
function axisSourceFor(code) {
    if (code === 0)
        return 'tee.pad.minAreaPose.angleRad';
    if (code === 1)
        return 'TeeEvidence.angleRad';
    if (code === 2)
        return 'TeeEvidence.pad.angleRad';
    // Code 3 is producer testimony for an unknown source, not a source name.
    return UNKNOWN;
}
function rowFor(drawable) {
    const ref = lockId(drawable);
    const decoded = decodeLockRef(drawable.ref);
    const tierCode = finite(drawable.values, 'tierCode');
    const axisSourceCode = finite(drawable.values, 'axisSourceCode');
    return {
        lockId: ref,
        hole: finite(drawable.values, 'hole'),
        badgeId: decoded?.badgeId ?? UNKNOWN,
        teeId: decoded?.teeId ?? UNKNOWN,
        tier: tierFor(tierCode),
        tierCode,
        score: finite(drawable.values, 'score'),
        weakAligned: finite(drawable.values, 'weakAligned'),
        efficiency: finite(drawable.values, 'efficiency'),
        axisErrorDeg: finite(drawable.values, 'axisErrorDeg'),
        axisSource: axisSourceFor(axisSourceCode),
        axisSourceCode,
        margin: finite(drawable.values, 'margin'),
        pathPoints: finite(drawable.values, 'pathPoints'),
        recovered: finite(drawable.values, 'recovered'),
        rayDegraded: finite(drawable.values, 'rayDegraded'),
        sigmaUsedDeg: finite(drawable.values, 'sigmaUsedDeg'),
        wideningDeg: finite(drawable.values, 'wideningDeg'),
        traceOutcomeCode: finite(drawable.values, 'traceOutcomeCode'),
        traceLengthPx: finite(drawable.values, 'traceLengthPx'),
        tunneledSegments: finite(drawable.values, 'tunneledSegments'),
        bendCount: finite(drawable.values, 'bendCount'),
        verdict: drawable.verdict,
        reason: typeof drawable.reason === 'string' ? drawable.reason : UNKNOWN
    };
}
function measurementValue(unit, name) {
    const matches = (unit.measurements ?? []).filter((measurement) => measurement.name === name);
    if (matches.length !== 1)
        return UNKNOWN;
    const value = matches[0].sum;
    return typeof value === 'number' && Number.isFinite(value) ? value : UNKNOWN;
}
function countsFor(unit) {
    return {
        candidates: measurementValue(unit, 'candidates'),
        locks: measurementValue(unit, 'locks'),
        visibleLocks: measurementValue(unit, 'visibleLocks'),
        recoveredLocks: measurementValue(unit, 'recoveredLocks'),
        unmatchedBadges: measurementValue(unit, 'unmatchedBadges'),
        unusedTees: measurementValue(unit, 'unusedTees'),
        basketsFollowed: measurementValue(unit, 'basketsFollowed'),
        basketsUnknown: measurementValue(unit, 'basketsUnknown')
    };
}
function duplicateRefs(refs) {
    const counts = new Map();
    for (const ref of refs)
        counts.set(ref, (counts.get(ref) ?? 0) + 1);
    return [...counts]
        .filter(([, count]) => count > 1)
        .map(([ref]) => ref)
        .sort();
}
function correspondence(traceDrawables, rows, visualDrawables) {
    const refsFor = (drawables) => drawables.map((drawable) => lockId(drawable));
    const traceLockRefs = refsFor(traceDrawables);
    const cliLockRefs = rows.map((row) => row.lockId);
    const visualLockRefs = refsFor(visualDrawables);
    const duplicateCliRefs = duplicateRefs(cliLockRefs);
    const duplicateVisualRefs = duplicateRefs(visualLockRefs);
    const cliUnique = [...new Set(cliLockRefs)];
    const visualUnique = [...new Set(visualLockRefs)];
    const missingVisualRefs = cliUnique.filter((ref) => !visualUnique.includes(ref));
    const orphanVisualRefs = visualUnique.filter((ref) => !cliUnique.includes(ref));
    const malformedRefs = traceDrawables
        .map((drawable) => lockId(drawable))
        .filter((ref) => ref === UNKNOWN || !decodeLockRef(ref));
    return {
        traceLockRefs,
        cliLockRefs,
        visualLockRefs,
        duplicateCliRefs,
        duplicateVisualRefs,
        missingVisualRefs,
        orphanVisualRefs,
        malformedRefs: [...new Set(malformedRefs)],
        matched: traceLockRefs.length === cliLockRefs.length &&
            cliLockRefs.length === visualLockRefs.length &&
            duplicateCliRefs.length === 0 &&
            duplicateVisualRefs.length === 0 &&
            missingVisualRefs.length === 0 &&
            orphanVisualRefs.length === 0 &&
            traceLockRefs.every((ref, index) => ref === cliLockRefs[index] && ref === visualLockRefs[index])
    };
}
function abstentionCliRows(abstentions) {
    if (abstentions.length === 0)
        return [];
    const lines = [
        '',
        'TEE→BADGE ABSTENTIONS (all-Hn: every unmatched badge named, never silent)',
        'hole | badgeId | kind | bestScore | winningHole | winningScore | verdict | reason'
    ];
    for (const row of abstentions) {
        lines.push([
            holeText(row.hole),
            row.badgeId,
            row.kind,
            valueText(row.bestScore),
            holeText(row.winningHole),
            valueText(row.winningScore),
            row.verdict,
            row.reason
        ].join(' | '));
    }
    return lines;
}
function cliRows(metadata, counts, rows) {
    const header = 'lockId | hole | badgeId | teeId | tier | score | weakAligned | efficiency | axisErrorDeg | axisSource | sigmaUsedDeg | wideningDeg | rayDegraded | margin | pathPoints | traceOutcome | traceLengthPx | tunneledSegments | bendCount | verdict | reason';
    const lines = [
        'TEE→BADGE LOCK',
        `runId=${metadata.runId}`,
        `imageId=${metadata.imageId}`,
        `paramsHash=${metadata.paramsHash}`,
        `featureId=${metadata.featureId}`,
        `traceHash=${metadata.traceHash}`,
        `frame=${metadata.canonicalFrame}`,
        // CL-6b: baskets are read as footprint-arrival testimony for the
        // badge->basket tracer whenever it ran (basketsFollowed+basketsUnknown
        // > 0); stage A's tee<->badge lock itself still reads zero basket
        // evidence either way.
        `basketEvidenceRead=${(typeof counts.basketsFollowed === 'number' ? counts.basketsFollowed : 0) + (typeof counts.basketsUnknown === 'number' ? counts.basketsUnknown : 0) > 0 ? 1 : 0}`,
        `candidates=${valueText(counts.candidates)}`,
        `locks=${valueText(counts.locks)}`,
        `visibleLocks=${valueText(counts.visibleLocks)}`,
        `recoveredLocks=${valueText(counts.recoveredLocks)}`,
        `unmatchedBadges=${valueText(counts.unmatchedBadges)}`,
        `unusedTees=${valueText(counts.unusedTees)}`,
        `basketsFollowed=${valueText(counts.basketsFollowed)}`,
        `basketsUnknown=${valueText(counts.basketsUnknown)}`,
        header
    ];
    for (const row of rows) {
        lines.push([
            row.lockId,
            holeText(row.hole),
            row.badgeId,
            row.teeId,
            row.tier,
            valueText(row.score),
            valueText(row.weakAligned),
            valueText(row.efficiency),
            valueText(row.axisErrorDeg),
            row.axisSource,
            valueText(row.sigmaUsedDeg),
            valueText(row.wideningDeg),
            valueText(row.rayDegraded),
            valueText(row.margin),
            valueText(row.pathPoints),
            traceOutcomeText(row.traceOutcomeCode),
            valueText(row.traceLengthPx),
            valueText(row.tunneledSegments),
            valueText(row.bendCount),
            row.verdict,
            row.reason
        ].join(' | '));
    }
    return lines;
}
function planFor(unit, run, acceptedPaths, cliText) {
    return {
        title: `G4 Tee→Badge ownership lock (${run.configName})`,
        base: 'badgeStage.masks.bright',
        layers: [
            {
                name: 'Tee→Badge ownership locks (thin blue)',
                note: '#00a2ff thin-blue layer: exact producer-emitted routed testimony (stage A tee<->badge lock); paths are forwarded unchanged; stage B (CL-6b) reads basket footprints only as path-termination testimony, never as a routing target',
                drawables: acceptedPaths
            }
        ],
        notes: [
            `feature: ${exports.TEE_BADGE_LOCK_FEATURE_ID} -- ${unit.gate}, trace unit '${unit.id}'`,
            'presentation style is applied by Terra shared Sweep integration; this feature declares no paint or geometry policy.',
            'exact path contract: each accepted teeBadgePath is forwarded in producer order; no reverse, refit, smoothing, regeneration, or pixel read occurs here.',
            ...cliText.split('\n')
        ]
    };
}
/** Build the CLI/visual receipt pair from one teeBadgeLock UnitTrace. */
function buildTeeBadgeLockReceipt(unit, run) {
    const acceptedPaths = teeBadgePaths(unit);
    const rows = acceptedPaths.map(rowFor);
    const abstentionRows = teeBadgeAbstentions(unit).map(abstentionRowFor);
    const counts = countsFor(unit);
    const metadata = runMetadata(run, unit.featureId);
    const cliText = [
        ...cliRows(metadata, counts, rows),
        ...abstentionCliRows(abstentionRows)
    ].join('\n');
    const plan = planFor(unit, run, acceptedPaths, cliText);
    const matched = correspondence(acceptedPaths, rows, acceptedPaths);
    return { plan, rows, abstentionRows, counts, cliText, correspondence: matched };
}
/** FeatureRender seam: one exact forwarded layer over the bright-mask base. */
exports.TEE_BADGE_LOCK_RENDER = {
    units: [TEE_BADGE_LOCK_UNIT],
    draw(unit, run) {
        return buildTeeBadgeLockReceipt(unit, run).plan;
    }
};
exports.teeBadgeLockRender = exports.TEE_BADGE_LOCK_RENDER;
//# sourceMappingURL=g4.teeBadgeLockReceipt.js.map