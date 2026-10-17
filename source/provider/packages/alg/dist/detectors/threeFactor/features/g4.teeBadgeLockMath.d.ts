/**
 * Pure tee↔badge ownership math for the G4 teeBadgeLock deviation.
 *
 * The path named `RawPairEvidence.teeLeg` is legacy pathfinder testimony in
 * badge→tee order.  This feature deliberately treats it as opaque testimony,
 * reads no basket-side property, and reverses the exact sampled points once
 * at the public seam.  Everything below operates on that tee→badge sequence;
 * it never interpolates, smooths, or refits a route.
 */
export type TeeBadgePoint = readonly [number, number];
export type TeeBadgePath = readonly TeeBadgePoint[];
/** The deliberately narrow adapter input.  Do not widen this to the whole
 * RawPairEvidence shape: basket geometry and legacy score fields are outside
 * this feature's evidence custody. */
export interface TeeBadgePathInput {
    readonly badgeId: string;
    readonly teeId: string;
    readonly teeLeg: {
        readonly path: TeeBadgePath;
    };
}
/** Alias used by callers that want the raw-row name to remain explicit. */
export type TeeBadgeLockRawPairRow = TeeBadgePathInput;
export interface TeeBadgePathCandidate {
    readonly badgeId: string;
    readonly teeId: string;
    readonly teeBadgePath: TeeBadgePath;
    /** Detector coordinates are optional on the pure path shape.  The
     * production scorer supplies them from measurement.badges/tees; direct
     * isolated math tests fall back to route endpoints. */
    readonly teeXPx?: number;
    readonly teeYPx?: number;
    readonly badgeXPx?: number;
    readonly badgeYPx?: number;
}
export interface TeeBadgeLockMathKnobs {
    /** Source provenance: measurement.parameters.alignmentPower. */
    readonly alignmentPower: number;
    /** Source provenance: measurement.parameters.worstWindowSrcPx. */
    readonly worstWindowSrcPx: number;
    /** Source provenance: resolved scoring.minWindowCells. */
    readonly minWindowCells: number;
}
export interface TeeBadgeLockSupportField {
    readonly width: number;
    readonly height: number;
    readonly scale: number;
    readonly support: ArrayLike<number>;
    readonly bestTheta: ArrayLike<number>;
}
export type TeeBadgeAxisSource = 'TeeEvidence.pad.minAreaPose.angleRad' | 'TeeEvidence.angleRad' | 'TeeEvidence.pad.angleRad' | 'UNKNOWN';
/**
 * ---- G3 compass interface (2026-08-29 compass-lane contract, final section) ----
 *
 * The sibling G3 lane publishes per-tee axis evidence and per-image bearing
 * sigma on the board; this feature CONSUMES that shape and never recomputes
 * it. G3's fields are not yet on `TeeEvidence`/`ThreeFactorMeasurement` in
 * this worktree (concurrent build), so the two read* functions below are a
 * typed, structural accessor: they read the exact contract shape off
 * whatever object G3 eventually attaches it to, and degrade to a named
 * UNKNOWN when a field is absent -- never a guess, never a thrown error for
 * a lane still landing its half.
 */
export type CompassAxisQuality = 'good' | 'occluded-partial' | 'poor' | 'none';
export type CompassAxisSource = 'constrained-fit' | 'component-pca-evidence-only' | 'UNKNOWN';
export interface CompassTeeAxis {
    readonly axisRad: number | null;
    readonly axisQuality: CompassAxisQuality;
    readonly axisSource: CompassAxisSource;
    readonly excusedMaskRef: string | 'UNKNOWN';
    readonly centerUncertaintyPx: number | 'UNKNOWN';
}
export interface CompassSigmaProvenance {
    readonly goodFitCount?: number;
    readonly method?: string;
    readonly fallback?: string;
}
export interface CompassImageSigma {
    readonly orientationSigmaDeg: number | 'UNKNOWN';
    readonly sigmaProvenance: CompassSigmaProvenance;
}
/** CL-4's named conservative fallback: applied ONLY when an image publishes
 * no per-image sigma (too few good-quality fits to estimate one). This is
 * the owner-verified real-world compass extreme already on record in the
 * signed 2026-08-28 render-stack contract ("compass median 1.1 degrees,
 * p90 2.65", ratchet-tracked outlier at 11.3) -- a documented sanity anchor
 * pressed into service as a worst-case fallback, not a re-imported tuning
 * constant, and it is never used when a real per-image sigma exists. */
