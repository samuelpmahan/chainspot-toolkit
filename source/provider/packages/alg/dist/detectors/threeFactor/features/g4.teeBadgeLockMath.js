"use strict";
/**
 * Pure tee↔badge ownership math for the G4 teeBadgeLock deviation.
 *
 * The path named `RawPairEvidence.teeLeg` is legacy pathfinder testimony in
 * badge→tee order.  This feature deliberately treats it as opaque testimony,
 * reads no basket-side property, and reverses the exact sampled points once
 * at the public seam.  Everything below operates on that tee→badge sequence;
 * it never interpolates, smooths, or refits a route.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.selectTeeBadgeLocks = exports.extractTeeBadgePaths = exports.ROUTE_TIE_BREAK_EPSILON = exports.UNKNOWN_SIGMA_FALLBACK_NAME = exports.UNKNOWN_SIGMA_FALLBACK_DEG = void 0;
exports.readImageSigma = readImageSigma;
exports.scoreTeeBadgeRay = scoreTeeBadgeRay;
exports.traceBadgeToBasket = traceBadgeToBasket;
exports.collapseTeeBadgePaths = collapseTeeBadgePaths;
exports.scoreTeeBadgePath = scoreTeeBadgePath;
exports.readTeeAxis = readTeeAxis;
exports.scoreTeeBadgeCandidates = scoreTeeBadgeCandidates;
exports.maximumWeightTeeBadgeMatching = maximumWeightTeeBadgeMatching;
exports.buildTeeBadgeLockEvidence = buildTeeBadgeLockEvidence;
/** CL-4's named conservative fallback: applied ONLY when an image publishes
 * no per-image sigma (too few good-quality fits to estimate one). This is
 * the owner-verified real-world compass extreme already on record in the
 * signed 2026-08-28 render-stack contract ("compass median 1.1 degrees,
 * p90 2.65", ratchet-tracked outlier at 11.3) -- a documented sanity anchor
 * pressed into service as a worst-case fallback, not a re-imported tuning
 * constant, and it is never used when a real per-image sigma exists. */
exports.UNKNOWN_SIGMA_FALLBACK_DEG = 11.3;
exports.UNKNOWN_SIGMA_FALLBACK_NAME = 'UNKNOWN_SIGMA_FALLBACK_DEG=11.3 (owner-verified compass p100 outlier, 2026-08-28 render-stack contract; applied only when this image published no per-image sigma)';
function readCompassAxisQuality(value) {
    return value === 'good' || value === 'occluded-partial' || value === 'poor' || value === 'none'
        ? value
        : 'none';
}
function readCompassAxisSource(value) {
    return value === 'constrained-fit' || value === 'component-pca-evidence-only' ? value : 'UNKNOWN';
}
/** Typed, defensive read of one image's G3-published orientation sigma.
 * (The tee-axis counterpart, readTeeAxis, is defined further below next to
 * the legacy TeeBadgeTeeOrder fallback chain it also consults.) */
function readImageSigma(measurement) {
    if (!measurement || typeof measurement !== 'object') {
        return { orientationSigmaDeg: 'UNKNOWN', sigmaProvenance: { fallback: exports.UNKNOWN_SIGMA_FALLBACK_NAME } };
    }
    const value = measurement;
    if (finite(value.orientationSigmaDeg)) {
        const provenance = value.sigmaProvenance && typeof value.sigmaProvenance === 'object'
            ? value.sigmaProvenance
            : { method: 'measurement.orientationSigmaDeg (unstructured provenance)' };
        return { orientationSigmaDeg: value.orientationSigmaDeg, sigmaProvenance: provenance };
    }
    return { orientationSigmaDeg: 'UNKNOWN', sigmaProvenance: { fallback: exports.UNKNOWN_SIGMA_FALLBACK_NAME } };
}
/**
 * CL-6a + CL-4 + CL-5: score how well one tee's own compass axis points at
 * one badge. Plain sentence: "the tee's pointing direction should land on
 * the badge, within how much this photo's own fits wobble, widened a
 * little more when the badge sits close (a small center error tilts the
 * ray more at short range)."
 */
