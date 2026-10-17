"use strict";
// Coordinate-transform ledger: an ordered record of every transform that
// moved a pixel coordinate from its raw, original-image position to its
// final canonical-frame position. Every G0 operation that changes what a
// coordinate means (crop, placement, projection) appends one entry instead
// of silently mutating positions — this is what lets truth matching claim
// 'reconciled-verified' ("we RAN the transform and can show it") rather
// than merely 'dims-only' ("the numbers happen to agree").
Object.defineProperty(exports, "__esModule", { value: true });
exports.createLedger = createLedger;
exports.appendEntry = appendEntry;
exports.appendEntries = appendEntries;
function createLedger() {
    return { entries: [] };
}
/** Ledgers are immutable — appending returns a new ledger, never mutates. */
function appendEntry(ledger, entry) {
    return { entries: [...ledger.entries, entry] };
}
function appendEntries(ledger, entries) {
    return { entries: [...ledger.entries, ...entries] };
}
//# sourceMappingURL=ledger.js.map