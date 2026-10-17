import type { BadgeEvidence, BasketEvidence, TeeEvidence, OrientedQuad } from '../types';
import { type ComponentStats } from '../components';
import type { Mask } from '../raster';
import type { SpriteMatch } from '../endpoints';
import type { EngineUnit } from './types';
import type { OpaqueDetector } from '../occlusion';
export interface RecoveryFit {
    readonly centerXPx: number;
    readonly centerYPx: number;
    readonly halfWidthPx: number;
    readonly halfHeightPx: number;
    readonly angleRad: number;
    /** Width of the observed course-local support band.  This is derived from
     * the intact pads' area, not from a renderer/template constant. */
    readonly supportThicknessPx?: number;
}
export interface TeeRecoveryCandidate {
    readonly id: string;
    /** Badge-constrained feasibility fit used only for the recovery predicate. */
    readonly fit: RecoveryFit;
    /** Independent localization testimony used for corners/center when one
     * detector-owned component spans both course-local pad axes. */
    readonly localizationFit?: RecoveryFit;
    readonly localizationSource?: 'support-fit' | 'full-span-component-pca';
    /** Bright pixels belonging to the surviving shard, in candidate coordinates. */
    readonly fragmentPixels: readonly (readonly [number, number])[];
    readonly supportingComponentIds: readonly string[];
    /** Candidate points are local to the cropped viewport unless explicitly original. */
    readonly coordinateFrame?: 'local' | 'original';
    /** Vertical offset used when candidate coordinates are viewport-local. */
    readonly viewportTopPx?: number;
    /** Badge ray used for the hard C1S angular constraint. */
    readonly teeToBadgeAngleRad?: number;
    readonly badgeAxisAngleRad?: number;
    readonly badgeId?: string;
    readonly badgeLabel?: string | null;
    readonly seedSource?: string;
    readonly bfsComponentsVisited?: number;
    /** Total unowned, non-occluded bright components considered for this
     * candidate's target badge (the whole canonical raster; no spatial
     * prefilter). Carried on the candidate so the receipt can honestly state
     * the searched scope next to the accept/reject verdict. */
    readonly consideredComponentsGlobal?: number;
    /** Set when this exact component set also satisfies the strict predicate
     * for another missing badge that wins the axis-error tiebreak. Forces
     * rejection here so a genuine ambiguity is never silently resolved by
     * loop order -- the winner's badge label is named so the trade-off is
     * visible. */
    readonly ambiguityLostToBadgeLabel?: string | null;
}
export interface TeeRecoveryValues {
    readonly supportingPixels: number;
    readonly supportingComponents: number;
    readonly badgeAxisAlignment?: number;
    readonly coordinateFrame: 'original-image';
    readonly badgeAxisErrorRad?: number;
    readonly unexplainedVisiblePixels?: number;
    readonly supportFitCenterXPx?: number;
    readonly supportFitCenterYPx?: number;
    readonly localizedCenterXPx?: number;
    readonly localizedCenterYPx?: number;
    readonly fullSpanComponentLocalization?: number;
}
export interface TeeRecoveryResult {
    readonly id: string;
    readonly verdict: 'accepted' | 'rejected';
    readonly reason: string;
    readonly values: TeeRecoveryValues;
    readonly corners: OrientedQuad;
}
export declare const teeRecoveryFeature: {
    id: string;
    gate: "G4";
    kind: "baseline";
    defaultEnabled: true;
    note: string;
    render: import("./types").FeatureRender;
    knobs: {
        axisToleranceDeg: {
            default: number;
            note: string;
            validate: (value: unknown) => "axisToleranceDeg must be a finite number between 0.5 and 90" | null;
        };
    };
};
/** Set per run from the resolved teeRecovery knobs (single-threaded engine;
 * the unit run installs this before any candidate is built or judged). */
export declare function setActiveAxisToleranceDeg(deg: number): void;
interface RecoveryStage {
    readonly brightLabels: Int32Array;
    readonly brightComponents: readonly ComponentStats[];
    readonly brightMask: Mask;
    readonly width: number;
    readonly height: number;
}
/** The recovery producer is deliberately assignment anchored.  These are
 * structural views so callers can pass the normal assignment object without
 * coupling this deviation to the assignment implementation. */