function scoreTeeBadgeRay(axis, imageSigma, bearingRad, badgeDistancePx) {
    if (axis.axisQuality === 'poor' || axis.axisQuality === 'none' || axis.axisRad === null) {
        return {
            rayFactor: 1,
            rayErrorDeg: 'UNKNOWN',
            sigmaUsedDeg: 'UNKNOWN',
            sigmaProvenance: 'UNKNOWN (no confident ray to score)',
            wideningDeg: 'UNKNOWN',
            degraded: true,
            degradeReason: axis.axisRad === null
                ? 'no accepted axis fit for this tee (angleRad null) -- corroboration-only'
                : `axisQuality='${axis.axisQuality}' cannot drive a confident ray lock -- corroboration-only`
        };
    }
    const rayErrorDeg = (axialAngleDelta(axis.axisRad, bearingRad) * 180) / Math.PI;
    let sigmaImageDeg;
    let sigmaProvenance;
    if (typeof imageSigma.orientationSigmaDeg === 'number') {
        sigmaImageDeg = imageSigma.orientationSigmaDeg;
        const p = imageSigma.sigmaProvenance;
        sigmaProvenance =
            typeof p.method === 'string'
                ? `${p.method}${finite(p.goodFitCount) ? ` (n=${p.goodFitCount})` : ''}`
                : 'measurement-provided per-image sigma';
    }
    else {
        sigmaImageDeg = exports.UNKNOWN_SIGMA_FALLBACK_DEG;
        sigmaProvenance = exports.UNKNOWN_SIGMA_FALLBACK_NAME;
    }
    // CL-5: a small center-position error tilts the ray more when the badge
    // is close -- atan(centerShiftPx / badgeDistancePx), degenerate (maximal,
    // 90deg) widening when the badge sits exactly at the tee's own center.
    let wideningDeg = 0;
    if (typeof axis.centerUncertaintyPx === 'number' && axis.centerUncertaintyPx > 0) {
        wideningDeg =
            badgeDistancePx > 0
                ? (Math.atan(axis.centerUncertaintyPx / badgeDistancePx) * 180) / Math.PI
                : 90;
    }
    const sigmaUsedDeg = Math.sqrt(sigmaImageDeg ** 2 + wideningDeg ** 2);
    const rayFactor = Math.exp(-((rayErrorDeg / sigmaUsedDeg) ** 2));
    return { rayFactor, rayErrorDeg, sigmaUsedDeg, sigmaProvenance, wideningDeg, degraded: false };
}
/** CL-6a: route factors (weakAlignedSupport, pathEfficiency) demote to
 * corroboration/tie-break -- they may only nudge a candidate's rank within
 * floating-point precision of the ray term, never override it. */
exports.ROUTE_TIE_BREAK_EPSILON = 1e-6;
function insideBbox(point, bbox) {
    const [x, y, w, h] = bbox;
    return point[0] >= x && point[0] <= x + w && point[1] >= y && point[1] <= y + h;
}
function occluderAt(point, occluders) {
    return occluders.find((occluder) => insideBbox(point, occluder.bbox));
}
function basketAt(point, baskets) {
    return baskets.find((basket) => insideBbox(point, basket.bbox));
}
function angleDiff(fromRad, toRad) {
    return Math.atan2(Math.sin(toRad - fromRad), Math.cos(toRad - fromRad));
}
function angleLerp(fromRad, toRad, weight) {
    return fromRad + angleDiff(fromRad, toRad) * weight;
}
/** bestTheta is undirected (mod pi, per the ribbon field's own convention);
 * pick whichever of theta/theta+pi keeps the trace moving the same way it
 * was already headed. */
function disambiguateTheta(theta, headingRad) {
    const a = theta;
    const b = theta + Math.PI;
    return Math.abs(angleDiff(headingRad, a)) <= Math.abs(angleDiff(headingRad, b)) ? a : b;
}
// A near-exact right-angle turn is a genuine tie between the two undirected
// candidates (theta vs theta+pi are equidistant from the current heading);
// floating-point noise, not the paint, would otherwise decide which way to
// go -- including backward. Break a real tie by looking one step further
// along each candidate and keeping whichever direction the paint actually
// continues under.
const HEADING_TIE_EPSILON_RAD = 1e-6;
function disambiguateHeading(theta, headingRad, fromPoint, stepPx, field, viewportTopPx) {
    const a = theta;
    const b = theta + Math.PI;
    const diffA = Math.abs(angleDiff(headingRad, a));
    const diffB = Math.abs(angleDiff(headingRad, b));
    if (Math.abs(diffA - diffB) >= HEADING_TIE_EPSILON_RAD)
        return diffA <= diffB ? a : b;
    const aheadA = [fromPoint[0] + Math.cos(a) * stepPx, fromPoint[1] + Math.sin(a) * stepPx];
    const aheadB = [fromPoint[0] + Math.cos(b) * stepPx, fromPoint[1] + Math.sin(b) * stepPx];
    const supportA = sampleField(field, aheadA, viewportTopPx).support;
    const supportB = sampleField(field, aheadB, viewportTopPx).support;
    return supportA >= supportB ? a : b;
}
function sampleField(field, point, viewportTopPx) {
    const [cx, cy] = cellFor(point, field, viewportTopPx);
    const index = cy * field.width + cx;
    return { support: fieldAt(field.support, index), theta: fieldAt(field.bestTheta, index) };
}
// Equal-weight ridge smoothing: a genuinely bent path is followed one step's
// worth of turn at a time; single-cell quantization noise gets damped rather
// than chased.
const HEADING_BLEND_WEIGHT = 0.5;
// Two credible ridges diverging by more than this from the current heading,
// on opposite sides, is a structural fork -- comfortably above the noise a
// single quantized best-orientation bin ever introduces along one ridge.
const FORK_DIVERGENCE_DEG = 45;
/**
 * Follow the painted hole path from one claimed badge, away from the tee
 * side, through the support field's own testimony -- ridge-following along
 * bestTheta, tunneling short gaps under other stack members, and stopping
 * the instant the trace lands inside a real basket's own footprint. A trace
 * that runs off support with nothing to tunnel under, forks ambiguously, or
 * exhausts its length budget without a credible terminus returns a loud
 * UNKNOWN carrying its partial trace, never a proximity guess at "closest
 * basket."
 */
