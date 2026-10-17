"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GATE_CROSS_GATE_DEPENDENCIES = exports.GATE_FEATURE_DECLARATION_DIVERGENCES = exports.GATE_OPERATION_DECLARATION_DIVERGENCES = exports.GATE_OPERATION_OWNERSHIP = exports.GATE_SET_OPERATIONS = exports.GATE_FEATURE_SETS = exports.GATE_FEATURE_IDS = void 0;
const g1_badges_1 = require("./features/g1.badges");
const g1_digits_1 = require("./features/g1.digits");
const g1_badgeGlyphTemplate_1 = require("./features/g1.badgeGlyphTemplate");
const g2_sprite_1 = require("./features/g2.sprite");
const g2_cleanBasketFamily_1 = require("./features/g2.cleanBasketFamily");
const g3_endpoints_1 = require("./features/g3.endpoints");
const g3_teeFamily_1 = require("./features/g3.teeFamily");
const g3_teeMinAreaPose_1 = require("./features/g3.teeMinAreaPose");
const g3_teeRecovery_1 = require("./features/g3.teeRecovery");
const g3_phantomTee_1 = require("./features/g3.phantomTee");
const g4_teeBadgeLock_1 = require("./features/g4.teeBadgeLock");
const g4_posteriorTeeRecovery_1 = require("./features/g4.posteriorTeeRecovery");
const g4_scoring_1 = require("./features/g4.scoring");
const g4_search_1 = require("./features/g4.search");
const st_fourLaneSensor_1 = require("./features/st.fourLaneSensor");
const st_straightTest_1 = require("./features/st.straightTest");
const g5_ribbon_1 = require("./features/g5.ribbon");
const g5_routing_1 = require("./features/g5.routing");
const g5_badgeM2Aa_1 = require("./features/g5.badgeM2Aa");
const g5_zfit_1 = require("./features/g5.zfit");
const shared_hsv_1 = require("./features/shared.hsv");
const registry_1 = require("./features/registry");
const shared_services_1 = require("./shared-services");
const operations_1 = require("../../exec/operations");
/** Explicit owned feature membership, intentionally excluding parked supportRoi. */
exports.GATE_FEATURE_IDS = {
    'shared-set': ['hsv'],
    'g1-set': ['badges', 'digits', 'badgeGlyphTemplate'],
    'g2-set': ['sprite', 'cleanBasketFamily'],
    'g3-set': ['endpoints', 'teeFamily', 'teeMinAreaPose'],
    'g4-set': ['teeRecovery', 'phantomTee', 'teeBadgeLock', 'posteriorTeeRecovery'],
    'g5-set': ['fourLaneSensor', 'straightTest', 'ribbon', 'routing', 'badgeM2Aa'],
    'g6-set': ['scoring', 'search'],
    'g7-set': ['zfit']
};
const FEATURES = {
    'shared-set': [shared_hsv_1.sharedHsvFeature],
    'g1-set': [g1_badges_1.g1BadgesFeature, g1_digits_1.g1DigitsFeature, g1_badgeGlyphTemplate_1.badgeGlyphTemplateFeature],
    'g2-set': [g2_sprite_1.g2SpriteFeature, g2_cleanBasketFamily_1.cleanBasketFamilyFeature],
    'g3-set': [g3_endpoints_1.g3EndpointsFeature, g3_teeFamily_1.teeFamilyFeature, g3_teeMinAreaPose_1.teeMinAreaPoseFeature],
    'g4-set': [
        g3_teeRecovery_1.teeRecoveryFeature,
        g3_phantomTee_1.phantomTeeFeature,
        g4_teeBadgeLock_1.teeBadgeLockFeature,
        g4_posteriorTeeRecovery_1.posteriorTeeRecoveryFeature
    ],
    'g5-set': [
        st_fourLaneSensor_1.fourLaneSensorFeature,
        st_straightTest_1.straightTestFeature,
        g5_ribbon_1.g5RibbonFeature,
        g5_routing_1.g5RoutingFeature,
        g5_badgeM2Aa_1.badgeM2AaFeature
    ],
    'g6-set': [g4_scoring_1.g4ScoringFeature, g4_search_1.g4SearchFeature],
    'g7-set': [g5_zfit_1.zfitFeature]
};
/** The semantic production compositions, in the required feature order. */
exports.GATE_FEATURE_SETS = {
    'shared-set': {
        id: 'shared-set',
        features: FEATURES['shared-set'],
        services: shared_services_1.THREE_FACTOR_SHARED_SERVICES,
        imports: [],
        locallyOperationlessFeatureIds: ['hsv'],
        seededSlots: [],
        note: 'Shared cross-gate infrastructure.'
    },
    'g1-set': {
        id: 'g1-set',
        features: FEATURES['g1-set'],
        imports: ['hsv'],
        seededSlots: ['localImage', 'viewport']
    },
    'g2-set': {
        id: 'g2-set',
        features: FEATURES['g2-set'],
        imports: [],
        seededSlots: ['stage', 'viewport']
    },
    'g3-set': {
        id: 'g3-set',
        features: FEATURES['g3-set'],
        imports: ['badges', 'scoring'],
        seededSlots: ['stage', 'sprites', 'viewport']
    },
    'g4-set': {
        id: 'g4-set',
        features: FEATURES['g4-set'],
        imports: ['scoring', 'search', 'ribbon', 'routing', 'zfit'],
        seededSlots: [
            'stage',
            'badges',
            'baskets',
            'tees',
            'sprites',
            'viewport',
            'recoveredTees',
            'assignment',
            'measurement'
        ],
        note: 'Endpoint recovery: assignment prerequisites are supplied by the downstream composition; teeRecovery precedes terminal phantom completion.'
    },
    'g5-set': {
        id: 'g5-set',
        features: FEATURES['g5-set'],
        imports: ['scoring'],
        locallyOperationlessFeatureIds: ['fourLaneSensor'],
        seededSlots: [
            'image',
            'localImage',
            'params',
            'paramsHash',
            'viewport',
            'stage',
            'badgeStage.components',
            'badges',
            'baskets',
            'tees',
            'straightTestTruthAssistance'
        ]
    },
    'g6-set': {
        id: 'g6-set',
        features: FEATURES['g6-set'],
        imports: ['ribbon', 'routing'],
        seededSlots: ['measurement', 'recoveredTees']
    },
    'g7-set': {
        id: 'g7-set',
        features: FEATURES['g7-set'],
        imports: ['scoring', 'search'],
        seededSlots: ['measurement', 'assignment.tees', 'assignment.rawPairs', 'assignment']
    }
};
const SET_BY_GATE = {
    shared: 'shared-set',
    G1: 'g1-set',
    G2: 'g2-set',
    G3: 'g3-set',
    G4: 'g4-set',
    G5: 'g5-set',
    G6: 'g6-set',
    G7: 'g7-set'
};
/** Feature ownership is semantic too. Several feature declarations retain
 * the engine gate needed by config parsing (G4/G5), so feature.gate cannot be
 * used as the set boundary for those cards. */
