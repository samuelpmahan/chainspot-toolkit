export declare const zfitFeature: {
    id: string;
    gate: "G7";
    kind: "deviation";
    defaultEnabled: false;
    note: string;
    knobs: {
        topK: {
            default: number;
            note: string;
            validate: (value: unknown) => "topK must be a positive integer" | null;
        };
        alignedWorstCeiling: {
            default: number;
            note: string;
            validate: (value: unknown) => "alignedWorstCeiling must be in [0, 1]" | null;
        };
        distanceStartOffset: {
            default: number;
            note: string;
        };
        distanceStepPx: {
            default: number;
            note: string;
        };
        maxChordFraction: {
            default: number;
            note: string;
        };
        maxAdditionalDistance: {
            default: number;
            note: string;
        };
        bendAngles: {
            default: number[];
            note: string;
        };
        bendLengthShort: {
            default: number;
            note: string;
        };
        bendLengthMedium: {
            default: number;
            note: string;
        };
        bendLengthLong: {
            default: number;
            note: string;
        };
        maxPathOvershootFraction: {
            default: number;
            note: string;
        };
        bendFactorWithSegment: {
            default: number;
            note: string;
        };
        bendFactorWithoutSegment: {
            default: number;
            note: string;
        };
        scoreMultiplier: {
            default: number;
            note: string;
        };
    };
};
