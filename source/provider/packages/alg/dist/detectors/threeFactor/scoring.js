"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_ZFIT_KNOBS = exports.DEFAULT_SCORING_KNOBS = void 0;
exports.makeRawPairEvidence = makeRawPairEvidence;
exports.scorePair = scorePair;
exports.DEFAULT_SCORING_KNOBS = {
    fallbackTeeBboxOffset: 6,
    fallbackTeeBboxSize: 12,
    ringDistance: 84,
    ringTolerance: 12,
    zoneFactorDistance: 35,
    secondaryRingDistance: 44,
    secondaryRingTolerance: 8,
    radialTolerance: 0.5,
    teeOrientationSigma: 12,
    badgeFractionTarget: 0.36,
    badgeFractionTolerance: 0.19,
    badgeFractionSigma: 0.15,
    collinearityWeight: 0.6,
    collinearitySigma: 2,
    basketIdentityFloor: 0.4,
    basketScoreOffset: 0.2,
    basketScoreScale: 0.5,
    endpointSupportSampleCount: 3,
    badgeOverlapWaiverRadius: 8,
    recoveredTeePrior: 0.7,
    minWindowCells: 3
};
exports.DEFAULT_ZFIT_KNOBS = {
    topK: 80,
    alignedWorstCeiling: 0.28,
    distanceStartOffset: 8,
    distanceStepPx: 14,
    maxChordFraction: 0.85,
    maxAdditionalDistance: 220,
    bendAngles: [-60, -45, -30, -20, 0, 20, 30, 45, 60],
    bendLengthShort: 0.8,
    bendLengthMedium: 1.6,
    bendLengthLong: 3,
    maxPathOvershootFraction: 1.4,
    bendFactorWithSegment: 0.8,
    bendFactorWithoutSegment: 0.9,
    scoreMultiplier: 0.9
};
function cell(field, x, y, yOffsetPx) {
    const cx = Math.max(0, Math.min(field.width - 1, Math.round(x / field.scale)));
    const cy = Math.max(0, Math.min(field.height - 1, Math.round((y - yOffsetPx) / field.scale)));
    return cy * field.width + cx;
}
function supportAt(field, point, yOffsetPx) {
    return field.support[cell(field, point[0], point[1], yOffsetPx)];
}
function canonicalPath(teeLeg, basketLeg) {
    return [...teeLeg.path].reverse().concat(basketLeg.path.slice(1));
}
function weakWindow(samples, windowCells) {
    if (!samples.length)
        return 0;
    if (samples.length <= windowCells)
        return samples.reduce((sum, value) => sum + value, 0) / samples.length;
    let sum = samples.slice(0, windowCells).reduce((total, value) => total + value, 0);
    let worst = sum / windowCells;
    for (let i = windowCells; i < samples.length; i++) {
        sum += samples[i] - samples[i - windowCells];
        worst = Math.min(worst, sum / windowCells);
    }
    return worst;
}
function endpointSupport(field, leg, yOffsetPx, sampleCount) {
    const samples = leg.path.slice(-sampleCount);
    return samples.length ? samples.reduce((sum, point) => sum + supportAt(field, point, yOffsetPx), 0) / samples.length : 0;
}
function zoneFactor(field, point, baskets, ownBasketId, yOffsetPx, knobs) {
    const [x, y] = point;
    for (const basket of baskets) {
        if (basket.detId === ownBasketId)
            continue;
        const d = Math.hypot(x - basket.centerXPx, y - basket.centerYPx);
        if (d <= knobs.zoneFactorDistance)
            return 0.4;
        if (Math.abs(d - knobs.ringDistance) <= knobs.ringTolerance || Math.abs(d - knobs.secondaryRingDistance) <= knobs.secondaryRingTolerance) {
            const theta = field.bestTheta[cell(field, x, y, yOffsetPx)];
            const radial = Math.abs(((x - basket.centerXPx) * Math.cos(theta) + (y - basket.centerYPx) * Math.sin(theta)) / Math.max(d, 1e-9));
            if (radial <= knobs.radialTolerance)
                return 0.4;
        }
    }
    return 1;
}
function alignedSamples(field, path, baskets, ownBasketId, params, yOffsetPx, knobs) {
    const samples = [];
    for (let i = 0; i < path.length; i++) {
        const previous = path[Math.max(0, i - 1)];
        const next = path[Math.min(path.length - 1, i + 1)];
        const length = Math.hypot(next[0] - previous[0], next[1] - previous[1]);
        const fieldCell = cell(field, path[i][0], path[i][1], yOffsetPx);
        const alignment = length ? Math.abs(((next[0] - previous[0]) * Math.cos(field.bestTheta[fieldCell]) + (next[1] - previous[1]) * Math.sin(field.bestTheta[fieldCell])) / length) : 1;
        const support = field.support[fieldCell] * alignment ** params.alignmentPower;
        samples.push(support * zoneFactor(field, path[i], baskets, ownBasketId, yOffsetPx, knobs));
    }
    return samples;
}
function alignedPairSamples(field, teeLeg, basketLeg, baskets, ownBasketId, params, yOffsetPx, knobs) {
    // The reference scores each leg independently: a basket's furniture is
    // exempt only on the basket leg, never on the tee leg. Concatenate after
    // applying that distinction so a route cannot borrow its own basket's zone
    // while travelling from the tee to the badge.
    const tee = alignedSamples(field, teeLeg.path, baskets, '', params, yOffsetPx, knobs).reverse();
    const basket = alignedSamples(field, basketLeg.path, baskets, ownBasketId, params, yOffsetPx, knobs);
    return tee.concat(basket.slice(1));
}
function overlapFactor(field, teeLeg, basketLeg, badge, yOffsetPx, knobs) {
    const badgeX = Math.round(badge.cxPx / field.scale);
    const badgeY = Math.round((badge.cyPx - yOffsetPx) / field.scale);
    const outsideBadgeWaiver = (point) => {
        const x = Math.round(point[0] / field.scale);
        const y = Math.round((point[1] - yOffsetPx) / field.scale);
        return Math.hypot(x - badgeX, y - badgeY) > knobs.badgeOverlapWaiverRadius;
    };
    const teeCells = new Set();
    for (const point of teeLeg.path) {
        if (!outsideBadgeWaiver(point))
            continue;
        teeCells.add(cell(field, point[0], point[1], yOffsetPx));
    }
    let outside = 0;
    let shared = 0;
    for (const point of basketLeg.path) {
        if (!outsideBadgeWaiver(point))
            continue;
        outside++;
        if (teeCells.has(cell(field, point[0], point[1], yOffsetPx)))
            shared++;
    }
    if (!outside)
        return 1;
    const overlap = shared / outside;
    return (1 - overlap) ** 2;
}
function axisAngleDegrees(a, b) {
    let delta = Math.abs(a - b) % Math.PI;
    if (delta > Math.PI / 2)
        delta = Math.PI - delta;
    return (delta * 180) / Math.PI;
}
function directionalAngleDegrees(a, b) {
    let delta = Math.abs(a - b) % (2 * Math.PI);
    if (delta > Math.PI)
        delta = 2 * Math.PI - delta;
    return (delta * 180) / Math.PI;
}
function geometryFactors(badge, tee, basket, knobs) {
    const tx = tee.xPx;
    const ty = tee.yPx;
    const bx = basket.tipXPx;
    const by = basket.tipYPx;
    const dx = bx - tx;
    const dy = by - ty;
    const chord = Math.hypot(dx, dy);
    const teeToBadge = Math.atan2(badge.cyPx - ty, badge.cxPx - tx);
    const teeAngle = tee.angleRad === null ? 0 : axisAngleDegrees(tee.angleRad, teeToBadge);
    const teeOrientation = tee.angleRad === null ? 1 : Math.exp(-((teeAngle / knobs.teeOrientationSigma) ** 2));
    const fraction = chord > 0 ? ((badge.cxPx - tx) * dx + (badge.cyPx - ty) * dy) / (chord * chord) : 0.5;
    const excess = Math.max(0, Math.abs(fraction - knobs.badgeFractionTarget) - knobs.badgeFractionTolerance);
    const badgeFraction = Math.exp(-((excess / knobs.badgeFractionSigma) ** 2));
    const badgeAngle = Math.atan2(badge.cyPx - ty, badge.cxPx - tx);
    const endpointAngle = Math.atan2(by - ty, bx - tx);
    const collinearityDegrees = directionalAngleDegrees(badgeAngle, endpointAngle);
    const collinearity = 1 + knobs.collinearityWeight * Math.exp(-((collinearityDegrees / knobs.collinearitySigma) ** 2));
    return { teeOrientation, badgeFraction, collinearity };
}
function zfitFactor(field, badge, tee, basket, baskets, params, yOffsetPx, current, knobs, zfitKnobs) {
    if (current >= zfitKnobs.alignedWorstCeiling)
        return 1;
    const chord = Math.hypot(basket.tipXPx - tee.xPx, basket.tipYPx - tee.yPx);
    const firstLength = Math.hypot(badge.cxPx - tee.xPx, badge.cyPx - tee.yPx);
    if (chord < 1 || firstLength < 1)
        return 1;
    const ux = (badge.cxPx - tee.xPx) / firstLength;
    const uy = (badge.cyPx - tee.yPx) / firstLength;
    let best = current;
    for (let distance = firstLength + zfitKnobs.distanceStartOffset; distance <= Math.min(chord * zfitKnobs.maxChordFraction, firstLength + zfitKnobs.maxAdditionalDistance); distance += zfitKnobs.distanceStepPx) {
        const p1 = [tee.xPx + ux * distance, tee.yPx + uy * distance];
        for (const bendDegrees of zfitKnobs.bendAngles) {
            const radians = (bendDegrees * Math.PI) / 180;
            const vx = ux * Math.cos(radians) - uy * Math.sin(radians);
            const vy = ux * Math.sin(radians) + uy * Math.cos(radians);
            const lengths = bendDegrees === 0 ? [0] : [zfitKnobs.bendLengthShort * params.corridorWidthPx, zfitKnobs.bendLengthMedium * params.corridorWidthPx, zfitKnobs.bendLengthLong * params.corridorWidthPx];
            for (const secondLength of lengths) {
                const p2 = [p1[0] + vx * secondLength, p1[1] + vy * secondLength];
                if (distance + secondLength + Math.hypot(basket.tipXPx - p2[0], basket.tipYPx - p2[1]) > zfitKnobs.maxPathOvershootFraction * chord)
                    continue;
                const path = [];
                const segments = [[tee.xPx, tee.yPx, p1[0], p1[1]], ...(secondLength ? [[p1[0], p1[1], p2[0], p2[1]]] : []), [p2[0], p2[1], basket.tipXPx, basket.tipYPx]];
                for (const [x0, y0, x1, y1] of segments) {
                    const length = Math.hypot(x1 - x0, y1 - y0);
                    const steps = Math.max(1, Math.round(length / field.scale));
                    for (let i = 1; i <= steps; i++)
                        path.push([x0 + (x1 - x0) * i / steps, y0 + (y1 - y0) * i / steps]);
                }
                const samples = alignedSamples(field, path, baskets, basket.detId, params, yOffsetPx, knobs);
                const bendFactor = bendDegrees === 0 ? 1 : secondLength > 0 ? zfitKnobs.bendFactorWithSegment : zfitKnobs.bendFactorWithoutSegment;
                best = Math.max(best, weakWindow(samples, Math.max(knobs.minWindowCells, Math.round(params.worstWindowSrcPx / field.scale))) * bendFactor * zfitKnobs.scoreMultiplier);
            }
        }
    }
    return best > current ? best / Math.max(current, 1e-6) : 1;
}
function makeRawPairEvidence(field, badge, tee, basket, teeLeg, basketLeg, params, yOffsetPx, knobs = exports.DEFAULT_SCORING_KNOBS) {
    const path = canonicalPath(teeLeg, basketLeg);
    if (!teeLeg.reachable || !basketLeg.reachable || !path.length) {
        return {
            pairId: `${badge.detId}:${tee.detId}:${basket.detId}`,
            badgeId: badge.detId,
            teeId: tee.detId,
            basketId: basket.detId,
            teeLeg,
            basketLeg,
            supportMean: 0,
            supportMin: 0,
            supportedFraction: 0,
            worstWindowMean: 0,
            weakSpanCount: 0,
            weakSpanLongestPx: 0,
            pathLengthPx: 0,
            straightDistancePx: 0,
            efficiency: 0,
            endpointSupportTee: 0,
            endpointSupportBasket: 0,
            failureReason: 'unreachable'
        };
    }
    const samples = path.map((point) => supportAt(field, point, yOffsetPx));
    let weakSpanCount = 0;
    let weakSpanLongest = 0;
    let weak = 0;
    for (let i = 0; i <= samples.length; i++) {
        if (i < samples.length && samples[i] < params.supportTau)
            weak++;
        else if (weak) {
            weakSpanCount++;
            weakSpanLongest = Math.max(weakSpanLongest, weak * field.scale);
            weak = 0;
        }
    }
    let pathLength = 0;
    for (let i = 1; i < path.length; i++)
        pathLength += Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]);
    const straight = Math.hypot(tee.xPx - badge.cxPx, tee.yPx - badge.cyPx) + Math.hypot(basket.tipXPx - badge.cxPx, basket.tipYPx - badge.cyPx);
    return {
        pairId: `${badge.detId}:${tee.detId}:${basket.detId}`,
        badgeId: badge.detId,
        teeId: tee.detId,
        basketId: basket.detId,
        teeLeg,
        basketLeg,
        supportMean: samples.reduce((sum, value) => sum + value, 0) / samples.length,
        supportMin: Math.min(...samples),
        supportedFraction: samples.filter((value) => value >= params.supportTau).length / samples.length,
        worstWindowMean: weakWindow(samples, Math.max(knobs.minWindowCells, Math.round(params.worstWindowSrcPx / field.scale))),
        weakSpanCount,
        weakSpanLongestPx: weakSpanLongest,
        pathLengthPx: pathLength,
        straightDistancePx: straight,
        efficiency: straight > 0 ? pathLength / straight : 0,
        endpointSupportTee: endpointSupport(field, teeLeg, yOffsetPx, knobs.endpointSupportSampleCount),
        endpointSupportBasket: endpointSupport(field, basketLeg, yOffsetPx, knobs.endpointSupportSampleCount),
        failureReason: null
    };
}
function scorePair(raw, field, badge, tee, basket, baskets, params, yOffsetPx, allowZfit = false, knobs = exports.DEFAULT_SCORING_KNOBS, zfitKnobs = exports.DEFAULT_ZFIT_KNOBS) {
    const aligned = alignedPairSamples(field, raw.teeLeg, raw.basketLeg, baskets, basket.detId, params, yOffsetPx, knobs);
    const alignedWorst = weakWindow(aligned, Math.max(knobs.minWindowCells, Math.round(params.worstWindowSrcPx / field.scale)));
    const alignment = raw.worstWindowMean > 0 ? alignedWorst / raw.worstWindowMean : 0;
    const zone = aligned.length && raw.supportMean > 0 ? aligned.reduce((sum, value) => sum + value, 0) / aligned.length / Math.max(raw.supportMean, 1e-6) : 0;
    const simplePath = overlapFactor(field, raw.teeLeg, raw.basketLeg, badge, yOffsetPx, knobs);
    const geometry = geometryFactors(badge, tee, basket, knobs);
    const basketIdentity = Math.max(knobs.basketIdentityFloor, Math.min(1, (basket.score - knobs.basketScoreOffset) / knobs.basketScoreScale));
    const recoveredPrior = tee.tier === 'recovered' ? knobs.recoveredTeePrior : 1;
    const preliminary = alignedWorst * simplePath * geometry.teeOrientation * geometry.badgeFraction * geometry.collinearity * basketIdentity * recoveredPrior;
    const zfit = params.zfit && allowZfit
        ? zfitFactor(field, badge, tee, basket, baskets, params, yOffsetPx, alignedWorst, knobs, zfitKnobs)
        : 1;
    const score = preliminary * zfit;
    return {
        raw,
        score,
        rank: 0,
        factors: {
            alignment,
            zone,
            simplePath,
            ...geometry,
            basketIdentity,
            recoveredPrior,
            zfit
        }
    };
}
//# sourceMappingURL=scoring.js.map