// 2026-08-29 gate-reorg: a per-step heading drift under this is quantization
// noise (single-cell bestTheta bins), not a real bend -- keeps "ran straight"
// receipts honest for paths that are geometrically dead straight.
const STRAIGHT_STEP_TOLERANCE_DEG = 2;
function traceBadgeToBasket(input) {
    const viewportTopPx = finite(input.viewportTopPx) ? input.viewportTopPx : 0;
    const stepPx = Math.max(1, input.corridorWidthPx / 4);
    const points = [input.startPx];
    const tunneledSegments = [];
    let heading = input.headingRad;
    let current = input.startPx;
    let lengthPx = 0;
    let tunnelOverId;
    let tunnelBudgetPx = 0;
    let tunnelUsedPx = 0;
    // bendCount: number of distinct contiguous turning phases (2026-08-29
    // gate-reorg: 0 = "ran straight to the basket" (new-G5-shaped), >0 =
    // "bent N times" (new-G6-shaped) -- visible in the evidence pre-migration.
    let bendCount = 0;
    let turning = false;
    const withinField = (point) => {
        const x = point[0] / input.field.scale;
        const y = (point[1] - viewportTopPx) / input.field.scale;
        return x >= -1 && y >= -1 && x <= input.field.width && y <= input.field.height;
    };
    while (lengthPx < input.maxTraceLengthPx) {
        const next = [
            current[0] + Math.cos(heading) * stepPx,
            current[1] + Math.sin(heading) * stepPx
        ];
        if (!withinField(next)) {
            return { outcome: 'unknown', reason: 'ran-off-image', points, lengthPx, tunneledSegments, bendCount };
        }
        const landedBasket = basketAt(next, input.baskets);
        if (landedBasket) {
            points.push(next);
            lengthPx += stepPx;
            return {
                outcome: 'basket',
                basketId: landedBasket.basketId,
                points,
                lengthPx,
                tunneledSegments,
                bendCount
            };
        }
        const insideStartBadge = insideBbox(next, input.startBadgeBbox);
        const { support, theta } = sampleField(input.field, next, viewportTopPx);
        const onPath = support >= input.supportTau || insideStartBadge;
        if (onPath) {
            if (tunnelOverId !== undefined) {
                tunneledSegments.push({ overId: tunnelOverId, lengthPx: tunnelUsedPx });
                tunnelOverId = undefined;
                tunnelUsedPx = 0;
            }
            if (!insideStartBadge) {
                const chosen = disambiguateHeading(theta, heading, next, stepPx, input.field, viewportTopPx);
                // Ambiguous fork: sample the two lateral directions a half-corridor
                // off the ridge centerline; if both carry real on-path support and
                // their own disambiguated headings diverge from the centerline on
                // OPPOSITE sides by more than FORK_DIVERGENCE_DEG, the path forks
                // here rather than continuing as one ridge.
                const half = input.corridorWidthPx / 2;
                const leftPoint = [
                    next[0] + Math.cos(heading + Math.PI / 2) * half,
                    next[1] + Math.sin(heading + Math.PI / 2) * half
                ];
                const rightPoint = [
                    next[0] + Math.cos(heading - Math.PI / 2) * half,
                    next[1] + Math.sin(heading - Math.PI / 2) * half
                ];
                const left = sampleField(input.field, leftPoint, viewportTopPx);
                const right = sampleField(input.field, rightPoint, viewportTopPx);
                if (left.support >= input.supportTau && right.support >= input.supportTau) {
                    const leftHeading = disambiguateTheta(left.theta, heading);
                    const rightHeading = disambiguateTheta(right.theta, heading);
                    const leftDeg = (angleDiff(heading, leftHeading) * 180) / Math.PI;
                    const rightDeg = (angleDiff(heading, rightHeading) * 180) / Math.PI;
                    if (Math.abs(leftDeg) > FORK_DIVERGENCE_DEG &&
                        Math.abs(rightDeg) > FORK_DIVERGENCE_DEG &&
                        Math.sign(leftDeg) !== Math.sign(rightDeg)) {
                        return {
                            outcome: 'unknown',
                            reason: 'ambiguous-fork',
                            points,
                            lengthPx,
                            tunneledSegments,
                            bendCount
                        };
                    }
                }
                const previousHeading = heading;
                heading = angleLerp(heading, chosen, HEADING_BLEND_WEIGHT);
                const stepTurnDeg = Math.abs((angleDiff(previousHeading, heading) * 180) / Math.PI);
                if (stepTurnDeg > STRAIGHT_STEP_TOLERANCE_DEG) {
                    if (!turning)
                        bendCount++;
                    turning = true;
                }
                else {
                    turning = false;
                }
            }
            points.push(next);
            current = next;
            lengthPx += stepPx;
            continue;
        }
        // Off support. Only a known stack member excuses a gap (S5): tunnel
        // straight through for up to that member's own measured footprint plus
        // a half-corridor margin -- never a fixed pixel literal.
        const occluder = occluderAt(next, input.occluders);
        if (occluder) {
            if (tunnelOverId !== occluder.id) {
                tunnelOverId = occluder.id;
                tunnelUsedPx = 0;
                tunnelBudgetPx = Math.hypot(occluder.bbox[2], occluder.bbox[3]) + input.corridorWidthPx / 2;
            }
            tunnelUsedPx += stepPx;
            if (tunnelUsedPx > tunnelBudgetPx) {
                return { outcome: 'unknown', reason: 'petered-out', points, lengthPx, tunneledSegments, bendCount };
            }
            points.push(next);
            current = next;
            lengthPx += stepPx;
            continue;
        }
        return { outcome: 'unknown', reason: 'petered-out', points, lengthPx, tunneledSegments, bendCount };
    }
    return { outcome: 'unknown', reason: 'exceeded-max-length', points, lengthPx, tunneledSegments, bendCount };
}
const UNKNOWN_AXIS = 'UNKNOWN';
function finite(value) {
    return typeof value === 'number' && Number.isFinite(value);
}
function positiveFinite(value) {
    return finite(value) && value > 0;
}
function samePoint(a, b) {
    return Object.is(a[0], b[0]) && Object.is(a[1], b[1]);
}
function clonePath(path) {
    if (!Array.isArray(path))
        throw new Error('teeBadgeLock: teeLeg.path must be an array.');
    return path.map((point, index) => {
        if (!Array.isArray(point) || point.length < 2 || !finite(point[0]) || !finite(point[1])) {
            throw new Error(`teeBadgeLock: teeLeg.path point ${index} must contain finite x,y.`);
        }
        return [point[0], point[1]];
    });
}
function equalPath(a, b) {
    return a.length === b.length && a.every((point, index) => samePoint(point, b[index]));
}
/**
 * Extract only the pathfinder testimony allowed by the feature contract.
 * Duplicate rows for one badge×tee pair are accepted only when every sampled
 * point is exactly identical; a divergent duplicate is a hard error.
 */
