import type { AssignmentEvidence, RecoveredTeeInput, ThreeFactorMeasurement } from '../types';
import type { EngineUnit } from './types';
export declare const phantomTeeFeature: {
    id: string;
    gate: "G4";
    kind: "deviation";
    defaultEnabled: false;
    note: string;
    render: import("./types").FeatureRender;
    knobs: {
        minViableScore: {
            default: number;
            note: string;
            validate: (value: unknown) => "minViableScore must be a number" | null;
        };
        maxCompletions: {
            default: number;
            note: string;
            validate: (value: unknown) => "maxCompletions must be a positive integer" | null;
        };
    };
};
/** Pure core, exported for tests: which phantom tees would be synthesized. */
export declare function synthesizePhantomTees(measurement: ThreeFactorMeasurement, assignments: readonly AssignmentEvidence[], minViableScore: number, maxCompletions?: number): RecoveredTeeInput[];
export declare const phantomTeeUnit: EngineUnit;
