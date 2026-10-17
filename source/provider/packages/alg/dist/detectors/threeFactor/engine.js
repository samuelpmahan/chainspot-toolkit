"use strict";
// The threeFactor engine: executes a config-declared unit order over the
// evidence board, resolving ABFeatures and collecting the spatial trace.
// The DEFAULT config is the recovered production baseline
// (pinned by tests/unit/threeFactorParity.test.ts).
Object.defineProperty(exports, "__esModule", { value: true });
exports.SEEDED_SLOTS = exports.DEFAULT_EXECUTION = exports.ENGINE_UNITS = void 0;
exports.createTraceContext = createTraceContext;
exports.resolveConfiguredParams = resolveConfiguredParams;
exports.runEngine = runEngine;
const assignment_1 = require("./assignment");
const measure_1 = require("./measure");
const board_1 = require("../../exec/board");
const compile_1 = require("../../exec/compile");
const gateway_1 = require("../../exec/gateway");
const registry_1 = require("./features/registry");
const g4_scoring_1 = require("./features/g4.scoring");
const g4_search_1 = require("./features/g4.search");
const g5_ribbon_1 = require("./features/g5.ribbon");
const g5_routing_1 = require("./features/g5.routing");
const g3_phantomTee_1 = require("./features/g3.phantomTee");
const g3_teeFamily_1 = require("./features/g3.teeFamily");
const g3_teeMinAreaPose_1 = require("./features/g3.teeMinAreaPose");
const g3_teeRecovery_1 = require("./features/g3.teeRecovery");
const st_straightTest_1 = require("./features/st.straightTest");
const g4_teeBadgeLock_1 = require("./features/g4.teeBadgeLock");
const g1_badgeGlyphTemplate_1 = require("./features/g1.badgeGlyphTemplate");
const occlusion_1 = require("./occlusion");
const g2_cleanBasketFamily_1 = require("./features/g2.cleanBasketFamily");
const types_1 = require("./features/types");
const assignmentUnit = {
    id: 'assignment',
    gate: 'G6',
    consumes: ['measurement', 'recoveredTees'],
    produces: ['assignment'],
    note: 'straight-route pair scoring + global one-to-one ownership',
    run(board, ctx) {
        const stop = ctx.span('assignment');
        const measurement = board.get('measurement');
        const recovered = board.get('recoveredTees');
        const straightMeasurement = measurement.parameters.zfit
            ? { ...measurement, parameters: { ...measurement.parameters, zfit: false } }
            : measurement;
        const scoringKnobs = ctx.resolve(g4_scoring_1.g4ScoringFeature).knobs;
        const searchKnobs = ctx.resolve(g4_search_1.g4SearchFeature).knobs;
        const ribbonKnobs = ctx.resolve(g5_ribbon_1.g5RibbonFeature).knobs;
        const routingKnobs = ctx.resolve(g5_routing_1.g5RoutingFeature).knobs;
        const assignment = (0, assignment_1.assignThreeFactor)(straightMeasurement, recovered, undefined, scoringKnobs, searchKnobs, ribbonKnobs, routingKnobs);
        for (const own of assignment.assignments) {
            ctx.measure('assignment', 'score', own.score);
        }
        board.set('assignment', assignment);
        stop();
    }
};
const zfitUnit = {
    id: 'zfit',
    gate: 'G7',
    consumes: ['measurement', 'assignment'],
    produces: ['assignment'],
    note: 'optional bent-path Z-fit refinement after straight assignment',
    run(board) {
        // The operation-level implementation owns execution; this unit declaration
        // exists for config validation and schema generation.
        board.set('assignment', board.get('assignment'));
    }
};
exports.ENGINE_UNITS = [
    ...measure_1.measureUnits,
    assignmentUnit,
    zfitUnit,
    g3_phantomTee_1.phantomTeeUnit,
    g3_teeFamily_1.teeFamilyUnit,
    g3_teeMinAreaPose_1.teeMinAreaPoseUnit,
    g3_teeRecovery_1.teeRecoveryUnit,
    g4_teeBadgeLock_1.teeBadgeLockUnit,
    g1_badgeGlyphTemplate_1.badgeGlyphTemplateUnit,
    g2_cleanBasketFamily_1.cleanBasketFamilyUnit,
    st_straightTest_1.straightTestUnit
];
exports.DEFAULT_EXECUTION = [
    ...measure_1.DEFAULT_MEASURE_EXECUTION.slice(0, measure_1.DEFAULT_MEASURE_EXECUTION.indexOf('tees') + 1),
    'teeFamily',
    ...measure_1.DEFAULT_MEASURE_EXECUTION.slice(measure_1.DEFAULT_MEASURE_EXECUTION.indexOf('tees') + 1),
    'assignment',
    'teeRecovery',
    'zfit'
];
/** Slots the engine seeds before any unit runs. */
exports.SEEDED_SLOTS = [
    'image',
    'localImage',
    'params',
    'viewport',
    'paramsHash',
    'recoveredTees',
    /** Always present at production front doors. Sweep may replace this
     * separate S0-only payload with verified canonical comparison assistance
     * before execution; it never changes detector/raster evidence. */
    'straightTestTruthAssistance'
];
function createTraceContext(resolved, paramsHash, operations = [], metadata = {}) {
    const unitById = new Map(exports.ENGINE_UNITS.map((unit) => [unit.id, unit]));
    const traces = new Map();
    const heatmaps = {};
    let straightTest;
    const featureIdsByUnit = new Map();
    for (const operation of operations) {
        let ids = featureIdsByUnit.get(operation.unit);
        if (!ids) {
            ids = [];
            featureIdsByUnit.set(operation.unit, ids);
        }
        for (const featureId of operation.features ?? []) {
            if (!ids.includes(featureId))
                ids.push(featureId);
        }
    }
    function traceFor(unitId) {
        let entry = traces.get(unitId);
        if (!entry) {
            const gate = unitById.get(unitId)?.gate ?? 'shared';
            const boundFeatureIds = featureIdsByUnit.get(unitId) ?? [];
            const fallbackFeature = (0, registry_1.featureById)(unitId);
            const featureIds = boundFeatureIds.length > 0 ? boundFeatureIds : fallbackFeature ? [fallbackFeature.id] : [];
            const featureId = featureIds.find((id) => (0, registry_1.featureById)(id)?.render?.units.includes(unitId)) ?? featureIds[0];
            const feature = featureId ? (0, registry_1.featureById)(featureId) : undefined;
            const state = featureId
                ? resolved.features[featureId]
                : undefined;
            const knobs = state?.knobs ?? (feature ? (0, types_1.defaultKnobs)(feature) : {});
            const deviating = feature
                ? Object.entries(knobs)
                    .filter(([name, value]) => feature.knobs[name]?.default !== value)
                    .map(([name]) => name)
                : [];
            entry = {
                id: unitId,
                gate,
                ...(featureId ? { featureId } : {}),
                featureIds,
                enabled: state?.enabled ?? true,
                knobs,
                knobsDeviating: deviating,
                ms: 0,
                drawables: [],
                measurements: []
            };
            traces.set(unitId, entry);
        }
        return entry;
    }
    const trace = {
        configName: resolved.name,
        paramsHash,
        ...metadata,
        execution: resolved.execution,
        features: resolved.features,
        units: [],
        heatmaps
    };
    const ctx = {
        occlusion: new occlusion_1.OcclusionDetector(),
        resolve(feature) {
            return (resolved.features[feature.id] ?? {
                enabled: feature.defaultEnabled,
                knobs: (0, types_1.defaultKnobs)(feature)
            });
        },
        measure(unitId, name, value) {
            const entry = traceFor(unitId);
            let aggregate = entry.measurements.find((m) => m.name === name);
            if (!aggregate) {
                aggregate = { name, count: 0, min: Infinity, max: -Infinity, sum: 0 };
                entry.measurements.push(aggregate);
            }
            aggregate.count++;
            aggregate.sum += value;
            if (value < aggregate.min)
                aggregate.min = value;
            if (value > aggregate.max)
                aggregate.max = value;
        },
        overlay(unitId, drawable) {
            traceFor(unitId).drawables.push(drawable);
        },
        heatmap(unitId, key, data) {
            traceFor(unitId);
            heatmaps[key] = data;
        },
        recordStraightTest(value) {
            // An empty S0 result is still an executed semantic stage. Materialize
            // its UnitTrace even when it emitted no geometry drawables so receipts
            // can distinguish "ran and abstained" from "not scheduled".
            traceFor('straightTest');
            straightTest = value;
        },
        span(unitId) {
            const start = performance.now();
            return () => {
                traceFor(unitId).ms += performance.now() - start;
            };
        }
    };
    return {
        ctx,
        trace: {
            ...trace,
            get units() {
                return [...traces.values()];
            },
            get straightTest() {
                return straightTest;
            }
        }
    };
}
/**
 * Injects a baseline feature's knob value into ThreeFactorParams at the
 * key it already rides (measure.ts's makeParameters), when the caller
 * hasn't set that param explicitly. Shared by every baseline feature whose
 * knobs ride CorridorParams instead of a function parameter of their own
 * (g5.ribbon's fieldScale/supportTau, g5.routing's corridorWidthPx/
 * orientations/widthsSrc/alignmentPower/worstWindowSrcPx) — precedence is
 * caller-explicit param > config knob > frozen default.
 */
