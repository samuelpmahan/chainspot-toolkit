/** Browser-only inference subset of LAB's deterministic digit classifier. */
export interface LogisticModel {
    readonly classes: readonly string[];
    readonly W: readonly (readonly number[])[];
    readonly b: readonly number[];
    readonly lambda: number;
    readonly iters: number;
}
/** One 10x768 matrix multiply followed by softmax. */
export declare function predictProbs(model: LogisticModel, features: ArrayLike<number>): number[];
