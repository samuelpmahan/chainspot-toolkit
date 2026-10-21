#!/usr/bin/env node
// Bakes packages/alg/src/detectors/threeFactor/assets/badge-glyph-templates.json:
// one 24x18 normalized glyph mask per hole label of digits/holeLabels.ts.
// Run by hand when the templates or the vocabulary change, after building
// packages/alg/dist (this script uses the dist's own math, so there is no
// mirror to keep in step):
//
//   node scripts/generate-badge-glyph-templates.mjs            # write both assets
//   node scripts/generate-badge-glyph-templates.mjs --check    # bake, compare, write nothing
//
// It bakes three assets: the digit templates (badge-digit-templates.json, the
// black-and-white digit reader, from the dev sprites), the binary templates (badge-glyph-templates.json, from
// the old-stuff rasters below) and the coverage templates of the second reader
// (badge-coverage-templates.json, digits/badgeCoverageTemplateMath.ts, from
// dev-course badge sprites in artifacts/badge-coverage-sources), by the same
// composition rule.
//
// Sources: artifacts/badge-glyph-sources/hole-01..18.png, the UDisc badge
// rasters the original 18 templates were baked from (ChainSpot af85a3e,
// old-stuff/static/resources/chainspot_cv_templates/).
//
// Labels 1..18: normalizeBadgeGlyphMask() of each raster as a whole, exactly
// as before (byte-identical rows).
//
// Labels 19 and up are COMPOSED from the same font. Nothing about the font is
// assumed; each quantity is measured on those 18 rasters:
//   - digit glyphs: the ink (brightNeutral pixels not connected to the raster
//     border, which is the badge frame) split at empty columns. 1..9 come from
//     the single-digit badges, 0 from the right digit of 10;
//   - the gap between the two digits' ink, the ink top, the raster height, and
//     the padding of the pill around its ink span: medians over 10..18;
//   - the pill's minimum width: the median width of the single-digit badges
//     (UDisc never draws a badge narrower than a one-digit one).
// A label is its digit glyphs side by side at that gap, on a plate as wide as
// max(minimum width, ink span + padding), normalized like any raster.
//
// The composition rule is checked before anything is written: 11..18 composed
// from the lone glyphs must each classify as itself against the real 1..18
// templates (classifyNormalizedGlyph, default knobs). The confusion of the
// vocabulary (the closest two templates by shifted Dice) is printed for the
// candidate bounds and recorded in the asset.

import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const SOURCES = join(ROOT, 'artifacts/badge-glyph-sources');
const OUT_PATH = join(ROOT, 'packages/alg/src/detectors/threeFactor/assets/badge-glyph-templates.json');
const require = createRequire(import.meta.url);
const dist = (path) => require(join(ROOT, 'packages/alg/dist/detectors/threeFactor', path));
const {
	brightNeutral,
	normalizeBadgeGlyphMask,
	bestMaskScore,
	classifyNormalizedGlyph,
	DEFAULT_BADGE_GLYPH_TEMPLATE_KNOBS: KNOBS
} = dist('digits/badgeGlyphTemplateMath.js');
const { HOLE_LABEL_MAX } = dist('digits/holeLabels.js');
const SOURCE_LABELS = 18;   // count (hole-NN.png rasters in artifacts/badge-glyph-sources)
const CANDIDATE_BOUNDS = [18, 27, 36];   // hole labels; printed so the chosen bound's confusion sits beside its neighbours

// ---- PNG (8-bit RGB/RGBA, non-interlaced) --------------------------------------------------