function bridgeParam(params, key, state, knobName) {
    if (!state || params?.[key] !== undefined)
        return params;
    return { ...(params ?? {}), [key]: state.knobs[knobName] };
}
/**
 * Resolve every config feature whose values ride the legacy
 * ThreeFactorParams/CorridorParams seed. All execution front doors must call
 * this before seedBoard so the config hash and the executed parameters cannot
 * disagree. Caller-explicit numeric/routing params retain precedence over
 * baseline knobs. An enabled zfit ABFeature remains authoritative over the
 * legacy boolean flag, preserving the existing config behavior.
 */
function resolveConfiguredParams(params, resolved) {
    if (!resolved)
        return params;
    const zfitState = resolved.features['zfit'];
    let effectiveParams = zfitState?.enabled
        ? { ...(params ?? {}), zfit: true }
        : params;
    const ribbonState = resolved.features['ribbon'];
    effectiveParams = bridgeParam(effectiveParams, 'fieldScale', ribbonState, 'fieldScale');
    effectiveParams = bridgeParam(effectiveParams, 'supportTau', ribbonState, 'supportTau');
    const routingState = resolved.features['routing'];
    effectiveParams = bridgeParam(effectiveParams, 'corridorWidthPx', routingState, 'corridorWidthPx');
    effectiveParams = bridgeParam(effectiveParams, 'orientations', routingState, 'orientations');
    effectiveParams = bridgeParam(effectiveParams, 'widthsSrc', routingState, 'widthsSrc');
    effectiveParams = bridgeParam(effectiveParams, 'alignmentPower', routingState, 'alignmentPower');
    effectiveParams = bridgeParam(effectiveParams, 'worstWindowSrcPx', routingState, 'worstWindowSrcPx');
    return effectiveParams;
}
/**
 * Run the engine: seed the board, validate the execution order against unit
 * declarations, execute in the config's order. `resolved` carries the
 * feature states and the order; omit for frozen defaults with no trace.
 */