function collapseTeeBadgePaths(rows) {
    const byPair = new Map();
    for (const row of rows) {
        // Keep these accesses intentionally explicit and local.  In particular,
        // do not destructure or inspect the rest of RawPairEvidence.
        const badgeId = row.badgeId;
        const teeId = row.teeId;
        const teeLeg = row.teeLeg;
        if (typeof badgeId !== 'string' || typeof teeId !== 'string' || !teeLeg) {
            throw new Error('teeBadgeLock: raw row must provide badgeId, teeId, and teeLeg.');
        }
        const legacyPath = clonePath(teeLeg.path);
        const candidate = {
            badgeId,
            teeId,
            teeBadgePath: legacyPath.slice().reverse()
        };
        const key = `${badgeId}\u0000${teeId}`;
        const prior = byPair.get(key);
        if (prior) {
            if (!equalPath(prior.teeBadgePath, candidate.teeBadgePath)) {
                throw new Error(`teeBadgeLock: divergent duplicate teeBadgePath for badge '${badgeId}' and tee '${teeId}'.`);
            }
            continue;
        }
        byPair.set(key, candidate);
    }
    return [...byPair.values()].sort((a, b) => compareText(a.badgeId, b.badgeId) || compareText(a.teeId, b.teeId));
}
/** Public adapter alias required by the acceptance seam. */
exports.extractTeeBadgePaths = collapseTeeBadgePaths;
function clamp(value, low, high) {
    return Math.max(low, Math.min(high, value));
}
function cellFor(point, field, viewportTopPx) {
    const x = clamp(Math.round(point[0] / field.scale), 0, Math.max(0, field.width - 1));
    const y = clamp(Math.round((point[1] - viewportTopPx) / field.scale), 0, Math.max(0, field.height - 1));
    return [x, y];
}
function fieldAt(values, index) {
    const value = values[index];
    return finite(value) ? value : 0;
}
function tangentTheta(path, index) {
    if (path.length < 2)
        return 0;
    let previous = index - 1;
    while (previous >= 0 && samePoint(path[previous], path[index]))
        previous--;
    let next = index + 1;
    while (next < path.length && samePoint(path[next], path[index]))
        next++;
    if (previous < 0 && next >= path.length)
        return 0;
    const a = previous >= 0 ? path[previous] : path[index];
    const b = next < path.length ? path[next] : path[index];
    let dx = b[0] - a[0];
    let dy = b[1] - a[1];
    if (dx === 0 && dy === 0) {
        if (next < path.length) {
            dx = b[0] - path[Math.max(0, index - 1)][0];
            dy = b[1] - path[Math.max(0, index - 1)][1];
        }
        else if (previous >= 0) {
            dx = path[index][0] - a[0];
            dy = path[index][1] - a[1];
        }
    }
    return dx === 0 && dy === 0 ? 0 : Math.atan2(dy, dx);
}
function routeLength(path) {
    let length = 0;
    for (let index = 1; index < path.length; index++) {
        length += Math.hypot(path[index][0] - path[index - 1][0], path[index][1] - path[index - 1][1]);
    }
    return length;
}
function fallbackEndpoints(path) {
    return {
        tee: path[0] ?? [0, 0],
        badge: path[path.length - 1] ?? [0, 0]
    };
}
function axialAngleDelta(aRad, bRad) {
    const period = Math.PI;
    const normalized = (value) => {
        const result = value % period;
        return result < 0 ? result + period : result;
    };
    const delta = normalized(aRad) - normalized(bRad);
    const wrapped = ((((delta + Math.PI / 2) % period) + period) % period) - Math.PI / 2;
    return Math.abs(wrapped);
}
function readPoint(value) {
    if (Array.isArray(value) && finite(value[0]) && finite(value[1]))
        return [value[0], value[1]];
    if (value && typeof value === 'object') {
        const object = value;
        const x = finite(object.xPx) ? object.xPx : object.cxPx;
        const y = finite(object.yPx) ? object.yPx : object.cyPx;
        if (finite(x) && finite(y))
            return [x, y];
    }
    return undefined;
}
/** Score one exact tee→badge testimony path. */
function scoreTeeBadgePath(input) {
    const { candidate, field, knobs } = input;
    if (!positiveFinite(field.scale))
        throw new Error('teeBadgeLock: field.scale must be positive.');
    if (!Number.isInteger(field.width) ||
        field.width < 1 ||
        !Number.isInteger(field.height) ||
        field.height < 1) {
        throw new Error('teeBadgeLock: support field dimensions must be positive integers.');
    }
    if (!finite(knobs.alignmentPower) || knobs.alignmentPower < 0)
        throw new Error('teeBadgeLock: alignmentPower must be finite and non-negative.');
    if (!finite(knobs.worstWindowSrcPx) || knobs.worstWindowSrcPx < 0)
        throw new Error('teeBadgeLock: worstWindowSrcPx must be finite and non-negative.');
    if (!Number.isInteger(knobs.minWindowCells) || knobs.minWindowCells < 1)
        throw new Error('teeBadgeLock: minWindowCells must be a positive integer.');
    const viewportTopPx = finite(input.viewportTopPx) ? input.viewportTopPx : 0;
    const path = candidate.teeBadgePath;
    const errors = [];
    for (let index = 0; index < path.length; index++) {
        const [cx, cy] = cellFor(path[index], field, viewportTopPx);
        const index1d = cy * field.width + cx;
        const support = fieldAt(field.support, index1d);
        const bestTheta = fieldAt(field.bestTheta, index1d);
        const alignment = Math.abs(Math.cos(tangentTheta(path, index) - bestTheta));
        errors.push(support * Math.pow(alignment, knobs.alignmentPower));
    }
    const windowCells = Math.max(knobs.minWindowCells, Math.round(knobs.worstWindowSrcPx / field.scale));
    let weakAlignedSupport = 0;
    if (errors.length > 0) {
        if (errors.length <= windowCells) {
            weakAlignedSupport = errors.reduce((sum, value) => sum + value, 0) / errors.length;
        }
        else {
            weakAlignedSupport = Infinity;
            for (let start = 0; start + windowCells <= errors.length; start++) {
                let sum = 0;
                for (let offset = 0; offset < windowCells; offset++)
                    sum += errors[start + offset];
                weakAlignedSupport = Math.min(weakAlignedSupport, sum / windowCells);
            }
        }
    }
    const fallback = fallbackEndpoints(path);
    const teePoint = input.teePoint ?? readPoint([candidate.teeXPx, candidate.teeYPx]) ?? fallback.tee;
    const badgePoint = input.badgePoint ?? readPoint([candidate.badgeXPx, candidate.badgeYPx]) ?? fallback.badge;
    const dx = badgePoint[0] - teePoint[0];
    const dy = badgePoint[1] - teePoint[1];
    const chordPx = Math.hypot(dx, dy);
    const routedLengthPx = routeLength(path);
    const pathEfficiency = chordPx === 0 ? 0 : chordPx / Math.max(chordPx, routedLengthPx);
    // Legacy receipt provenance label: which TeeEvidence field the axis number
    // itself came from (kept for the receipt's axisSource column regardless of
    // which compass path fed the ray below).
    let axisSource = input.teeAxisSource ?? UNKNOWN_AXIS;
    if (finite(input.teeAxisRad) && input.teeAxisSource === undefined)
        axisSource = 'TeeEvidence.angleRad';
    // CL-6a ray-first scoring: the compass axis (G3-published, or legacy
    // fallback) selects/ranks candidates; weakAlignedSupport and
    // pathEfficiency ("route factors") only corroborate and break ties.
    const compassAxis = input.compassAxis ??
        (finite(input.teeAxisRad)
            ? {
                axisRad: input.teeAxisRad,
                axisQuality: 'good',
                axisSource: 'component-pca-evidence-only',
                excusedMaskRef: 'UNKNOWN',
                centerUncertaintyPx: 'UNKNOWN'
            }
            : { axisRad: null, axisQuality: 'none', axisSource: 'UNKNOWN', excusedMaskRef: 'UNKNOWN', centerUncertaintyPx: 'UNKNOWN' });
    const imageSigma = input.imageSigma ?? { orientationSigmaDeg: 'UNKNOWN', sigmaProvenance: { fallback: exports.UNKNOWN_SIGMA_FALLBACK_NAME } };
    const bearingRad = Math.atan2(dy, dx);
    const ray = chordPx > 0
        ? scoreTeeBadgeRay(compassAxis, imageSigma, bearingRad, chordPx)
        : {
            rayFactor: 1,
            rayErrorDeg: 'UNKNOWN',
            sigmaUsedDeg: 'UNKNOWN',
            sigmaProvenance: 'UNKNOWN (zero-length tee-badge chord)',
            wideningDeg: 'UNKNOWN',
            degraded: true,
            degradeReason: 'zero-length tee-badge chord'
        };
    const axisErrorDeg = ray.rayErrorDeg;
    const axisFactor = ray.rayFactor;
    // Corroboration: how well the routed testimony itself supports this
    // candidate, only ever nudging rank within ROUTE_TIE_BREAK_EPSILON of the
    // ray term -- unless the ray is degraded (poor/none axis quality, or no
    // fit at all), in which case corroboration alone must carry the score.
    const corroboration = weakAlignedSupport * pathEfficiency;
    const score = ray.degraded ? corroboration : ray.rayFactor + exports.ROUTE_TIE_BREAK_EPSILON * corroboration;
    return {
        ...candidate,
        score,
        weakAlignedSupport,
        pathEfficiency,
        axisErrorDeg,
        axisFactor,
        axisSource,
        windowCells,
        routedLengthPx,
        chordPx,
        runnerUpMargin: null,
        ray,
        rayDegraded: ray.degraded
    };
}
function legacyAxisFromTeeOrder(tee) {
    if (!tee || typeof tee !== 'object')
        return { rad: null, source: UNKNOWN_AXIS };
    const value = tee;
    const minAreaPose = value.pad?.minAreaPose?.angleRad;
    if (finite(minAreaPose))
        return { rad: minAreaPose, source: 'TeeEvidence.pad.minAreaPose.angleRad' };
    if (finite(value.angleRad))
        return { rad: value.angleRad, source: 'TeeEvidence.angleRad' };
    const padAngle = value.pad?.angleRad;
    if (finite(padAngle))
        return { rad: padAngle, source: 'TeeEvidence.pad.angleRad' };
    return { rad: null, source: UNKNOWN_AXIS };
}
/**
 * CL-6a/CL-4/CL-5 compass accessor over a G4-visible tee order row: prefers
 * G3's own published axisRad/axisQuality/axisSource/centerUncertaintyPx
 * (detected by the presence of `axisQuality` or `excusedMaskRef`, fields the
 * legacy TeeBadgeTeeOrder shape never had) and falls back to the pre-existing
 * angle chain (minAreaPose -> angleRad -> pad.angleRad), read as
 * axisQuality='good'/axisSource='component-pca-evidence-only', when G3 has
 * not (yet) published its own fields on this tee.
 */
