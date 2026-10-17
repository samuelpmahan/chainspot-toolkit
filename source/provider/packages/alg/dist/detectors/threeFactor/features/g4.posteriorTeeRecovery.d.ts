/**
 * Experimental posterior tee-recovery reconciliation.
 *
 * It consumes the frozen G4 recovery + teeBadgeLock testimony, reopens only
 * the conflict island, and ranks material shard hypotheses against NULL.
 *
 * A selected hypothesis is then written down as a REAL recovered tee, not as a
 * sidecar opinion: a recovered tee is as valid as a visible one, it is just
 * recorded differently. That means a wrong pick shows up on the endpoint image
 * where a human sees it, instead of hiding in a table nobody renders.
 * It rewrites `assignment` with those exact tee-to-badge decisions while
 * leaving basket selection to the existing pair evidence.
 *
 * "Posterior" here means normalized model weight, not a calibrated real-
 * world probability. The receipt exposes every likelihood term and model
 * provenance so the number cannot masquerade as unexplained certainty.
 */
import type { ABFeatureOperation } from '../../../exec/feature-set';
import type { RecoveredTeeInput } from '../types';
export interface PosteriorEvidenceModel {
    readonly median: number;
    readonly scale: number;
    readonly sampleCount: number;
    readonly provenance: string;
}
export interface PosteriorTeeCandidate {
    readonly kind: 'candidate';
    readonly id: string;
    readonly badgeId: string;
    readonly hole: string | null;
    readonly componentLabels: readonly number[];
    readonly centerXPx: number;
    readonly centerYPx: number;
    readonly supportPixels: number;
    readonly unexplainedPixels: number;
    readonly distancePx: number;
    readonly axisErrorDeg: number | null;
    readonly logTerms: {
        readonly support: number;
        readonly distance: number;
        readonly axis: number;
        readonly contradictions: number;
        readonly multiplicityAndPrior: number;
    };
    readonly logWeightVsNull: number;
    posteriorWithinTarget?: number;
}
export interface PosteriorNullCandidate {
    readonly kind: 'null';
    readonly id: 'NULL';
    readonly badgeId: string;
    readonly hole: string | null;
    readonly componentLabels: readonly [];
    readonly logWeightVsNull: 0;
    posteriorWithinTarget?: number;
}
export type PosteriorTeeHypothesis = PosteriorTeeCandidate | PosteriorNullCandidate;
export interface PosteriorJointHypothesis {
    readonly posterior: number;
    readonly logWeight: number;
    readonly selections: readonly PosteriorTeeHypothesis[];
}
export interface PosteriorPhantomProposal {
    readonly badgeId: string;
    readonly hole: number;
    readonly xPx: number;
    readonly yPx: number;
    readonly provenance: RecoveredTeeInput['provenance'];
}
export interface PosteriorTeeRecoveryEvidence {
    readonly schema: 'posterior-tee-recovery@1';
    readonly enabled: boolean;
    readonly status: 'disabled' | 'no-conflicts' | 'resolved' | 'abstained-too-large';
    readonly evidenceModels: {
        readonly distance: PosteriorEvidenceModel;
        readonly axis: PosteriorEvidenceModel;
    };
    readonly targetBadgeIds: readonly string[];
    readonly targets: readonly {
        readonly badgeId: string;
        readonly hole: string | null;
        readonly consideredComponents: number;
        readonly topHypotheses: readonly PosteriorTeeHypothesis[];
    }[];
    readonly jointTop: readonly PosteriorJointHypothesis[];
    readonly phantomProposals: readonly PosteriorPhantomProposal[];
    readonly completions: {
        readonly unaffectedLocks: number;
        readonly observable: number;
        readonly phantom: number;
        readonly unresolvedNulls: number;
        readonly total: number;
    };
}
export declare const posteriorTeeRecoveryOperation: ABFeatureOperation;
export declare const posteriorTeeRecoveryFeature: {
    id: string;
    gate: "G4";
    kind: "deviation";
    defaultEnabled: false;
    resolveOnlyWhenConfigured: true;
    note: string;
    render: import("./types").FeatureRender;
    knobs: {
        observableToNullPriorOdds: {
            default: number;
            note: string;
            validate: (value: unknown) => "observableToNullPriorOdds must be > 0" | null;
        };
        topKPerTarget: {
            default: number;
            note: string;
            validate: (value: unknown) => "topKPerTarget must be an integer in [1,32]" | null;
        };
        maxConflictTargets: {
            default: number;
            note: string;
            validate: (value: unknown) => "maxConflictTargets must be an integer in [1,6]" | null;
        };
        supportLogWeight: {
            default: number;
            note: string;
            validate: (value: unknown) => "supportLogWeight must be >= 0" | null;
        };
        distanceTailWeight: {
            default: number;
            note: string;
            validate: (value: unknown) => "distanceTailWeight must be >= 0" | null;
        };
        axisWeight: {
            default: number;
            note: string;
            validate: (value: unknown) => "axisWeight must be >= 0" | null;
        };
        distanceScaleFloorPx: {
            default: number;
            note: string;
            validate: (value: unknown) => "distanceScaleFloorPx must be > 0" | null;
        };
        axisScaleFloorDeg: {
            default: number;
            note: string;
            validate: (value: unknown) => "axisScaleFloorDeg must be > 0" | null;
        };
        contradictionOddsPerPixel: {
            default: number;
            note: string;
            validate: (value: unknown) => "contradictionOddsPerPixel must be in (0,1]" | null;
        };
    };
    operations: ABFeatureOperation[];
};
