/**
 * Black-and-white DIGIT reader (Sam, 2026-10-21: "Can you adapt B+W into a
 * better reader?" ... "it can and should read by digit"): a third badge
 * reader beside the binary whole-number reader (badgeGlyphTemplateMath.ts,
 * the recorded baseline) and the coverage reader
 * (badgeCoverageTemplateMath.ts).
 *
 * Why the binary whole-number reader abstains: on the 108 dev badges all 32
 * of its abstentions are 'ambiguous' (thin margin), none 'low-score'. A dev
 * badge scores only 0.76-0.87 Dice against its own template, because the
 * templates come from older rasters binarized at a fixed level (strokes and
 * proportions differ from today's sprites), so near-identical numbers (15/16,
 * 16/18, 5/8, 13/18) tie. Templates made from dev sprites through the same
 * binarization lift that to near 1 and are the main lever; a LOCAL threshold
 * is the second.
 *
 * The reader:
 *  1. binarizes the badge on the binary reader's inset (14% / 16% of the
 *     bbox) at LOCAL level: luminance >= midway between this badge's plate
 *     and glyph levels (coverageLevels, the coverage reader's own measure);
 *  2. forms two layouts: one cell over the whole ink, and two cells split at
 *     the inter-digit gap (the widest run of ink-free columns inside the ink,
 *     or the emptiest interior column when the digits touch). Gap and cell
 *     widths are measured on each badge, in sample cells, never fixed px;
 *  3. normalizes each cell to a 16x24 digit canvas scaled by the badge's
 *     full ink height (digits share a cap height, so a "1" stays narrow);
 *  4. scores each cell against digit templates 0-9 (best shifted Dice over a
 *     digit's templates) and takes the layout with the better mean digit
 *     score;
 *  5. abstains on the layout when one-cell vs two-cell is close, per digit on
 *     a low score or a thin margin over the next digit, and on a leading
 *     zero. Only then does the vocabulary bound the result: a number outside
 *     1..HOLE_LABEL_MAX or above the course's badge count is reported as
 *     such ('out-of-vocabulary', 'above-badge-count'), never bent to a
 *     nearby allowed number.
 *
 * It differs from the per-digit segmentation reader (measure.ts, readBadges):
 * that one takes connected components of S1's bright mask (fixed HSV
 * thresholds), gates and valley-splits them, classifies each with a trained
 * logistic model on a 24x32 canvas, and then picks the best label by the
 * product of digit posteriors over the vocabulary. This one thresholds
 * per badge, decides one-vs-two digits as competing layouts scored jointly,
 * matches templates cut from the dev sprites, and applies the vocabulary only
 * afterwards.
 *
 * Fixed quantities: badges are screen-fixed sprites (DOCTRINE: GLOBAL, size
 * by label, not map-scaled). Nothing here is in absolute px anyway: the inset
 * is a fraction of the bbox, the sampling grid and canvases are resolutions,
 * and the gap is measured per badge.
 */

import type { BadgeCropBody, NormalizedGlyphMask, RgbaBitmap } from './badgeGlyphTemplateMath';
import { bestMaskScore } from './badgeGlyphTemplateMath';
import { coverageLevels } from './badgeCoverageTemplateMath';
import { HOLE_LABEL_MAX } from './holeLabels';

export interface BadgeDigitTemplateKnobs {
	/** Dice below this rejects a digit ('low-score'): the binary reader's minScore, carried. */
	readonly minScore: number;
	/** Dice gap to the next digit below this abstains ('ambiguous-digit'): the binary reader's minMargin. */
	readonly minMargin: number;
	/** Gap between the one-cell and two-cell mean digit scores below this abstains ('ambiguous-layout'). */
	readonly minLayoutMargin: number;
	readonly maxShiftPx: number;
	readonly digitWidthPx: number;
	readonly digitHeightPx: number;
}

export const DEFAULT_BADGE_DIGIT_TEMPLATE_KNOBS: BadgeDigitTemplateKnobs = Object.freeze({
	minScore: 0.58,
	minMargin: 0.045,
	minLayoutMargin: 0.045,
	maxShiftPx: 1,
	digitWidthPx: 16,
	digitHeightPx: 24
});

/** Sampling grid over the badge bbox (twice the binary reader's 48x36 per side, so a gap of one source px
 * is at least one empty column), and the binary reader's inset. */
const SAMPLE_W = 96;
const SAMPLE_H = 72;
const MARGIN_X = 0.14;
const MARGIN_Y = 0.16;
/** Where the split column is sought when the two digits touch: the middle of the ink span (fractions). */
const TOUCH_SPLIT_LO = 0.3;
const TOUCH_SPLIT_HI = 0.7;

export interface BadgeDigitTemplateEntry {
	readonly digit: number;
	/** Which dev sprite and position it was cut from, e.g. "14 right". */
	readonly from: string;
	readonly mask: NormalizedGlyphMask;
}

