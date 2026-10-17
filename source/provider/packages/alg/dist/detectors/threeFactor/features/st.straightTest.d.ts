import type { EngineUnit } from './types';
import { type StraightTestCandidateInput, type StraightTestMeasurements, type StraightTestProposal, type StraightTestTruthAssistance } from './st.straightTest.contract';
export declare const straightTestFeature: {
    id: string;
    gate: "G5";
    kind: "deviation";
    defaultEnabled: false;
    resolveOnlyWhenConfigured: true;
    note: string;
    knobs: {
        truthAssisted: {
            default: boolean;
            note: string;
            validate: (value: unknown) => "truthAssisted must be a boolean" | null;
        };
    };
};
export declare function measureStraightGeometry(candidate: StraightTestCandidateInput): StraightTestMeasurements;
export declare function evaluateStraightTestCandidate(candidate: StraightTestCandidateInput, assistance: StraightTestTruthAssistance, candidateCount?: number): StraightTestProposal;
export declare const straightTestUnit: EngineUnit;