export interface TeeRecoveryAssignmentContext {
    readonly assignments: readonly {
        readonly badgeId: string;
        readonly basketId: string;
    }[];
}
export interface TeeRecoverySearchContext {
    readonly assignment?: TeeRecoveryAssignmentContext;
    readonly sprites?: readonly SpriteMatch[];
    /** The run-scoped service is queried only for exact OPAQUE sprite pixels.
     * ALPHA and UNKNOWN never remove white evidence. */
    readonly occlusion?: OpaqueDetector;
}
/** One badge's best-fit candidate plus the runners-up considered for it,
 * kept so a candidate-less or ambiguous target still prints exactly what was
 * searched instead of vanishing silently. */
interface TargetSearchOutcome {
    readonly badgeId: string;
    readonly badgeLabel: string | null;
    readonly consideredComponents: number;
    readonly winner?: TeeRecoveryCandidate;
    /** Every other component group considered for this badge, most-supported
     * first. Not capped here -- the receipt caller caps what it prints. */
    readonly runnerUps: readonly TeeRecoveryCandidate[];
}
/** Records that a component was NOT dropped whole but had K of its pixels
 * subtracted as a known screen-chrome occluder, so the exclusion is always
 * receipt-visible ("no silent cuts"). */
interface ChromeSubtractionNote {
    readonly componentLabel: number;
    readonly subtractedPixels: number;
    readonly remainingPixels: number;
    readonly regionCount: number;
}
/**
 * DESIGN NOTE, designed-but-deferred (owner request 2026-08-28): C1S/C2D
 * range-circle dash subtraction.
 *
 * Every basket renders a solid C1S ring (10m real radius) and a dashed C2D
 * ring (20m real radius) around its tip. Each dash is a small bright
 * component lying on a common circle, and their fragments can satisfy the
 * hollow-tee-support predicate the same way a screen-chrome glyph can. The
 * z-order is NOT fixed: NorthPark's T16 pad renders ON TOP of its C2D (the
 * pad is the non-occluded case -- see targetPredecessors' forensic note and
 * the classification table in the final report), while DashsTrack's T5 pad
 * renders UNDER its C2D (the genuinely occluded case). Either way, the fix
 * must be PIXEL subtraction, never whole-component removal: dropping any
 * component that touches a range-circle dash would eat a merged pad.
 *
 * Shape of the fix (not yet implemented -- flagged for a follow-up lane):
 * 1. Per course, per basket, collect small bright components near the
 *    basket tip within a generous radius (course-observed span, same
 *    provenance discipline as this file's fitted geometry -- never an
 *    absolute pixel literal).
 * 2. Fit a circle (least-squares) to those components' centroids; a good
 *    fit (low residual, count consistent with a dashed/solid ring) yields a
 *    MEASURED radius in pixels for that specific course and basket. Never
 *    assume a radius -- it is zoom-dependent and must come from the fit.
 * 3. Subtract only the pixels within one raster-tolerance band of that
 *    fitted circle from every component, mirroring the screen-chrome
 *    pattern above (component keeps its remnant).
 * 4. Bonus measurement (record only, do not gate anything on it): the
 *    C1S/C2D fitted pixel radii imply a per-course metersPerPixel figure
 *    from their known real-world radii (10m/20m) -- this is the
 *    course-derived ruler the owner wants to eventually replace absolute-
 *    pixel literals elsewhere (see the footgun inventory in the final
 *    report). Emit it once the circle fit lands; not emitted by this lane.
 */
/**
 * Owner policy 2026-08-28: discovery has NO spatial prefilter of any kind --
 * no predecessor-basket radius, no anchor, no course-derived distribution
 * box. "A recoverable tee touches basket N-1" was a baked-in worldview that
 * missed courses whose layout does not chain that way (see the forensic
 * history on targetPredecessors above). Every unowned, non-occluded bright
 * component on the whole canonical raster is a candidate for every missing
 * numbered badge; the strict acceptance predicate (every visible pixel
 * explained, support >= MIN_SHARD_SUPPORT_PIXELS, axis gate) is the only
 * filter, and it is unchanged. The predicate's own center-intersection bound
 * in fitComponent already rejects an oversized/impossible component almost
 * immediately, so this stays cheap despite visiting every component.
 */
export declare function buildTeeRecoveryCandidates(stage: RecoveryStage, badges: readonly BadgeEvidence[], baskets: readonly BasketEvidence[], tees: readonly TeeEvidence[], viewportTopPx?: number, search?: TeeRecoverySearchContext): {
    readonly candidates: readonly TeeRecoveryCandidate[];
    readonly searchOutcomes: readonly TargetSearchOutcome[];
    readonly chromeSubtractionNotes: readonly ChromeSubtractionNote[];
};
export declare const teeRecoveryUnit: EngineUnit;
export {};
