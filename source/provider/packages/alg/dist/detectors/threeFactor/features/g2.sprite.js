"use strict";
// g2.sprite — renderer-family basket detection recovered from the surviving
// LAB smart-basket implementation. Pass 1 recognizes isolated 42x66 bright
// components with the expected white shape and local dark shell. Pass 2
// searches only around known badge/basket occluders for missing family
// members. Ownership remains downstream.
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.g2SpriteFeature = exports.G2_SPRITE_RENDER = void 0;
const basket_sprite_json_1 = __importDefault(require("../assets/basket-sprite.json"));
const smartBasket_1 = require("../smartBasket");
const ASSET_WIDTH = basket_sprite_json_1.default.width;
const ASSET_HEIGHT = basket_sprite_json_1.default.height;
function fraction(value, name) {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1
        ? null
        : `${name} must be in [0, 1]`;
}
function nonNegative(value, name) {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0
        ? null
        : `${name} must be non-negative`;
}
const BASKETS_UNIT = 'baskets';
const BRIGHT_MASK_ARTIFACT = 'badgeStage.masks.bright';
function verdictOf(drawables, verdict) {
    return drawables.filter((drawable) => drawable.verdict === verdict);
}
function countByReason(drawables) {
    const counts = new Map();
    for (const drawable of drawables) {
        const reason = drawable.reason ?? '(no reason recorded -- invalid silent drop)';
        counts.set(reason, (counts.get(reason) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}
/** The sprite feature owns this plan. LAB only rasterizes its traced geometry. */
exports.G2_SPRITE_RENDER = {
    units: [BASKETS_UNIT],
    draw(unit, run) {
        const accepted = verdictOf(unit.drawables, 'accepted');
        const rejected = verdictOf(unit.drawables, 'rejected');
        const whiteBounds = verdictOf(unit.drawables, 'info').filter((drawable) => drawable.type === 'box' && drawable.ref?.endsWith(':white-component'));
        const semanticTips = verdictOf(unit.drawables, 'info').filter((drawable) => drawable.type === 'point' && drawable.ref?.endsWith(':semantic-tip'));
        const notes = [
            `feature:      sprite (g2.sprite) -- ${unit.gate}, trace unit '${unit.id}'`,
            `unit enabled: ${unit.enabled}  (source: UnitTrace.enabled)`,
            `config:       ${run.configName}`,
            `paramsHash:   ${run.paramsHash || 'UNKNOWN -- caller ran the engine without one'}`,
            `unit ms:      ${unit.ms.toFixed(2)}  (source: UnitTrace.ms; wall clock, not quality)`,
            `knobsDeviating: ${unit.knobsDeviating.length ? unit.knobsDeviating.join(', ') : 'none'}  (source: UnitTrace.knobsDeviating)`,
            '',
            `accepted basket candidates: ${accepted.length}   (source: accepted UnitTrace.drawables)`,
            `rejected basket candidates: ${rejected.length}   (source: rejected UnitTrace.drawables)`,
            `examined renderer-family candidates: ${accepted.length + rejected.length}`,
            '',
            'green/red candidate boxes are full-sprite bounds learned from white + associated black family support.',
            'cyan boxes are the detector-local bright connected components and are never emitted as object bounds.',
            'ownership: UNKNOWN -- G2 localizes sprites; downstream assignment owns course-hole ownership.',
            '',
            'rejections by reason:'
        ];
        const reasons = countByReason(rejected);
        if (reasons.length === 0)
            notes.push('  none');
        else
            for (const [reason, count] of reasons)
                notes.push(`  ${String(count).padStart(4)} x  ${reason}`);
        for (const measurement of unit.measurements) {
            notes.push(`measurement '${measurement.name}': n=${measurement.count} min=${measurement.min} max=${measurement.max} mean=${(measurement.sum / Math.max(1, measurement.count)).toFixed(4)}  (source: UnitTrace.measurements)`);
        }
        return {
            title: `g2.sprite -- full basket bounds (${run.configName})`,
            base: BRIGHT_MASK_ARTIFACT,
            layers: [
                {
                    name: 'basket full-sprite bounds rejected (G2)',
                    note: 'full learned sprite bounding box plus measured rejection testimony',
                    drawables: rejected
                },
                {
                    name: 'basket full-sprite bounds accepted (G2)',
                    note: 'full learned sprite bounding box emitted to downstream evidence',
                    drawables: accepted
                },
                {
                    name: 'basket white-component bounds (G2)',
                    note: 'detector-local bright support, retained separately and never represented as object bounds',
                    drawables: whiteBounds
                },
                {
                    name: 'basket semantic endpoints (G2)',
                    note: 'engine-emitted geometric endpoints; informational only, never ownership',
                    drawables: semanticTips
                }
            ],
            notes
        };
    }
};
exports.g2SpriteFeature = {
    id: 'sprite',
    gate: 'G2',
    kind: 'baseline',
    defaultEnabled: true,
    note: 'Two-pass basket renderer-family detection: intact connected components, then occlusion recovery seeded by known renderer objects.',
    render: exports.G2_SPRITE_RENDER,
    knobs: {
        bboxTolerancePx: {
            default: smartBasket_1.DEFAULT_SMART_BASKET_OPTIONS.bboxTolerancePx,
            note: 'allowed difference from the 42x66 connected-component family bbox',
            validate: (value) => Number.isInteger(value) && value >= 0
                ? null
                : 'bboxTolerancePx must be a non-negative integer'
        },
        areaRatioMin: {
            default: smartBasket_1.DEFAULT_SMART_BASKET_OPTIONS.areaRatioMin,
            validate: (value) => nonNegative(value, 'areaRatioMin')
        },
        areaRatioMax: {
            default: smartBasket_1.DEFAULT_SMART_BASKET_OPTIONS.areaRatioMax,
            validate: (value) => nonNegative(value, 'areaRatioMax')
        },
        cleanWhiteCoverageMin: {
            default: smartBasket_1.DEFAULT_SMART_BASKET_OPTIONS.cleanWhiteCoverageMin,
            validate: (value) => fraction(value, 'cleanWhiteCoverageMin')
        },
        cleanDarkShellMin: {
            default: smartBasket_1.DEFAULT_SMART_BASKET_OPTIONS.cleanDarkShellMin,
            validate: (value) => fraction(value, 'cleanDarkShellMin')
        },
        cleanDarkCoherenceMin: {
            default: smartBasket_1.DEFAULT_SMART_BASKET_OPTIONS.cleanDarkCoherenceMin,
            validate: (value) => fraction(value, 'cleanDarkCoherenceMin')
        },
        shellRadiusPx: {
            default: smartBasket_1.DEFAULT_SMART_BASKET_OPTIONS.shellRadiusPx,
            validate: (value) => Number.isInteger(value) && value >= 1
                ? null
                : 'shellRadiusPx must be a positive integer'
        },
        blackConsensusFraction: {
            default: smartBasket_1.DEFAULT_SMART_BASKET_OPTIONS.blackConsensusFraction,
            validate: (value) => fraction(value, 'blackConsensusFraction')
        },
        blackConsensusMarginPx: {
            default: smartBasket_1.DEFAULT_SMART_BASKET_OPTIONS.blackConsensusMarginPx,
            validate: (value) => nonNegative(value, 'blackConsensusMarginPx')
        },
        recoveryIdentityMin: {
            default: smartBasket_1.DEFAULT_SMART_BASKET_OPTIONS.recoveryIdentityMin,
            validate: (value) => fraction(value, 'recoveryIdentityMin')
        },
        recoveryWhiteCoverageMin: {
            default: smartBasket_1.DEFAULT_SMART_BASKET_OPTIONS.recoveryWhiteCoverageMin,
            validate: (value) => fraction(value, 'recoveryWhiteCoverageMin')
        },
        recoveryBlackSupportMin: {
            default: smartBasket_1.DEFAULT_SMART_BASKET_OPTIONS.recoveryBlackSupportMin,
            validate: (value) => fraction(value, 'recoveryBlackSupportMin')
        },
        recoveryVisibilityMin: {
            default: smartBasket_1.DEFAULT_SMART_BASKET_OPTIONS.recoveryVisibilityMin,
            validate: (value) => fraction(value, 'recoveryVisibilityMin')
        },
        highVisibilityMin: {
            default: smartBasket_1.DEFAULT_SMART_BASKET_OPTIONS.highVisibilityMin,
            validate: (value) => fraction(value, 'highVisibilityMin')
        },
        dedupeRadiusPx: {
            default: smartBasket_1.DEFAULT_SMART_BASKET_OPTIONS.dedupeRadiusPx,
            validate: (value) => nonNegative(value, 'dedupeRadiusPx')
        },
        semanticTipOffsetPx: {
            default: smartBasket_1.DEFAULT_SMART_BASKET_OPTIONS.semanticTipOffsetPx,
            note: 'offset below the 42x66 family bbox to the pole-tip endpoint',
            validate: (value) => nonNegative(value, 'semanticTipOffsetPx')
        },
        maxChildrenPerSeed: {
            default: smartBasket_1.DEFAULT_SMART_BASKET_OPTIONS.maxChildrenPerSeed,
            validate: (value) => Number.isInteger(value) && value >= 1
                ? null
                : 'maxChildrenPerSeed must be a positive integer'
        },
        spriteWidth: {
            default: ASSET_WIDTH,
            validate: (value) => value === ASSET_WIDTH
                ? null
                : `spriteWidth must match basket-sprite.json width (${ASSET_WIDTH})`
        },
        spriteHeight: {
            default: ASSET_HEIGHT,
            validate: (value) => value === ASSET_HEIGHT
                ? null
                : `spriteHeight must match basket-sprite.json height (${ASSET_HEIGHT})`
        }
    }
};
//# sourceMappingURL=g2.sprite.js.map