function readTeeAxis(tee) {
    if (tee && typeof tee === 'object') {
        const value = tee;
        if (value.axisQuality !== undefined || value.excusedMaskRef !== undefined) {
            return {
                axisRad: finite(value.axisRad) ? value.axisRad : null,
                axisQuality: readCompassAxisQuality(value.axisQuality),
                axisSource: readCompassAxisSource(value.axisSource),
                excusedMaskRef: typeof value.excusedMaskRef === 'string' ? value.excusedMaskRef : 'UNKNOWN',
                centerUncertaintyPx: finite(value.centerUncertaintyPx) ? value.centerUncertaintyPx : 'UNKNOWN'
            };
        }
    }
    const legacy = legacyAxisFromTeeOrder(tee);
    return {
        axisRad: legacy.rad,
        axisQuality: legacy.rad === null ? 'none' : 'good',
        axisSource: legacy.rad === null ? 'UNKNOWN' : 'component-pca-evidence-only',
        excusedMaskRef: 'UNKNOWN',
        centerUncertaintyPx: 'UNKNOWN'
    };
}
function pointFromEvidence(value) {
    return readPoint(value);
}
function normalizeCandidateScoringArgs(args) {
    if (args.length === 1 &&
        args[0] &&
        typeof args[0] === 'object' &&
        'candidates' in args[0]) {
        return args[0];
    }
    const candidates = (args[0] ?? []);
    const field = args[1];
    const tees = args[2];
    const badges = args[3];
    const knobs = args[4];
    const viewportTopPx = args[5];
    return { candidates, field, tees, badges, knobs, viewportTopPx };
}
/** Score all collapsed candidates, enriching exact detector endpoint geometry
 * only where the caller supplied it.  Both object and positional forms are
 * accepted to keep this pure helper convenient for fixture-level callers. */
