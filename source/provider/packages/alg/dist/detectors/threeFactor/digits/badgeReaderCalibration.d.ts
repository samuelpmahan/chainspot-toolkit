/**
 * Learned abstention for the badge readers (Sam, 2026-10-21: "There's no good reason for something a perceptron did
 * 75 years ago to not be automatic"). Per reader, P(a label is right | its features) = sigmoid(bias + priorShift +
 * sum weights_j * features_j), fitted offline by the toolkit's scripts/badge-calibration.mjs on out-of-course dev
 * scores and vendored as assets/badge-reader-calibration.json. A reader reads when P >= pStar, one number for every
 * reader from a stated cost (the asset's `rule`). The provider never trains at run time.
 *
 * The feature functions below are the only definition of the features; the fitting script calls them too.
 *   binary, coverage: [score of the label, its margin over the best other label]
 *   digitBW:          [lowest digit Dice of the label, lowest digit margin to its runner-up once every better digit of
 *                      its cell is removed (never negative), layout margin (the label's layout minus the other layout)]
 *   perDigit:         [geometric mean of the label's digit posteriors, its normalized posterior minus the best other]
 * `others` is the vocabulary the label competes in: all of 1..HOLE_LABEL_MAX for a read, fewer for a hard negative
 * (the true label removed) or for the per-image assignment (the labels still free).
 */
export type BadgeReaderName = 'binary' | 'digitBW' | 'coverage' | 'perDigit';
/** Read iff P >= READER_P_STAR. */
export declare const READER_P_STAR: number;
export declare function readerProbability(reader: BadgeReaderName, features: readonly number[]): number;
/** binary / coverage: [score, score minus the best other label of `others`]. */
export declare function templateLabelFeatures(scoreOf: (label: number) => number, label: number, others: readonly number[]): number[];
/** Best Dice per digit 0..9 in each cell of the one-cell and two-cell layouts (badgeDigitScoreTable). */
export interface DigitScoreTable {
    readonly one: readonly (readonly number[])[] | null;
    readonly two: readonly (readonly number[])[] | null;
}
/**
 * digitBW: the features the digit reader would report if it read `label`. The reader reads each cell's best digit, so a
 * label whose digit is not its cell's best is read only when every better digit in that cell is absent: those digits
 * are removed, and the label's digit is then the cell's best. Per cell its Dice and its margin to ITS runner-up among
 * the digits left (the best digit scoring at most as much); the layout margin is the label's layout mean against the
 * other layout's mean best. For the reader's own read nothing is removed and these are exactly what
 * classifyBadgeDigits reports. A hard negative (the true label absent) and an assigned label (the bijection) are read
 * the same way. `others` is accepted for symmetry with the other readers; a digit read does not depend on it.
 */
export declare function digitLabelFeatures(table: DigitScoreTable, label: number, _others?: readonly number[]): number[];
/** perDigit: from the per-digit reader's digit posteriors (BadgeEvidence.digits[i].scores). */
export declare function perDigitLabelFeatures(digitScores: readonly (readonly number[])[], label: number, others: readonly number[]): number[];