const FEATURE_SET_BY_ID = Object.fromEntries(Object.entries(exports.GATE_FEATURE_IDS).flatMap(([setId, featureIds]) => featureIds.map((featureId) => [featureId, setId])));
/** Canonical semantic operation order, independent of stale engine gate labels.
 *
 * Endpoint recovery is represented by teeRecovery followed by phantomTee.
 * Straight evidence is owned by G5, assignment by G6, and Z-fit pathfinding
 * by G7; sets are never
 * consulted by production scheduling.
 */
const SEMANTIC_OPERATION_ORDER = {
    'shared-set': [],
    'g1-set': [
        'badgeStage.masks',
        'badgeStage.components',
        'badgeStage.family',
        'badgeStage.badges',
        'badges',
        'badgeGlyphTemplate'
    ],
    'g2-set': ['baskets', 'cleanBasketFamily'],
    'g3-set': ['tees.ringMeasure', 'tees.exclusion', 'teeFamily', 'teeMinAreaPose'],
    'g4-set': ['teeRecovery', 'phantomTee', 'teeBadgeLock', 'posteriorTeeRecovery'],
    'g5-set': [
        'straightTest',
        'supportField',
        'badgeOcclusionPatch',
        'rawPairs',
        'measurement',
        'badgeEvidence.materialize',
        'badgeEvidence.m2Aa'
    ],
    'g6-set': [
        'assignment.pairs',
        'assignment.scoring',
        'assignment.ranking',
        'assignment.selection'
    ],
    'g7-set': ['zfit']
};
const OPERATION_DEF_BY_ID = new Map(operations_1.OPERATION_DEFS.map((definition) => [definition.spec.id, definition]));
/** Operation definitions grouped once by semantic composition order. */
exports.GATE_SET_OPERATIONS = Object.fromEntries(Object.keys(exports.GATE_FEATURE_SETS).map((setId) => [setId, []]));
for (const [setId, operationIds] of Object.entries(SEMANTIC_OPERATION_ORDER)) {
    for (const operationId of operationIds) {
        const definition = OPERATION_DEF_BY_ID.get(operationId);
        if (!definition)
            throw new Error(`Unknown semantic operation '${operationId}' in '${setId}'`);
        const run = operations_1.operationImpls.get(operationId);
        if (!run)
            throw new Error(`Missing operation implementation '${operationId}'`);
        const extractArtifacts = Object.prototype.hasOwnProperty.call(operations_1.ARTIFACT_EXTRACTORS, operationId)
            ? operations_1.ARTIFACT_EXTRACTORS[operationId]
            : undefined;
        const operation = {
            spec: definition.spec,
            run,
            ...(extractArtifacts ? { extractArtifacts } : {})
        };
        exports.GATE_SET_OPERATIONS[setId].push({ operation });
    }
}
// Keep the public set object self-contained for the feature-set compiler seam.
for (const setId of Object.keys(exports.GATE_FEATURE_SETS)) {
    exports.GATE_FEATURE_SETS[setId] = {
        ...exports.GATE_FEATURE_SETS[setId],
        operations: exports.GATE_SET_OPERATIONS[setId]
    };
}
/** One-to-one operation ownership, useful to receipts and conformance tests. */
exports.GATE_OPERATION_OWNERSHIP = Object.fromEntries(Object.entries(exports.GATE_SET_OPERATIONS).flatMap(([setId, operations]) => operations.map(({ operation }) => [operation.spec.id, setId])));
/** Operation labels whose engine `spec.gate` is an old alias for the
 * semantic LAB composition. Keeping this exported makes the divergence
 * inspectable instead of silently trusting the stale label. */
