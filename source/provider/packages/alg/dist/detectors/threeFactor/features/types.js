"use strict";
// Core types for the config-driven threeFactor engine.
//
// The algorithm is executed as an ordered list of UNITS over a shared
// evidence board; the order comes from the CONFIG (the single readable
// source of truth for the alg), validated against each unit's declared
// consumes/produces. ABFeatures are behavior with an A/B-style easy-off:
// baseline units default ON and deviations default OFF so the default config
// remains the explicit recovered production behavior.
Object.defineProperty(exports, "__esModule", { value: true });
exports.nullFeatureContext = exports.LAB_GATE_MAPPING = exports.GATE_TITLES = exports.CANONICAL_GATE_ORDER = void 0;
exports.defaultKnobs = defaultKnobs;
const occlusion_1 = require("../occlusion");
exports.CANONICAL_GATE_ORDER = ['G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7'];
/**
 * Owner's phase model (2026-08-28): G4 is Recovery (Tee + Basket) and carries
 * the endpoints-complete contract — after the G4 phase, every endpoint the run
 * will ever have is on the board (visible G3 tees plus recovered ones; phantom
 * completion stays a default-OFF deviation). G5 Straight Test has two parts:
 * part 1 is straight evidence (support field, raw pairs, measurement), part 2
 * is assignment/completion of straight holes — delivered by the G6-owned
 * assignment operations, which the `--through G5` cutoff therefore schedules.
 * G6 is the bent-pathfinding + refinement phase (anything left has one or more
 * bends); its terminal refinement is Z-fit, which stays in the G7 slot as the
 * terminal operation rather than being folded into g6-set — the least invasive
 * encoding, because set membership, imports, and ownership tests stay intact
 * while the `--through G6` cutoff folds the terminal slot into the phase.
 */
exports.GATE_TITLES = {
    G1: 'Badges',
    G2: 'Baskets',
    G3: 'Visible Tees',
    G4: 'Recovery (Tee + Basket)',
    G5: 'Straight Test',
    G6: 'Assignment',
    G7: 'Bend Refinement',
    shared: 'Shared Infrastructure'
};
/**
 * Mapping to the LAB registry cards (scripts/chainspot-lab/gates.ts, ids
 * 0-7). LAB 0 (Crop + Stitch) is pre-detector and has no engine gate.
 */
exports.LAB_GATE_MAPPING = {
    0: 'pre-detector',
    1: 'G1',
    2: 'G2',
    3: 'G3',
    4: 'G4',
    5: 'G5',
    6: 'G6',
    7: 'G7'
};
/** No-op context: legacy callers pay nothing and change nothing. */
exports.nullFeatureContext = {
    occlusion: new occlusion_1.OcclusionDetector(),
    resolve(feature) {
        return { enabled: feature.defaultEnabled, knobs: defaultKnobs(feature) };
    },
    measure() { },
    overlay() { },
    heatmap() { },
    span() {
        return () => { };
    }
};
function defaultKnobs(feature) {
    const out = {};
    for (const [name, spec] of Object.entries(feature.knobs))
        out[name] = spec.default;
    return out;
}
//# sourceMappingURL=types.js.map