export declare const UNKNOWN_SIGMA_FALLBACK_DEG = 11.3;
export declare const UNKNOWN_SIGMA_FALLBACK_NAME = "UNKNOWN_SIGMA_FALLBACK_DEG=11.3 (owner-verified compass p100 outlier, 2026-08-28 render-stack contract; applied only when this image published no per-image sigma)";
/** Typed, defensive read of one image's G3-published orientation sigma.
 * (The tee-axis counterpart, readTeeAxis, is defined further below next to
 * the legacy TeeBadgeTeeOrder fallback chain it also consults.) */
export declare function readImageSigma(measurement: unknown): CompassImageSigma;
export interface RayScoreResult {
    /** In [0,1]; 1 exactly when `degraded` (the ray casts no vote). */
    readonly rayFactor: number;
    readonly rayErrorDeg: number | 'UNKNOWN';
    /** The effective sigma actually used (image sigma combined with the
     * CL-5 center-uncertainty widening term), in degrees. */
    readonly sigmaUsedDeg: number | 'UNKNOWN';
    readonly sigmaProvenance: string;
    /** atan(centerUncertaintyPx / badgeDistancePx) in degrees (CL-5). */
    readonly wideningDeg: number | 'UNKNOWN';
    /** true when this tee's axis cannot drive a confident ray lock
     * (axisQuality 'poor'/'none', or no accepted fit at all) -- ranking
     * degrades to corroboration-only for this candidate. */
    readonly degraded: boolean;
    readonly degradeReason?: string;
}
/**
 * CL-6a + CL-4 + CL-5: score how well one tee's own compass axis points at
 * one badge. Plain sentence: "the tee's pointing direction should land on
 * the badge, within how much this photo's own fits wobble, widened a
 * little more when the badge sits close (a small center error tilts the
 * ray more at short range)."
 */
export declare function scoreTeeBadgeRay(axis: CompassTeeAxis, imageSigma: CompassImageSigma, bearingRad: number, badgeDistancePx: number): RayScoreResult;
/** CL-6a: route factors (weakAlignedSupport, pathEfficiency) demote to
 * corroboration/tie-break -- they may only nudge a candidate's rank within
 * floating-point precision of the ray term, never override it. */
export declare const ROUTE_TIE_BREAK_EPSILON = 0.000001;
export interface TeeBadgeLockScoredCandidate extends TeeBadgePathCandidate {
    readonly score: number;
    readonly weakAlignedSupport: number;
    readonly pathEfficiency: number;
    readonly axisErrorDeg: number | 'UNKNOWN';
    readonly axisFactor: number;
    readonly axisSource: TeeBadgeAxisSource;
    readonly windowCells: number;
    readonly routedLengthPx: number;
    readonly chordPx: number;
    readonly runnerUpMargin: number | null;
    /** CL-6a ray audit (CL-9: winners print this). Present whenever a tee
     * axis was consulted; absent only for isolated legacy callers that never
     * supplied axis/sigma context. */
    readonly ray?: RayScoreResult;
    /** true when this candidate's rank came from corroboration alone because
     * the tee's axis quality could not drive a confident ray lock. */
    readonly rayDegraded?: boolean;
}
export interface TeeBadgeBadgeOrder {
    readonly detId: string;
    readonly label?: string | null;
    readonly cxPx?: number;
    readonly cyPx?: number;
}
export interface TeeBadgeTeeOrder {
    readonly detId: string;
    readonly tier?: string;
    readonly xPx?: number;
    readonly yPx?: number;
    readonly angleRad?: number | null;
    readonly pad?: {
        readonly angleRad?: number | null;
        readonly minAreaPose?: {
            readonly angleRad?: number | null;
        };
    };
}
export interface TeeBadgeLockResult {
    readonly candidates: readonly TeeBadgeLockScoredCandidate[];
    readonly locks: readonly TeeBadgeLockScoredCandidate[];
    readonly unmatchedBadgeIds: readonly string[];
    readonly unusedTeeIds: readonly string[];
}
export interface TeeBadgeLockEvidenceLock extends TeeBadgeLockScoredCandidate {
    readonly tier: 'visible' | 'recovered';
    readonly hole?: number;
    /** CL-6b: stage B's badge->basket trace outcome for this lock's badge,
     * when one was run (e.g. the caller had a support field and basket
     * footprints available). Absent, never a guessed value, when stage B
     * did not run for this lock. */
    readonly basketTrace?: BadgeBasketTraceOutcome;
}
/**
 * All-Hn resolver completion: every badge the max-weight match left
 * unmatched gets one of these two named dispositions, never silence.
 *
 *  - 'orphan':   this badge had zero candidate testimony (no ray reached it
 *                at all) -- there was nothing for the matcher to contest.
 *  - 'conflict': this badge had candidate testimony, but its best-scoring
 *                tee was awarded to a different badge's stronger claim (or
 *                every candidate tee it reached was awarded elsewhere).
 */
