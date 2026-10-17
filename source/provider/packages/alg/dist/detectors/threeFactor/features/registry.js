"use strict";
// Feature registry. New features register with ONE import + list entry
// (the LAB registry's basketFamily.ts out-of-band precedent). The tail of
// this module is an import-time integrity check mirroring
// scripts/chainspot-lab/invariants.ts: duplicate ids or bad knob specs
// refuse to load rather than silently drifting.
Object.defineProperty(exports, "__esModule", { value: true });
exports.ALL_FEATURES = void 0;
exports.featureById = featureById;
const g5_zfit_1 = require("./g5.zfit");
const g3_phantomTee_1 = require("./g3.phantomTee");
const g4_scoring_1 = require("./g4.scoring");
const g4_search_1 = require("./g4.search");
const g5_ribbon_1 = require("./g5.ribbon");
const g5_routing_1 = require("./g5.routing");
const g3_endpoints_1 = require("./g3.endpoints");
const g5_badgeM2Aa_1 = require("./g5.badgeM2Aa");
const g2_sprite_1 = require("./g2.sprite");
const g2_cleanBasketFamily_1 = require("./g2.cleanBasketFamily");
const g1_badges_1 = require("./g1.badges");
const g1_digits_1 = require("./g1.digits");
const g1_badgeGlyphTemplate_1 = require("./g1.badgeGlyphTemplate");
const shared_hsv_1 = require("./shared.hsv");
const g3_teeFamily_1 = require("./g3.teeFamily");
const g3_teeMinAreaPose_1 = require("./g3.teeMinAreaPose");
const g3_teeRecovery_1 = require("./g3.teeRecovery");
const g4_teeBadgeLock_1 = require("./g4.teeBadgeLock");
const g4_posteriorTeeRecovery_1 = require("./g4.posteriorTeeRecovery");
const st_fourLaneSensor_1 = require("./st.fourLaneSensor");
const st_straightTest_1 = require("./st.straightTest");
exports.ALL_FEATURES = [
    g5_zfit_1.zfitFeature,
    g3_phantomTee_1.phantomTeeFeature,
    g4_scoring_1.g4ScoringFeature,
    g4_search_1.g4SearchFeature,
    g5_ribbon_1.g5RibbonFeature,
    g5_routing_1.g5RoutingFeature,
    g5_badgeM2Aa_1.badgeM2AaFeature,
    g3_endpoints_1.g3EndpointsFeature,
    g2_sprite_1.g2SpriteFeature,
    g2_cleanBasketFamily_1.cleanBasketFamilyFeature,
    g1_badges_1.g1BadgesFeature,
    g1_digits_1.g1DigitsFeature,
    g1_badgeGlyphTemplate_1.badgeGlyphTemplateFeature,
    shared_hsv_1.sharedHsvFeature,
    g3_teeFamily_1.teeFamilyFeature,
    g3_teeMinAreaPose_1.teeMinAreaPoseFeature,
    g3_teeRecovery_1.teeRecoveryFeature,
    g4_teeBadgeLock_1.teeBadgeLockFeature,
    g4_posteriorTeeRecovery_1.posteriorTeeRecoveryFeature,
    st_fourLaneSensor_1.fourLaneSensorFeature,
    st_straightTest_1.straightTestFeature
];
function featureById(id) {
    return exports.ALL_FEATURES.find((feature) => feature.id === id);
}
// --- integrity check (import-time) -----------------------------------------
{
    const seen = new Set();
    for (const feature of exports.ALL_FEATURES) {
        if (seen.has(feature.id))
            throw new Error(`Duplicate ABFeature id: ${feature.id}`);
        seen.add(feature.id);
        if (feature.kind === 'deviation' && feature.defaultEnabled) {
            throw new Error(`ABFeature ${feature.id}: deviations must default OFF (frozen parity).`);
        }
        for (const [name, spec] of Object.entries(feature.knobs)) {
            if (spec.validate) {
                const error = spec.validate(spec.default);
                if (error !== null) {
                    throw new Error(`ABFeature ${feature.id}: default for knob '${name}' invalid: ${error}`);
                }
            }
        }
    }
}
//# sourceMappingURL=registry.js.map