/**
 * Canonical digit-mask normalization for all NuThing P2 digit experiments.
 *
 * Every real, synthetic, or augmented digit sample goes through THIS module
 * so competing feature/classifier experiments consume byte-identical
 * representations. Do not fork or re-implement the normalization elsewhere.
 *
 * A digit sample is a binary mask tightly cropped to the digit's bounding
 * box. Normalization scales it into a DIGIT_W x DIGIT_H grid preserving
 * aspect (nearest-neighbor), centered with equal margins.
 */
export declare const DIGIT_W = 24;
export declare const DIGIT_H = 32;
/** Row-major DIGIT_W x DIGIT_H binary mask (0/1 per byte). */
export type NormalizedDigit = Uint8Array;
export declare function normalizeDigitMask(mask: Uint8Array | number[], width: number, height: number): NormalizedDigit;
/** Serialize a normalized digit as base64 (one byte per pixel, 0/1). */
export declare function digitToBase64(digit: NormalizedDigit): string;
export declare function digitFromBase64(b64: string): NormalizedDigit;
