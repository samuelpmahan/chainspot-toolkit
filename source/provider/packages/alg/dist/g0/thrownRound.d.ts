/** Purple is not expected on a clean course capture — see purpleMass.ts. */
export declare const THROWN_ROUND_PURPLE_MASS_MIN = 0;
export interface ThrownRoundCandidate {
    readonly index: number;
    readonly score: number;
}
export type ThrownRoundDecision = {
    readonly status: 'waiting';
} | {
    readonly status: 'none';
} | {
    readonly status: 'auto';
    readonly index: number;
    readonly score: number;
} | {
    readonly status: 'ambiguous';
    readonly candidates: readonly ThrownRoundCandidate[];
};
/**
 * `scores[i]` is image i's purple-mass confidence, or `undefined` when that
 * image's measurement hasn't finished yet (mirrors the page's
 * `purpleReady` gate — any undefined score means the whole decision waits,
 * matching `images.some((image) => !purpleReady[...])`).
 */
export declare function decideThrownRound(scores: readonly (number | undefined)[], threshold?: number): ThrownRoundDecision;