export type TeeBadgeLockAbstentionKind = 'orphan' | 'conflict';
export interface TeeBadgeLockAbstention {
    readonly badgeId: string;
    readonly hole?: number;
    readonly kind: TeeBadgeLockAbstentionKind;
    /** The best candidate this badge reached, when it reached any. */
    readonly bestTeeId?: string;
    readonly bestScore?: number;
    /** Populated only for 'conflict': the badge that won the contested tee. */
    readonly winningBadgeId?: string;
    readonly winningHole?: number;
    readonly winningScore?: number;
    /** One human sentence per C5 -- never a machine-only code. */
    readonly reason: string;
}
export interface TeeBadgeLockEvidence extends TeeBadgeLockResult {
    readonly coordinateFrame: 'canonical-raster';
    /** CL-6b: baskets ARE read now, but ONLY as arrival-footprint testimony
     * for the badge->basket tracer below -- never as a routing target, never
     * enumerated as candidates, never a "nearest basket" shortcut. Stage A's
     * tee->badge lock itself still reads zero basket evidence. */
    readonly basketEvidenceRead: boolean;
    readonly corridorWidthPx: number | 'UNKNOWN';
    readonly corridorWidthPxProvenance: string;
    readonly locks: readonly TeeBadgeLockEvidenceLock[];
    /** Every unmatched badge, named with an orphan/conflict disposition.
     * length === unmatchedBadgeIds.length, always -- see buildTeeBadgeLockEvidence. */
    readonly abstentions: readonly TeeBadgeLockAbstention[];
}
export interface TraceOccluder {
    readonly id: string;
    readonly bbox: readonly [number, number, number, number];
}
export interface TraceBasketTarget {
    readonly basketId: string;
    readonly bbox: readonly [number, number, number, number];
}
export interface TunneledSegment {
    readonly overId: string;
    readonly lengthPx: number;
}
export interface BadgeBasketTraceInput {
    readonly badgeId: string;
    readonly startPx: TeeBadgePoint;
    /** Initial heading, away from the tee side (continuing the tee->badge
     * chord's own bearing beyond the badge). */
    readonly headingRad: number;
    readonly field: TeeBadgeLockSupportField;
    readonly viewportTopPx?: number;
    /** On/off-path support threshold -- course-derived
     * (measurement.parameters.supportTau), never an imported literal. */
    readonly supportTau: number;
    /** Course-derived step/tunnel scale (measurement.parameters.corridorWidthPx). */
    readonly corridorWidthPx: number;
    /** The claimed badge's own footprint: still being inside it is not an
     * off-path gap -- the trace is still leaving the badge glyph itself. */
    readonly startBadgeBbox: readonly [number, number, number, number];
    /** Other stack members (other badges/baskets/chrome) eligible for
     * tunneling: pixels under them are excused from the petered-out judgment
     * (S5), for up to that member's OWN measured footprint plus a
     * half-corridor margin -- never a fixed pixel literal. */
    readonly occluders: readonly TraceOccluder[];
    /** Termination targets, tested by footprint membership only -- never used
     * to route toward, rank, or select a "nearest" candidate. */
    readonly baskets: readonly TraceBasketTarget[];
    /** Loop-safety cap only (e.g. the image diagonal) -- not a tuning knob. */
    readonly maxTraceLengthPx: number;
}
export type BadgeBasketTraceOutcome = {
    readonly outcome: 'basket';
    readonly basketId: string;
    readonly points: TeeBadgePath;
    readonly lengthPx: number;
    readonly tunneledSegments: readonly TunneledSegment[];
    /** 2026-08-29 gate-reorg note: 0 means the path ran straight to the
     * basket (the new G5's mechanism family); >0 counts distinct
     * contiguous turning phases (the new G6's mechanism family) so that
     * split is visible in the evidence even before units are re-homed. */
    readonly bendCount: number;
} | {
    readonly outcome: 'unknown';
    readonly reason: 'petered-out' | 'ambiguous-fork' | 'ran-off-image' | 'exceeded-max-length';
    readonly points: TeeBadgePath;
    readonly lengthPx: number;
    readonly bendCount: number;
    readonly tunneledSegments: readonly TunneledSegment[];
};
export declare function traceBadgeToBasket(input: BadgeBasketTraceInput): BadgeBasketTraceOutcome;
/**
 * Extract only the pathfinder testimony allowed by the feature contract.
 * Duplicate rows for one badge×tee pair are accepted only when every sampled
 * point is exactly identical; a divergent duplicate is a hard error.
 */
