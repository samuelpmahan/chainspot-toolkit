import type { FeatureRender, FeatureRenderPlan, RunTrace, UnitTrace } from './types';
export declare const POSTERIOR_TEE_RECOVERY_FEATURE_ID: "posteriorTeeRecovery";
export declare function buildPosteriorTeeRecoveryPlan(unit: UnitTrace, run: RunTrace): FeatureRenderPlan;
/** FeatureRender seam: the producer's own drawables, forwarded unchanged. */
export declare const POSTERIOR_TEE_RECOVERY_RENDER: FeatureRender;
