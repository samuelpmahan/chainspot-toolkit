import type { ABFeatureOperation } from '../../../exec/feature-set';
import { OcclusionDetector } from '../occlusion';
import type { StraightTestTrace } from './st.straightTest.contract';
export type GateId = 'G1' | 'G2' | 'G3' | 'G4' | 'G5' | 'G6' | 'G7' | 'shared';
export declare const CANONICAL_GATE_ORDER: readonly ["G1", "G2", "G3", "G4", "G5", "G6", "G7"];
/**
 * Owner's phase model (2026-08-28): G4 is Recovery (Tee + Basket) and carries
 * the endpoints-complete contract — after the G4 phase, every endpoint the run
 * will ever have is on the board (visible G3 tees plus recovered ones; phantom
 * completion stays a default-OFF deviation). G5 Straight Test has two parts:
 * part 1 is straight evidence (support field, raw pairs, measurement), part 2
 * is assignment/completion of straight holes — delivered by the G6-owned
 * assignment operations, which the `--through G5` cutoff therefore schedules.
 * G6 is the bent-pathfinding + refinement phase (anything left has one or more
 * bends); its terminal refinement is Z-fit, which stays in the G7 slot as the
 * terminal operation rather than being folded into g6-set — the least invasive
 * encoding, because set membership, imports, and ownership tests stay intact
 * while the `--through G6` cutoff folds the terminal slot into the phase.
 */
export declare const GATE_TITLES: Record<GateId, string>;
/**
 * Mapping to the LAB registry cards (scripts/chainspot-lab/gates.ts, ids
 * 0-7). LAB 0 (Crop + Stitch) is pre-detector and has no engine gate.
 */
export declare const LAB_GATE_MAPPING: Record<number, GateId | 'pre-detector'>;
export interface KnobSpec<T> {
    readonly default: T;
    readonly note?: string;
    /** returns an error string, or null when valid — makeParameters' style */
    readonly validate?: (value: T) => string | null;
}
export type KnobSpecs = Record<string, KnobSpec<unknown>>;
export type KnobValues<K extends KnobSpecs> = {
    readonly [P in keyof K]: K[P]['default'];
};
export interface ABFeature<K extends KnobSpecs = KnobSpecs> {
    /** unique across the registry, e.g. 'zfit', 'phantomTee' */
    readonly id: string;
    readonly gate: GateId;
    /** baseline = part of production behavior (default ON); deviation = opt-in */
    readonly kind: 'baseline' | 'deviation';
    readonly defaultEnabled: boolean;
    /**
     * Keep a newly introduced default-OFF experiment out of a pre-existing
     * frozen resolved-config hash unless the saved config names it explicitly.
     * This is intentionally opt-in: older deviations remain materialized in
     * legacy resolved configs exactly as their pinned baseline requires.
     */
    readonly resolveOnlyWhenConfigured?: boolean;
    readonly note?: string;
    readonly knobs: K;
    /** Ordered executable behavior when this feature participates in an ABFeatureSet. */
    readonly operations?: readonly ABFeatureOperation[];
    /**
     * OPTIONAL feature-owned rendering. Absent on every feature by default,
     * so this member cannot move parity and cannot break a feature that
     * never opts in.
     *
     * Why it exists: the LAB renderer registry keys on ArtifactKind (mask,
     * rgba, componentSet, ...). A kind-keyed renderer gets ONE artifact and
     * knows nothing about which feature produced it or why, so it can draw
     * "a mask" but never "the tee candidates this feature rejected, over
     * the bright mask it rejected them on". The feature knows that. This
     * hook lets the feature say it.
     *
     * It is a DESCRIPTION, not a drawing: `draw` returns a FeatureRenderPlan
     * of layers over already-traced drawables. It must not rasterize, must
     * not recompute detector data, and must not reach for pixels — every
     * value in the plan has to come from the UnitTrace/RunTrace it was
     * handed. The kind-keyed path stays the owner of raw bytes.
     */
    readonly render?: FeatureRender;
}
export interface ResolvedFeature {
    readonly enabled: boolean;
    readonly knobs: Record<string, unknown>;
}
export type Verdict = 'accepted' | 'rejected' | 'info';
export interface DrawableBase {
    readonly verdict: Verdict;
    /** mandatory when verdict === 'rejected' */
    readonly reason?: string;
    /** evidence reference (detId etc.) — never pixels */
    readonly ref?: string;
    /** small numeric payload rendered in tooltips */
    readonly values?: Record<string, number>;
    /** Literal producer provenance that is not a measurement (for example,
     * contributor references or an explicit UNKNOWN). Render selectors forward
     * this verbatim and must not synthesize or reinterpret it. */
    readonly metadata?: Readonly<Record<string, string>>;
    /** Presentation intent carried by the detector trace, never inferred from
     * a magic ref string. It cannot change a verdict or semantic cardinality. */
    readonly visualRole?: 'badge-pixels' | 'basket-tip' | 'tee-visible-pixels' | 'tee-border' | 'tee-center' | 'tee-shard' | 'tee-corner-tick' | 'tee-diagonal' | 'tee-rejection' | 'phantom-center' | 'tee-badge-path' | 'tee-badge-abstention' | 'hole-label' | 'badge-glyph-template-verdict';
}
export interface PointDrawable extends DrawableBase {
    readonly type: 'point';
    readonly xPx: number;
    readonly yPx: number;
}
export interface BoxDrawable extends DrawableBase {
    readonly type: 'box';
    readonly bbox: readonly [number, number, number, number];
}
export interface PolylineDrawable extends DrawableBase {
    readonly type: 'polyline';
    readonly path: readonly (readonly [number, number])[];
}
/** Exact raster evidence. Unlike a polyline, a pixel set has no implied
 * connectivity and the renderer must not interpolate between its cells. */
