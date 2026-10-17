export declare const g1DigitsFeature: {
    id: string;
    gate: "G1";
    kind: "baseline";
    defaultEnabled: true;
    note: string;
    knobs: {
        minComponentArea: {
            default: number;
            note: string;
        };
        heightRatioMin: {
            default: number;
            note: string;
        };
        wideRatio: {
            default: number;
            note: string;
        };
        valleySearchLo: {
            default: number;
            note: string;
        };
        valleySearchHi: {
            default: number;
            note: string;
        };
        digitW: {
            default: number;
            note: string;
            validate: (value: unknown) => string | null;
        };
        digitH: {
            default: number;
            note: string;
            validate: (value: unknown) => string | null;
        };
        confidenceFloorDivisor: {
            default: number;
            note: string;
        };
        labelAmbiguityMargin: {
            default: number;
            note: string;
        };
    };
};
