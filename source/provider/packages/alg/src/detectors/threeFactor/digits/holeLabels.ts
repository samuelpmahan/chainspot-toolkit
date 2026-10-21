/**
 * The hole-label vocabulary every G1 badge reader shares: the whole numbers
 * 1..HOLE_LABEL_MAX.
 *
 * Both readers check against it: the per-digit reader (measure.ts
 * `labelCandidates` / `classifyReading`) and the whole-glyph template
 * witness (g1.badgeGlyphTemplate, whose baked asset must carry exactly
 * these labels). Before this module the bound was a bare 18 in both places,
 * so a course with more than 18 holes could not be read: a "24" was mapped
 * onto the nearest label in 10..18 ("14"), and S1 then dropped one of the
 * two "14"s as a collision.
 *
 * Why 27, measured on the template vocabulary (bake script
 * scripts/generate-badge-glyph-templates.mjs; numbers are shifted-Dice
 * between baked 24x18 template masks):
 *   - 1..18 (the real UDisc rasters): the closest two templates are 15 and
 *     16 at 0.854.
 *   - 1..27 (19..27 composed from the same font's digit glyphs): the
 *     closest are 22 and 23 at 0.856, so the vocabulary is no more
 *     confusable than it already was, and no 1..18 template gains a closer
 *     neighbour.
 *   - 1..36: 26 and 28 reach 0.925, far closer than any pair the matcher was
 *     proven on.
 * 27 is also three 9-hole loops. The per-digit reader is indifferent to the
 * bound (its posterior margin on the dev badges is 0.981 or more at 1..18,
 * 1..27 and 1..36 alike); the bound is set by the whole-glyph witness.
 * A read outside the vocabulary is never projected onto it: the per-digit
 * reader abstains with 'out-of-vocabulary' (measure.ts `classifyReading`).
 */
export const HOLE_LABEL_MAX = 27;

/** 1..HOLE_LABEL_MAX in ascending order. */
export const HOLE_LABELS: readonly number[] = Object.freeze(
	Array.from({ length: HOLE_LABEL_MAX }, (_, index) => index + 1)
);

/** True when `label` is a hole label of the vocabulary. */
export function isHoleLabel(label: number): boolean {
	return Number.isInteger(label) && label >= 1 && label <= HOLE_LABEL_MAX;
}
