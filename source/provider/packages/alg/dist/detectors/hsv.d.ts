export interface Hsv {
    readonly h: number;
    readonly s: number;
    readonly v: number;
}
export declare function rgbToHsv(r: number, g: number, b: number): Hsv;