function runEngine(image, params, recoveredTees, resolved, paramsHash) {
    const execution = resolved?.execution ?? exports.DEFAULT_EXECUTION;
    // Compile validates the fully-expanded OPERATION list against the op-level
    // dependency DAG (stronger than the old unit-level validateExecution it
    // replaces: it also proves each decomposed unit's own internal chain is a
    // genuine, satisfiable dependency order — R2). `resolved` may be absent
    // (frozen-default, no-trace callers, e.g. the parity pin): compile still
    // needs a ResolvedConfig shape to expand `execution`, so an empty-features
    // stand-in is used — ctx (nullFeatureContext below) never consults it.
    const compileTarget = resolved ?? {
        name: 'frozen-default',
        execution,
        features: {}
    };
    const plan = (0, compile_1.compileExecutionPlan)(compileTarget, paramsHash);
    const effectiveParams = resolveConfiguredParams(params, resolved);
    // Exactly ONE gateway walks operations from here down — executeCompiledPlan
    // (packages/alg/src/exec/gateway.ts). The board is now the exec layer's
    // generic string-keyed ExecBoard; it is structurally identical to the
    // EvidenceBoard the legacy unit bodies expect (get/has/set), so
    // seedBoard — untouched — still seeds it directly.
    const board = (0, board_1.createExecBoard)();
    (0, measure_1.seedBoard)(board, image, effectiveParams);
    board.set('paramsHash', paramsHash ?? plan.planFingerprint);
    board.set('recoveredTees', recoveredTees);
    board.set('straightTestTruthAssistance', {
        mode: 'blind',
        locks: []
    });
    const withTrace = resolved !== undefined;
    const { ctx, trace } = withTrace
        ? createTraceContext(resolved, paramsHash ?? '', plan.ops)
        : { ctx: types_1.nullFeatureContext, trace: undefined };
    (0, gateway_1.executeCompiledPlan)(plan, board, ctx);
    return {
        measurement: board.get('measurement'),
        assignment: board.get('assignment'),
        ...(withTrace ? { trace } : {})
    };
}
//# sourceMappingURL=engine.js.map