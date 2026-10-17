"use strict";
// CanonicalTruth — Annotation JSON loaded as native truth (no reshaping),
// plus the C3 match-level rule that says HOW confidently a given
// CanonicalFrame corresponds to a given truth file.
//
// TRUTH FIREWALL: nothing in this file, or anywhere else in G0, ever feeds
// a CanonicalTruth value INTO a measure/decide function as an input that
// changes production output. Truth is evaluation/assistance metadata only.
Object.defineProperty(exports, "__esModule", { value: true });
exports.matchTruth = matchTruth;
function matchTruth(rawImageSha256, frame, truth) {
    if (rawImageSha256 === truth.sourceImage.sha256)
        return { level: 'byte', matchedAgainst: 'raw' };
    if (frame.imageId === truth.sourceImage.sha256)
        return { level: 'byte', matchedAgainst: 'canonical' };
    const dimsMatch = frame.widthPx === truth.sourceImage.widthPx && frame.heightPx === truth.sourceImage.heightPx;
    if (!dimsMatch)
        return null;
    const transformRan = frame.ledger.entries.some((entry) => entry.kind === 'crop' || entry.kind === 'placement');
    if (transformRan)
        return { level: 'reconciled-verified' };
    return {
        level: 'dims-only',
        warning: 'Dimensions match the truth source image, but the ledger records no crop or placement transform that produced them — this may be coincidence. Treat this match as unverified.'
    };
}
//# sourceMappingURL=truth.js.map