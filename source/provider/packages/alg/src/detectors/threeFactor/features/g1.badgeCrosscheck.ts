/**
 * G1 badgeCrosscheck (Sam, 2026-10-21: "Yes, make readers crosscheck"). Over every badge S1 found:
 *  - the per-digit reader (measure.ts) still sets the label;
 *  - the coverage DIGIT reader checks it: the same label is 'confirmed'; another label is 'disagree', recorded with
 *    both reads and both P, and the per-digit label is kept (nothing changes silently);
 *  - where the per-digit reader has no label (it abstained, or read outside the vocabulary) and the coverage digit
 *    reader reads with P >= READER_P_STAR, its read is used and marked 'filled', unless another badge already holds that
 *    label; otherwise the badge stays 'unread';
 *  - the B+W digit reader and the whole-number coverage reader are witnesses, recorded with their reads and P; they
 *    never decide.
 * P is the learned confidence (badgeReaderCalibration.ts). Pure; the toolkit's Calculation fn.Badge.crosscheck calls it.
 */

import type { BadgeEvidence } from '../types';
import type { RgbaBitmap } from '../digits/badgeGlyphTemplateMath';
import { HOLE_LABELS } from '../digits/holeLabels';
import { badgeDigitScoreTable } from '../digits/badgeDigitTemplateMath';
import { digitLabelFeatures, perDigitLabelFeatures, readerProbability, READER_P_STAR, templateLabelFeatures, type DigitScoreTable } from '../digits/badgeReaderCalibration';
import { classifyBadgeCoverageDigits } from './g1.badgeCoverageDigit';
import { classifyBadgeCoverage } from './g1.badgeCoverageTemplate';
import { BADGE_DIGIT_TEMPLATES } from './g1.badgeDigitTemplate';

export type CrosscheckVerdict = 'confirmed' | 'disagree' | 'filled' | 'unread';

export interface CrosscheckRead {
	readonly label: number | null;
	readonly p: number | null;
}

export interface BadgeCrosscheck {
	readonly detId: string;
	readonly bbox: readonly [number, number, number, number];
	/** The label after the crosscheck: the per-digit label, or the filled read. */
	readonly label: number | null;
	readonly verdict: CrosscheckVerdict;
	readonly note: string | null;
	readonly perDigit: CrosscheckRead & { readonly abstention: string | null };
	readonly coverageDigit: CrosscheckRead;
	readonly witnesses: { readonly digitBW: CrosscheckRead; readonly coverage: CrosscheckRead };
}

const round4 = (v: number) => Math.round(v * 1e4) / 1e4;

/** The best label of the vocabulary from a digit score table, and its P. */
function digitTableRead(reader: 'digitBW' | 'coverageDigit', table: DigitScoreTable): CrosscheckRead {
	const joint = (L: number) => {
		const ds = [...String(L)].map(Number), cells = ds.length === 1 ? table.one : table.two;
		return cells && cells.length === ds.length ? ds.reduce((a, d, i) => a + cells[i][d], 0) / ds.length : -Infinity;
	};
	const label = HOLE_LABELS.reduce((a, L) => (joint(L) > joint(a) ? L : a), HOLE_LABELS[0]);
	if (!Number.isFinite(joint(label))) return { label: null, p: null };
	return { label, p: round4(readerProbability(reader, digitLabelFeatures(table, label))) };
}

export function crosscheckBadges(image: RgbaBitmap, badges: readonly BadgeEvidence[], viewportTopPx = 0): BadgeCrosscheck[] {
	const rows = badges.map((badge) => {
		const [x, y, w, h] = badge.bbox;
		const body = { xPx: x + w / 2, yPx: y + h / 2 - viewportTopPx, widthPx: w, heightPx: h };
		const perDigitLabel = badge.label == null ? null : Number(badge.label);
		const digitScores = (badge.digits ?? []).map((d) => d.scores);
		const perDigit = {
			label: perDigitLabel,
			p: perDigitLabel == null ? null : round4(readerProbability('perDigit', perDigitLabelFeatures(digitScores, perDigitLabel, HOLE_LABELS))),
			abstention: badge.abstentionReason ?? null
		};
		const coverageDigit = digitTableRead('coverageDigit', classifyBadgeCoverageDigits(image, badge, viewportTopPx).table);
		const digitBW = digitTableRead('digitBW', badgeDigitScoreTable(image, body, BADGE_DIGIT_TEMPLATES));
		const cov = classifyBadgeCoverage(image, badge, viewportTopPx);
		const coverage: CrosscheckRead = cov.bestLabel == null ? { label: null, p: null } : { label: cov.bestLabel, p: round4(readerProbability('coverage', [cov.bestScore, cov.ambiguityMargin])) };
		return { badge, perDigit, coverageDigit, witnesses: { digitBW, coverage } };
	});
	const held = new Set(rows.map((r) => r.perDigit.label).filter((l): l is number => l != null));
	return rows.map(({ badge, perDigit, coverageDigit, witnesses }) => {
		let verdict: CrosscheckVerdict, label = perDigit.label, note: string | null = null;
		if (perDigit.label != null) verdict = coverageDigit.label === perDigit.label ? 'confirmed' : 'disagree';
		else if (coverageDigit.label != null && coverageDigit.p != null && coverageDigit.p >= READER_P_STAR) {
			if (held.has(coverageDigit.label)) { verdict = 'unread'; note = `coverage digit read ${coverageDigit.label} is held by another badge`; }
			else { verdict = 'filled'; label = coverageDigit.label; held.add(label); }
		} else verdict = 'unread';
		if (verdict === 'disagree') note = `per-digit ${perDigit.label} (P ${perDigit.p}) vs coverage digit ${coverageDigit.label} (P ${coverageDigit.p}); the per-digit label is kept`;
		return { detId: badge.detId, bbox: badge.bbox, label, verdict, note, perDigit, coverageDigit, witnesses };
	});
}
