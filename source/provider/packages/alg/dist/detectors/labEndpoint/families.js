"use strict";
/**
 * Repeated-family discovery over component size space, matching the baseline's
 * anchored_families / family_spread semantics exactly (including stable
 * ordering: anchor order determines first-seen family order; the final sort by
 * size is stable, so equal-size families keep anchor order).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.logSizeDistance = logSizeDistance;
exports.componentSizeDistance = componentSizeDistance;
exports.bboxSizeDistance = bboxSizeDistance;
exports.median = median;
exports.anchoredFamilies = anchoredFamilies;
exports.familySpread = familySpread;
function logSizeDistance(aMajor, aMinor, bMajor, bMinor) {
    return Math.max(Math.abs(Math.log(aMajor / bMajor)), Math.abs(Math.log(aMinor / bMinor)));
}
function componentSizeDistance(a, b) {
    return logSizeDistance(a.major, a.minor, b.major, b.minor);
}
function bboxSizeDistance(a, b) {
    return Math.max(Math.abs(Math.log(a.bboxW / b.bboxW)), Math.abs(Math.log(a.bboxH / b.bboxH)));
}
/** np.median: mean of the two middle elements for even-length input. */
function median(values) {
    const sorted = values.slice().sort((a, b) => a - b);
    const n = sorted.length;
    const mid = n >> 1;
    return n % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
function anchoredFamilies(components, tolerance, distanceFn = componentSizeDistance) {
    const families = [];
    const seen = new Set();
    for (const anchor of components) {
        const family = components.filter((c) => distanceFn(anchor, c) <= tolerance);
        const key = family
            .map((c) => c.label)
            .sort((a, b) => a - b)
            .join(',');
        if (seen.has(key))
            continue;
        seen.add(key);
        families.push(family);
    }
    // Stable sort by size descending (Array.prototype.sort is stable per spec).
    return families
        .map((f, i) => [f, i])
        .sort((a, b) => b[0].length - a[0].length || a[1] - b[1])
        .map(([f]) => f);
}
function familySpread(family) {
    if (family.length === 0)
        return Infinity;
    const major = median(family.map((c) => c.major));
    const minor = median(family.map((c) => c.minor));
    return median(family.map((c) => logSizeDistance(c.major, c.minor, major, minor)));
}
//# sourceMappingURL=families.js.map