function scoreTeeBadgeCandidates(...args) {
    const options = normalizeCandidateScoringArgs(args);
    const tees = new Map((options.tees ?? []).map((tee) => [tee.detId, tee]));
    const badges = new Map((options.badges ?? []).map((badge) => [badge.detId, badge]));
    return options.candidates.map((candidate) => {
        const tee = tees.get(candidate.teeId);
        const badge = badges.get(candidate.badgeId);
        const legacyAxis = legacyAxisFromTeeOrder(tee);
        const compassAxis = readTeeAxis(tee);
        return scoreTeeBadgePath({
            candidate,
            field: options.field,
            teeAxisRad: legacyAxis.rad,
            teeAxisSource: legacyAxis.source,
            compassAxis,
            imageSigma: options.imageSigma,
            teePoint: pointFromEvidence(tee) ?? readPoint([candidate.teeXPx, candidate.teeYPx]),
            badgePoint: pointFromEvidence(badge) ?? readPoint([candidate.badgeXPx, candidate.badgeYPx]),
            viewportTopPx: options.viewportTopPx,
            knobs: options.knobs
        });
    });
}
function exactPositiveHole(label) {
    if (typeof label !== 'string' || !/^[1-9]\d*$/.test(label))
        return undefined;
    const value = Number(label);
    return Number.isSafeInteger(value) && value > 0 ? value : undefined;
}
function badgeSortValue(value) {
    const hole = exactPositiveHole(value?.label);
    return [hole === undefined ? 1 : 0, hole ?? Number.MAX_SAFE_INTEGER, value?.detId ?? ''];
}
function compareBadges(a, b) {
    const av = badgeSortValue(a);
    const bv = badgeSortValue(b);
    return av[0] - bv[0] || av[1] - bv[1] || av[2].localeCompare(bv[2]);
}
function compareText(a, b) {
    return a === b ? 0 : a < b ? -1 : 1;
}
function candidateOrder(candidates, badges, tees) {
    const badgeMap = new Map((badges ?? []).map((badge) => [badge.detId, badge]));
    const teeMap = new Map((tees ?? []).map((tee) => [tee.detId, tee]));
    const badgeIds = [
        ...new Set([
            ...(badges ?? []).map((badge) => badge.detId),
            ...candidates.map((candidate) => candidate.badgeId)
        ])
    ];
    const teeIds = [
        ...new Set([
            ...(tees ?? []).map((tee) => tee.detId),
            ...candidates.map((candidate) => candidate.teeId)
        ])
    ];
    badgeIds.sort((a, b) => {
        const av = badgeMap.get(a);
        const bv = badgeMap.get(b);
        if (av && bv)
            return compareBadges(av, bv);
        if (av)
            return -1;
        if (bv)
            return 1;
        return compareText(a, b);
    });
    teeIds.sort((a, b) => compareText(a, b));
    return { badgeIds, teeIds };
}
/** Deterministic Hungarian maximization.  The matrix is padded with zero
 * dummy slots only when the two real dimensions differ; no dummy identifier
 * can escape in the result. */