export declare function collapseTeeBadgePaths(rows: readonly TeeBadgePathInput[]): TeeBadgePathCandidate[];
/** Public adapter alias required by the acceptance seam. */
export declare const extractTeeBadgePaths: typeof collapseTeeBadgePaths;
export interface ScoreTeeBadgePathInput {
    readonly candidate: TeeBadgePathCandidate;
    readonly field: TeeBadgeLockSupportField;
    readonly teeAxisRad?: number | null;
    readonly teeAxisSource?: TeeBadgeAxisSource;
    /** CL-6a/CL-4/CL-5: the G3-published compass axis for this tee. When
     * omitted, derived from teeAxisRad/teeAxisSource (legacy compatibility;
     * treated as axisQuality 'good'/'component-pca-evidence-only'). */
    readonly compassAxis?: CompassTeeAxis;
    /** CL-4: this image's own per-image bearing sigma. Omitted -> the named
     * UNKNOWN_SIGMA_FALLBACK_DEG conservative fallback applies. */
    readonly imageSigma?: CompassImageSigma;
    readonly teePoint?: TeeBadgePoint;
    readonly badgePoint?: TeeBadgePoint;
    readonly viewportTopPx?: number;
    readonly knobs: TeeBadgeLockMathKnobs;
}
/** Score one exact tee→badge testimony path. */
export declare function scoreTeeBadgePath(input: ScoreTeeBadgePathInput): TeeBadgeLockScoredCandidate;
/**
 * CL-6a/CL-4/CL-5 compass accessor over a G4-visible tee order row: prefers
 * G3's own published axisRad/axisQuality/axisSource/centerUncertaintyPx
 * (detected by the presence of `axisQuality` or `excusedMaskRef`, fields the
 * legacy TeeBadgeTeeOrder shape never had) and falls back to the pre-existing
 * angle chain (minAreaPose -> angleRad -> pad.angleRad), read as
 * axisQuality='good'/axisSource='component-pca-evidence-only', when G3 has
 * not (yet) published its own fields on this tee.
 */
export declare function readTeeAxis(tee: unknown): CompassTeeAxis;
export interface ScoreTeeBadgeCandidatesOptions {
    readonly candidates: readonly TeeBadgePathCandidate[];
    readonly field: TeeBadgeLockSupportField;
    readonly tees?: readonly TeeBadgeTeeOrder[];
    readonly badges?: readonly TeeBadgeBadgeOrder[];
    readonly viewportTopPx?: number;
    readonly knobs: TeeBadgeLockMathKnobs;
    /** CL-4: this image's own per-image bearing sigma, shared by every
     * candidate scored in this call. Omitted -> UNKNOWN_SIGMA_FALLBACK_DEG. */
    readonly imageSigma?: CompassImageSigma;
}
/** Score all collapsed candidates, enriching exact detector endpoint geometry
 * only where the caller supplied it.  Both object and positional forms are
 * accepted to keep this pure helper convenient for fixture-level callers. */
export declare function scoreTeeBadgeCandidates(...args: unknown[]): TeeBadgeLockScoredCandidate[];
/**
 * Exact maximum-weight one-to-one matching.  There is intentionally no score
 * threshold: zero and negative selected candidates remain observable.  A
 * candidate's runner-up is the best other real tee testimony for that badge,
 * whether or not that tee wins another badge.
 */
export declare function maximumWeightTeeBadgeMatching(candidates: readonly TeeBadgeLockScoredCandidate[], metadata?: {
    readonly badges?: readonly TeeBadgeBadgeOrder[];
    readonly tees?: readonly TeeBadgeTeeOrder[];
}): TeeBadgeLockResult;
/** Public alias required by the acceptance seam. */
export declare const selectTeeBadgeLocks: typeof maximumWeightTeeBadgeMatching;
export interface BuildTeeBadgeLockEvidenceOptions {
    readonly badges?: readonly TeeBadgeBadgeOrder[];
    readonly tees?: readonly TeeBadgeTeeOrder[];
    readonly measurement?: {
        readonly parameters?: {
            readonly corridorWidthPx?: number;
        };
    };
    readonly corridorWidthPx?: number;
    /** CL-6b: stage B's per-badge trace outcomes, keyed by badgeId. Every
     * locked badge with an entry here gets its trace attached to its lock
     * row; a locked badge with no entry simply carries no basketTrace
     * (stage B was not run for it), never a fabricated one. */
    readonly basketTraces?: ReadonlyMap<string, BadgeBasketTraceOutcome>;
}
/** Add the semantic, provenance-bearing envelope consumed by the operation
 * and by the LAB receipt.  Badge holes are copied only from exact labels. */
export declare function buildTeeBadgeLockEvidence(selected: TeeBadgeLockResult, options?: BuildTeeBadgeLockEvidenceOptions): TeeBadgeLockEvidence;
