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

import calibrationData from '../assets/badge-reader-calibration.json';

export type BadgeReaderName = 'binary' | 'digitBW' | 'coverage' | 'perDigit';

interface ReaderModel {
	readonly features: readonly string[];
	readonly weights: readonly number[];
	readonly bias: number;
	readonly priorShift: number;
}

interface CalibrationAsset {
	readonly pStar: number;
	readonly costWrong: number;
	readonly readers: Readonly<Record<BadgeReaderName, ReaderModel>>;
}

const CALIBRATION = calibrationData as unknown as CalibrationAsset;

/** Read iff P >= READER_P_STAR. */
export const READER_P_STAR: number = CALIBRATION.pStar;

export function readerProbability(reader: BadgeReaderName, features: readonly number[]): number {
	const m = CALIBRATION.readers[reader];
	if (!m || m.weights.length !== features.length) throw new Error(`badgeReaderCalibration: ${reader} takes ${m?.weights.length} features`);
	const z = m.bias + m.priorShift + features.reduce((a, v, j) => a + v * m.weights[j], 0);
	return 1 / (1 + Math.exp(-z));
}

/** binary / coverage: [score, score minus the best other label of `others`]. */
export function templateLabelFeatures(scoreOf: (label: number) => number, label: number, others: readonly number[]): number[] {
	const rest = others.filter((k) => k !== label);
	const s = scoreOf(label);
	return [s, rest.length ? s - Math.max(...rest.map(scoreOf)) : s];
}

/** Best Dice per digit 0..9 in each cell of the one-cell and two-cell layouts (badgeDigitScoreTable). */
export interface DigitScoreTable {
	readonly one: readonly (readonly number[])[] | null;
	readonly two: readonly (readonly number[])[] | null;
}

const meanBest = (cells: readonly (readonly number[])[] | null) =>
	cells ? cells.reduce((a, c) => a + Math.max(...c), 0) / cells.length : -1;

/**
 * digitBW: the features the digit reader would report if it read `label`. The reader reads each cell's best digit, so a
 * label whose digit is not its cell's best is read only when every better digit in that cell is absent: those digits
 * are removed, and the label's digit is then the cell's best. Per cell its Dice and its margin to ITS runner-up among
 * the digits left (the best digit scoring at most as much); the layout margin is the label's layout mean against the
 * other layout's mean best. For the reader's own read nothing is removed and these are exactly what
 * classifyBadgeDigits reports. A hard negative (the true label absent) and an assigned label (the bijection) are read
 * the same way. `others` is accepted for symmetry with the other readers; a digit read does not depend on it.
 */
export function digitLabelFeatures(table: DigitScoreTable, label: number, _others: readonly number[] = []): number[] {
	const ds = [...String(label)].map(Number);
	const cells = ds.length === 1 ? table.one : table.two;
	const other = ds.length === 1 ? table.two : table.one;
	if (!cells || cells.length !== ds.length) return [0, 0, -1];
	const scores = ds.map((d, i) => cells[i][d]);
	const margins = ds.map((d, i) => {
		const below = cells[i].filter((v, e) => e !== d && v <= cells[i][d]);
		return below.length ? cells[i][d] - Math.max(...below) : cells[i][d];
	});
	if (margins.some((m) => m < 0)) throw new Error('digitLabelFeatures: a negative digit margin (a read is its cell\'s best digit)');
	const joint = scores.reduce((a, v) => a + v, 0) / scores.length;
	return [Math.min(...scores), Math.min(...margins), joint - meanBest(other)];
}

/** perDigit: from the per-digit reader's digit posteriors (BadgeEvidence.digits[i].scores). */
export function perDigitLabelFeatures(digitScores: readonly (readonly number[])[], label: number, others: readonly number[]): number[] {
	const n = digitScores.length;
	const likelihood = (k: number) =>
		String(k).length === n ? [...String(k)].reduce((p, c, i) => p * (digitScores[i][Number(c)] ?? 0), 1) : 0;
	const pool = [...new Set([...others, label])];
	const total = pool.reduce((a, k) => a + likelihood(k), 0) || 1;
	const rest = others.filter((k) => k !== label);
	const p = likelihood(label) / total;
	return [n >= 1 && n <= 2 ? Math.pow(likelihood(label), 1 / n) : 0, p - Math.max(0, ...rest.map((k) => likelihood(k) / total))];
}
