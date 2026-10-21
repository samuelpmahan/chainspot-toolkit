/**
 * Coverage whole-glyph matcher: the second reader beside the binary one
 * (badgeGlyphTemplateMath.ts), after Sam (2026-10-21): "the badge
 * anti-aliasing pixels could be used to fit more efficient digit recognition
 * since they still show the shape with far fewer px".
 *
 * The binary reader keeps a sample only when it is bright and neutral
 * (>= 150), so a glyph edge's anti-aliased pixels, whose grey level is the
 * glyph's sub-pixel coverage of that pixel, are thrown away. Here every
 * sample is a coverage in 0..1 instead:
 *
 *   coverage = (lum - plateLum) / (glyphLum - plateLum), clamped,
 *
 * with plateLum and glyphLum LOCAL, measured on each badge (two-means over
 * the native pixels inside the same inset the binary reader samples). The
 * geometry is the binary reader's: the same 48x36 grid and 14%/16% inset,
 * the tight box at half coverage (the glyph's own edge) widened by one cell
 * for the anti-aliased fringe, scaled to fit the same 24x18 canvas, and
 * area-resampled instead of nearest-neighbour so the fringe is kept.
 * Templates are scored by zero-mean normalized cross-correlation, best over
 * +/- maxShiftPx, and abstention is first-class with the binary reader's own
 * thresholds (a low top score, or a thin top-vs-runner-up margin).
 *
 * This USES anti-aliased pixels to read; it does not mute or reassign any
 * pixel (DOCTRINE: muting waits for a baseline through S7).
 */

import type { BadgeCropBody, RgbaBitmap } from './badgeGlyphTemplateMath';

export interface BadgeCoverageTemplateKnobs {
	/** Below this NCC the best template is rejected ('low-score'). Carried from the binary reader's minScore. */
	readonly minScore: number;
	/** Below this NCC gap between best and runner-up the read abstains ('ambiguous'). The binary reader's minMargin. */
	readonly minMargin: number;
	readonly normalizedWidthPx: number;
	readonly normalizedHeightPx: number;
	readonly maxShiftPx: number;
}

export const DEFAULT_BADGE_COVERAGE_TEMPLATE_KNOBS: BadgeCoverageTemplateKnobs = Object.freeze({
	minScore: 0.58,
	minMargin: 0.045,
	normalizedWidthPx: 24,
	normalizedHeightPx: 18,
	maxShiftPx: 1
});

/** The binary reader's sampling grid and inset (badgeGlyphTemplateMath.ts rawBadgeGlyphMask). */
const SAMPLE_W = 48;
const SAMPLE_H = 36;
const MARGIN_X = 0.14;
const MARGIN_Y = 0.16;
/** Sub-samples per canvas pixel side for the area resample. */
const SUPERSAMPLE = 4;

export interface CoverageLevels {
	/** Mean RGB luminance of the dark plate and of the white glyph, measured on this badge. */
	readonly plateLum: number;
	readonly glyphLum: number;
}

export interface NormalizedCoverage {
	readonly widthPx: number;
	readonly heightPx: number;
	/** coverage 0..1 per canvas pixel, row-major */
	readonly data: Float64Array;
}

function lumAt(image: RgbaBitmap, x: number, y: number): number {
	const cx = Math.max(0, Math.min(image.width - 1, x));
	const cy = Math.max(0, Math.min(image.height - 1, y));
	const o = (cy * image.width + cx) * 4;
	return (image.data[o] + image.data[o + 1] + image.data[o + 2]) / 3;
}

function bilinearLum(image: RgbaBitmap, fx: number, fy: number): number {
	const x0 = Math.floor(fx);
	const y0 = Math.floor(fy);
	const ax = fx - x0;
	const ay = fy - y0;
	return (
		(1 - ay) * ((1 - ax) * lumAt(image, x0, y0) + ax * lumAt(image, x0 + 1, y0)) +
		ay * ((1 - ax) * lumAt(image, x0, y0 + 1) + ax * lumAt(image, x0 + 1, y0 + 1))
	);
}

function lowerMedian(sorted: readonly number[]): number {
	return sorted.length ? sorted[(sorted.length - 1) >> 1] : 0;
}