function hungarianMaximum(weights) {
    const rows = weights.length;
    const cols = rows ? weights[0].length : 0;
    const size = Math.max(rows, cols);
    if (size === 0)
        return [];
    const cost = Array.from({ length: size + 1 }, (_, i) => Array.from({ length: size + 1 }, (_, j) => i === 0 || j === 0 ? 0 : -(weights[i - 1]?.[j - 1] ?? 0)));
    const u = new Array(size + 1).fill(0);
    const v = new Array(size + 1).fill(0);
    const p = new Array(size + 1).fill(0);
    const way = new Array(size + 1).fill(0);
    for (let i = 1; i <= size; i++) {
        p[0] = i;
        let j0 = 0;
        const minv = new Array(size + 1).fill(Infinity);
        const used = new Array(size + 1).fill(false);
        do {
            used[j0] = true;
            const i0 = p[j0];
            let delta = Infinity;
            let j1 = 0;
            for (let j = 1; j <= size; j++) {
                if (used[j])
                    continue;
                const current = cost[i0][j] - u[i0] - v[j];
                if (current < minv[j]) {
                    minv[j] = current;
                    way[j] = j0;
                }
                if (minv[j] < delta || (Object.is(minv[j], delta) && j < j1)) {
                    delta = minv[j];
                    j1 = j;
                }
            }
            for (let j = 0; j <= size; j++) {
                if (used[j]) {
                    u[p[j]] += delta;
                    v[j] -= delta;
                }
                else
                    minv[j] -= delta;
            }
            j0 = j1;
        } while (p[j0] !== 0);
        do {
            const j1 = way[j0];
            p[j0] = p[j1];
            j0 = j1;
        } while (j0 !== 0);
    }
    const pairs = [];
    for (let j = 1; j <= size; j++) {
        const row = p[j];
        if (row > 0 && row <= rows && j <= cols)
            pairs.push([row - 1, j - 1]);
    }
    return pairs;
}
/**
 * Exact maximum-weight one-to-one matching.  There is intentionally no score
 * threshold: zero and negative selected candidates remain observable.  A
 * candidate's runner-up is the best other real tee testimony for that badge,
 * whether or not that tee wins another badge.
 */
function maximumWeightTeeBadgeMatching(candidates, metadata = {}) {
    const { badgeIds, teeIds } = candidateOrder(candidates, metadata.badges, metadata.tees);
    const bestByPair = new Map();
    for (const candidate of candidates) {
        if (!finite(candidate.score))
            throw new Error('teeBadgeLock: candidate scores must be finite.');
        const key = `${candidate.badgeId}\u0000${candidate.teeId}`;
        const prior = bestByPair.get(key);
        if (!prior || candidate.score > prior.score)
            bestByPair.set(key, candidate);
    }
    const sparseWeights = badgeIds.map((badgeId) => teeIds.map((teeId) => bestByPair.get(`${badgeId}\u0000${teeId}`)?.score));
    const maxAbsScore = [...bestByPair.values()].reduce((maximum, candidate) => Math.max(maximum, Math.abs(candidate.score)), 0);
    // Missing testimony is not a zero-score candidate. Penalize absent real
    // edges enough that the solver maximizes real-edge cardinality before
    // total score; rectangular padding inside Hungarian remains the only
    // source of structural dummy matches.
    const matrixSize = Math.max(badgeIds.length, teeIds.length);
    const missingEdgeWeight = -(2 * maxAbsScore * matrixSize + 1);
    const weights = sparseWeights.map((row) => row.map((score) => score ?? missingEdgeWeight));
    const assignments = hungarianMaximum(weights);
    const selectedByBadge = new Map();
    for (const [row, col] of assignments) {
        const badgeId = badgeIds[row];
        const teeId = teeIds[col];
        const candidate = bestByPair.get(`${badgeId}\u0000${teeId}`);
        if (candidate)
            selectedByBadge.set(badgeId, candidate);
    }
    const locks = badgeIds.flatMap((badgeId) => {
        const candidate = selectedByBadge.get(badgeId);
        if (!candidate)
            return [];
        const otherScores = candidates
            .filter((entry) => entry.badgeId === badgeId && entry.teeId !== candidate.teeId)
            .map((entry) => entry.score);
        const bestOther = otherScores.length ? Math.max(...otherScores) : undefined;
        const runnerUpMargin = bestOther === undefined ? null : candidate.score - bestOther;
        return [{ ...candidate, runnerUpMargin }];
    });
    const usedTees = new Set(locks.map((lock) => lock.teeId));
    const matchedBadges = new Set(locks.map((lock) => lock.badgeId));
    return {
        candidates: candidates.slice(),
        locks,
        unmatchedBadgeIds: badgeIds.filter((id) => !matchedBadges.has(id)),
        unusedTeeIds: teeIds.filter((id) => !usedTees.has(id))
    };
}
/** Public alias required by the acceptance seam. */
exports.selectTeeBadgeLocks = maximumWeightTeeBadgeMatching;
function normalizedTier(tee) {
    return tee?.tier === 'recovered' ? 'recovered' : 'visible';
}
function holeLabel(hole, badgeId) {
    return hole === undefined ? `badge ${badgeId} (unread label)` : `H${hole}`;
}
/**
 * All-Hn completion: classify every unmatched badge as 'orphan' (no
 * candidate testimony reached it) or 'conflict' (its best candidate tee
 * went to a stronger claim), and print the one required human sentence.
 * Never invents a lock; only narrates the abstention already decided by
 * maximumWeightTeeBadgeMatching.
 */