export interface PixelSetDrawable extends DrawableBase {
    readonly type: 'pixelSet';
    readonly pixels: readonly (readonly [number, number])[];
}
/**
 * Heatmaps carry their Float32Array OUT OF BAND (transferable across the
 * worker boundary, zero copy); the drawable holds dims + a key into
 * RunTrace.heatmaps.
 */
export interface HeatmapDrawable extends DrawableBase {
    readonly type: 'heatmap';
    readonly key: string;
    readonly widthCells: number;
    readonly heightCells: number;
    /** cell size in original-image px (field scale) */
    readonly cellPx: number;
    readonly originXPx: number;
    readonly originYPx: number;
}
export type Drawable = PointDrawable | BoxDrawable | PolylineDrawable | PixelSetDrawable | HeatmapDrawable;
export interface MeasurementAggregate {
    readonly name: string;
    count: number;
    min: number;
    max: number;
    sum: number;
}
export interface UnitTrace {
    readonly id: string;
    readonly gate: GateId;
    /** Primary ABFeature whose state supplies this unit's legacy enabled/knob
     * fields. Derived from the compiled operations, never guessed from unit id. */
    readonly featureId?: string;
    /** Every ABFeature read by this unit's compiled operations, in plan order. */
    readonly featureIds: readonly string[];
    readonly enabled: boolean;
    readonly knobs: Record<string, unknown>;
    readonly knobsDeviating: readonly string[];
    ms: number;
    readonly drawables: Drawable[];
    readonly measurements: MeasurementAggregate[];
}
export interface RunTrace {
    readonly configName: string;
    readonly paramsHash: string;
    /** Optional until a front door knows the canonical run/image identity. */
    readonly runId?: string;
    readonly imageId?: string;
    /** Deterministic semantic trace digest. It intentionally excludes timers
     * and heatmap payload bytes so equivalent reviewed testimony hashes alike. */
    readonly traceHash?: string;
    readonly canonicalFrame?: string;
    readonly execution: readonly string[];
    /** Exact feature states used by the run. Unit ids are not feature ids: the
     * `tees` unit, for example, reads the `endpoints` feature's knobs. */
    readonly features: Readonly<Record<string, ResolvedFeature>>;
    readonly units: UnitTrace[];
    /** keyed heatmap buffers; transfer these across postMessage */
    readonly heatmaps: Record<string, Float32Array>;
    /** S0 structured rows; optional so legacy traces remain source-compatible. */
    readonly straightTest?: StraightTestTrace;
}
/** One draw pass over drawables the trace already holds. Style comes from
 * each Drawable's own `verdict` (accepted/rejected/info) — a layer never
 * restates it, so a renderer can never disagree with the trace. */
