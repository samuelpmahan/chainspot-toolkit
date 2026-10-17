"use strict";
// R2: the real operation universe. A unit stays an ownership/grouping
// label (`OperationSpec.unit`); the operations below are the scheduling
// and debug nodes a step-by-step scrubber walks. Three units get genuine
// substep decomposition (badgeStage, tees, assignment — the ones the
// owner's brief named explicitly); the other nine keep their existing
// EngineUnit body as a single operation — a deliberate cut, defended in
// the Wave 1A report, not "11 units relabeled as 11 operations."
//
// Every decomposed op calls the SAME exported pure functions the
// monolithic unit already called (recoverDarkPlateBadges/
// excludeAndAssembleTees were extracted, not duplicated — see
// badgeStage.ts and measure.ts; rerouteRawPairs/scoreRawPairs/
// rankPairsByBadge/recoveredTee were merely un-privated in assignment.ts).
// Same functions, same order, same arguments — the decomposition changes
// scheduling granularity, not arithmetic, which is what keeps this
// byte-identical to the pre-Wave-1A engine.
Object.defineProperty(exports, "__esModule", { value: true });
exports.ARTIFACT_EXTRACTORS = exports.KNOWN_UNIT_IDS = exports.operationCalculationBindings = exports.operationImpls = exports.OPERATION_UNIVERSE = exports.OPERATION_DEFS = exports.UNIT_OPERATIONS = void 0;
exports.withHoleLabels = withHoleLabels;
const measure_1 = require("../detectors/threeFactor/measure");
const g3_phantomTee_1 = require("../detectors/threeFactor/features/g3.phantomTee");
const g3_teeFamily_1 = require("../detectors/threeFactor/features/g3.teeFamily");
const g3_teeMinAreaPose_1 = require("../detectors/threeFactor/features/g3.teeMinAreaPose");
const g3_teeRecovery_1 = require("../detectors/threeFactor/features/g3.teeRecovery");
const g4_teeBadgeLock_1 = require("../detectors/threeFactor/features/g4.teeBadgeLock");
const g4_posteriorTeeRecovery_1 = require("../detectors/threeFactor/features/g4.posteriorTeeRecovery");
const g2_cleanBasketFamily_1 = require("../detectors/threeFactor/features/g2.cleanBasketFamily");
const g1_badges_1 = require("../detectors/threeFactor/features/g1.badges");
const g1_digits_1 = require("../detectors/threeFactor/features/g1.digits");
const g1_badgeGlyphTemplate_1 = require("../detectors/threeFactor/features/g1.badgeGlyphTemplate");
const shared_hsv_1 = require("../detectors/threeFactor/features/shared.hsv");
const g2_sprite_1 = require("../detectors/threeFactor/features/g2.sprite");
const g3_endpoints_1 = require("../detectors/threeFactor/features/g3.endpoints");
const g4_scoring_1 = require("../detectors/threeFactor/features/g4.scoring");
const g4_search_1 = require("../detectors/threeFactor/features/g4.search");
const g5_ribbon_1 = require("../detectors/threeFactor/features/g5.ribbon");
const g5_routing_1 = require("../detectors/threeFactor/features/g5.routing");
const g5_zfit_1 = require("../detectors/threeFactor/features/g5.zfit");
const raster_1 = require("../detectors/threeFactor/raster");
const componentField_1 = require("../detectors/threeFactor/componentField");
const badgeEvidence_1 = require("../detectors/threeFactor/badgeEvidence");
const objects_1 = require("../detectors/threeFactor/objects");
const m1Representation_1 = require("../detectors/threeFactor/m1Representation");
const g5_badgeM2Aa_1 = require("../detectors/threeFactor/features/g5.badgeM2Aa");
const sha256_1 = require("./sha256");
const badgeStage_1 = require("../detectors/threeFactor/badgeStage");
const measure_2 = require("../detectors/threeFactor/measure");
const endpoints_1 = require("../detectors/threeFactor/endpoints");
const assignment_1 = require("../detectors/threeFactor/assignment");
const st_straightTest_1 = require("../detectors/threeFactor/features/st.straightTest");
const types_1 = require("../detectors/threeFactor/types");
/** Cast: ExecBoard (string-keyed) is structurally a superset of the closed-EvidenceSlot EvidenceBoard the legacy unit.run bodies expect. */
function asLegacyBoard(board) {
    return board;
}
const measureUnitById = new Map(measure_1.measureUnits.map((unit) => [unit.id, unit]));
function legacyUnit(id) {
    const unit = measureUnitById.get(id);
    if (!unit)
        throw new Error(`exec/operations: no legacy unit '${id}'`);
    return unit;
}
function wrapLegacy(id, kind, gate, features, note, calculationAddress = `fn.${id}`) {
    const unit = legacyUnit(id);
    return {
        spec: {
            id,
            kind,
            gate,
            unit: id,
            consumes: unit.consumes,
            produces: unit.produces,
            calculations: [calculationAddress],
            ...(features ? { features } : {}),
            ...(note ? { note } : {})
        },
        run: (board, ctx) => unit.run(asLegacyBoard(board), ctx),
        calculationBindings: [{ address: calculationAddress, calculate: unit.run }]
    };
}
const badgeStageOps = [
    {
        spec: {
            id: 'badgeStage.masks',
            kind: 'measure',
            gate: 'G1',
            unit: 'badgeStage',
            consumes: ['localImage'],
            produces: ['badgeStage.masks'],
            calculations: ['fn.computeBrightDarkMasks'],
            features: [shared_hsv_1.sharedHsvFeature.id],
            note: 'HSV bright/dark thresholding over the viewport-cropped local image'
        },
        run(board, ctx) {
            const stop = ctx.span('badgeStage');
            const hsvKnobs = ctx.resolve(shared_hsv_1.sharedHsvFeature).knobs;
            const image = board.get('localImage');
            board.set('badgeStage.masks', (0, raster_1.computeBrightDarkMasks)(image, hsvKnobs));
            stop();
        },
        calculationBindings: [
            { address: 'fn.computeBrightDarkMasks', calculate: raster_1.computeBrightDarkMasks }
        ]
    },
    {
        spec: {
            id: 'badgeStage.components',
            kind: 'transform',
            gate: 'G1',
            unit: 'badgeStage',
            consumes: ['badgeStage.masks'],
            produces: ['badgeStage.components'],
            calculations: ['fn.groupBrightDarkComponentFields'],
            note: '8-connected component labeling of the bright mask'
        },
        run(board, ctx) {
            const stop = ctx.span('badgeStage');
            const { bright, dark } = board.get('badgeStage.masks');
            board.set('badgeStage.components', (0, componentField_1.groupBrightDarkComponentFields)({ bright, dark }));
            stop();
        },
        calculationBindings: [
            { address: 'fn.groupBrightDarkComponentFields', calculate: componentField_1.groupBrightDarkComponentFields }
        ]
    },
    {
        spec: {
            id: 'badgeStage.family',
            kind: 'compute',
            gate: 'G1',
            unit: 'badgeStage',
            consumes: ['badgeStage.masks', 'badgeStage.components', 'localImage'],
            produces: ['badgeStage.family'],
            calculations: ['fn.detectBadgeFamily'],
            features: [g1_badges_1.g1BadgesFeature.id],
            note: 'anchored bright-family badge candidates (aspect + dark-interior gates)'
        },
        run(board, ctx) {
            const stop = ctx.span('badgeStage');
            const knobs = ctx.resolve(g1_badges_1.g1BadgesFeature).knobs;
            const { dark } = board.get('badgeStage.masks');
            const { components: brightComponents } = board.get('badgeStage.components').bright;
            const image = board.get('localImage');
            board.set('badgeStage.family', (0, badgeStage_1.detectBadgeFamily)(image.width, dark, brightComponents, knobs));
            stop();
        },
        calculationBindings: [{ address: 'fn.detectBadgeFamily', calculate: badgeStage_1.detectBadgeFamily }]
    },
    {
        spec: {
            id: 'badgeStage.badges',
            kind: 'decide',
            gate: 'G1',
            unit: 'badgeStage',
            consumes: ['badgeStage.masks', 'badgeStage.components', 'badgeStage.family', 'localImage'],
            produces: ['stage'],
            calculations: ['fn.recoverDarkPlateBadges'],
            features: [g1_badges_1.g1BadgesFeature.id],
            note: 'dark-plate glyph recovery accept/reject, then materialize the BadgeStageResult'
        },
        run(board, ctx) {
            const stop = ctx.span('badgeStage');
            const knobs = ctx.resolve(g1_badges_1.g1BadgesFeature).knobs;
            const image = board.get('localImage');
            const { bright, dark } = board.get('badgeStage.masks');
            const fields = board.get('badgeStage.components');
            const { labels: brightLabels, components: brightComponents } = fields.bright;
            const { labels: darkLabels, components: darkComponents } = fields.dark;
            const family = board.get('badgeStage.family');
            const badges = [...family];
            const badgeSources = badges.map(() => 'bright-family');
            const plateBboxes = badges.map(() => null);
            (0, badgeStage_1.recoverDarkPlateBadges)(image.width, bright, dark, badges, badgeSources, plateBboxes, knobs, darkComponents);
            const stage = {
                width: image.width,
                height: image.height,
                brightMask: bright,
                darkMask: dark,
                brightLabels,
                brightComponents: [...brightComponents],
                darkLabels,
                darkComponents: [...darkComponents],
                badges,
                badgeSources,
                plateBboxes,
                badgeCount: badges.length,
                plateInteriorMarginPx: knobs.plateInteriorMargin,
                plateFrameTolerancePx: knobs.plateFrameTolerancePx
            };
            board.set('stage', stage);
            stop();
        },
        calculationBindings: [
            { address: 'fn.recoverDarkPlateBadges', calculate: badgeStage_1.recoverDarkPlateBadges }
        ]
    }
];
// ---------------------------------------------------------------------------
// Visible tees only: hollow-ring measurement followed by exclusion/family
// decision. Component/shard recovery is deliberately a separate phase.
const teesOps = [
    {
        spec: {
            id: 'tees.ringMeasure',
            kind: 'measure',
            gate: 'G3',
            unit: 'tees',
            consumes: ['stage'],
            produces: ['tees.rawRings'],
            calculations: ['fn.detectTeeRings'],
            features: [g3_endpoints_1.g3EndpointsFeature.id],
            note: 'enclosed-hole hollow-glyph ring detection over the bright mask, unfiltered'
        },
        run(board, ctx) {
            const stop = ctx.span('tees');
            const stage = board.get('stage');
            const endpointsKnobs = ctx.resolve(g3_endpoints_1.g3EndpointsFeature).knobs;
            board.set('tees.rawRings', (0, endpoints_1.detectTeeRings)(stage.brightMask, endpointsKnobs));
            stop();
        },
        calculationBindings: [{ address: 'fn.detectTeeRings', calculate: endpoints_1.detectTeeRings }]
    },
    {
        spec: {
            id: 'tees.exclusion',
            kind: 'decide',
            gate: 'G3',
            unit: 'tees',
            consumes: ['tees.rawRings', 'stage', 'sprites', 'viewport'],
            produces: ['tees'],
            calculations: ['fn.excludeAndAssembleVisibleTees'],
            features: [g4_scoring_1.g4ScoringFeature.id, g3_endpoints_1.g3EndpointsFeature.id, g1_badges_1.g1BadgesFeature.id],
            note: 'visible hollow-ring candidates only: badge-bbox + screen-chrome exclusion, then sort/assign detIds; shard recovery is separate'
        },
        run(board, ctx) {
            const stop = ctx.span('tees');
            const stage = board.get('stage');
            const sprites = board.get('sprites');
            const { topPx } = board.get('viewport');
            const rawRings = board.get('tees.rawRings');
            const scoringKnobs = ctx.resolve(g4_scoring_1.g4ScoringFeature).knobs;
            const endpointsKnobs = ctx.resolve(g3_endpoints_1.g3EndpointsFeature).knobs;
            const badgeStageKnobs = ctx.resolve(g1_badges_1.g1BadgesFeature).knobs;
            const tees = (0, measure_2.excludeAndAssembleTees)(stage, rawRings, [], sprites, topPx, ctx, scoringKnobs, endpointsKnobs, badgeStageKnobs);
            for (const tee of tees) {
                ctx.overlay('tees', {
                    type: 'box',
                    bbox: tee.bbox,
                    verdict: 'accepted',
                    ref: tee.detId,
                    values: { fill: tee.fill, area: tee.area }
                });
            }
            board.set('tees', tees);
            stop();
        },
        calculationBindings: [
            { address: 'fn.excludeAndAssembleVisibleTees', calculate: measure_2.excludeAndAssembleTees }
        ]
    }
];
// ---------------------------------------------------------------------------
// assignment — decomposed per R2's own example: scoring compute, selection
// decide (plus the pairing/reroute transform and ranking compute the owner
// text elided with "...").
function pairKey(pair) {
    return `${pair.raw.teeId}:${pair.raw.basketId}`;
}
const assignmentOps = [
    {
        spec: {
            id: 'assignment.pairs',
            kind: 'transform',
            gate: 'G6',
            unit: 'assignment',
            consumes: ['measurement', 'recoveredTees'],
            produces: ['assignment.tees', 'assignment.rawPairs'],
            calculations: ['fn.mergeRecoveredTeesAndReuseOrReroutePairs'],
            features: [g4_scoring_1.g4ScoringFeature.id, g4_search_1.g4SearchFeature.id, g5_ribbon_1.g5RibbonFeature.id, g5_routing_1.g5RoutingFeature.id],
            note: 'merge deduped recovered tees, reroute raw pairs when any were accepted'
        },
        run(board, ctx) {
            const stop = ctx.span('assignment');
            const measurement = board.get('measurement');
            const recoveredTees = board.get('recoveredTees');
            const scoringKnobs = ctx.resolve(g4_scoring_1.g4ScoringFeature).knobs;
            const searchKnobs = ctx.resolve(g4_search_1.g4SearchFeature).knobs;
            const ribbonKnobs = ctx.resolve(g5_ribbon_1.g5RibbonFeature).knobs;
            const routingKnobs = ctx.resolve(g5_routing_1.g5RoutingFeature).knobs;
            const sortedRecovered = [...recoveredTees].sort((a, b) => a.yPx - b.yPx || a.xPx - b.xPx || a.provenance.note.localeCompare(b.provenance.note));
            const tees = [...measurement.tees];
            let acceptedRecovered = 0;
            for (const input of sortedRecovered) {
                if (tees.some((tee) => Math.hypot(tee.xPx - input.xPx, tee.yPx - input.yPx) <
                    searchKnobs.recoveredTeeDedupeDistance))
                    continue;
                tees.push((0, assignment_1.recoveredTee)(input, acceptedRecovered++, measurement.baskets, scoringKnobs));
            }
            tees.sort((a, b) => a.yPx - b.yPx || a.xPx - b.xPx || a.detId.localeCompare(b.detId));
            const rawPairs = acceptedRecovered > 0
                ? (0, assignment_1.rerouteRawPairs)(measurement, tees, ribbonKnobs, routingKnobs, scoringKnobs)
                : measurement.rawPairs;
            board.set('assignment.tees', tees);
            board.set('assignment.rawPairs', rawPairs);
            stop();
        }
    },
    {
        spec: {
            id: 'assignment.scoring',
            kind: 'compute',
            gate: 'G6',
            unit: 'assignment',
            consumes: ['measurement', 'assignment.tees', 'assignment.rawPairs'],
            produces: ['assignment.scoredPairs'],
            calculations: ['fn.scoreStraightTeeBasketPairs'],
            features: [g4_scoring_1.g4ScoringFeature.id],
            note: 'score every pair on the straight-route evidence; bent-path salvage belongs to G7'
        },
        run(board, ctx) {
            const stop = ctx.span('assignment');
            const measurement = board.get('measurement');
            const tees = board.get('assignment.tees');
            const rawPairs = board.get('assignment.rawPairs');
            const scoringKnobs = ctx.resolve(g4_scoring_1.g4ScoringFeature).knobs;
            const straightMeasurement = measurement.parameters.zfit
                ? { ...measurement, parameters: { ...measurement.parameters, zfit: false } }
                : measurement;
            board.set('assignment.scoredPairs', (0, assignment_1.scoreRawPairs)(straightMeasurement, tees, rawPairs, undefined, scoringKnobs));
            stop();
        },
        calculationBindings: [
            { address: 'fn.scoreStraightTeeBasketPairs', calculate: assignment_1.scoreRawPairs }
        ]
    },
    {
        spec: {
            id: 'assignment.ranking',
            kind: 'compute',
            gate: 'G6',
            unit: 'assignment',
            consumes: ['assignment.scoredPairs'],
            produces: ['assignment.rankedByBadge'],
            calculations: ['fn.rankTeeBasketPairsByBadge'],
            note: 'rank scored pairs within each badge'
        },
        run(board, ctx) {
            const stop = ctx.span('assignment');
            const scored = board.get('assignment.scoredPairs');
            board.set('assignment.rankedByBadge', (0, assignment_1.rankPairsByBadge)(scored));
            stop();
        },
        calculationBindings: [
            { address: 'fn.rankTeeBasketPairsByBadge', calculate: assignment_1.rankPairsByBadge }
        ]
    },
    {
        spec: {
            id: 'assignment.selection',
            kind: 'decide',
            gate: 'G6',
            unit: 'assignment',
            consumes: ['assignment.rankedByBadge', 'measurement', 'assignment.tees'],
            produces: ['assignment'],
            calculations: ['fn.selectOneToOneTeeBasketAssignments'],
            features: [g4_search_1.g4SearchFeature.id],
            note: 'global one-to-one ownership search, then materialize the ThreeFactorAssignment'
        },
        run(board, ctx) {
            const stop = ctx.span('assignment');
            const measurement = board.get('measurement');
            const tees = board.get('assignment.tees');
            const byBadge = board.get('assignment.rankedByBadge');
            const searchKnobs = ctx.resolve(g4_search_1.g4SearchFeature).knobs ?? assignment_1.DEFAULT_SEARCH_KNOBS;
            const scoredPairs = [...byBadge.values()].flat();
            const selected = (0, assignment_1.selectAssignments)(byBadge, searchKnobs);
            const assignments = [...selected.entries()]
                .filter((entry) => entry[1] !== null)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([badgeId, pair]) => ({
                badgeId,
                teeId: pair.raw.teeId,
                basketId: pair.raw.basketId,
                score: pair.score,
                rank: pair.rank,
                ownership: 'selected',
                alternatives: (byBadge.get(badgeId) ?? [])
                    .filter((candidate) => pairKey(candidate) !== pairKey(pair))
                    .slice(0, 3)
                    .map((candidate) => ({
                    teeId: candidate.raw.teeId,
                    basketId: candidate.raw.basketId,
                    score: candidate.score
                }))
            }));
            const result = { measurement, tees, scoredPairs, assignments };
            for (const own of result.assignments)
                ctx.measure('assignment', 'score', own.score);
            board.set('assignment', result);
            stop();
        },
        calculationBindings: [
            { address: 'fn.selectOneToOneTeeBasketAssignments', calculate: assignment_1.selectAssignments }
        ]
    }
];
const zfitOps = [
    {
        spec: {
            id: 'zfit',
            kind: 'compute',
            gate: 'G7',
            unit: 'zfit',
            consumes: ['measurement', 'assignment.tees', 'assignment.rawPairs', 'assignment'],
            produces: ['assignment'],
            features: [g5_zfit_1.zfitFeature.id, g4_scoring_1.g4ScoringFeature.id, g4_search_1.g4SearchFeature.id],
            note: 'when enabled, rescore the top-K weak straight routes with bent-path Z-fit and reselect ownership'
        },
        run(board, ctx) {
            const stop = ctx.span('zfit');
            const state = ctx.resolve(g5_zfit_1.zfitFeature);
            const measurement = board.get('measurement');
            const tees = board.get('assignment.tees');
            const rawPairs = board.get('assignment.rawPairs');
            const prior = board.get('assignment');
            if (!state.enabled) {
                board.set('assignment', prior);
                stop();
                return;
            }
            const zfitKnobs = state.knobs;
            const scoringKnobs = ctx.resolve(g4_scoring_1.g4ScoringFeature).knobs;
            const searchKnobs = ctx.resolve(g4_search_1.g4SearchFeature).knobs ?? assignment_1.DEFAULT_SEARCH_KNOBS;
            const scored = (0, assignment_1.scoreRawPairs)(measurement, tees, rawPairs, zfitKnobs, scoringKnobs);
            const byBadge = (0, assignment_1.rankPairsByBadge)(scored);
            const selected = (0, assignment_1.selectAssignments)(byBadge, searchKnobs);
            const assignments = [...selected.entries()]
                .filter((entry) => entry[1] !== null)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([badgeId, pair]) => ({
                badgeId,
                teeId: pair.raw.teeId,
                basketId: pair.raw.basketId,
                score: pair.score,
                rank: pair.rank,
                ownership: 'selected',
                alternatives: (byBadge.get(badgeId) ?? [])
                    .filter((candidate) => pairKey(candidate) !== pairKey(pair))
                    .slice(0, 3)
                    .map((candidate) => ({
                    teeId: candidate.raw.teeId,
                    basketId: candidate.raw.basketId,
                    score: candidate.score
                }))
            }));
            for (const own of assignments)
                ctx.measure('zfit', 'score', own.score);
            board.set('assignment', {
                measurement,
                tees,
                scoredPairs: [...byBadge.values()].flat(),
                assignments
            });
            stop();
        }
    }
];
// ---------------------------------------------------------------------------
// The nine units that keep a single operation — real DAG nodes, just not
// decomposed further (R2: "your judgment on the exact cut").
const reusedOps = [
    {
        spec: {
            id: 'straightTest',
            kind: 'decide',
            gate: 'G5',
            unit: 'straightTest',
            consumes: st_straightTest_1.straightTestUnit.consumes,
            produces: st_straightTest_1.straightTestUnit.produces,
            features: [st_straightTest_1.straightTestFeature.id],
            note: st_straightTest_1.straightTestUnit.note
        },
        run: (board, ctx) => st_straightTest_1.straightTestUnit.run(asLegacyBoard(board), ctx)
    },
    wrapLegacy('badges', 'compute', 'G1', [g1_digits_1.g1DigitsFeature.id], undefined, 'fn.readAndAssembleCourseBadges'),
    {
        spec: {
            id: 'badgeGlyphTemplate',
            kind: 'decide',
            gate: 'G1',
            unit: 'badgeGlyphTemplate',
            consumes: g1_badgeGlyphTemplate_1.badgeGlyphTemplateUnit.consumes,
            produces: g1_badgeGlyphTemplate_1.badgeGlyphTemplateUnit.produces,
            features: [g1_badgeGlyphTemplate_1.badgeGlyphTemplateFeature.id],
            note: g1_badgeGlyphTemplate_1.badgeGlyphTemplateUnit.note
        },
        run: (board, ctx) => g1_badgeGlyphTemplate_1.badgeGlyphTemplateUnit.run(asLegacyBoard(board), ctx)
    },
    wrapLegacy('supportField', 'measure', 'G5', [g5_ribbon_1.g5RibbonFeature.id]),
    wrapLegacy('badgeOcclusionPatch', 'transform', 'G5', [g5_ribbon_1.g5RibbonFeature.id]),
    wrapLegacy('baskets', 'compute', 'G2', [g2_sprite_1.g2SpriteFeature.id], undefined, 'fn.matchBasketSpritesAndAssembleEvidence'),
    wrapLegacy('rawPairs', 'compute', 'G5', [
        g5_ribbon_1.g5RibbonFeature.id,
        g5_routing_1.g5RoutingFeature.id,
        g4_scoring_1.g4ScoringFeature.id
    ]),
    wrapLegacy('measurement', 'materialize', 'G5'),
    {
        spec: {
            id: 'badgeEvidence.materialize',
            kind: 'materialize',
            gate: 'G5',
            unit: 'badgeEvidence',
            consumes: ['image', 'viewport', 'paramsHash', 'badgeStage.components', 'measurement'],
            produces: ['badgeEvidence.library'],
            note: 'materialize exact Badge B+W, naive AA, residue, and source-field evidence'
        },
        run(board) {
            const image = board.get('image');
            const fields = board.get('badgeStage.components');
            const measurement = board.get('measurement');
            const { topPx } = board.get('viewport');
            const paramsHash = board.get('paramsHash');
            const rgba = new Uint8Array(image.data.buffer, image.data.byteOffset, image.data.byteLength);
            const rasterSha = (0, sha256_1.sha256HexSyncText)(`${image.width}x${image.height}:${(0, sha256_1.sha256HexSync)(rgba)}`);
            const graph = (0, objects_1.acquireObjectGraphV1)(measurement, {
                width: image.width,
                height: fields.bright.mask.height,
                brightLabels: fields.bright.labels,
                darkLabels: fields.dark.labels,
                brightComponents: fields.bright.components,
                darkComponents: fields.dark.components
            });
            const specimens = graph.badges.flatMap((object) => {
                const assembly = object.raster.componentAssembly;
                if (!assembly || assembly.status !== 'assembled')
                    return [];
                return [
                    (0, badgeEvidence_1.materializeBadgeEvidence)(image, fields, object.evidence, assembly, {
                        imageId: rasterSha,
                        paramsHash,
                        detector: types_1.THREE_FACTOR_ALGO,
                        detectorVersion: types_1.THREE_FACTOR_ALGO_VERSION
                    }, topPx)
                ];
            });
            board.set('badgeEvidence.library', {
                badges: specimens,
                m1: (0, m1Representation_1.materializeM1Representation)(graph, fields, {
                    imageId: rasterSha,
                    paramsHash,
                    detector: types_1.THREE_FACTOR_ALGO,
                    detectorVersion: types_1.THREE_FACTOR_ALGO_VERSION
                }, topPx)
            });
        }
    },
    {
        spec: g5_badgeM2Aa_1.badgeM2AaOperation.spec,
        run: g5_badgeM2Aa_1.badgeM2AaOperation.run
    },
    {
        spec: {
            id: 'phantomTee',
            kind: 'decide',
            gate: 'G4',
            unit: 'phantomTee',
            consumes: g3_phantomTee_1.phantomTeeUnit.consumes,
            produces: g3_phantomTee_1.phantomTeeUnit.produces,
            features: [
                g3_phantomTee_1.phantomTeeFeature.id,
                g5_zfit_1.zfitFeature.id,
                g4_scoring_1.g4ScoringFeature.id,
                g4_search_1.g4SearchFeature.id,
                g5_ribbon_1.g5RibbonFeature.id,
                g5_routing_1.g5RoutingFeature.id
            ],
            note: g3_phantomTee_1.phantomTeeUnit.note
        },
        run: (board, ctx) => g3_phantomTee_1.phantomTeeUnit.run(asLegacyBoard(board), ctx)
    },
    {
        spec: g4_teeBadgeLock_1.teeBadgeLockOperation.spec,
        run: g4_teeBadgeLock_1.teeBadgeLockOperation.run,
        calculationBindings: g4_teeBadgeLock_1.teeBadgeLockOperation.calculationBindings
    },
    {
        spec: g4_posteriorTeeRecovery_1.posteriorTeeRecoveryOperation.spec,
        run: g4_posteriorTeeRecovery_1.posteriorTeeRecoveryOperation.run
    },
    {
        spec: {
            id: 'teeFamily',
            kind: 'decide',
            gate: 'G3',
            unit: 'teeFamily',
            consumes: g3_teeFamily_1.teeFamilyUnit.consumes,
            produces: g3_teeFamily_1.teeFamilyUnit.produces,
            calculations: ['fn.selectVisibleTeeFamily'],
            features: [g3_teeFamily_1.teeFamilyFeature.id],
            note: g3_teeFamily_1.teeFamilyUnit.note
        },
        run: (board, ctx) => g3_teeFamily_1.teeFamilyUnit.run(asLegacyBoard(board), ctx),
        calculationBindings: [
            { address: 'fn.selectVisibleTeeFamily', calculate: g3_teeFamily_1.teeFamilyUnit.run }
        ]
    },
    {
        spec: {
            id: 'teeMinAreaPose',
            kind: 'decide',
            gate: 'G3',
            unit: 'teeMinAreaPose',
            consumes: g3_teeMinAreaPose_1.teeMinAreaPoseUnit.consumes,
            produces: g3_teeMinAreaPose_1.teeMinAreaPoseUnit.produces,
            features: [g3_teeMinAreaPose_1.teeMinAreaPoseFeature.id],
            note: g3_teeMinAreaPose_1.teeMinAreaPoseUnit.note
        },
        run: (board, ctx) => g3_teeMinAreaPose_1.teeMinAreaPoseUnit.run(asLegacyBoard(board), ctx)
    },
    {
        spec: {
            id: 'teeRecovery',
            kind: 'decide',
            gate: 'G4',
            unit: 'teeRecovery',
            consumes: g3_teeRecovery_1.teeRecoveryUnit.consumes,
            produces: [...g3_teeRecovery_1.teeRecoveryUnit.produces, 'assignment.tees', 'assignment.rawPairs'],
            calculations: ['fn.recoverTeeShardsAndRepublishAssignment'],
            features: [g3_teeRecovery_1.teeRecoveryFeature.id],
            note: g3_teeRecovery_1.teeRecoveryUnit.note
        },
        run(board, ctx) {
            g3_teeRecovery_1.teeRecoveryUnit.run(asLegacyBoard(board), ctx);
            // Recovery reruns assignment without mutating the immutable G5
            // measurement. Republish its final inventory and routes into the
            // downstream assignment slots so G7 never reads the pre-recovery 15-tee
            // state after G4 has produced an 18-tee assignment.
            const assignment = board.get('assignment');
            board.set('assignment.tees', assignment.tees);
            board.set('assignment.rawPairs', assignment.scoredPairs.map((pair) => pair.raw));
        }
    },
    {
        spec: {
            id: 'cleanBasketFamily',
            kind: 'decide',
            gate: 'G2',
            unit: 'cleanBasketFamily',
            consumes: g2_cleanBasketFamily_1.cleanBasketFamilyUnit.consumes,
            produces: g2_cleanBasketFamily_1.cleanBasketFamilyUnit.produces,
            features: [g2_cleanBasketFamily_1.cleanBasketFamilyFeature.id],
            note: g2_cleanBasketFamily_1.cleanBasketFamilyUnit.note
        },
        run: (board, ctx) => g2_cleanBasketFamily_1.cleanBasketFamilyUnit.run(asLegacyBoard(board), ctx)
    }
];
const allOpDefs = [
    ...badgeStageOps,
    ...teesOps,
    ...assignmentOps,
    ...zfitOps,
    ...reusedOps
];
const opDefById = new Map(allOpDefs.map((def) => [def.spec.id, def]));
/**
 * Unit id -> its fixed-order operation id list. Config `execution` arrays
 * are still authored at unit granularity (R3: no schema bump); compile.ts
 * expands each unit id through this table to build the op-level plan.
 * Intra-unit order is NOT configurable — it is the unit's own internal
 * dependency chain, fixed at registration time. Map insertion order below
 * is also the canonical (default.json) unit order, used only to make
 * OPERATION_UNIVERSE's iteration order readable — compile.ts's actual
 * scheduling always follows the RESOLVED config's execution list, never
 * this map's key order.
 */