/** LOCAL plate and glyph levels: two-means (medians) over the native pixels inside the inset. */
export function coverageLevels(image: RgbaBitmap, badge: BadgeCropBody): CoverageLevels {
	const left = badge.xPx - badge.widthPx / 2;
	const top = badge.yPx - badge.heightPx / 2;
	const values: number[] = [];
	const y0 = Math.ceil(top + MARGIN_Y * badge.heightPx);
	const y1 = Math.floor(top + (1 - MARGIN_Y) * badge.heightPx) - 1;
	const x0 = Math.ceil(left + MARGIN_X * badge.widthPx);
	const x1 = Math.floor(left + (1 - MARGIN_X) * badge.widthPx) - 1;
	for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) values.push(lumAt(image, x, y));
	values.sort((a, b) => a - b);
	if (!values.length) return { plateLum: 0, glyphLum: 255 };
	let lo = values[Math.floor(values.length * 0.1)];
	let hi = values[Math.floor(values.length * 0.9)];
	for (let iteration = 0; iteration < 20; iteration++) {
		const mid = (lo + hi) / 2;
		const nextLo = lowerMedian(values.filter((v) => v < mid));
		const nextHi = lowerMedian(values.filter((v) => v >= mid));
		if (nextLo === lo && nextHi === hi) break;
		lo = nextLo;
		hi = nextHi;
	}
	return { plateLum: lo, glyphLum: hi };
}

/** The badge's coverage on the binary reader's grid, tight-cropped and area-resampled to the canvas; null without glyph. */
export function normalizeBadgeCoverage(
	image: RgbaBitmap,
	badge: BadgeCropBody,
	knobs: BadgeCoverageTemplateKnobs = DEFAULT_BADGE_COVERAGE_TEMPLATE_KNOBS,
	levels: CoverageLevels = coverageLevels(image, badge)
): NormalizedCoverage | null {
	const left = badge.xPx - badge.widthPx / 2;
	const top = badge.yPx - badge.heightPx / 2;
	const span = Math.max(1, levels.glyphLum - levels.plateLum);
	const grid = new Float64Array(SAMPLE_W * SAMPLE_H);
	let minX = SAMPLE_W;
	let minY = SAMPLE_H;
	let maxX = -1;
	let maxY = -1;
	for (let y = 0; y < SAMPLE_H; y++) {
		const v = (y + 0.5) / SAMPLE_H;
		if (v < MARGIN_Y || v > 1 - MARGIN_Y) continue;
		for (let x = 0; x < SAMPLE_W; x++) {
			const u = (x + 0.5) / SAMPLE_W;
			if (u < MARGIN_X || u > 1 - MARGIN_X) continue;
			const lum = bilinearLum(image, left + u * badge.widthPx - 0.5, top + v * badge.heightPx - 0.5);
			const c = Math.max(0, Math.min(1, (lum - levels.plateLum) / span));
			grid[y * SAMPLE_W + x] = c;
			if (c >= 0.5) {
				minX = Math.min(minX, x);
				maxX = Math.max(maxX, x);
				minY = Math.min(minY, y);
				maxY = Math.max(maxY, y);
			}
		}
	}
	if (maxX < 0) return null;
	minX = Math.max(0, minX - 1);
	minY = Math.max(0, minY - 1);
	maxX = Math.min(SAMPLE_W - 1, maxX + 1);
	maxY = Math.min(SAMPLE_H - 1, maxY + 1);
	const sourceWidth = maxX - minX + 1;
	const sourceHeight = maxY - minY + 1;
	const W = knobs.normalizedWidthPx;
	const H = knobs.normalizedHeightPx;
	const scale = Math.min((W - 2) / sourceWidth, (H - 2) / sourceHeight);
	const drawWidth = Math.max(1, Math.round(sourceWidth * scale));
	const drawHeight = Math.max(1, Math.round(sourceHeight * scale));
	const offsetX = Math.floor((W - drawWidth) / 2);
	const offsetY = Math.floor((H - drawHeight) / 2);
	const data = new Float64Array(W * H);
	const at = (x: number, y: number) => grid[y * SAMPLE_W + x];
	for (let y = 0; y < drawHeight; y++) {
		for (let x = 0; x < drawWidth; x++) {
			let sum = 0;
			for (let sy = 0; sy < SUPERSAMPLE; sy++) {
				for (let sx = 0; sx < SUPERSAMPLE; sx++) {
					const gx = minX + ((x + (sx + 0.5) / SUPERSAMPLE) * sourceWidth) / drawWidth - 0.5;
					const gy = minY + ((y + (sy + 0.5) / SUPERSAMPLE) * sourceHeight) / drawHeight - 0.5;
					const x0 = Math.max(minX, Math.min(maxX, Math.floor(gx)));
					const y0 = Math.max(minY, Math.min(maxY, Math.floor(gy)));
					const x1 = Math.min(maxX, x0 + 1);
					const y1 = Math.min(maxY, y0 + 1);
					const ax = Math.max(0, Math.min(1, gx - x0));
					const ay = Math.max(0, Math.min(1, gy - y0));
					sum += (1 - ay) * ((1 - ax) * at(x0, y0) + ax * at(x1, y0)) + ay * ((1 - ax) * at(x0, y1) + ax * at(x1, y1));
				}
			}
			data[(offsetY + y) * W + offsetX + x] = sum / (SUPERSAMPLE * SUPERSAMPLE);
		}
	}
	return { widthPx: W, heightPx: H, data };
}

