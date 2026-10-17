/**
 * Three-factor infrastructure owned by the shared composition boundary.
 *
 * This registry is deliberately metadata-only. `OcclusionDetector` is already
 * constructed once per detector run by the engine and is exposed through
 * `FeatureContext`; registering its descriptor here must not create another
 * detector, feature, or engine unit.
 */
export declare const THREE_FACTOR_SHARED_SERVICES: readonly [{
    readonly id: "occlusion";
    readonly kind: "run-scoped-infrastructure";
    readonly scope: "run";
    readonly note: "Known opaque/alpha footprint seam shared by three-factor stages.";
}];
export type ThreeFactorSharedServiceId = (typeof THREE_FACTOR_SHARED_SERVICES)[number]['id'];
