/**
 * Learned abstention for the badge readers (Sam, 2026-10-21: "There's no good reason for something a perceptron did
 * 75 years ago to not be automatic"). Per reader, P(a label is right | its features) = sigmoid(bias + priorShift +
 * sum weights_j * features_j), fitted offline by the toolkit's scripts/badge-calibration.mjs on out-of-course dev
 * scores and vendored as assets/badge-reader-calibration.json. A reader reads when P >= pStar, one number for every
 * reader from a stated cost (the asset's `rule`). The provider never trains at run time.
 *
 * The feature functions below are the only definition of the features; the fitting script calls them too.
 *   binary, coverage: [score of the label, its margin over the best other label]
 *   digitBW:          [lowest digit Dice of the label, lowest digit margin over the digits that would still spell a
 *                      label of the vocabulary given, layout margin (the label's layout minus the other layout)]
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

export function digitLabelFeatures(table: DigitScoreTable, label: number, others: readonly number[]): number[] {
	const ds = [...String(label)].map(Number);
	const cells = ds.length === 1 ? table.one : table.two;
	const other = ds.length === 1 ? table.two : table.one;
	if (!cells || cells.length !== ds.length) return [0, -1, -1];
	const scores = ds.map((d, i) => cells[i][d]);
	const joint = scores.reduce((a, v) => a + v, 0) / scores.length;
	const rest = others.filter((k) => k !== label && String(k).length === ds.length);
	const margins = ds.map((d, i) => {
		const alternatives = rest
			.filter((k) => [...String(k)].every((c, j) => j === i || Number(c) === ds[j]))
			.map((k) => Number(String(k)[i]));
		return alternatives.length ? cells[i][d] - Math.max(...alternatives.map((a) => cells[i][a])) : 1;
	});
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
