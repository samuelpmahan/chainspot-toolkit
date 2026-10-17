import type { EngineUnit } from './types';
export declare const teeMinAreaPoseFeature: {
    id: string;
    gate: "G3";
    kind: "deviation";
    defaultEnabled: false;
    resolveOnlyWhenConfigured: true;
    note: string;
    render: import("./types").FeatureRender;
    knobs: {};
};
/** Refinement only: membership, recovery, assignment, and baseline fields are
 * immutable. The exact component alone owns the optional presentation pose. */
export declare const teeMinAreaPoseUnit: EngineUnit;