exports.GATE_OPERATION_DECLARATION_DIVERGENCES = Object.fromEntries(operations_1.OPERATION_DEFS.flatMap(({ spec }) => {
    const semanticSet = exports.GATE_OPERATION_OWNERSHIP[spec.id];
    const declaredSet = SET_BY_GATE[spec.gate];
    return declaredSet === semanticSet
        ? []
        : [[spec.id, { declaredGate: spec.gate, semanticSet }]];
}));
/** Feature declarations that retain the engine gate vocabulary while their
 * authoritative semantic composition is a later LAB phase. */
exports.GATE_FEATURE_DECLARATION_DIVERGENCES = Object.fromEntries(registry_1.ALL_FEATURES.flatMap((feature) => {
    const semanticSet = FEATURE_SET_BY_ID[feature.id];
    const declaredSet = SET_BY_GATE[feature.gate];
    return declaredSet === semanticSet
        ? []
        : [[feature.id, { declaredGate: feature.gate, semanticSet }]];
}));
/** Feature reads crossing the operation's owning gate, never inferred as membership. */
exports.GATE_CROSS_GATE_DEPENDENCIES = Object.fromEntries(operations_1.OPERATION_DEFS.map(({ spec }) => {
    const owner = exports.GATE_OPERATION_OWNERSHIP[spec.id];
    const reads = (spec.features ?? []).filter((featureId) => {
        const feature = Object.values(FEATURES)
            .flat()
            .find((candidate) => candidate.id === featureId);
        return feature !== undefined && FEATURE_SET_BY_ID[feature.id] !== owner;
    });
    return [spec.id, reads];
}));
// Import-time integrity: a newly registered ABFeature cannot silently sit
// outside the gate compositions, and an operation cannot acquire a cross-gate
// read without the owning set declaring that import.
{
    const registryIds = new Set(registry_1.ALL_FEATURES.map((feature) => feature.id));
    const serviceRegistryIds = new Set(shared_services_1.THREE_FACTOR_SHARED_SERVICES.map((service) => service.id));
    const ownedIds = new Set();
    const ownedServiceIds = new Set();
    for (const [setId, set] of Object.entries(exports.GATE_FEATURE_SETS)) {
        const declaredIds = exports.GATE_FEATURE_IDS[setId];
        const actualIds = set.features.map((feature) => feature.id);
        if (declaredIds.length !== actualIds.length ||
            declaredIds.some((id, i) => id !== actualIds[i])) {
            throw new Error(`Gate ABFeatureSet '${setId}': GATE_FEATURE_IDS drifted from features.`);
        }
        for (const feature of set.features) {
            if (ownedIds.has(feature.id)) {
                throw new Error(`Gate ABFeatureSet: feature '${feature.id}' is owned more than once.`);
            }
            if (FEATURE_SET_BY_ID[feature.id] !== setId) {
                throw new Error(`Gate ABFeatureSet '${setId}': feature '${feature.id}' is semantically owned by another set.`);
            }
            ownedIds.add(feature.id);
        }
        for (const service of set.services ?? []) {
            if (!serviceRegistryIds.has(service.id)) {
                throw new Error(`Gate ABFeatureSet '${setId}': service '${service.id}' is absent from the shared-service registry.`);
            }
            if (ownedServiceIds.has(service.id)) {
                throw new Error(`Gate ABFeatureSet: service '${service.id}' is owned more than once.`);
            }
            ownedServiceIds.add(service.id);
        }
        const imports = set.imports ?? [];
        if (new Set(imports).size !== imports.length) {
            throw new Error(`Gate ABFeatureSet '${setId}': duplicate imported feature id.`);
        }
        const expectedImports = new Set((set.operations ?? []).flatMap(({ operation }) => (operation.spec.features ?? []).filter((id) => !actualIds.includes(id))));
        if (imports.length !== expectedImports.size ||
            imports.some((id) => !expectedImports.has(id) || !registryIds.has(id))) {
            throw new Error(`Gate ABFeatureSet '${setId}': explicit imports drifted from operation reads ` +
                `(declared=${imports.join(',') || 'none'}; expected=${[...expectedImports].join(',') || 'none'}).`);
        }
        const locallyRead = new Set((set.operations ?? []).flatMap(({ operation }) => operation.spec.features ?? []));
        const expectedOperationless = set.features
            .filter((feature) => !feature.operations?.length && !locallyRead.has(feature.id))
            .map((feature) => feature.id);
        const declaredOperationless = set.locallyOperationlessFeatureIds ?? [];
        if (declaredOperationless.length !== expectedOperationless.length ||
            declaredOperationless.some((id) => !expectedOperationless.includes(id))) {
            throw new Error(`Gate ABFeatureSet '${setId}': locally operationless feature inventory drifted.`);
        }
    }
    const composedOperationIds = Object.values(exports.GATE_SET_OPERATIONS).flatMap((operations) => operations.map(({ operation }) => operation.spec.id));
    const universeOperationIds = operations_1.OPERATION_DEFS.map(({ spec }) => spec.id);
    if (composedOperationIds.length !== universeOperationIds.length ||
        new Set(composedOperationIds).size !== composedOperationIds.length ||
        new Set(universeOperationIds).size !== universeOperationIds.length ||
        new Set(composedOperationIds).size !== new Set(universeOperationIds).size ||
        universeOperationIds.some((id) => !composedOperationIds.includes(id))) {
        throw new Error('Gate ABFeatureSets must own every operation exactly once.');
    }
    if (ownedIds.size !== registryIds.size || [...registryIds].some((id) => !ownedIds.has(id))) {
        throw new Error('Gate ABFeatureSets must own every registered ABFeature exactly once.');
    }
    if (ownedServiceIds.size !== serviceRegistryIds.size ||
        [...serviceRegistryIds].some((id) => !ownedServiceIds.has(id))) {
        throw new Error('Gate ABFeatureSets must own every registered shared service exactly once.');
    }
}
//# sourceMappingURL=gate-sets.js.map