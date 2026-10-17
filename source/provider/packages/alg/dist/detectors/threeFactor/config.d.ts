import { type EngineUnit, type GateId, type ResolvedFeature } from './features/types';
export declare const CONFIG_SCHEMA = "threeFactor-config@1";
export interface ThreeFactorConfig {
    readonly schema: typeof CONFIG_SCHEMA;
    readonly name: string;
    readonly note?: string;
    /** full unit execution order; omitted = inherit the default order */
    readonly execution?: readonly string[];
    /** gate -> featureId -> deviation */
    readonly gates?: Readonly<Partial<Record<GateId, Record<string, {
        enabled?: boolean;
        knobs?: Record<string, unknown>;
    }>>>>;
}
export interface ResolvedConfig {
    readonly name: string;
    readonly execution: readonly string[];
    /** featureId -> fully resolved state (defaults merged with deviations) */
    readonly features: Readonly<Record<string, ResolvedFeature>>;
}
/** Validate raw parsed JSON into a ThreeFactorConfig. Throws with named errors. */
export declare function parseConfig(raw: unknown): ThreeFactorConfig;
/**
 * Validate an execution order against unit declarations: every id known, no
 * duplicates, every consumed slot produced by an EARLIER unit (a slot listed
 * in both consumes and produces of one unit is a refinement and needs an
 * earlier producer). Externally provided slots seed the walk.
 */
export declare function validateExecution(execution: readonly string[], units: readonly EngineUnit[], seeded: readonly string[]): void;
/** Merge registry defaults with the config's deviations. */
export declare function resolveConfig(config: ThreeFactorConfig, defaultExecution: readonly string[]): ResolvedConfig;
