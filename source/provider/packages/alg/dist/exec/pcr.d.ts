import type { CompiledExecutionPlan } from './compile';
import type { OperationSpec, TickTestimony } from './contract';
export interface PcrSpec {
    readonly id: string;
    readonly title: string;
    readonly tickIds: readonly string[];
}
export interface PcrTickCheckpoint {
    readonly operation: OperationSpec;
    readonly testimony: TickTestimony;
}
/**
 * Storybook-facing composition of already-executed Tick testimony.  PCR has
 * deliberately no run() method: the production gateway is the only execution
 * authority and hands this function the receipts it already produced.
 */
export interface Pcr {
    readonly schema: 'chainspot-pcr@1';
    readonly id: string;
    readonly title: string;
    readonly planFingerprint: string;
    readonly paramsHash: string | null;
    readonly runResultId: string;
    /** Explicitly bounded: opaque PxC values are not silently claimed as content-frozen. */
    readonly runResultIdentityScope: 'tick-testimony-and-materializations';
    readonly runResultIdentityLimitation: 'opaque PxC output values require an emitted Materialization';
    readonly ticks: readonly PcrTickCheckpoint[];
}
export declare function composePcr(spec: PcrSpec, plan: CompiledExecutionPlan, testimony: readonly TickTestimony[]): Pcr;
/** View identity is a pure projection of a frozen PCR; it cannot execute CV. */
export declare function pcrRenderId(pcr: Pcr, viewArgs: Readonly<Record<string, unknown>>): string;
