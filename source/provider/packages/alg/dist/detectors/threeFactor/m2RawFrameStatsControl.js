"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.M2_RAW_CONTROL_REPLICATES = void 0;
exports.materializeM2RawFrameStatsControl = materializeM2RawFrameStatsControl;
/** Fixed-size deterministic negative-control experiment for the raw probe. */
exports.M2_RAW_CONTROL_REPLICATES = 999;
function hashSeed(value) {
    let hash = 0x811c9dc5;
    for (let index = 0; index < value.length; index++) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash >>> 0;
}
function nextRandom(state) {
    let next = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(next ^ (next >>> 15), next | 1) >>> 0;
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return { value: ((value ^ (value >>> 14)) >>> 0) / 4294967296, state: next };
}
function shifts(seed, sampleCount, width, height) {
    if (width <= 1 || height <= 1)
        throw new Error('M2 negative-control geometry has no nonzero circular shift');
    const out = [[0, 0]];
    let state = seed;
    for (let index = 1; index < sampleCount; index++) {
        let result = nextRandom(state);
        const x = 1 + Math.floor(result.value * (width - 1));
        state = result.state;
        result = nextRandom(state);
        const y = 1 + Math.floor(result.value * (height - 1));
        state = result.state;
        out.push([x, y]);
    }
    return out;
}
function key(x, y) {
    return `${x},${y}`;
}
function quantile(values, fraction) {
    if (!values.length)
        return 0;
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * fraction))] ?? 0;
}
function summary(observed, values) {
    const mean = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
    const sampleSd = values.length > 1
        ? Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1))
        : null;
    const atLeast = values.filter((value) => value >= observed).length;
    return {
        observed,
        nullMean: mean,
        nullSampleSd: sampleSd ?? 0,
        nullQuantiles: { p50: quantile(values, 0.5), p95: quantile(values, 0.95), p99: quantile(values, 0.99) },
        nullMaximum: values.length ? Math.max(...values) : 0,
        empiricalP: (1 + atLeast) / (values.length + 1),
        replicateCount: values.length,
        nullSamples: [...values]
    };
}
function rowsByKey(observations) {
    return new Map(observations.map((observation) => [key(...observation.localPixel), observation]));
}
function controlledObservation(margin, target, rows, shifts, sampleIds) {
    const [width, height] = margin.frameSize;
    const minX = -margin.marginPx;
    const minY = -margin.marginPx;
    const groups = new Map();
    for (const [sampleIndex, sampleId] of sampleIds.entries()) {
        const shift = shifts[sampleIndex] ?? [0, 0];
        const x = ((target.localPixel[0] - minX - shift[0]) % width + width) % width + minX;
        const y = ((target.localPixel[1] - minY - shift[1]) % height + height) % height + minY;
        const source = rows.get(key(x, y));
        const value = source?.exactGroups.find((group) => group.sampleIds.includes(sampleId));
        if (!value)
            continue;
        const valueKey = key(value.rgba[0], value.rgba[1]) + `,${value.rgba[2]},${value.rgba[3]}`;
        const prior = groups.get(valueKey) ?? { rgba: value.rgba, ids: [] };
        prior.ids.push(sampleId);
        groups.set(valueKey, prior);
    }
    const exactGroups = [...groups.values()].sort((a, b) => `${a.rgba}`.localeCompare(`${b.rgba}`));
    const modal = exactGroups.reduce((best, group) => group.ids.length > (best?.ids.length ?? -1) ? group : best, undefined);
    const values = exactGroups.flatMap((group) => group.ids.map(() => group.rgba));
    const sampleSd = values.length > 1 ? [0, 1, 2, 3].map((channel) => {
        const mean = values.reduce((sum, value) => sum + value[channel], 0) / values.length;
        return Math.sqrt(values.reduce((sum, value) => sum + (value[channel] - mean) ** 2, 0) / (values.length - 1));
    }) : null;
    const count = modal?.ids.length ?? 0;
    return {
        ...target,
        eligibleSampleIds: values.length ? [...new Set(exactGroups.flatMap((group) => group.ids))].sort() : [],
        exactGroups: exactGroups.map((group) => ({ rgba: group.rgba, sampleIds: [...group.ids].sort(), count: group.ids.length })),
        exactSupportCount: count,
        exactSupported: count >= 2,
        modalRgba: modal?.rgba ?? null,
        modalSupportCount: count,
        modalSupportFraction: values.length ? count / values.length : 0,
        sampleSd,
        sampleSdDenominator: sampleSd ? 'n-1' : null,
        nullModel: { p: 0.5, sampleCount: values.length, probabilityAllMatch: values.length === 18 ? 3.814697265625e-6 : null, percentAllMatch: values.length === 18 ? 0.0003814697265625 : null }
    };
}
function maxOverlap(observations, threshold) {
    return observations.reduce((max, observation) => Math.max(max, observation.modalSupportCount >= threshold ? observation.modalSupportCount : 0), 0);
}
function largestCluster(observations, threshold) {
    const cells = new Set(observations.filter((observation) => observation.modalSupportCount >= threshold).map((observation) => key(...observation.localPixel)));
    let largest = 0;
    while (cells.size) {
        const first = cells.values().next().value;
        cells.delete(first);
        const pending = [first];
        let count = 0;
        while (pending.length) {
            const value = pending.pop();
            count++;
            const [x, y] = value.split(',').map(Number);
            for (let dy = -1; dy <= 1; dy++)
                for (let dx = -1; dx <= 1; dx++) {
                    if (!dx && !dy)
                        continue;
                    const neighbor = key(x + dx, y + dy);
                    if (cells.delete(neighbor))
                        pending.push(neighbor);
                }
        }
        largest = Math.max(largest, count);
    }
    return largest;
}
/** Compute deterministic circular-shift null controls from a materialized probe trace. */
function materializeM2RawFrameStatsControl(trace, options) {
    const replicateCount = options.replicates ?? exports.M2_RAW_CONTROL_REPLICATES;
    const supportThresholds = [...new Set(options.supportThresholds ?? [2, 18])].filter((value) => Number.isInteger(value) && value >= 2).sort((a, b) => a - b);
    const seedNumber = hashSeed(`${options.imageId}${options.paramsHash}${options.featureId}`);
    const controlSeed = seedNumber.toString(16).padStart(8, '0');
    if (replicateCount < 1 || !supportThresholds.length)
        return { status: 'unknown', reason: 'negative-control options have no replicates or support thresholds', controlSeed, seedAlgorithm: 'fnv1a32(imageId+paramsHash+featureId)', replicateCount: 0, supportThresholds, assumptions: ['independent nonzero circular shifts for each sample except sample 0 fixed'], margins: [] };
    if (trace.registrations.length !== 18 || trace.final.status !== 'adequate' || trace.margins.some((margin) => margin.frameSize[0] <= 1 || margin.frameSize[1] <= 1))
        return { status: 'unknown', reason: trace.registrations.length !== 18 ? `negative-control requires exactly 18 registrations; received ${trace.registrations.length}` : trace.final.status !== 'adequate' ? 'negative-control blocked because raw frame is not adequate' : 'negative-control geometry has no valid nonzero circular shift', controlSeed, seedAlgorithm: 'fnv1a32(imageId+paramsHash+featureId)', replicateCount: 0, supportThresholds, assumptions: ['sample 0 is fixed', 'all other samples require nonzero x/y circular shifts'], margins: [] };
    const geometry = trace.registrations[0]?.ownedBbox;
    if (!geometry || trace.registrations.some((registration) => registration.ownedBbox[2] !== geometry[2] || registration.ownedBbox[3] !== geometry[3]))
        return { status: 'unknown', reason: 'negative-control requires equal registered crop dimensions', controlSeed, seedAlgorithm: 'fnv1a32(imageId+paramsHash+featureId)', replicateCount: 0, supportThresholds, assumptions: ['sample 0 is fixed', 'all other samples require nonzero x/y circular shifts'], margins: [] };
    // Only the final margin's per-pixel observations feed the promotion
    // decision (and only the final margin retains them -- superseded margins
    // carry summaries only, see m2Representation.ts). The control is computed
    // for that one margin, never re-swept across every superseded margin.
    const finalMargin = trace.margins.find((candidate) => candidate.marginPx === trace.final.finalMarginPx);
    const finalObservations = finalMargin?.observations;
    if (!finalMargin || !finalObservations)
        return { status: 'unknown', reason: "negative-control requires the final margin's retained per-pixel observations, which are missing", controlSeed, seedAlgorithm: 'fnv1a32(imageId+paramsHash+featureId)', replicateCount: 0, supportThresholds, assumptions: ['sample 0 is fixed', 'all other samples require nonzero x/y circular shifts'], margins: [] };
    const margins = [];
    {
        const margin = finalMargin;
        const observations = finalObservations;
        const rows = rowsByKey(observations);
        const shiftsAtMargin = shifts(seedNumber ^ margin.marginPx, trace.registrations.length, margin.frameSize[0], margin.frameSize[1]);
        const observedBySupport = {};
        const nullBySupport = {};
        const nullRing = [];
        const allReplicateShifts = [];
        for (const threshold of supportThresholds) {
            observedBySupport[String(threshold)] = { max: maxOverlap(observations, threshold), cluster: largestCluster(observations, threshold) };
            nullBySupport[String(threshold)] = { max: [], cluster: [] };
        }
        for (let replicate = 0; replicate < replicateCount; replicate++) {
            const replicateShifts = shifts((seedNumber + replicate + margin.marginPx * 2654435761) >>> 0, trace.registrations.length, margin.frameSize[0], margin.frameSize[1]);
            allReplicateShifts.push(replicateShifts);
            // One shift belongs to one specimen for the whole crop. Every target
            // coordinate then reads that specimen's shifted raw row and recomputes
            // the modal exact tuple; no aggregate observation row is shifted.
            const controlled = observations.map((target) => controlledObservation(margin, target, rows, replicateShifts, trace.registrations.map((registration) => registration.sampleId)));
            for (const threshold of supportThresholds) {
                nullBySupport[String(threshold)].max.push(maxOverlap(controlled, threshold));
                nullBySupport[String(threshold)].cluster.push(largestCluster(controlled, threshold));
            }
            if (margin.exactBoundary.total === 0) {
                const edge = controlled.filter((observation) => {
                    const [x, y] = observation.localPixel;
                    return x === -margin.marginPx || y === -margin.marginPx || x === margin.frameSize[0] - margin.marginPx - 1 || y === margin.frameSize[1] - margin.marginPx - 1;
                });
                nullRing.push(maxOverlap(edge, 18));
            }
        }
        const bySupportThreshold = Object.fromEntries(supportThresholds.map((threshold) => [String(threshold), {
                globalMaxExactOverlap: summary(observedBySupport[String(threshold)].max, nullBySupport[String(threshold)].max),
                largestEightConnectedCluster: summary(observedBySupport[String(threshold)].cluster, nullBySupport[String(threshold)].cluster)
            }]));
        const outermostClearedRing = margin.exactBoundary.total === 0
            ? summary(maxOverlap(observations.filter((observation) => {
                const [x, y] = observation.localPixel;
                return x === -margin.marginPx || y === -margin.marginPx || x === margin.frameSize[0] - margin.marginPx - 1 || y === margin.frameSize[1] - margin.marginPx - 1;
            }), 18), nullRing)
            : undefined;
        margins.push({ marginPx: margin.marginPx, fixedSampleId: trace.registrations[0]?.sampleId ?? null, shifts: shiftsAtMargin, replicateShifts: allReplicateShifts, bySupportThreshold, ...(outermostClearedRing ? { outermostClearedRing } : {}) });
    }
    return {
        status: margins.length ? 'measured' : 'unknown',
        reason: margins.length ? `deterministic circular-shift null control materialized for the final margin (${finalMargin.marginPx}px) only` : 'raw probe has no margins to control',
        controlSeed,
        seedAlgorithm: 'fnv1a32(imageId+paramsHash+featureId)',
        replicateCount,
        supportThresholds,
        assumptions: ['sample 0 is fixed', 'all other samples receive independent nonzero x/y circular shifts', 'circular shifts preserve per-crop color distribution and spatial autocorrelation', '8-connected cluster adjacency is a descriptive statistic only; no pixel-independence assumption is made'],
        margins
    };
}
//# sourceMappingURL=m2RawFrameStatsControl.js.map