exports.UNIT_OPERATIONS = new Map([
    ['straightTest', ['straightTest']],
    ['badgeStage', badgeStageOps.map((op) => op.spec.id)],
    ['badges', ['badges']],
    ['badgeGlyphTemplate', ['badgeGlyphTemplate']],
    ['supportField', ['supportField']],
    ['badgeOcclusionPatch', ['badgeOcclusionPatch']],
    ['baskets', ['baskets']],
    ['tees', teesOps.map((op) => op.spec.id)],
    ['rawPairs', ['rawPairs']],
    ['measurement', ['measurement']],
    ['badgeEvidence', ['badgeEvidence.materialize', 'badgeEvidence.m2Aa']],
    ['assignment', assignmentOps.map((op) => op.spec.id)],
    ['zfit', zfitOps.map((op) => op.spec.id)],
    ['phantomTee', ['phantomTee']],
    ['teeBadgeLock', ['teeBadgeLock', 'posteriorTeeRecovery']],
    ['teeFamily', ['teeFamily']],
    ['teeMinAreaPose', ['teeMinAreaPose']],
    ['teeRecovery', ['teeRecovery']],
    ['cleanBasketFamily', ['cleanBasketFamily']]
]);
exports.OPERATION_DEFS = [...exports.UNIT_OPERATIONS.values()].flatMap((opIds) => opIds.map((opId) => {
    const def = opDefById.get(opId);
    if (!def)
        throw new Error(`exec/operations: missing OperationDef for '${opId}'`);
    return def;
}));
exports.OPERATION_UNIVERSE = exports.OPERATION_DEFS.map((def) => def.spec);
exports.operationImpls = new Map(exports.OPERATION_DEFS.map((def) => [def.spec.id, def.run]));
/**
 * Runtime function bindings for the fn.* addresses declared by each real
 * operation.  This map is testimony only; operationImpls remains the sole
 * execution authority.
 */