function buildAbstentions(result, badges, holeOf) {
    const winnerByTee = new Map();
    for (const lock of result.locks)
        winnerByTee.set(lock.teeId, lock);
    return result.unmatchedBadgeIds.map((badgeId) => {
        const hole = holeOf(badgeId);
        const label = holeLabel(hole, badgeId);
        const own = result.candidates
            .filter((candidate) => candidate.badgeId === badgeId)
            .sort((a, b) => b.score - a.score);
        const best = own[0];
        if (!best) {
            return {
                badgeId,
                ...(hole === undefined ? {} : { hole }),
                kind: 'orphan',
                reason: `${label}: no tee testimony reaches this badge (zero candidate rays) -- abstaining.`
            };
        }
        const winner = winnerByTee.get(best.teeId);
        const winningBadgeId = winner?.badgeId;
        const winningHole = winningBadgeId === undefined ? undefined : holeOf(winningBadgeId);
        const winningScore = winner?.score;
        const winningLabel = winningBadgeId === undefined
            ? 'another claim'
            : holeLabel(winningHole, winningBadgeId);
        return {
            badgeId,
            ...(hole === undefined ? {} : { hole }),
            kind: 'conflict',
            bestTeeId: best.teeId,
            bestScore: best.score,
            ...(winningBadgeId === undefined ? {} : { winningBadgeId }),
            ...(winningHole === undefined ? {} : { winningHole }),
            ...(winningScore === undefined ? {} : { winningScore }),
            reason: `${label}: best candidate tee ${best.teeId} (score ${best.score.toFixed(4)}) ` +
                `was awarded to ${winningLabel}${winningScore === undefined ? '' : ` (score ${winningScore.toFixed(4)})`} by the max-weight match -- conflict, abstaining.`
        };
    });
}
/** Add the semantic, provenance-bearing envelope consumed by the operation
 * and by the LAB receipt.  Badge holes are copied only from exact labels. */
function buildTeeBadgeLockEvidence(selected, options = {}) {
    const badges = new Map((options.badges ?? []).map((badge) => [badge.detId, badge]));
    const tees = new Map((options.tees ?? []).map((tee) => [tee.detId, tee]));
    const basketTraces = options.basketTraces;
    const locks = selected.locks.map((lock) => {
        const hole = exactPositiveHole(badges.get(lock.badgeId)?.label);
        const basketTrace = basketTraces?.get(lock.badgeId);
        return {
            ...lock,
            tier: normalizedTier(tees.get(lock.teeId)),
            ...(hole === undefined ? {} : { hole }),
            ...(basketTrace === undefined ? {} : { basketTrace })
        };
    });
    // Evidence rows follow the same semantic badge order as matching whenever
    // BadgeEvidence is available.  This keeps numbered receipts naturally
    // readable even when an isolated caller matched by detector id only.
    locks.sort((a, b) => {
        const ah = a.hole ?? Number.MAX_SAFE_INTEGER;
        const bh = b.hole ?? Number.MAX_SAFE_INTEGER;
        return ah - bh || a.badgeId.localeCompare(b.badgeId);
    });
    const corridorWidthPx = options.corridorWidthPx ?? options.measurement?.parameters?.corridorWidthPx;
    const holeOf = (badgeId) => exactPositiveHole(badges.get(badgeId)?.label);
    const abstentions = buildAbstentions(selected, badges, holeOf);
    return {
        ...selected,
        locks,
        abstentions,
        coordinateFrame: 'canonical-raster',
        // CL-6b: true only when stage B actually ran (at least one trace was
        // supplied) -- baskets are footprint-arrival testimony for the tracer,
        // never a routing target, never consulted by stage A's tee<->badge lock.
        basketEvidenceRead: (basketTraces?.size ?? 0) > 0,
        corridorWidthPx: finite(corridorWidthPx) ? corridorWidthPx : 'UNKNOWN',
        corridorWidthPxProvenance: finite(corridorWidthPx)
            ? 'measurement.parameters.corridorWidthPx'
            : 'UNKNOWN (measurement.parameters.corridorWidthPx)'
    };
}
//# sourceMappingURL=g4.teeBadgeLockMath.js.map