function decodePng(bytes) {
	const chunks = [];
	for (let at = 8; at < bytes.length; ) {
		const length = bytes.readUInt32BE(at);
		chunks.push({ type: bytes.toString('latin1', at + 4, at + 8), data: bytes.subarray(at + 8, at + 8 + length) });
		at += 12 + length;
	}
	const ihdr = chunks[0].data;
	const width = ihdr.readUInt32BE(0);
	const height = ihdr.readUInt32BE(4);
	if (ihdr[8] !== 8 || (ihdr[9] !== 2 && ihdr[9] !== 6) || ihdr[12] !== 0) throw new Error('unsupported PNG');
	const bpp = ihdr[9] === 2 ? 3 : 4;
	const stride = width * bpp;
	const raw = inflateSync(Buffer.concat(chunks.filter((c) => c.type === 'IDAT').map((c) => c.data)));
	const px = Buffer.alloc(height * stride);
	const paeth = (a, b, c) => {
		const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
		return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
	};
	for (let y = 0; y < height; y++) {
		const filter = raw[y * (stride + 1)];
		for (let i = 0; i < stride; i++) {
			const x = raw[y * (stride + 1) + 1 + i];
			const a = i >= bpp ? px[y * stride + i - bpp] : 0;
			const b = y ? px[(y - 1) * stride + i] : 0;
			const c = y && i >= bpp ? px[(y - 1) * stride + i - bpp] : 0;
			const pred = filter === 0 ? 0 : filter === 1 ? a : filter === 2 ? b : filter === 3 ? (a + b) >> 1 : paeth(a, b, c);
			px[y * stride + i] = (x + pred) & 0xff;
		}
	}
	const data = new Uint8ClampedArray(width * height * 4);
	for (let i = 0; i < width * height; i++) {
		data[i * 4] = px[i * bpp];
		data[i * 4 + 1] = px[i * bpp + 1];
		data[i * 4 + 2] = px[i * bpp + 2];
		data[i * 4 + 3] = 255;
	}
	return { width, height, data };
}

// ---- glyphs and the font measured on the 18 rasters ----------------------------------------

/** Ink of one badge raster: brightNeutral pixels not 8-connected to the raster border (the
 * frame), split into glyphs at empty columns. Each glyph: { x0, y0, w, h, mask }. */