export interface DigitRead {
	readonly digit: number;
	readonly score: number;
	readonly runnerUp: number;
	readonly margin: number;
}

export type BadgeDigitAbstention =
	| 'empty-glyph'
	| 'ambiguous-layout'
	| 'low-score'
	| 'ambiguous-digit'
	| 'leading-zero'
	| 'out-of-vocabulary'
	| 'above-badge-count';

export interface BadgeDigitClassification {
	/** The number the digits spell, whatever the abstention (null only without glyph). */
	readonly number: string | null;
	/** The accepted label, or null. */
	readonly label: string | null;
	readonly abstention: BadgeDigitAbstention | null;
	readonly layout: 1 | 2 | null;
	readonly layoutMargin: number;
	/** min over digits of the digit margin. */
	readonly digitMargin: number;
	/** min(layoutMargin, digitMargin): how close the read came to abstaining. */
	readonly margin: number;
	readonly digits: readonly DigitRead[];
	/** The measured inter-digit gap and ink span, in sample columns (1/96 of the bbox width each). */
	readonly gapColumns: number;
	readonly inkColumns: number;
}

interface Extent {
	readonly minX: number;
	readonly maxX: number;
	readonly minY: number;
	readonly maxY: number;
}

/** The badge's glyph, binarized at the midway level between its own plate and glyph. */
export function sampleBadgeDigits(image: RgbaBitmap, badge: BadgeCropBody): Uint8Array {
	const levels = coverageLevels(image, badge);
	const mid = (levels.plateLum + levels.glyphLum) / 2;
	const left = badge.xPx - badge.widthPx / 2;
	const top = badge.yPx - badge.heightPx / 2;
	const grid = new Uint8Array(SAMPLE_W * SAMPLE_H);
	for (let y = 0; y < SAMPLE_H; y++) {
		const v = (y + 0.5) / SAMPLE_H;
		if (v < MARGIN_Y || v > 1 - MARGIN_Y) continue;
		for (let x = 0; x < SAMPLE_W; x++) {
			const u = (x + 0.5) / SAMPLE_W;
			if (u < MARGIN_X || u > 1 - MARGIN_X) continue;
			const sx = Math.max(0, Math.min(image.width - 1, Math.round(left + u * badge.widthPx - 0.5)));
			const sy = Math.max(0, Math.min(image.height - 1, Math.round(top + v * badge.heightPx - 0.5)));
			const o = (sy * image.width + sx) * 4;
			if ((image.data[o] + image.data[o + 1] + image.data[o + 2]) / 3 >= mid) grid[y * SAMPLE_W + x] = 1;
		}
	}
	return grid;
}

function extentOf(grid: Uint8Array, x0: number, x1: number): Extent | null {
	let minX = Infinity, maxX = -1, minY = Infinity, maxY = -1;
	for (let y = 0; y < SAMPLE_H; y++)
		for (let x = x0; x <= x1; x++)
			if (grid[y * SAMPLE_W + x]) {
				minX = Math.min(minX, x);
				maxX = Math.max(maxX, x);
				minY = Math.min(minY, y);
				maxY = Math.max(maxY, y);
			}
	return maxX < 0 ? null : { minX, maxX, minY, maxY };
}

function cellMask(grid: Uint8Array, x0: number, x1: number, inkHeight: number, knobs: BadgeDigitTemplateKnobs): NormalizedGlyphMask | null {
	const e = extentOf(grid, x0, x1);
	if (!e) return null;
	const W = knobs.digitWidthPx;
	const H = knobs.digitHeightPx;
	const w = e.maxX - e.minX + 1;
	const h = e.maxY - e.minY + 1;
	const scale = Math.min((H - 2) / inkHeight, (W - 2) / w);
	const dw = Math.max(1, Math.round(w * scale));
	const dh = Math.max(1, Math.round(h * scale));
	const ox = Math.floor((W - dw) / 2);
	const oy = Math.floor((H - dh) / 2);
	const data = new Uint8Array(W * H);
	for (let y = 0; y < dh; y++) {
		const sy = Math.min(e.maxY, e.minY + Math.floor(((y + 0.5) * h) / dh));
		for (let x = 0; x < dw; x++) {
			const sx = Math.min(e.maxX, e.minX + Math.floor(((x + 0.5) * w) / dw));
			if (grid[sy * SAMPLE_W + sx]) data[(oy + y) * W + ox + x] = 1;
		}
	}
	return { widthPx: W, heightPx: H, data };
}

export interface BadgeDigitLayouts {
	readonly one: readonly NormalizedGlyphMask[];
	readonly two: readonly NormalizedGlyphMask[] | null;
	readonly gapColumns: number;
	readonly inkColumns: number;
}

