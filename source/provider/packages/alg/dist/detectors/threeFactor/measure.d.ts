import type { ComponentStats } from './components';
import { runBadgeStage, type BadgeStageKnobs } from './badgeStage';
import { type EndpointsKnobs, type SpriteMatch, type TeeRing } from './endpoints';
import { type DigitsKnobs } from './digits/segment';
import { type HsvKnobs } from './raster';
import { type ScoringKnobs } from './scoring';
import type { BadgeAbstentionReason, BadgeEvidence, RgbaImage, TeeEvidence, ThreeFactorMeasurement, ThreeFactorParams } from './types';
import { type EngineUnit, type EvidenceBoard, type FeatureContext } from './features/types';
/** Minimal evidence board: named slots with fail-loud reads. */
export declare function createBoard(): EvidenceBoard;
/**
 * Fix contract C2/C4/C5 (docs/seven-whys/g1-badge-digit-garbage.md):
 * classify one badge's raw digit reading into a final label plus a named
 * abstention reason, WITHOUT deciding collisions yet (that needs every
 * badge's classification first — see the caller).
 */
export declare function classifyReading(rawLabel: string, digitCount: number, confidence: number, candidates: {
    label: number;
    confidence: number;
}[], floor: number, ambiguityMargin: number): {
    label: string | null;
    bestLabel: string | null;
    abstentionReason: BadgeAbstentionReason | null;
};
/**
 * Fix contract C5 (docs/seven-whys/g1-badge-digit-garbage.md): restore
 * `badgeGlyphBatchIsComplete`'s uniqueness property
 * (`old-stuff/badgeGlyphClassifier.ts:420-426`) — two or more badges landing
 * on the same in-vocabulary label is a CONFLICT, receipt-visible on every
 * party named, never silent. Resolution keeps the higher-confidence claimant
 * (deterministic tie-break: lower `index`) and marks the rest UNREAD
 * 'collision', but records `conflictWith` on BOTH the winner and the
 * loser(s) so a resolved collision is still visible in the receipt.
 * Set-completion (picking a label by elimination) is explicitly NOT used
 * here — see the forensics doc's C5 warning: this function only ever
 * REMOVES a duplicate label, it never assigns one.
 *
 * Pure function over the minimal shape needed, independent of BadgeReading /
 * BadgeEvidence, so the collision rule itself is unit-testable in isolation.
 */
export declare function resolveBadgeCollisions(entries: readonly {
    detId: string;
    index: number;
    label: string | null;
    confidence: number;
}[]): Map<string, {
    label: string | null;
    abstentionReason: 'collision' | null;
    conflictWith: string[];
}>;
/**
 * Truth-free badge detection with digit reading, as a standalone public seam
 * for LAB tooling (digit-derived hole viewports in `lab scope`). Runs ONLY
 * the G1 badge stage plus digit reading — no baskets, tees, support field,
 * or assignment — so it stays fast enough for interactive scoping.
 * Coordinates leave in the supplied image's frame shifted by `yOffsetPx`,
 * exactly like the engine's `badges` unit output.
 */
export declare function detectBadges(image: RgbaImage, yOffsetPx?: number, digitsKnobs?: DigitsKnobs, badgeStageKnobs?: BadgeStageKnobs, hsvKnobs?: HsvKnobs): BadgeEvidence[];
/**
 * Exclude ring/component tee candidates that fall inside a badge bbox or a
 * screen-chrome cluster, then merge + sort + assign detIds. Extracted from
 * makeTees's tail (moved verbatim, not rewritten) so the exec layer's
 * tees.exclusion operation (packages/alg/src/exec/operations.ts) can run
 * the exact same exclusion + assembly pass over independently-produced raw
 * ring/component candidate sets, without duplicating this logic. Callers
 * own producing `rawRings` (e.g. detectTeeRings) and `rawComponents`
 * (bright components with badge-labeled ones already dropped) — see
 * makeTees below for the canonical, single-call-site composition.
 */
export declare function excludeAndAssembleTees(stage: Pick<ReturnType<typeof runBadgeStage>, 'brightComponents' | 'width' | 'height' | 'badges'>, rawRings: readonly TeeRing[], rawComponents: readonly ComponentStats[], sprites: readonly SpriteMatch[], yOffsetPx: number, ctx?: FeatureContext, knobs?: ScoringKnobs, endpointsKnobs?: EndpointsKnobs, badgeStageKnobs?: BadgeStageKnobs): TeeEvidence[];
export declare const measureUnits: readonly EngineUnit[];
export declare const DEFAULT_MEASURE_EXECUTION: readonly string[];
/** Seed the evidence board exactly as the monolithic entry point did. */
export declare function seedBoard(board: EvidenceBoard, image: RgbaImage, params?: ThreeFactorParams): void;
export declare function measureThreeFactor(image: RgbaImage, params?: ThreeFactorParams): ThreeFactorMeasurement;