exports.operationCalculationBindings = new Map(exports.OPERATION_DEFS.map((def) => [
    def.spec.id,
    def.calculationBindings ?? [
        {
            address: def.spec.calculations?.[0] ?? `fn.${def.spec.id}`,
            calculate: def.run
        }
    ]
]));
/** The unit ids compile.ts's inherited validateExecution already understands (unchanged, unit-granularity legality check). */
exports.KNOWN_UNIT_IDS = [...exports.UNIT_OPERATIONS.keys()];
// ---------------------------------------------------------------------------
// Artifact extraction — a representative, not exhaustive, slice of each
// ArtifactKind so the evidence chain exercises every kind the contract
// declares. Kept separate from OperationSpec (contract.ts stays minimal).
function jsonBytes(value) {
    return new TextEncoder().encode(JSON.stringify(value));
}
function maskBytes(mask) {
    return mask.data;
}
function floatBytes(data) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
}
function withHoleLabels(assignments, badges) {
    const badgeById = new Map(badges.map((badge) => [badge.detId, badge]));
    return assignments.map((row) => {
        const badge = badgeById.get(row.badgeId);
        return {
            ...row,
            hole: badge?.label ?? 'UNREAD',
            holeConfidence: badge ? badge.confidence : null
        };
    });
}
exports.ARTIFACT_EXTRACTORS = {
    'badgeStage.masks'(board) {
        const image = board.get('localImage');
        const { bright, dark } = board.get('badgeStage.masks');
        return [
            {
                kind: 'rgba',
                id: 'badgeStage.masks.localImage',
                bytes: Uint8Array.from(image.data),
                dims: { width: image.width, height: image.height }
            },
            {
                kind: 'mask',
                id: 'badgeStage.masks.bright',
                bytes: maskBytes(bright),
                dims: { width: bright.width, height: bright.height }
            },
            {
                kind: 'mask',
                id: 'badgeStage.masks.dark',
                bytes: maskBytes(dark),
                dims: { width: dark.width, height: dark.height }
            }
        ];
    },
    'badgeStage.components'(board) {
        const fields = board.get('badgeStage.components');
        return [
            {
                kind: 'componentSet',
                id: 'badgeStage.components.bright',
                bytes: jsonBytes(fields.bright.components)
            },
            {
                kind: 'componentSet',
                id: 'badgeStage.components.dark',
                bytes: jsonBytes(fields.dark.components)
            }
        ];
    },
    'badgeEvidence.materialize'(board) {
        const library = board.get('badgeEvidence.library');
        const specimens = library.badges;
        const representation = library.m1;
        return [
            ...specimens.map((specimen) => ({
                kind: 'badgeEvidence',
                id: `badgeEvidence.${specimen.provenance.imageId.slice(0, 12)}.${specimen.id}`,
                bytes: (0, badgeEvidence_1.encodeMaterializedBadgeEvidence)(specimen)
            })),
            {
                kind: 'm1Representation',
                id: `m1Representation.${representation.provenance.imageId.slice(0, 12)}`,
                bytes: (0, m1Representation_1.encodeMaterializedM1Representation)(representation)
            }
        ];
    },
    'badgeEvidence.m2Aa'(board) {
        return [...(g5_badgeM2Aa_1.badgeM2AaOperation.extractArtifacts?.(board) ?? [])];
    },
    'tees.exclusion'(board) {
        const tees = board.get('tees');
        return [{ kind: 'candidateSet', id: 'tees.exclusion.kept', bytes: jsonBytes(tees) }];
    },
    supportField(board) {
        const field = board.get('supportField');
        return [
            { kind: 'scalarField', id: 'supportField.support', bytes: floatBytes(field.support) },
            { kind: 'orientationField', id: 'supportField.bestTheta', bytes: floatBytes(field.bestTheta) }
        ];
    },
    rawPairs(board) {
        const rawPairs = board.get('rawPairs');
        const sample = rawPairs[0];
        if (!sample)
            return [];
        return [
            { kind: 'polyline', id: 'rawPairs.sampleTeeLeg', bytes: jsonBytes(sample.teeLeg.path) }
        ];
    },
    'assignment.selection'(board) {
        const assignment = board.get('assignment');
        const measurement = board.get('measurement');
        return [
            {
                kind: 'measurementTable',
                id: 'assignment.selection.table',
                bytes: jsonBytes(withHoleLabels(assignment.assignments, measurement.badges))
            }
        ];
    },
    zfit(board) {
        const assignment = board.get('assignment');
        const measurement = board.get('measurement');
        return [
            {
                kind: 'measurementTable',
                id: 'zfit.finalAssignment.table',
                bytes: jsonBytes(withHoleLabels(assignment.assignments, measurement.badges))
            }
        ];
    },
    teeBadgeLock(board) {
        return [...(g4_teeBadgeLock_1.teeBadgeLockOperation.extractArtifacts?.(board) ?? [])];
    },
    posteriorTeeRecovery(board) {
        return [...(g4_posteriorTeeRecovery_1.posteriorTeeRecoveryOperation.extractArtifacts?.(board) ?? [])];
    }
};
//# sourceMappingURL=operations.js.map