export interface FeatureRenderLayer {
    readonly name: string;
    /** one line explaining what this layer is evidence OF */
    readonly note?: string;
    readonly drawables: readonly Drawable[];
}
/** What a feature wants drawn for one run. Declarative: the renderer picks
 * the medium (SVG/PNG/text), the feature picks the content. */
export interface FeatureRenderPlan {
    readonly title: string;
    /**
     * Artifact id of the raster this plan reads best over (e.g.
     * 'badgeStage.masks:bright'), for a renderer that can resolve one.
     * A NAME, never bytes — resolving it stays with the kind-keyed path.
     * Omit when the overlay stands on its own.
     */
    readonly base?: string;
    readonly layers: readonly FeatureRenderLayer[];
    /**
     * Receipt lines. Repo rule: every number ships with where it came from,
     * or a loud UNKNOWN. These are printed verbatim next to the image.
     */
    readonly notes: readonly string[];
}
export interface FeatureRender {
    /**
     * Trace unit ids whose UnitTrace this render consumes. Required because
     * a unit id is NOT a feature id: the trace unit that carries g3.endpoints'
     * drawables is called 'tees'. Declaring it here keeps that mapping next
     * to the feature instead of in a lookup table on the LAB side that goes
     * stale silently.
     */
    readonly units: readonly string[];
    /** `unit` is one of `units`; `run` is the whole trace, so cross-gate
     * overlays (a G3 rejection drawn against G2's accepted baskets) are
     * possible without a second pass over the image. */
    draw(unit: UnitTrace, run: RunTrace): FeatureRenderPlan;
}
export interface FeatureContext {
    resolve(feature: ABFeature): ResolvedFeature;
    /** exact aggregates over the full stream (count/min/max/sum) */
    measure(unitId: string, name: string, value: number): void;
    overlay(unitId: string, drawable: Drawable): void;
    heatmap(unitId: string, key: string, data: Float32Array): void;
    /** Publish the reviewed S0 row payload beside normal drawables. Optional
     * keeps custom legacy FeatureContexts source-compatible; production trace
     * contexts always supply it. */
    recordStraightTest?(trace: StraightTestTrace): void;
    /** returns a stop function that records elapsed ms on the unit trace */
    span(unitId: string): () => void;
    /** Stable per-run known-occlusion service. */
    readonly occlusion: OcclusionDetector;
}
/** No-op context: legacy callers pay nothing and change nothing. */
export declare const nullFeatureContext: FeatureContext;
export declare function defaultKnobs(feature: ABFeature): Record<string, unknown>;
export type EvidenceSlot = 'image' | 'localImage' | 'params' | 'viewport' | 'stage' | 'badges' | 'supportField' | 'sprites' | 'baskets' | 'tees' | 'rawPairs' | 'measurement' | 'recoveredTees' | 'straightProposals' | 'straightTestTruthAssistance' | 'assignment' | 'teeBadgeLock' | 'teeBadgeCompass' | 'badgeGlyphTemplate';
export interface EvidenceBoard {
    get<T>(slot: EvidenceSlot): T;
    has(slot: EvidenceSlot): boolean;
    set(slot: EvidenceSlot, value: unknown): void;
}
export interface EngineUnit {
    readonly id: string;
    readonly gate: GateId;
    /** slots that must exist before this unit runs */
    readonly consumes: readonly EvidenceSlot[];
    /** slots this unit writes (a slot in both lists = refinement in place) */
    readonly produces: readonly EvidenceSlot[];
    readonly note?: string;
    run(board: EvidenceBoard, ctx: FeatureContext): void;
}