function glyphsOf(image) {
	const { width: W, height: H, data } = image;
	const bright = new Uint8Array(W * H);
	for (let i = 0; i < W * H; i++)
		bright[i] = brightNeutral(data[i * 4], data[i * 4 + 1], data[i * 4 + 2], KNOBS.foregroundThreshold) ? 1 : 0;
	const frame = new Uint8Array(W * H);
	const stack = [];
	for (let x = 0; x < W; x++) stack.push(x, (H - 1) * W + x);
	for (let y = 0; y < H; y++) stack.push(y * W, y * W + W - 1);
	while (stack.length) {
		const i = stack.pop();
		if (!bright[i] || frame[i]) continue;
		frame[i] = 1;
		const x = i % W, y = (i - x) / W;
		for (let dy = -1; dy <= 1; dy++)
			for (let dx = -1; dx <= 1; dx++) {
				const nx = x + dx, ny = y + dy;
				if (nx >= 0 && ny >= 0 && nx < W && ny < H) stack.push(ny * W + nx);
			}
	}
	const ink = (x, y) => bright[y * W + x] && !frame[y * W + x];
	const columns = [];
	for (let x = 0; x < W; x++) {
		let any = false;
		for (let y = 0; y < H && !any; y++) any = !!ink(x, y);
		columns.push(any);
	}
	const glyphs = [];
	for (let x = 0; x < W; x++) {
		if (!columns[x]) continue;
		let x1 = x;
		while (x1 + 1 < W && columns[x1 + 1]) x1++;
		let y0 = H, y1 = -1;
		for (let y = 0; y < H; y++)
			for (let xx = x; xx <= x1; xx++)
				if (ink(xx, y)) { y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
		const w = x1 - x + 1, h = y1 - y0 + 1, mask = new Uint8Array(w * h);
		for (let y = 0; y < h; y++) for (let xx = 0; xx < w; xx++) mask[y * w + xx] = ink(x + xx, y0 + y) ? 1 : 0;
		glyphs.push({ x0: x, y0, w, h, mask });
		x = x1;
	}
	return glyphs;
}

const median = (values) => [...values].sort((a, b) => a - b)[(values.length - 1) >> 1];

function measureFont(rasters) {
	const lone = {};
	for (let label = 1; label <= 9; label++) {
		const glyphs = glyphsOf(rasters[label]);
		if (glyphs.length !== 1) throw new Error(`hole-${label}: expected 1 glyph, found ${glyphs.length}`);
		lone[label] = glyphs[0];
	}
	const gaps = [], pads = [], tops = [], heights = [];
	for (let label = 10; label <= SOURCE_LABELS; label++) {
		const glyphs = glyphsOf(rasters[label]);
		if (glyphs.length !== 2) throw new Error(`hole-${label}: expected 2 glyphs, found ${glyphs.length}`);
		const [left, right] = glyphs;
		if (label === 10) lone[0] = right;
		gaps.push(right.x0 - (left.x0 + left.w));
		pads.push(rasters[label].width - (right.x0 + right.w - left.x0));
		tops.push(Math.min(left.y0, right.y0));
		heights.push(rasters[label].height);
	}
	return {
		lone,
		gapPx: median(gaps),
		padPx: median(pads),
		topPx: median(tops),
		heightPx: median(heights),
		minWidthPx: median([1, 2, 3, 4, 5, 6, 7, 8, 9].map((label) => rasters[label].width)),
		measured: { gapsPx: gaps, padsPx: pads, topsPx: tops }
	};
}

/** The badge raster of `label` drawn from the font's glyphs: white ink on a black plate. */
function composeRaster(font, label) {
	const glyphs = [...String(label)].map((digit) => font.lone[Number(digit)]);
	const span = glyphs.reduce((sum, g) => sum + g.w, 0) + font.gapPx * (glyphs.length - 1);
	const width = Math.max(font.minWidthPx, span + font.padPx);
	const height = font.heightPx;
	const data = new Uint8ClampedArray(width * height * 4);
	for (let i = 0; i < width * height; i++) data[i * 4 + 3] = 255;
	let x = Math.floor((width - span) / 2);
	for (const g of glyphs) {
		for (let y = 0; y < g.h; y++)
			for (let xx = 0; xx < g.w; xx++) {
				if (!g.mask[y * g.w + xx]) continue;
				const o = ((font.topPx + y) * width + x + xx) * 4;
				data[o] = data[o + 1] = data[o + 2] = 255;
			}
		x += g.w + font.gapPx;
	}
	return { width, height, data };
}

const wholeRaster = (image) => ({ xPx: image.width / 2, yPx: image.height / 2, widthPx: image.width, heightPx: image.height });
const normalized = (image) => {
	const mask = normalizeBadgeGlyphMask(image, wholeRaster(image), KNOBS);
	if (!mask) throw new Error('normalized to an empty glyph');
	return mask;
};
const rowsOf = (mask) =>
	Array.from({ length: mask.heightPx }, (_, y) =>
		Array.from(mask.data.subarray(y * mask.widthPx, (y + 1) * mask.widthPx)).join(''));
const round3 = (value) => Math.round(value * 1000) / 1000;

/** The two templates most alike (shifted Dice, the matcher's own score). */
function closestPair(entries) {
	let best = { labels: null, dice: -1 };
	for (let i = 0; i < entries.length; i++)
		for (let j = i + 1; j < entries.length; j++) {
			const dice = bestMaskScore(entries[i].mask, entries[j].mask, KNOBS.maxShiftPx);
			if (dice > best.dice) best = { labels: [entries[i].label, entries[j].label], dice };
		}
	return { labels: best.labels, dice: round3(best.dice) };
}

// ---- bake ----------------------------------------------------------------------------------

const rasters = {};
for (let label = 1; label <= SOURCE_LABELS; label++)
	rasters[label] = decodePng(readFileSync(join(SOURCES, `hole-${String(label).padStart(2, '0')}.png`)));
const font = measureFont(rasters);
const real = Array.from({ length: SOURCE_LABELS }, (_, i) => ({ label: i + 1, mask: normalized(rasters[i + 1]) }));

// The composition rule must reproduce the font: 11..18 drawn from lone glyphs classify as themselves.
const check = [];
for (let label = 11; label <= SOURCE_LABELS; label++) {
	const mask = normalized(composeRaster(font, label));
	const verdict = classifyNormalizedGlyph(mask, real, KNOBS);
	check.push({ label, bestLabel: verdict.bestLabel, selfDice: round3(bestMaskScore(mask, real[label - 1].mask, KNOBS.maxShiftPx)), margin: round3(verdict.ambiguityMargin) });
}
const failed = check.filter((c) => c.bestLabel !== c.label);
if (failed.length) throw new Error(`composition rule does not reproduce the font: ${JSON.stringify(failed)}`);

const composedFor = (bound) =>
	Array.from({ length: Math.max(0, bound - SOURCE_LABELS) }, (_, i) => ({ label: SOURCE_LABELS + 1 + i, mask: normalized(composeRaster(font, SOURCE_LABELS + 1 + i)) }));
const confusion = CANDIDATE_BOUNDS.map((bound) => {
	const entries = [...real, ...composedFor(bound)].slice(0, bound);
	return { bound, closestPair: closestPair(entries) };
});
const templates = [...real, ...composedFor(HOLE_LABEL_MAX)].slice(0, HOLE_LABEL_MAX);

const out = {
	schema: 'badgeGlyphTemplates@1',
	sourceCommit: 'af85a3e',
	sourcePath: 'old-stuff/static/resources/chainspot_cv_templates',
	normalizedWidthPx: KNOBS.normalizedWidthPx,
	normalizedHeightPx: KNOBS.normalizedHeightPx,
	note:
		"Each template is normalizeBadgeGlyphMask() applied to its own full raster (the old classifier's own self-test contract: a template classifies as itself). Rows are top-to-bottom strings of 0/1, one char per pixel, width=normalizedWidthPx.",
	vocabulary: {
		labels: `1..${HOLE_LABEL_MAX}`,
		from: 'digits/holeLabels.ts HOLE_LABEL_MAX',
		raster: `1..${SOURCE_LABELS}: the source rasters (artifacts/badge-glyph-sources, copied from sourceCommit:sourcePath)`,
		composed: `${SOURCE_LABELS + 1}..${HOLE_LABEL_MAX}: the source rasters' digit glyphs side by side (scripts/generate-badge-glyph-templates.mjs)`,
		font: {
			gapPx: font.gapPx, padPx: font.padPx, topPx: font.topPx, heightPx: font.heightPx, minWidthPx: font.minWidthPx,
			unit: 'px of the source rasters (medians over hole-10..18; minWidthPx over hole-01..09)'
		},
		compositionCheck: { rule: '11..18 composed from lone glyphs classify as themselves against the raster templates', rows: check },
		confusion: { unit: 'shifted Dice between the two closest templates of 1..bound', rows: confusion }
	},
	templates: templates.map(({ label, mask }) => ({ label, rows: rowsOf(mask) }))
};

console.log('font (px of the source rasters):', JSON.stringify({ ...font, lone: undefined }));
console.log('composition check (11..18 from lone glyphs):', JSON.stringify(check));
for (const row of confusion) console.log(`closest pair in 1..${row.bound}: ${row.closestPair.labels.join(' vs ')} at Dice ${row.closestPair.dice}`);

// ---- coverage templates (the second reader, digits/badgeCoverageTemplateMath.ts) ------------------
// Same composition rule, at the glyph's sub-pixel coverage instead of its binary ink. Sources: one clean
// badge sprite per label from the DEV courses (artifacts/badge-coverage-sources, written by the toolkit's
// scripts/badge-coverage-sources.mjs); validation is never a source.

const C = dist('digits/badgeCoverageTemplateMath.js');
const CK = C.DEFAULT_BADGE_COVERAGE_TEMPLATE_KNOBS;
const COVERAGE_SOURCES = join(ROOT, 'artifacts/badge-coverage-sources');
const COVERAGE_OUT_PATH = join(ROOT, 'packages/alg/src/detectors/threeFactor/assets/badge-coverage-templates.json');
const PLATE_GREY = 0;   // grey level of a composed plate; the reader measures both levels per badge, so any two levels do
const GLYPH_GREY = 255;

const coverageRasters = {};
for (let label = 1; label <= SOURCE_LABELS; label++)
	coverageRasters[label] = decodePng(readFileSync(join(COVERAGE_SOURCES, `hole-${String(label).padStart(2, '0')}.png`)));
const coverageFont = measureFont(coverageRasters);
/** A glyph's coverage patch: its ink box widened by one px of anti-aliased fringe on every side. */
const coveragePatch = (raster, glyph) => {
	const levels = C.coverageLevels(raster, wholeRaster(raster)), span = Math.max(1, levels.glyphLum - levels.plateLum);
	const w = glyph.w + 2, h = glyph.h + 2, cov = new Float64Array(w * h);
	for (let y = 0; y < h; y++)
		for (let x = 0; x < w; x++) {
			const px = Math.max(0, Math.min(raster.width - 1, glyph.x0 - 1 + x)), py = Math.max(0, Math.min(raster.height - 1, glyph.y0 - 1 + y)), o = (py * raster.width + px) * 4;
			cov[y * w + x] = Math.max(0, Math.min(1, ((raster.data[o] + raster.data[o + 1] + raster.data[o + 2]) / 3 - levels.plateLum) / span));
		}
	return { w, h, cov, inkW: glyph.w };
};
const lonePatch = {};
for (let label = 1; label <= 9; label++) lonePatch[label] = coveragePatch(coverageRasters[label], coverageFont.lone[label]);
lonePatch[0] = coveragePatch(coverageRasters[10], coverageFont.lone[0]);
function composeCoverageRaster(label) {
	const patches = [...String(label)].map((digit) => lonePatch[Number(digit)]);
	const span = patches.reduce((sum, p) => sum + p.inkW, 0) + coverageFont.gapPx * (patches.length - 1);
	const width = Math.max(coverageFont.minWidthPx, span + coverageFont.padPx), height = coverageFont.heightPx;
	const cov = new Float64Array(width * height);
	let x = Math.floor((width - span) / 2);
	for (const p of patches) {
		for (let yy = 0; yy < p.h; yy++)
			for (let xx = 0; xx < p.w; xx++) {
				const X = x - 1 + xx, Y = coverageFont.topPx - 1 + yy;
				if (X >= 0 && Y >= 0 && X < width && Y < height) cov[Y * width + X] = Math.max(cov[Y * width + X], p.cov[yy * p.w + xx]);
			}
		x += p.inkW + coverageFont.gapPx;
	}
	const data = new Uint8ClampedArray(width * height * 4);
	for (let i = 0; i < width * height; i++) {
		data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = Math.round(PLATE_GREY + cov[i] * (GLYPH_GREY - PLATE_GREY));
		data[i * 4 + 3] = 255;
	}
	return { width, height, data };
}
const coverageOf = (raster) => {
	const coverage = C.normalizeBadgeCoverage(raster, wholeRaster(raster), CK);
	if (!coverage) throw new Error('coverage normalized to an empty glyph');
	return C.decodeCoverageRows(C.encodeCoverageRows(coverage), coverage.widthPx, coverage.heightPx);   // as shipped
};
const realCoverage = Array.from({ length: SOURCE_LABELS }, (_, i) => ({ label: i + 1, coverage: coverageOf(coverageRasters[i + 1]) }));
const coverageCheck = [];
for (let label = 11; label <= SOURCE_LABELS; label++) {
	const verdict = C.classifyNormalizedCoverage(coverageOf(composeCoverageRaster(label)), realCoverage, { ...CK, minScore: -1, minMargin: 0 });
	coverageCheck.push({ label, bestLabel: verdict.bestLabel, ncc: round3(verdict.bestScore), margin: round3(verdict.ambiguityMargin) });
}
const coverageFailed = coverageCheck.filter((c) => c.bestLabel !== c.label);
if (coverageFailed.length) throw new Error(`coverage composition rule does not reproduce the font: ${JSON.stringify(coverageFailed)}`);
const composedCoverageFor = (bound) =>
	Array.from({ length: Math.max(0, bound - SOURCE_LABELS) }, (_, i) => ({ label: SOURCE_LABELS + 1 + i, coverage: coverageOf(composeCoverageRaster(SOURCE_LABELS + 1 + i)) }));
const coverageConfusion = CANDIDATE_BOUNDS.map((bound) => {
	const entries = [...realCoverage, ...composedCoverageFor(bound)].slice(0, bound);
	let best = { labels: null, ncc: -2 };
	for (let i = 0; i < entries.length; i++)
		for (let j = i + 1; j < entries.length; j++) {
			const ncc = C.bestCoverageScore(entries[i].coverage, entries[j].coverage, CK.maxShiftPx);
			if (ncc > best.ncc) best = { labels: [entries[i].label, entries[j].label], ncc };
		}
	return { bound, closestPair: { labels: best.labels, ncc: round3(best.ncc) } };
});
const coverageTemplates = [...realCoverage, ...composedCoverageFor(HOLE_LABEL_MAX)].slice(0, HOLE_LABEL_MAX);
const coverageOut = {
	schema: 'badgeCoverageTemplates@1',
	normalizedWidthPx: CK.normalizedWidthPx,
	normalizedHeightPx: CK.normalizedHeightPx,
	note:
		'Each template is normalizeBadgeCoverage() of a badge raster: per pixel the glyph coverage 0..1 as two hex digits (x 255). Rows top to bottom.',
	vocabulary: {
		labels: `1..${HOLE_LABEL_MAX}`,
		from: 'digits/holeLabels.ts HOLE_LABEL_MAX',
		raster: `1..${SOURCE_LABELS}: dev-course badge sprites (artifacts/badge-coverage-sources/sources.json)`,
		composed: `${SOURCE_LABELS + 1}..${HOLE_LABEL_MAX}: those sprites' digit coverage patches side by side (scripts/generate-badge-glyph-templates.mjs)`,
		font: {
			gapPx: coverageFont.gapPx, padPx: coverageFont.padPx, topPx: coverageFont.topPx, heightPx: coverageFont.heightPx, minWidthPx: coverageFont.minWidthPx,
			unit: 'px of the dev badge sprites (medians over 10..18; minWidthPx over 1..9)'
		},
		compositionCheck: { rule: '11..18 composed from lone glyphs classify as themselves against the sprite templates', rows: coverageCheck },
		confusion: { unit: 'normalized cross-correlation between the two closest templates of 1..bound', rows: coverageConfusion }
	},
	templates: coverageTemplates.map(({ label, coverage }) => ({ label, rows: C.encodeCoverageRows(coverage) }))
};
console.log('coverage font (px of the dev sprites):', JSON.stringify({ ...coverageFont, lone: undefined }));
console.log('coverage composition check (11..18 from lone glyphs):', JSON.stringify(coverageCheck));
for (const row of coverageConfusion) console.log(`coverage: closest pair in 1..${row.bound}: ${row.closestPair.labels.join(' vs ')} at NCC ${row.closestPair.ncc}`);

// ---- digit templates (the black-and-white digit reader, digits/badgeDigitTemplateMath.ts) -------------
// Cut from the same dev badge sprites through the reader's own binarization and layout: the lone 1..9 of
// badges 1..9, the left "1" of 10..18, the right 0..8 of 10..18. So "0" exists only as the right digit of 10
// and "9" only as the lone 9 (a right-hand 9, as in 19, is read against it).

const DG = dist('digits/badgeDigitTemplateMath.js');
const DK = DG.DEFAULT_BADGE_DIGIT_TEMPLATE_KNOBS;
const DIGIT_OUT_PATH = join(ROOT, 'packages/alg/src/detectors/threeFactor/assets/badge-digit-templates.json');
const digitTemplates = [];
for (let label = 1; label <= SOURCE_LABELS; label++) {
	const raster = coverageRasters[label];
	const layouts = DG.badgeDigitLayouts(DG.sampleBadgeDigits(raster, wholeRaster(raster)), DK);
	if (label <= 9) digitTemplates.push({ digit: label, from: `${label}`, mask: layouts.one[0] });
	else {
		if (!layouts.two) throw new Error(`dev sprite ${label} did not split into two digit cells`);
		digitTemplates.push({ digit: 1, from: `${label} left`, mask: layouts.two[0] }, { digit: label - 10, from: `${label} right`, mask: layouts.two[1] });
	}
}
const shippedDigits = digitTemplates.map((t) => ({ ...t, mask: DG.decodeDigitRows(rowsOf(t.mask), t.mask.widthPx, t.mask.heightPx) }));
const digitCheck = [];
for (let label = 1; label <= SOURCE_LABELS; label++) {
	const raster = coverageRasters[label];
	const read = DG.classifyBadgeDigitsAgainstTemplates(raster, wholeRaster(raster), shippedDigits, null, DK);
	digitCheck.push({ label, read: read.label, margin: round3(read.margin) });
}
const digitFailed = digitCheck.filter((c) => c.read !== String(c.label));
if (digitFailed.length) throw new Error(`digit templates do not read their own sprites: ${JSON.stringify(digitFailed)}`);
let closestDigits = { digits: null, dice: -1 };
for (let i = 0; i < shippedDigits.length; i++)
	for (let j = i + 1; j < shippedDigits.length; j++) {
		if (shippedDigits[i].digit === shippedDigits[j].digit) continue;
		const dice = bestMaskScore(shippedDigits[i].mask, shippedDigits[j].mask, DK.maxShiftPx);
		if (dice > closestDigits.dice) closestDigits = { digits: [shippedDigits[i].from, shippedDigits[j].from], dice };
	}
const digitOut = {
	schema: 'badgeDigitTemplates@1',
	digitWidthPx: DK.digitWidthPx,
	digitHeightPx: DK.digitHeightPx,
	note: 'Digit cells of the dev badge sprites (artifacts/badge-coverage-sources) through sampleBadgeDigits + badgeDigitLayouts. Rows are 0/1 per pixel, top to bottom.',
	sources: 'lone 1..9 of badges 1..9; left 1 of 10..18; right 0..8 of 10..18. 0 only from 10; 9 only from the lone 9.',
	selfCheck: { rule: 'each dev sprite 1..18 reads as itself', rows: digitCheck },
	closestDifferentDigits: { unit: 'shifted Dice', ...closestDigits, dice: round3(closestDigits.dice) },
	templates: digitTemplates.map(({ digit, from, mask }) => ({ digit, from, rows: rowsOf(mask) }))
};
console.log('digit self-check (dev sprites 1..18):', JSON.stringify(digitCheck.map((c) => c.margin)));
console.log('closest different digits:', JSON.stringify(digitOut.closestDifferentDigits));

// ---- write or check --------------------------------------------------------------------------------
const outputs = [[OUT_PATH, JSON.stringify(out, null, '\t') + '\n'], [COVERAGE_OUT_PATH, JSON.stringify(coverageOut, null, '\t') + '\n'], [DIGIT_OUT_PATH, JSON.stringify(digitOut, null, '\t') + '\n']];
if (process.argv.includes('--check')) {
	let stale = 0;
	for (const [path, text] of outputs) {
		const current = (() => { try { return readFileSync(path, 'utf8'); } catch { return null; } })();
		console.log(`${path}: ${current === text ? 'current' : 'differs from a fresh bake'}`);
		if (current !== text) stale++;
	}
	process.exit(stale ? 1 : 0);
}
for (const [path, text] of outputs) writeFileSync(path, text);
console.log(`wrote ${templates.length} binary and ${coverageTemplates.length} coverage templates (1..${HOLE_LABEL_MAX}), ${digitTemplates.length} digit templates`);
