export declare const g3EndpointsFeature: {
    id: string;
    gate: "G3";
    kind: "baseline";
    defaultEnabled: true;
    note: string;
    knobs: {
        holeAreaMin: {
            default: number;
            note: string;
        };
        holeAreaMax: {
            default: number;
            note: string;
        };
        holeDimMax: {
            default: number;
            note: string;
        };
        ringBand: {
            default: number;
            note: string;
            validate: (value: unknown) => "ringBand must be a non-negative integer" | null;
        };
        ringFracMin: {
            default: number;
            note: string;
        };
        dilationRadii: {
            default: number[];
            note: string;
        };
        largeRadiiThreshold: {
            default: number;
            note: string;
        };
        largeRadiiAreaMin: {
            default: number;
            note: string;
        };
        ringMergeProximity: {
            default: number;
            note: string;
        };
        elongationThreshold: {
            default: number;
            note: string;
        };
        componentMinDim: {
            default: number;
            note: string;
        };
        componentMaxDim: {
            default: number;
            note: string;
        };
        componentMinArea: {
            default: number;
            note: string;
        };
        componentMaxArea: {
            default: number;
            note: string;
        };
        componentMinFill: {
            default: number;
            note: string;
        };
        componentMaxFill: {
            default: number;
            note: string;
        };
        teeRingDedupDistance: {
            default: number;
            note: string;
        };
        teeSpriteExclusionDistance: {
            default: number;
            note: string;
        };
    };
};
