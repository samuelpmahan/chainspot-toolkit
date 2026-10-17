"use strict";
// Generic evidence store for the compiled-operation execution model.
// Structurally identical to threeFactor/features/types.ts's EvidenceBoard
// (get/has/set, fail-loud reads) but keyed by the open SlotRef string
// instead of the closed EvidenceSlot enum, so it can carry BOTH the
// classic unit-level slots ('stage', 'badges', 'measurement', ...) and the
// new dotted sub-slots a decomposed operation introduces ('badgeStage.
// masks', 'assignment.scoredPairs', ...) in one store. Browser-safe: no
// I/O, no node built-ins.
Object.defineProperty(exports, "__esModule", { value: true });
exports.pxKey = pxKey;
exports.pxFn = pxFn;
exports.createExecBoard = createExecBoard;
exports.trackAccess = trackAccess;
function pxKey(address) {
    return Object.freeze({ address });
}
function pxFn(address) {
    return Object.freeze({ address });
}
function addressOf(slot) {
    return typeof slot === 'string' ? slot : slot.address;
}
function createExecBoard() {
    const slots = new Map();
    const calculations = new Map();
    return {
        get(slot) {
            const address = addressOf(slot);
            if (!slots.has(address))
                throw new Error(`exec board: slot '${address}' not produced yet.`);
            return slots.get(address);
        },
        has: (slot) => slots.has(addressOf(slot)),
        set: (slot, value) => {
            slots.set(addressOf(slot), value);
        },
        register(fn, calculate) {
            const current = calculations.get(fn.address);
            if (current && current !== calculate) {
                throw new Error(`PxC: calculation '${fn.address}' is already registered.`);
            }
            calculations.set(fn.address, calculate);
        },
        call(fn, args) {
            const calculate = calculations.get(fn.address);
            if (!calculate)
                throw new Error(`PxC: calculation '${fn.address}' is not registered.`);
            return calculate(args);
        }
    };
}
/**
 * Wraps a board so every get()/set() call made through the wrapper during
 * one operation's run is recorded — the gateway's source for `actualConsumes`/
 * `actualProduces` on that operation's Receipt (see contract.ts). The
 * underlying board is untouched; this is a one-shot recorder, not a
 * persistent proxy.
 */
function trackAccess(board, tick) {
    const consumed = new Set();
    const produced = new Set();
    const writes = [];
    const declaredConsumes = new Set(tick.consumes);
    const tracked = {
        get(slot) {
            const address = addressOf(slot);
            consumed.add(address);
            try {
                return board.get(slot);
            }
            catch (error) {
                if (!board.has(slot)) {
                    throw new Error(`PxC: Tick '${tick.id}' read missing address '${address}'.`, {
                        cause: error
                    });
                }
                throw error;
            }
        },
        has: (slot) => board.has(slot),
        set: (slot, value) => {
            const address = addressOf(slot);
            const existed = board.has(slot);
            produced.add(address);
            writes.push({
                address,
                kind: !existed
                    ? 'new-address'
                    : declaredConsumes.has(address)
                        ? 'refinement'
                        : 'replacement'
            });
            board.set(slot, value);
        },
        register: (fn, calculate) => board.register(fn, calculate),
        call: (fn, args) => board.call(fn, args)
    };
    return { tracked, consumed, produced, writes };
}
//# sourceMappingURL=board.js.map