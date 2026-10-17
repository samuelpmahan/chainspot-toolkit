"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_SEARCH_KNOBS = void 0;
exports.recoveredTee = recoveredTee;
exports.rerouteRawPairs = rerouteRawPairs;
exports.scoreRawPairs = scoreRawPairs;
exports.rankPairsByBadge = rankPairsByBadge;
exports.rankScoredPairs = rankScoredPairs;
exports.selectAssignments = selectAssignments;
exports.assignThreeFactor = assignThreeFactor;
const routing_1 = require("./routing");
const ribbon_1 = require("./ribbon");
const scoring_1 = require("./scoring");
const IMPROVEMENT_EPSILON = 1e-9;
exports.DEFAULT_SEARCH_KNOBS = {
    assignTopRows: 60,
    exchangeTopK: 12,
    maxAssignPasses: 60,
    recoveredTeeDedupeDistance: 14
};
function recoveredTee(input, index, baskets, knobs) {
    const bbox = input.bbox ?? [
        Math.round(input.xPx - knobs.fallbackTeeBboxOffset),
        Math.round(input.yPx - knobs.fallbackTeeBboxOffset),
        knobs.fallbackTeeBboxSize,
        knobs.fallbackTeeBboxSize
    ];
    return {
        detId: `tee-recovered-${index}`,
        xPx: input.xPx,
        yPx: input.yPx,
        tier: 'recovered',
        angleRad: null,
        bbox,
        area: input.area ?? 0,
        fill: input.fill ?? 0,
        onRing: baskets.some((basket) => Math.abs(Math.hypot(input.xPx - basket.tipXPx, input.yPx - basket.tipYPx) - knobs.ringDistance) <= knobs.ringTolerance),
        recovery: input.provenance
    };
}
function comparePairs(a, b) {
    return b.score - a.score || b.raw.supportMean - a.raw.supportMean || a.raw.pairId.localeCompare(b.raw.pairId);
}
function pairKey(pair) {
    return `${pair.raw.teeId}:${pair.raw.basketId}`;
}
function rerouteRawPairs(measurement, tees, ribbonKnobs, routingKnobs, scoringKnobs) {
    const rawPairs = [];
    const teePoints = tees.map((tee) => ({ id: tee.detId, xPx: tee.xPx, yPx: tee.yPx }));
    const basketPoints = measurement.baskets.map((basket) => ({
        id: basket.detId,
        xPx: basket.tipXPx,
        yPx: basket.tipYPx
    }));
    for (const badge of measurement.badges) {
        const legs = (0, routing_1.routeBadgeLegs)(measurement.field, { id: badge.detId, xPx: badge.cxPx, yPx: badge.cyPx }, teePoints, basketPoints, measurement.viewport.topPx, ribbonKnobs, routingKnobs);
        for (let teeIndex = 0; teeIndex < tees.length; teeIndex++) {
            for (let basketIndex = 0; basketIndex < measurement.baskets.length; basketIndex++) {
                rawPairs.push((0, scoring_1.makeRawPairEvidence)(measurement.field, badge, tees[teeIndex], measurement.baskets[basketIndex], legs.tees[teeIndex], legs.baskets[basketIndex], measurement.parameters, measurement.viewport.topPx, scoringKnobs));
            }
        }
    }
    return rawPairs.sort((a, b) => a.pairId.localeCompare(b.pairId));
}
function scoreRawPairs(measurement, tees, rawPairs, zfitKnobs = scoring_1.DEFAULT_ZFIT_KNOBS, scoringKnobs = scoring_1.DEFAULT_SCORING_KNOBS) {
    const badges = new Map(measurement.badges.map((badge) => [badge.detId, badge]));
    const teesById = new Map(tees.map((tee) => [tee.detId, tee]));
    const baskets = new Map(measurement.baskets.map((basket) => [basket.detId, basket]));
    const baseParameters = measurement.parameters.zfit
        ? { ...measurement.parameters, zfit: false }
        : measurement.parameters;
    const scored = rawPairs.map((raw) => {
        const badge = badges.get(raw.badgeId);
        const tee = teesById.get(raw.teeId);
        const basket = baskets.get(raw.basketId);
        if (!badge || !tee || !basket) {
            throw new Error(`Raw pair references missing endpoint evidence: ${raw.pairId}`);
        }
        return (0, scoring_1.scorePair)(raw, measurement.field, badge, tee, basket, measurement.baskets, baseParameters, measurement.viewport.topPx, false, scoringKnobs, zfitKnobs);
    });
    if (!measurement.parameters.zfit)
        return scored;
    const salvage = scored
        .map((row, index) => ({ row, index }))
        .sort((a, b) => b.row.score - a.row.score || a.row.raw.pairId.localeCompare(b.row.raw.pairId))
        .slice(0, zfitKnobs.topK);
    for (const { row, index } of salvage) {
        const alignedWorst = row.raw.worstWindowMean > 0
            ? row.raw.worstWindowMean * row.factors.alignment
            : 0;
        if (alignedWorst <= 0 || row.score <= 0 || alignedWorst >= zfitKnobs.alignedWorstCeiling)
            continue;
        const badge = badges.get(row.raw.badgeId);
        const tee = teesById.get(row.raw.teeId);
        const basket = baskets.get(row.raw.basketId);
        if (!badge || !tee || !basket)
            continue;
        scored[index] = (0, scoring_1.scorePair)(row.raw, measurement.field, badge, tee, basket, measurement.baskets, measurement.parameters, measurement.viewport.topPx, true, scoringKnobs, zfitKnobs);
    }
    return scored;
}
function rankPairsByBadge(scoredPairs) {
    const byBadge = new Map();
    for (const pair of scoredPairs) {
        const list = byBadge.get(pair.raw.badgeId) ?? [];
        list.push(pair);
        byBadge.set(pair.raw.badgeId, list);
    }
    for (const [badgeId, list] of byBadge) {
        const ranked = [...list]
            .sort(comparePairs)
            .map((pair, index) => ({ ...pair, rank: index + 1 }));
        byBadge.set(badgeId, ranked);
    }
    return byBadge;
}
function rankScoredPairs(scoredPairs) {
    return [...rankPairsByBadge(scoredPairs).values()].flat();
}
function selectAssignments(rescoredByBadge, knobs = exports.DEFAULT_SEARCH_KNOBS) {
    const labels = [...rescoredByBadge.keys()];
    const margin = (label) => {
        const rows = [...(rescoredByBadge.get(label) ?? [])].sort(comparePairs);
        const top = rows[0];
        if (!top)
            return 0;
        const rival = rows.find((row) => row.raw.teeId !== top.raw.teeId && row.raw.basketId !== top.raw.basketId);
        return top.score - (rival?.score ?? 0);
    };
    const solveFrom = (order) => {
        const pick = new Map(labels.map((label) => [label, null]));
        const usedTees = new Set();
        const usedBaskets = new Set();
        for (const label of order) {
            let best = null;
            for (const row of rescoredByBadge.get(label) ?? []) {
                if (usedTees.has(row.raw.teeId) || usedBaskets.has(row.raw.basketId))
                    continue;
                if (!best || comparePairs(row, best) < 0)
                    best = row;
            }
            if (!best)
                continue;
            pick.set(label, best);
            usedTees.add(best.raw.teeId);
            usedBaskets.add(best.raw.basketId);
        }
        const topRows = new Map(labels.map((label) => [
            label,
            [...(rescoredByBadge.get(label) ?? [])].sort(comparePairs).slice(0, knobs.assignTopRows)
        ]));
        let improved = true;
        let guard = 0;
        while (improved && guard++ < knobs.maxAssignPasses) {
            improved = false;
            for (const label of labels) {
                const current = pick.get(label) ?? null;
                if (current) {
                    usedTees.delete(current.raw.teeId);
                    usedBaskets.delete(current.raw.basketId);
                }
                let best = null;
                for (const row of topRows.get(label) ?? []) {
                    if (usedTees.has(row.raw.teeId) || usedBaskets.has(row.raw.basketId))
                        continue;
                    if (!best || comparePairs(row, best) < 0)
                        best = row;
                }
                if (best && (!current || best.score > current.score + IMPROVEMENT_EPSILON)) {
                    pick.set(label, best);
                    improved = true;
                }
                else {
                    pick.set(label, current);
                }
                const now = pick.get(label);
                if (now) {
                    usedTees.add(now.raw.teeId);
                    usedBaskets.add(now.raw.basketId);
                }
            }
            for (let i = 0; i < labels.length; i++) {
                for (let j = i + 1; j < labels.length; j++) {
                    const labelA = labels[i];
                    const labelB = labels[j];
                    const currentA = pick.get(labelA) ?? null;
                    const currentB = pick.get(labelB) ?? null;
                    const base = (currentA?.score ?? 0) + (currentB?.score ?? 0);
                    for (const current of [currentA, currentB]) {
                        if (!current)
                            continue;
                        usedTees.delete(current.raw.teeId);
                        usedBaskets.delete(current.raw.basketId);
                    }
                    let bestPair = [currentA, currentB];
                    let bestTotal = base;
                    const rowsA = (topRows.get(labelA) ?? []).slice(0, knobs.exchangeTopK);
                    const rowsB = (topRows.get(labelB) ?? []).slice(0, knobs.exchangeTopK);
                    for (const rowA of rowsA) {
                        if (usedTees.has(rowA.raw.teeId) || usedBaskets.has(rowA.raw.basketId))
                            continue;
                        for (const rowB of rowsB) {
                            if (rowB.raw.teeId === rowA.raw.teeId ||
                                rowB.raw.basketId === rowA.raw.basketId)
                                continue;
                            if (usedTees.has(rowB.raw.teeId) || usedBaskets.has(rowB.raw.basketId))
                                continue;
                            const total = rowA.score + rowB.score;
                            if (total > bestTotal + IMPROVEMENT_EPSILON) {
                                bestTotal = total;
                                bestPair = [rowA, rowB];
                            }
                        }
                    }
                    if (bestPair[0] !== currentA || bestPair[1] !== currentB)
                        improved = true;
                    pick.set(labelA, bestPair[0]);
                    pick.set(labelB, bestPair[1]);
                    for (const current of bestPair) {
                        if (!current)
                            continue;
                        usedTees.add(current.raw.teeId);
                        usedBaskets.add(current.raw.basketId);
                    }
                }
            }
        }
        return pick;
    };
    const total = (pick) => [...pick.values()].reduce((sum, row) => sum + (row?.score ?? 0), 0);
    const marginOrder = [...labels].sort((a, b) => margin(b) - margin(a));
    const starts = [marginOrder, [...labels], [...labels].reverse()];
    let bestPick = solveFrom(starts[0]);
    for (const order of starts.slice(1)) {
        const candidate = solveFrom(order);
        if (total(candidate) > total(bestPick))
            bestPick = candidate;
    }
    return bestPick;
}
function assignThreeFactor(measurement, recoveredTees = [], zfitKnobs, scoringKnobs = scoring_1.DEFAULT_SCORING_KNOBS, searchKnobs = exports.DEFAULT_SEARCH_KNOBS, ribbonKnobs = ribbon_1.DEFAULT_RIBBON_KNOBS, routingKnobs = routing_1.DEFAULT_ROUTING_KNOBS) {
    const sortedRecovered = [...recoveredTees].sort((a, b) => a.yPx - b.yPx ||
        a.xPx - b.xPx ||
        a.provenance.note.localeCompare(b.provenance.note));
    const tees = [...measurement.tees];
    let acceptedRecovered = 0;
    for (const input of sortedRecovered) {
        if (tees.some((tee) => Math.hypot(tee.xPx - input.xPx, tee.yPx - input.yPx) < searchKnobs.recoveredTeeDedupeDistance))
            continue;
        tees.push(recoveredTee(input, acceptedRecovered++, measurement.baskets, scoringKnobs));
    }
    tees.sort((a, b) => a.yPx - b.yPx || a.xPx - b.xPx || a.detId.localeCompare(b.detId));
    const rawPairs = acceptedRecovered > 0
        ? rerouteRawPairs(measurement, tees, ribbonKnobs, routingKnobs, scoringKnobs)
        : measurement.rawPairs;
    const scoredUnranked = scoreRawPairs(measurement, tees, rawPairs, zfitKnobs, scoringKnobs);
    const byBadge = rankPairsByBadge(scoredUnranked);
    const scoredPairs = [...byBadge.values()].flat();
    const selected = selectAssignments(byBadge, searchKnobs);
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
    return { measurement, tees, scoredPairs, assignments };
}
//# sourceMappingURL=assignment.js.map