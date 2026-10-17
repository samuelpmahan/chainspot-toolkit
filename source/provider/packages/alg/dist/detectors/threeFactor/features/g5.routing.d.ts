export declare const g5RoutingFeature: {
    id: string;
    gate: "G5";
    kind: "baseline";
    defaultEnabled: true;
    note: string;
    knobs: {
        quantum: {
            default: number;
            note: string;
            validate: (value: unknown) => "quantum must be a positive finite number" | null;
        };
        ring: {
            default: number;
            note: string;
            validate: (value: unknown) => "ring must be a positive integer" | null;
        };
        seedCostClamp: {
            default: number;
            note: string;
        };
        seedClampRadiusCells: {
            default: number;
            note: string;
        };
        corridorWidthPx: {
            default: number;
            note: string;
        };
        orientations: {
            default: number;
            note: string;
        };
        widthsSrc: {
            default: number[];
            note: string;
        };
        alignmentPower: {
            default: number;
            note: string;
        };
        worstWindowSrcPx: {
            default: number;
            note: string;
        };
    };
};