/** Zero-mean normalized cross-correlation after shifting `b` by (dx, dy); 0 when either is flat. */
export function shiftedNcc(a: NormalizedCoverage, b: NormalizedCoverage, dx: number, dy: number): number {
	let n = 0, sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0;
	for (let y = 0; y < a.heightPx; y++) {
		for (let x = 0; x < a.widthPx; x++) {
			const bx = x + dx;
			const by = y + dy;
			const av = a.data[y * a.widthPx + x];
			const bv = bx >= 0 && by >= 0 && bx < b.widthPx && by < b.heightPx ? b.data[by * b.widthPx + bx] : 0;
			n++;
			sa += av;
			sb += bv;
			saa += av * av;
			sbb += bv * bv;
			sab += av * bv;
		}
	}
	const va = saa - (sa * sa) / n;
	const vb = sbb - (sb * sb) / n;
	return va <= 0 || vb <= 0 ? 0 : (sab - (sa * sb) / n) / Math.sqrt(va * vb);
}

export function bestCoverageScore(a: NormalizedCoverage, b: NormalizedCoverage, maxShiftPx: number): number {
	let best = -1;
	for (let dy = -maxShiftPx; dy <= maxShiftPx; dy++)
		for (let dx = -maxShiftPx; dx <= maxShiftPx; dx++) best = Math.max(best, shiftedNcc(a, b, dx, dy));
	return best;
}

export interface BadgeCoverageTemplateEntry {
	readonly label: number;
	readonly coverage: NormalizedCoverage;
}

export interface BadgeCoverageClassification {
	readonly label?: number;
	readonly bestLabel?: number;
	readonly runnerUpLabel?: number;
	readonly bestScore: number;
	readonly runnerUpScore: number;
	readonly ambiguityMargin: number;
	readonly abstention: 'empty-glyph' | 'low-score' | 'ambiguous' | null;
	readonly levels?: CoverageLevels;
}

export function classifyNormalizedCoverage(
	candidate: NormalizedCoverage | null,
	templates: readonly BadgeCoverageTemplateEntry[],
	knobs: BadgeCoverageTemplateKnobs = DEFAULT_BADGE_COVERAGE_TEMPLATE_KNOBS
): BadgeCoverageClassification {
	if (!candidate || templates.length < 2)
		return { bestScore: 0, runnerUpScore: 0, ambiguityMargin: 0, abstention: 'empty-glyph' };
	const ranked = templates
		.map((t) => ({ label: t.label, score: bestCoverageScore(candidate, t.coverage, knobs.maxShiftPx) }))
		.sort((a, b) => b.score - a.score || a.label - b.label);
	const [winner, runnerUp] = ranked;
	const ambiguityMargin = winner.score - runnerUp.score;
	const abstention =
		winner.score < knobs.minScore ? 'low-score' : ambiguityMargin < knobs.minMargin ? 'ambiguous' : null;
	return {
		...(abstention === null ? { label: winner.label } : {}),
		bestLabel: winner.label,
		runnerUpLabel: runnerUp.label,
		bestScore: winner.score,
		runnerUpScore: runnerUp.score,
		ambiguityMargin,
		abstention
	};
}

export function classifyBadgeCoverageAgainstTemplates(
	image: RgbaBitmap,
	badge: BadgeCropBody,
	templates: readonly BadgeCoverageTemplateEntry[],
	knobs: BadgeCoverageTemplateKnobs = DEFAULT_BADGE_COVERAGE_TEMPLATE_KNOBS
): BadgeCoverageClassification {
	const levels = coverageLevels(image, badge);
	return { ...classifyNormalizedCoverage(normalizeBadgeCoverage(image, badge, knobs, levels), templates, knobs), levels };
}

/** Asset rows: one 2-hex-digit byte (coverage x 255, rounded) per pixel. */
export function decodeCoverageRows(rows: readonly string[], widthPx: number, heightPx: number): NormalizedCoverage {
	const data = new Float64Array(widthPx * heightPx);
	rows.forEach((row, y) => {
		for (let x = 0; x < widthPx; x++) data[y * widthPx + x] = parseInt(row.slice(2 * x, 2 * x + 2), 16) / 255;
	});
	return { widthPx, heightPx, data };
}

export function encodeCoverageRows(coverage: NormalizedCoverage): string[] {
	const rows: string[] = [];
	for (let y = 0; y < coverage.heightPx; y++) {
		let row = '';
		for (let x = 0; x < coverage.widthPx; x++)
			row += Math.round(Math.max(0, Math.min(1, coverage.data[y * coverage.widthPx + x])) * 255).toString(16).padStart(2, '0');
		rows.push(row);
	}
	return rows;
}
