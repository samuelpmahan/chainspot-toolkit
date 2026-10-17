"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_MEASURE_EXECUTION = exports.measureUnits = void 0;
exports.createBoard = createBoard;
exports.classifyReading = classifyReading;
exports.resolveBadgeCollisions = resolveBadgeCollisions;
exports.detectBadges = detectBadges;
exports.excludeAndAssembleTees = excludeAndAssembleTees;
exports.seedBoard = seedBoard;
exports.measureThreeFactor = measureThreeFactor;
const basket_sprite_json_1 = __importDefault(require("./assets/basket-sprite.json"));
const logistic_json_1 = __importDefault(require("./assets/logistic.json"));
const badgeStage_1 = require("./badgeStage");
const endpoints_1 = require("./endpoints");
const smartBasket_1 = require("./smartBasket");
const logisticInference_1 = require("./digits/logisticInference");
const readBadges_1 = require("./digits/readBadges");
const segment_1 = require("./digits/segment");
const raster_1 = require("./raster");
const ribbon_1 = require("./ribbon");
const routing_1 = require("./routing");
const scoring_1 = require("./scoring");
const screenChrome_1 = require("./screenChrome");
const types_1 = require("./types");
const types_2 = require("./features/types");
const g4_scoring_1 = require("./features/g4.scoring");
const g5_ribbon_1 = require("./features/g5.ribbon");
const g5_routing_1 = require("./features/g5.routing");
const g3_endpoints_1 = require("./features/g3.endpoints");
const g2_sprite_1 = require("./features/g2.sprite");
const g1_badges_1 = require("./features/g1.badges");
const g1_digits_1 = require("./features/g1.digits");
const shared_hsv_1 = require("./features/shared.hsv");
/** Minimal evidence board: named slots with fail-loud reads. */
function createBoard() {
    const slots = new Map();
    return {
        get(slot) {
            if (!slots.has(slot))
                throw new Error(`evidence board: slot '${slot}' not produced yet.`);
            return slots.get(slot);
        },
        has: (slot) => slots.has(slot),
        set: (slot, value) => {
            slots.set(slot, value);
        }
    };
}
const basketTemplate = basket_sprite_json_1.default;
const logisticModel = logistic_json_1.default;
const digitScorer = {
    name: 'nuthing-p2-logistic',
    scores: (mask) => (0, logisticInference_1.predictProbs)(logisticModel, mask)
};
const DEFAULT_WIDTHS_SRC = [24, 32, 40, 48, 56, 64];
const DEFAULT_CORRIDOR_WIDTH = 37;
const DEFAULT_FIELD_SCALE = 3;
const DEFAULT_ORIENTATIONS = 12;
const DEFAULT_ALIGNMENT_POWER = 2;
const DEFAULT_WORST_WINDOW = 90;
const DEFAULT_SUPPORT_TAU = 0.5;
function clamp01(value) {
    return Math.max(0, Math.min(1, value));
}
function clampInt(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, Math.round(value)));
}
function makeParameters(params) {
    const corridorWidthPx = params?.corridorWidthPx ?? DEFAULT_CORRIDOR_WIDTH;
    const fieldScale = params?.fieldScale ?? DEFAULT_FIELD_SCALE;
    const orientations = params?.orientations ?? DEFAULT_ORIENTATIONS;
    const widthsSrc = params?.widthsSrc ?? DEFAULT_WIDTHS_SRC;
    const alignmentPower = params?.alignmentPower ?? DEFAULT_ALIGNMENT_POWER;
    const worstWindowSrcPx = params?.worstWindowSrcPx ?? DEFAULT_WORST_WINDOW;
    const supportTau = params?.supportTau ?? DEFAULT_SUPPORT_TAU;
    if (!Number.isFinite(corridorWidthPx) || corridorWidthPx <= 0)
        throw new Error('corridorWidthPx must be positive.');
    if (!Number.isFinite(fieldScale) || fieldScale <= 0)
        throw new Error('fieldScale must be positive.');
    if (!Number.isInteger(orientations) || orientations < 1)
        throw new Error('orientations must be a positive integer.');
    if (!widthsSrc.length || widthsSrc.some((width) => !Number.isFinite(width) || width <= 0))
        throw new Error('widthsSrc must contain positive values.');
    if (!Number.isFinite(alignmentPower) || alignmentPower < 0)
        throw new Error('alignmentPower must be non-negative.');
    if (!Number.isFinite(worstWindowSrcPx) || worstWindowSrcPx <= 0)
        throw new Error('worstWindowSrcPx must be positive.');
    if (!Number.isFinite(supportTau) || supportTau < 0 || supportTau > 1)
        throw new Error('supportTau must be in [0, 1].');
    return {
        corridorWidthPx,
        fieldScale,
        orientations,
        widthsSrc: [...widthsSrc],
        patchBadges: params?.patchBadges ?? true,
        alignmentPower,
        worstWindowSrcPx,
        supportTau,
        // zfit passthrough — previously dropped here, which made the salvage
        // pass unreachable via the public path (bug). undefined stays absent.
        ...(params?.zfit !== undefined ? { zfit: params.zfit } : {})
    };
}
function cropImage(image, topPx, bottomPx) {
    const height = bottomPx - topPx;
    const data = new Uint8Array(image.width * height * 4);
    for (let y = 0; y < height; y++) {
        const source = (topPx + y) * image.width * 4;
        data.set(image.data.slice(source, source + image.width * 4), y * image.width * 4);
    }
    return { width: image.width, height, data };
}
function shiftedComponent(component, yOffsetPx) {
    return { ...component, bboxY: component.bboxY + yOffsetPx, cy: component.cy + yOffsetPx };
}
function darkFraction(component, dark) {
    let count = 0;
    for (let y = component.bboxY; y < component.bboxY + component.bboxH; y++) {
        const row = y * dark.width;
        for (let x = component.bboxX; x < component.bboxX + component.bboxW; x++)
            count += dark.data[row + x];
    }
    return count / Math.max(1, component.bboxW * component.bboxH);
}
function labelCandidates(reading) {
    if (!reading.digits.length)
        return [];
    const candidates = Array.from({ length: 18 }, (_, index) => index + 1)
        .filter((label) => String(label).length === reading.digits.length)
        .map((label) => {
        const confidence = [...String(label)].reduce((product, digit, index) => product * (reading.digits[index]?.scores[Number(digit)] ?? 0), 1);
        return { label, confidence };
    })
        .sort((a, b) => b.confidence - a.confidence || a.label - b.label);
    const total = candidates.reduce((sum, candidate) => sum + candidate.confidence, 0);
    return candidates.map((candidate) => ({
        label: candidate.label,
        confidence: total > 0 ? candidate.confidence / total : 0
    }));
}
function digitEvidence(reading, yOffsetPx) {
    const [ix, iy] = reading.glyph.interiorBbox;
    return reading.digits.map((digit) => ({
        bbox: [
            ix + digit.candidate.bbox[0],
            iy + digit.candidate.bbox[1] + yOffsetPx,
            digit.candidate.bbox[2],
            digit.candidate.bbox[3]
        ],
        method: digit.candidate.method,
        predicted: digit.predicted,
        runnerUp: digit.runnerUp,
        scores: [...digit.scores],
        margin: digit.margin,
        normalized: new Uint8Array(digit.normalized)
    }));
}
function median(values) {
    if (!values.length)
        return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
/**
 * Fix contract C2/C4/C5 (docs/seven-whys/g1-badge-digit-garbage.md):
 * classify one badge's raw digit reading into a final label plus a named
 * abstention reason, WITHOUT deciding collisions yet (that needs every
 * badge's classification first — see the caller).
 */
function classifyReading(rawLabel, digitCount, confidence, candidates, floor, ambiguityMargin) {
    const bestLabel = candidates[0] ? String(candidates[0].label) : null;
    // C2 — structural rejection, unconditional: a hole label is 1 or 2 digits,
    // never assembled from more, and never leads with '0' (no hole 0 exists).
    // Checked BEFORE any confidence-based path so a well-formed-looking
    // in-vocabulary posterior over garbage segmentation (Mode B, the
    // HeritagePark height-filter case) can never launder through.
    if (digitCount === 0)
        return { label: null, bestLabel, abstentionReason: 'empty-glyph' };
    if (digitCount > 2)
        return { label: null, bestLabel, abstentionReason: 'too-many-digits' };
    if (rawLabel[0] === '0')
        return { label: null, bestLabel, abstentionReason: 'leading-zero' };
    // C4 — derived confidence floor, restoring old-stuff's first-class
    // abstention. bestLabel is retained either way so the receipt can show
    // what the detector would have said.
    if (confidence < floor)
        return { label: null, bestLabel, abstentionReason: 'low-score' };
    if (candidates.length >= 2 &&
        candidates[0].confidence - candidates[1].confidence < ambiguityMargin) {
        return { label: null, bestLabel, abstentionReason: 'ambiguous' };
    }
    return { label: bestLabel, bestLabel, abstentionReason: null };
}
/**
 * Fix contract C5 (docs/seven-whys/g1-badge-digit-garbage.md): restore
 * `badgeGlyphBatchIsComplete`'s uniqueness property
 * (`old-stuff/badgeGlyphClassifier.ts:420-426`) — two or more badges landing
 * on the same in-vocabulary label is a CONFLICT, receipt-visible on every
 * party named, never silent. Resolution keeps the higher-confidence claimant
 * (deterministic tie-break: lower `index`) and marks the rest UNREAD
 * 'collision', but records `conflictWith` on BOTH the winner and the
 * loser(s) so a resolved collision is still visible in the receipt.
 * Set-completion (picking a label by elimination) is explicitly NOT used
 * here — see the forensics doc's C5 warning: this function only ever
 * REMOVES a duplicate label, it never assigns one.
 *
 * Pure function over the minimal shape needed, independent of BadgeReading /
 * BadgeEvidence, so the collision rule itself is unit-testable in isolation.
 */
function resolveBadgeCollisions(entries) {
    const byLabel = new Map();
    for (const entry of entries) {
        if (entry.label === null)
            continue;
        const group = byLabel.get(entry.label);
        if (group)
            group.push(entry);
        else
            byLabel.set(entry.label, [entry]);
    }
    const result = new Map();
    for (const group of byLabel.values()) {
        if (group.length < 2)
            continue;
        const sorted = [...group].sort((a, b) => b.confidence - a.confidence || a.index - b.index);
        const [winner, ...losers] = sorted;
        const loserIds = losers.map((entry) => entry.detId);
        result.set(winner.detId, { label: winner.label, abstentionReason: null, conflictWith: loserIds });
        for (const loser of losers) {
            result.set(loser.detId, {
                label: null,
                abstentionReason: 'collision',
                conflictWith: [winner.detId, ...loserIds.filter((id) => id !== loser.detId)]
            });
        }
    }
    return result;
}
function makeBadges(stage, yOffsetPx, knobs = segment_1.DEFAULT_DIGITS_KNOBS) {
    const confidenceFloorDivisor = knobs.confidenceFloorDivisor;
    const ambiguityMargin = knobs.labelAmbiguityMargin;
    const readings = (0, readBadges_1.readCourseBadges)(stage, digitScorer, knobs);
    const entries = readings.map((reading, index) => ({
        reading,
        index,
        component: stage.badges[index],
        source: stage.badgeSources[index] ?? 'bright-family',
        plateBbox: stage.plateBboxes[index]
    }));
    entries.sort((a, b) => a.reading.badge.cy - b.reading.badge.cy ||
        a.reading.badge.cx - b.reading.badge.cx ||
        a.index - b.index);
    // C4 — floor derived from THIS run's own margin distribution (footgun
    // law: no absolute literal). Median of every badge that actually
    // produced a classifier margin (finite confidence), divided by a named
    // knob. The 7 known failures span 0.0015-0.0756 and the healthy
    // population spans 0.978-0.994 — three orders of magnitude apart, so any
    // divisor in a wide range separates them; the divisor itself is a knob
    // with printed provenance rather than a bare literal.
    const finiteConfidences = entries
        .map((entry) => entry.reading.confidence)
        .filter((value) => Number.isFinite(value));
    const floor = median(finiteConfidences) / confidenceFloorDivisor;
    const prelim = entries.map((entry, index) => {
        const rawLabel = entry.reading.label;
        const digitCount = entry.reading.digits.length;
        const candidates = labelCandidates(entry.reading);
        const isEmpty = entry.reading.confidence === Infinity;
        const confidence = isEmpty ? 0 : clamp01(entry.reading.confidence);
        const fillFraction = isEmpty ? darkFraction(entry.component, stage.darkMask) : undefined;
        const classified = classifyReading(rawLabel, digitCount, confidence, candidates, floor, ambiguityMargin);
        return {
            ...entry,
            detId: `badge-${index}`,
            rawLabel,
            digitCount,
            candidates,
            confidence,
            fillFraction,
            ...classified
        };
    });
    // C5 — collisions are receipt-visible, never silent.
    const resolutions = resolveBadgeCollisions(prelim.map((entry) => ({ detId: entry.detId, index: entry.index, label: entry.label, confidence: entry.confidence })));
    const conflictWith = new Map();
    for (const entry of prelim) {
        const resolution = resolutions.get(entry.detId);
        if (!resolution)
            continue;
        if (resolution.label === null)
            entry.label = null;
        if (resolution.abstentionReason)
            entry.abstentionReason = resolution.abstentionReason;
        if (resolution.conflictWith.length)
            conflictWith.set(entry.detId, resolution.conflictWith);
    }
    return prelim.map((entry) => {
        const component = shiftedComponent(entry.component, yOffsetPx);
        const bbox = [
            component.bboxX,
            component.bboxY,
            component.bboxW,
            component.bboxH
        ];
        const plateBbox = entry.plateBbox
            ? [
                entry.plateBbox[0],
                entry.plateBbox[1] + yOffsetPx,
                entry.plateBbox[2],
                entry.plateBbox[3]
            ]
            : undefined;
        return {
            detId: entry.detId,
            component,
            cxPx: entry.component.cx,
            cyPx: entry.component.cy + yOffsetPx,
            bbox,
            plateBbox,
            source: entry.source,
            digits: digitEvidence(entry.reading, yOffsetPx),
            rawLabel: entry.rawLabel,
            digitCount: entry.digitCount,
            label: entry.label,
            bestLabel: entry.bestLabel,
            labelCandidates: entry.candidates,
            confidence: entry.confidence,
            ...(entry.fillFraction !== undefined ? { fillFraction: entry.fillFraction } : {}),
            abstentionReason: entry.abstentionReason,
            confidenceFloor: floor,
            conflictWith: conflictWith.get(entry.detId) ?? [],
            notes: entry.reading.notes
        };
    });
}
/**
 * Truth-free badge detection with digit reading, as a standalone public seam
 * for LAB tooling (digit-derived hole viewports in `lab scope`). Runs ONLY
 * the G1 badge stage plus digit reading — no baskets, tees, support field,
 * or assignment — so it stays fast enough for interactive scoping.
 * Coordinates leave in the supplied image's frame shifted by `yOffsetPx`,
 * exactly like the engine's `badges` unit output.
 */
function detectBadges(image, yOffsetPx = 0, digitsKnobs = segment_1.DEFAULT_DIGITS_KNOBS, badgeStageKnobs = badgeStage_1.DEFAULT_BADGE_STAGE_KNOBS, hsvKnobs = raster_1.DEFAULT_HSV_KNOBS) {
    return makeBadges((0, badgeStage_1.runBadgeStage)(image, badgeStageKnobs, hsvKnobs), yOffsetPx, digitsKnobs);
}
/**
 * Return only the detector-known bright pixels belonging to one accepted
 * badge. Bright-family badges have an exact connected-component label; a
 * dark-plate recovery has no bright component of its own, so its exact white
 * glyph evidence is the bright mask intersected with the detector's tight
 * plate bounds. Coordinates leave this helper in original-image space.
 *
 * This is deliberately a presentation evidence seam: it does not infer a
 * shape from a bbox, and it does not alter any detection decision.
 */
function exactBadgeBrightPixels(stage, badge, yOffsetPx) {
    const bounds = badge.source === 'dark-plate-recovery' ? badge.plateBbox : badge.bbox;
    if (!bounds)
        return [];
    const [x, y, width, height] = bounds;
    const x0 = Math.max(0, Math.floor(x));
    const y0 = Math.max(0, Math.floor(y - yOffsetPx));
    const x1 = Math.min(stage.width, Math.ceil(x + width));
    const y1 = Math.min(stage.height, Math.ceil(y - yOffsetPx + height));
    const pixels = [];
    for (let localY = y0; localY < y1; localY++) {
        for (let localX = x0; localX < x1; localX++) {
            const offset = localY * stage.width + localX;
            const belongsToBrightComponent = badge.source === 'bright-family' && stage.brightLabels[offset] === badge.component.label;
            const belongsToRecoveredPlate = badge.source === 'dark-plate-recovery' && stage.brightMask.data[offset] !== 0;
            if (belongsToBrightComponent || belongsToRecoveredPlate)
                pixels.push([localX, localY + yOffsetPx]);
        }
    }
    return pixels;
}
function makeBaskets(sprites, yOffsetPx) {
    return [...sprites]
        .sort((a, b) => a.y - b.y || a.x - b.x || b.score - a.score)
        .map((sprite, index) => {
        const whiteBbox = [
            sprite.x,
            sprite.y + yOffsetPx,
            sprite.bboxW,
            sprite.bboxH
        ];
        return {
            detId: `basket-${index}`,
            bbox: [
                sprite.semanticBbox[0],
                sprite.semanticBbox[1] + yOffsetPx,
                sprite.semanticBbox[2],
                sprite.semanticBbox[3]
            ],
            whiteBbox,
            centerXPx: sprite.cx,
            centerYPx: sprite.cy + yOffsetPx,
            tipXPx: sprite.tipX,
            tipYPx: sprite.tipY + yOffsetPx,
            onFrac: sprite.onFrac,
            offFrac: sprite.offFrac,
            score: sprite.score,
            tier: sprite.tier,
            confidence: sprite.confidence,
            identity: sprite.identity,
            effectiveVisibility: sprite.effectiveVisibility,
            whiteCoverage: sprite.whiteCoverage,
            blackBorderSupport: sprite.blackBorderSupport,
            darkCoherence: sprite.darkCoherence,
            source: sprite.source
        };
    });
}
function makeTees(stage, sprites, yOffsetPx, ctx = types_2.nullFeatureContext, knobs = scoring_1.DEFAULT_SCORING_KNOBS, endpointsKnobs = endpoints_1.DEFAULT_ENDPOINTS_KNOBS, badgeStageKnobs = badgeStage_1.DEFAULT_BADGE_STAGE_KNOBS) {
    const rawRings = (0, endpoints_1.detectTeeRings)(stage.brightMask, endpointsKnobs);
    return excludeAndAssembleTees(stage, rawRings, [], sprites, yOffsetPx, ctx, knobs, endpointsKnobs, badgeStageKnobs);
}
/**
 * Prose for one suppressed tee candidate, naming the knob its value failed
 * against so the drawable carries its own provenance and a human never has to
 * open this file to read the receipt.
 *
 * `sprite-exclusion` says OCCLUDED out loud on purpose. A candidate inside a
 * matched basket sprite's exclusion radius is a tee we SAW and chose to drop —
 * not evidence the hole has no tee. Three separate agents have read output
 * with a tee missing, concluded the detector was broken, and rewritten correct
 * code, because that distinction had no way to reach the raster.
 *
 * `dim`/`area`/`fill` each guard a two-sided band and the sink records only
 * the single limit that was breached, so the bound is recovered from the
 * comparison: value below the limit failed the Min knob, above it the Max one.
 * Both branches are strict inequalities in collectTeePoints, so value ===
 * limit never reaches here.
 */
function suppressionReason(drop) {
    const near = drop.nearest
        ? ` of (${drop.nearest.cx.toFixed(1)}, ${drop.nearest.cy.toFixed(1)})`
        : '';
    switch (drop.reason) {
        case 'dedup-tee':
            return `dedup-tee: component ${drop.value.toFixed(2)}px${near}, an already-accepted tee (< teeRingDedupDistance=${drop.limit})`;
        case 'sprite-exclusion':
            return `sprite-exclusion: component ${drop.value.toFixed(2)}px${near}, a matched basket sprite (< teeSpriteExclusionDistance=${drop.limit}) — OCCLUDED tee, not an absent one`;
        default: {
            const bound = drop.value < drop.limit ? 'Min' : 'Max';
            const cap = drop.reason === 'dim' ? 'Dim' : drop.reason === 'area' ? 'Area' : 'Fill';
            return `${drop.reason}: component ${drop.value.toFixed(2)} vs component${bound}${cap}=${drop.limit}`;
        }
    }
}
/**
 * Exclude ring/component tee candidates that fall inside a badge bbox or a
 * screen-chrome cluster, then merge + sort + assign detIds. Extracted from
 * makeTees's tail (moved verbatim, not rewritten) so the exec layer's
 * tees.exclusion operation (packages/alg/src/exec/operations.ts) can run
 * the exact same exclusion + assembly pass over independently-produced raw
 * ring/component candidate sets, without duplicating this logic. Callers
 * own producing `rawRings` (e.g. detectTeeRings) and `rawComponents`
 * (bright components with badge-labeled ones already dropped) — see
 * makeTees below for the canonical, single-call-site composition.
 */
function excludeAndAssembleTees(stage, rawRings, rawComponents, sprites, yOffsetPx, ctx = types_2.nullFeatureContext, knobs = scoring_1.DEFAULT_SCORING_KNOBS, endpointsKnobs = endpoints_1.DEFAULT_ENDPOINTS_KNOBS, badgeStageKnobs = badgeStage_1.DEFAULT_BADGE_STAGE_KNOBS) {
    const chrome = (0, screenChrome_1.detectScreenChromeRegions)(stage.brightComponents, stage.width, stage.height);
    const insideBadgePadding = badgeStageKnobs.badgeInsidePadding;
    const insideBadge = (x, y) => stage.badges.some((badge) => x >= badge.bboxX - insideBadgePadding &&
        x <= badge.bboxX + badge.bboxW + insideBadgePadding &&
        y >= badge.bboxY - insideBadgePadding &&
        y <= badge.bboxY + badge.bboxH + insideBadgePadding);
    // no silent drops: every examined-and-killed candidate leaves a rejected
    // drawable with its reason — this is the "why 0 tees?" answer on the raster
    const reject = (x, y, reason, values) => ctx.overlay('tees', {
        type: 'point',
        xPx: x,
        yPx: y + yOffsetPx,
        verdict: 'rejected',
        reason,
        ...(values ? { values } : {})
    });
    const rings = rawRings.filter((ring) => {
        if (insideBadge(ring.cx, ring.cy)) {
            reject(ring.cx, ring.cy, `ring inside badge bbox (+${insideBadgePadding}px pad)`);
            return false;
        }
        if ((0, screenChrome_1.pointInScreenChrome)(ring.cx, ring.cy, chrome)) {
            reject(ring.cx, ring.cy, 'ring inside screen-chrome cluster');
            return false;
        }
        return true;
    });
    const components = rawComponents.filter((component) => {
        if (insideBadge(component.cx, component.cy)) {
            reject(component.cx, component.cy, `component inside badge bbox (+${insideBadgePadding}px pad)`);
            return false;
        }
        if ((0, screenChrome_1.pointInScreenChrome)(component.cx, component.cy, chrome)) {
            reject(component.cx, component.cy, 'component inside screen-chrome cluster');
            return false;
        }
        return true;
    });
    // collectTeePoints' five threshold gates were silent `continue`s. Its
    // optional sink records reason + failing value + the knob limit it failed
    // against; this loop is the only thing that was missing — it drains the
    // sink onto the SAME rejected-drawable channel as the badge/chrome drops
    // above, satisfying features/types.ts's "no silent drops" rule instead of
    // adding a second reporting path. Instrumentation only: `points` is
    // identical whether or not the sink is passed.
    const suppressed = [];
    const points = (0, endpoints_1.collectTeePoints)(rings, components, sprites.map((sprite) => ({ cx: sprite.cx, cy: sprite.cy })), endpointsKnobs, suppressed);
    for (const drop of suppressed) {
        reject(drop.cx, drop.cy, suppressionReason(drop), { value: drop.value, limit: drop.limit });
    }
    return points
        .map((tee) => {
        const ring = tee.ring;
        const component = tee.component;
        const xPx = tee.cx;
        const yPx = tee.cy + yOffsetPx;
        const bbox = ring
            ? [ring.bboxX, ring.bboxY + yOffsetPx, ring.bboxW, ring.bboxH]
            : component
                ? [
                    component.bboxX ?? Math.round(xPx - knobs.fallbackTeeBboxOffset),
                    (component.bboxY ?? Math.round(tee.cy - knobs.fallbackTeeBboxOffset)) + yOffsetPx,
                    component.bboxW,
                    component.bboxH
                ]
                : [
                    Math.round(xPx - knobs.fallbackTeeBboxOffset),
                    Math.round(yPx - knobs.fallbackTeeBboxOffset),
                    knobs.fallbackTeeBboxSize,
                    knobs.fallbackTeeBboxSize
                ];
        return {
            detId: '',
            xPx,
            yPx,
            tier: tee.tier,
            angleRad: ring?.angle ?? component?.angle ?? null,
            ring: ring
                ? {
                    bbox: [ring.bboxX, ring.bboxY + yOffsetPx, ring.bboxW, ring.bboxH],
                    area: ring.holeArea,
                    elongation: ring.elongation,
                    ringFrac: ring.ringFrac
                }
                : undefined,
            bbox,
            area: ring?.holeArea ?? component?.area ?? 0,
            fill: component?.fill ?? ring?.ringFrac ?? 0,
            onRing: sprites.some((sprite) => Math.abs(Math.hypot(xPx - sprite.cx, yPx - (sprite.cy + yOffsetPx)) - knobs.ringDistance) <= knobs.ringTolerance)
        };
    })
        .sort((a, b) => a.yPx - b.yPx || a.xPx - b.xPx || a.tier.localeCompare(b.tier))
        .map((tee, index) => ({ ...tee, detId: `tee-${index}` }));
}
function makeRawPairs(field, badges, tees, baskets, params, yOffsetPx, ribbonKnobs = ribbon_1.DEFAULT_RIBBON_KNOBS, routingKnobs = routing_1.DEFAULT_ROUTING_KNOBS, scoringKnobs = scoring_1.DEFAULT_SCORING_KNOBS) {
    const teePoints = tees.map((tee) => ({ id: tee.detId, xPx: tee.xPx, yPx: tee.yPx }));
    const basketPoints = baskets.map((basket) => ({
        id: basket.detId,
        xPx: basket.tipXPx,
        yPx: basket.tipYPx
    }));
    const pairs = [];
    for (const badge of badges) {
        const legs = (0, routing_1.routeBadgeLegs)(field, { id: badge.detId, xPx: badge.cxPx, yPx: badge.cyPx }, teePoints, basketPoints, yOffsetPx, ribbonKnobs, routingKnobs);
        for (let teeIndex = 0; teeIndex < tees.length; teeIndex++) {
            for (let basketIndex = 0; basketIndex < baskets.length; basketIndex++) {
                pairs.push((0, scoring_1.makeRawPairEvidence)(field, badge, tees[teeIndex], baskets[basketIndex], legs.tees[teeIndex], legs.baskets[basketIndex], params, yOffsetPx, scoringKnobs));
            }
        }
    }
    return pairs.sort((a, b) => a.pairId.localeCompare(b.pairId));
}
exports.measureUnits = [
    {
        id: 'badgeStage',
        gate: 'G1',
        consumes: ['localImage'],
        produces: ['stage'],
        note: 'HSV masks, connected components, badge candidate detection',
        run(board, ctx) {
            const stop = ctx.span('badgeStage');
            const badgeStageKnobs = ctx.resolve(g1_badges_1.g1BadgesFeature).knobs;
            const hsvKnobs = ctx.resolve(shared_hsv_1.sharedHsvFeature).knobs;
            board.set('stage', (0, badgeStage_1.runBadgeStage)(board.get('localImage'), badgeStageKnobs, hsvKnobs));
            stop();
        }
    },
    {
        id: 'badges',
        gate: 'G1',
        consumes: ['stage', 'viewport'],
        produces: ['badges'],
        note: 'digit reading + label candidates, original-image coordinates',
        run(board, ctx) {
            const stop = ctx.span('badges');
            const stage = board.get('stage');
            const { topPx } = board.get('viewport');
            const digitsKnobs = ctx.resolve(g1_digits_1.g1DigitsFeature).knobs;
            const badges = makeBadges(stage, topPx, digitsKnobs);
            for (const badge of badges) {
                const brightPixels = exactBadgeBrightPixels(stage, badge, topPx);
                ctx.overlay('badges', {
                    type: 'pixelSet',
                    pixels: brightPixels,
                    verdict: 'info',
                    visualRole: 'badge-pixels',
                    ref: badge.detId,
                    reason: badge.source === 'bright-family'
                        ? `presentation-only exact bright-mask component pixels (source: badgeStage.brightLabels[label=${badge.component.label}]; no bbox fill)`
                        : 'presentation-only exact bright-mask pixels inside recovered plateBbox (source: badgeStage.brightMask ∩ plateBbox; no bbox fill)',
                    values: { pixelCount: brightPixels.length }
                });
                ctx.overlay('badges', {
                    type: 'box',
                    bbox: badge.bbox,
                    verdict: 'accepted',
                    ref: badge.detId,
                    values: {
                        confidence: badge.confidence,
                        centerXPx: badge.cxPx,
                        centerYPx: badge.cyPx,
                        ...(badge.label === null || !Number.isFinite(Number(badge.label))
                            ? {}
                            : { label: Number(badge.label) })
                    },
                    reason: undefined
                });
                ctx.measure('badges', 'confidence', badge.confidence);
            }
            board.set('badges', badges);
            stop();
        }
    },
    {
        id: 'supportField',
        gate: 'G5',
        consumes: ['localImage', 'params'],
        produces: ['supportField'],
        note: 'ribbon support field — what the line follower sees',
        run(board, ctx) {
            const stop = ctx.span('supportField');
            const ribbonKnobs = ctx.resolve(g5_ribbon_1.g5RibbonFeature).knobs;
            const field = (0, ribbon_1.computeRibbonSupport)(board.get('localImage'), board.get('params'), ribbonKnobs);
            const { topPx } = board.get('viewport');
            ctx.heatmap('supportField', 'supportField', field.support);
            ctx.overlay('supportField', {
                type: 'heatmap',
                key: 'supportField',
                widthCells: field.width,
                heightCells: field.height,
                cellPx: field.scale,
                originXPx: 0,
                originYPx: topPx,
                verdict: 'info'
            });
            board.set('supportField', field);
            stop();
        }
    },
    {
        id: 'badgeOcclusionPatch',
        gate: 'G5',
        consumes: ['supportField', 'localImage', 'badges', 'params', 'viewport'],
        produces: ['supportField'],
        note: 'lifts support under badges that occlude the corridor (patchBadges)',
        run(board, ctx) {
            const stop = ctx.span('badgeOcclusionPatch');
            const parameters = board.get('params');
            const supportField = board.get('supportField');
            if (parameters.patchBadges) {
                const { topPx } = board.get('viewport');
                const badges = board.get('badges');
                const localBadges = badges.map((badge) => ({
                    ...badge,
                    cyPx: badge.cyPx - topPx,
                    bbox: [badge.bbox[0], badge.bbox[1] - topPx, badge.bbox[2], badge.bbox[3]],
                    component: {
                        ...badge.component,
                        cy: badge.component.cy - topPx,
                        bboxY: badge.component.bboxY - topPx
                    }
                }));
                const ribbonKnobs = ctx.resolve(g5_ribbon_1.g5RibbonFeature).knobs;
                (0, ribbon_1.patchBadgeOcclusion)(supportField, board.get('localImage'), localBadges, parameters.corridorWidthPx, ribbonKnobs);
            }
            // The operation is a transform even when patching is disabled: publish
            // the unchanged field so declared/actual slot testimony stays exact.
            board.set('supportField', supportField);
            stop();
        }
    },
    {
        id: 'baskets',
        gate: 'G2',
        consumes: ['stage', 'viewport'],
        produces: ['sprites', 'baskets'],
        note: 'basket sprite matching (coarse→fine) + evidence assembly',
        run(board, ctx) {
            const stop = ctx.span('baskets');
            const stage = board.get('stage');
            const { topPx } = board.get('viewport');
            const spriteKnobs = ctx.resolve(g2_sprite_1.g2SpriteFeature).knobs;
            const decisions = [];
            const smart = (0, smartBasket_1.matchBasketSpritesSmart)(stage.brightMask, stage.darkMask, stage.badges, basketTemplate, spriteKnobs, decisions);
            const sprites = smart.map((candidate) => ({
                ...candidate,
                onFrac: candidate.whiteCoverage,
                offFrac: 1 - candidate.blackBorderSupport,
                score: candidate.identity
            }));
            const baskets = makeBaskets(sprites, topPx);
            const basketByPosition = new Map(baskets.map((basket) => [`${basket.whiteBbox[0]}:${basket.whiteBbox[1] - topPx}`, basket]));
            for (const [index, decision] of decisions.entries()) {
                const basket = basketByPosition.get(`${decision.x}:${decision.y}`);
                const whiteBbox = [
                    decision.x,
                    decision.y + topPx,
                    decision.bboxW,
                    decision.bboxH
                ];
                const semanticBbox = [
                    decision.semanticBbox[0],
                    decision.semanticBbox[1] + topPx,
                    decision.semanticBbox[2],
                    decision.semanticBbox[3]
                ];
                const ref = decision.accepted ? basket?.detId : `basket-candidate-${index}`;
                ctx.overlay('baskets', {
                    type: 'box',
                    bbox: semanticBbox,
                    verdict: decision.accepted ? 'accepted' : 'rejected',
                    ref,
                    reason: `${decision.reason}; tier=${decision.tier}; source=${decision.source}`,
                    values: {
                        areaRatio: decision.areaRatio,
                        identity: decision.identity,
                        effectiveVisibility: decision.effectiveVisibility,
                        whiteCoverage: decision.whiteCoverage,
                        blackBorderSupport: decision.blackBorderSupport,
                        darkCoherence: decision.darkCoherence,
                        recovered: decision.tier === 'occlusion-recovery' ? 1 : 0
                    }
                });
                ctx.overlay('baskets', {
                    type: 'box',
                    bbox: whiteBbox,
                    verdict: 'info',
                    ref: `${ref ?? `basket-candidate-${index}`}:white-component`,
                    reason: 'bright connected-component bounds used by detector; not the basket object bbox',
                    values: {
                        blackConsensusSearchMarginPx: spriteKnobs.blackConsensusMarginPx,
                        semanticWidthPx: semanticBbox[2],
                        semanticHeightPx: semanticBbox[3]
                    }
                });
            }
            for (const basket of baskets) {
                const bboxLastPixelYPx = basket.bbox[1] + basket.bbox[3] - 1;
                const whiteBboxLastPixelYPx = basket.whiteBbox[1] + basket.whiteBbox[3] - 1;
                ctx.overlay('baskets', {
                    type: 'point',
                    xPx: basket.tipXPx,
                    yPx: basket.tipYPx,
                    verdict: 'info',
                    visualRole: 'basket-tip',
                    ref: `${basket.detId}:semantic-tip`,
                    reason: 'engine-emitted semantic basket endpoint; ownership not evaluated',
                    values: {
                        bboxLastPixelYPx,
                        whiteBboxLastPixelYPx,
                        semanticTipYPx: basket.tipYPx,
                        tipBelowBboxLastPixelPx: basket.tipYPx - bboxLastPixelYPx,
                        tipBelowWhiteBboxLastPixelPx: basket.tipYPx - whiteBboxLastPixelYPx,
                        configuredSemanticTipOffsetPx: spriteKnobs.semanticTipOffsetPx
                    }
                });
                ctx.measure('baskets', 'score', basket.score);
            }
            board.set('sprites', sprites);
            board.set('baskets', baskets);
            stop();
        }
    },
    {
        id: 'tees',
        gate: 'G3',
        consumes: ['stage', 'sprites', 'viewport'],
        produces: ['tees'],
        note: 'visible hollow-ring tee candidates with chrome + badge exclusion; shard recovery is separate',
        run(board, ctx) {
            const stop = ctx.span('tees');
            const stage = board.get('stage');
            const sprites = board.get('sprites');
            const { topPx } = board.get('viewport');
            const scoringKnobs = ctx.resolve(g4_scoring_1.g4ScoringFeature).knobs;
            const endpointsKnobs = ctx.resolve(g3_endpoints_1.g3EndpointsFeature).knobs;
            const badgeStageKnobs = ctx.resolve(g1_badges_1.g1BadgesFeature).knobs;
            const tees = makeTees(stage, sprites, topPx, ctx, scoringKnobs, endpointsKnobs, badgeStageKnobs);
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
        }
    },
    {
        id: 'rawPairs',
        gate: 'G5',
        consumes: ['supportField', 'badges', 'tees', 'baskets', 'params', 'viewport'],
        produces: ['rawPairs'],
        note: 'route both legs for every badge×tee×basket hypothesis',
        run(board, ctx) {
            const stop = ctx.span('rawPairs');
            const ribbonKnobs = ctx.resolve(g5_ribbon_1.g5RibbonFeature).knobs;
            const routingKnobs = ctx.resolve(g5_routing_1.g5RoutingFeature).knobs;
            const scoringKnobs = ctx.resolve(g4_scoring_1.g4ScoringFeature).knobs;
            const rawPairs = makeRawPairs(board.get('supportField'), board.get('badges'), board.get('tees'), board.get('baskets'), board.get('params'), board.get('viewport').topPx, ribbonKnobs, routingKnobs, scoringKnobs);
            for (const pair of rawPairs)
                ctx.measure('rawPairs', 'supportMin', pair.supportMin);
            board.set('rawPairs', rawPairs);
            stop();
        }
    },
    {
        id: 'measurement',
        gate: 'G5',
        consumes: [
            'image',
            'viewport',
            'params',
            'stage',
            'badges',
            'baskets',
            'tees',
            'supportField',
            'rawPairs'
        ],
        produces: ['measurement'],
        note: 'assemble the ThreeFactorMeasurement artifact',
        run(board, ctx) {
            const stop = ctx.span('measurement');
            const image = board.get('image');
            const { topPx, bottomPx } = board.get('viewport');
            const stage = board.get('stage');
            const measurement = {
                algo: types_1.THREE_FACTOR_ALGO,
                algoVersion: types_1.THREE_FACTOR_ALGO_VERSION,
                widthPx: image.width,
                heightPx: image.height,
                viewport: { topPx, bottomPx, sourceFrame: 'original-image' },
                parameters: board.get('params'),
                brightMask: stage.brightMask,
                darkMask: stage.darkMask,
                badges: board.get('badges'),
                baskets: board.get('baskets'),
                tees: board.get('tees'),
                field: board.get('supportField'),
                rawPairs: board.get('rawPairs')
            };
            board.set('measurement', measurement);
            stop();
        }
    }
];
exports.DEFAULT_MEASURE_EXECUTION = [
    'badgeStage',
    'badges',
    'baskets',
    'tees',
    'supportField',
    'badgeOcclusionPatch',
    'rawPairs',
    'measurement'
];
/** Seed the evidence board exactly as the monolithic entry point did. */
function seedBoard(board, image, params) {
    if (image.width <= 0 || image.height <= 0)
        throw new Error('Image dimensions must be positive.');
    if (image.data.length !== image.width * image.height * 4)
        throw new Error('RGBA byte length does not match image dimensions.');
    const topPx = clampInt(params?.viewport?.topPx ?? 0, 0, image.height - 1);
    const bottomPx = clampInt(params?.viewport?.bottomPx ?? image.height, topPx + 1, image.height);
    board.set('image', image);
    board.set('viewport', { topPx, bottomPx });
    board.set('params', makeParameters(params));
    board.set('localImage', cropImage(image, topPx, bottomPx));
}
function measureThreeFactor(image, params) {
    const board = createBoard();
    seedBoard(board, image, params);
    for (const unit of exports.measureUnits)
        unit.run(board, types_2.nullFeatureContext);
    return board.get('measurement');
}
//# sourceMappingURL=measure.js.map