/** The one-cell and two-cell layouts of a sampled glyph (null without ink). */
export function badgeDigitLayouts(grid: Uint8Array, knobs: BadgeDigitTemplateKnobs = DEFAULT_BADGE_DIGIT_TEMPLATE_KNOBS): BadgeDigitLayouts | null {
	const e = extentOf(grid, 0, SAMPLE_W - 1);
	if (!e) return null;
	const inkHeight = e.maxY - e.minY + 1;
	const columns: number[] = [];
	for (let x = e.minX; x <= e.maxX; x++) {
		let n = 0;
		for (let y = 0; y < SAMPLE_H; y++) n += grid[y * SAMPLE_W + x];
		columns.push(n);
	}
	let gap: { a: number; b: number; w: number } | null = null;
	for (let i = 0; i < columns.length; i++) {
		if (columns[i] !== 0) continue;
		let j = i;
		while (j + 1 < columns.length && columns[j + 1] === 0) j++;
		if (!gap || j - i + 1 > gap.w) gap = { a: i, b: j, w: j - i + 1 };
		i = j;
	}
	if (!gap) {
		let least = Infinity, at = -1;
		for (let i = Math.floor(columns.length * TOUCH_SPLIT_LO); i <= Math.ceil(columns.length * TOUCH_SPLIT_HI) && i < columns.length; i++)
			if (columns[i] < least) {
				least = columns[i];
				at = i;
			}
		gap = { a: at, b: at, w: 0 };
	}
	const one = cellMask(grid, e.minX, e.maxX, inkHeight, knobs);
	const left = gap.a > 0 ? cellMask(grid, e.minX, e.minX + gap.a - 1, inkHeight, knobs) : null;
	const right = e.minX + gap.b + 1 <= e.maxX ? cellMask(grid, e.minX + gap.b + 1, e.maxX, inkHeight, knobs) : null;
	return { one: one ? [one] : [], two: left && right ? [left, right] : null, gapColumns: gap.w, inkColumns: e.maxX - e.minX + 1 };
}

function readDigit(cell: NormalizedGlyphMask, templates: readonly BadgeDigitTemplateEntry[], knobs: BadgeDigitTemplateKnobs): DigitRead {
	const best = new Map<number, number>();
	for (const t of templates) {
		const s = bestMaskScore(cell, t.mask, knobs.maxShiftPx);
		if (!best.has(t.digit) || s > (best.get(t.digit) as number)) best.set(t.digit, s);
	}
	const ranked = [...best].map(([digit, score]) => ({ digit, score })).sort((a, b) => b.score - a.score || a.digit - b.digit);
	return { digit: ranked[0].digit, score: ranked[0].score, runnerUp: ranked[1].digit, margin: ranked[0].score - ranked[1].score };
}

export function classifyBadgeDigitsAgainstTemplates(
	image: RgbaBitmap,
	badge: BadgeCropBody,
	templates: readonly BadgeDigitTemplateEntry[],
	badgeCount: number | null = null,
	knobs: BadgeDigitTemplateKnobs = DEFAULT_BADGE_DIGIT_TEMPLATE_KNOBS
): BadgeDigitClassification {
	const layouts = badgeDigitLayouts(sampleBadgeDigits(image, badge), knobs);
	if (!layouts || !layouts.one.length)
		return { number: null, label: null, abstention: 'empty-glyph', layout: null, layoutMargin: 0, digitMargin: 0, margin: 0, digits: [], gapColumns: 0, inkColumns: 0 };
	const one = layouts.one.map((cell) => readDigit(cell, templates, knobs));
	const two = layouts.two ? layouts.two.map((cell) => readDigit(cell, templates, knobs)) : null;
	const joint1 = one[0].score;
	const joint2 = two ? (two[0].score + two[1].score) / 2 : -1;
	const digits = joint2 > joint1 && two ? two : one;
	const layoutMargin = two ? Math.abs(joint2 - joint1) : 1;
	const digitMargin = Math.min(...digits.map((d) => d.margin));
	const number = digits.map((d) => String(d.digit)).join('');
	const abstention: BadgeDigitAbstention | null =
		layoutMargin < knobs.minLayoutMargin
			? 'ambiguous-layout'
			: digits.some((d) => d.score < knobs.minScore)
				? 'low-score'
				: digitMargin < knobs.minMargin
					? 'ambiguous-digit'
					: number[0] === '0'
						? 'leading-zero'
						: Number(number) > HOLE_LABEL_MAX
							? 'out-of-vocabulary'
							: badgeCount !== null && Number(number) > badgeCount
								? 'above-badge-count'
								: null;
	return {
		number,
		label: abstention === null ? number : null,
		abstention,
		layout: digits.length as 1 | 2,
		layoutMargin,
		digitMargin,
		margin: Math.min(layoutMargin, digitMargin),
		digits,
		gapColumns: layouts.gapColumns,
		inkColumns: layouts.inkColumns
	};
}

/** Asset rows: one 0/1 char per pixel, as the binary templates. */
export function decodeDigitRows(rows: readonly string[], widthPx: number, heightPx: number): NormalizedGlyphMask {
	return { widthPx, heightPx, data: Uint8Array.from(rows.join('').split('').map((c) => (c === '1' ? 1 : 0))) };
}
