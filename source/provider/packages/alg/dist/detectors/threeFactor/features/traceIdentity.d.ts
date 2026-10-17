import type { RunTrace } from './types';
export interface TraceIdentityInput {
    readonly runId: string;
    readonly imageId: string;
}
/** The exact stable payload hashed for trace↔CLI↔Visual correspondence. */
export declare function semanticTracePayload(trace: RunTrace, identity: TraceIdentityInput): object;
export declare function makeTraceRunId(imageId: string, paramsHash: string, planFingerprint: string): string;
/** Return a trace with immutable correspondence identity attached. */
export declare function sealTrace(trace: RunTrace, identity: TraceIdentityInput): RunTrace;
