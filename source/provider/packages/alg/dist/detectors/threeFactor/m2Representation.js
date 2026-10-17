"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.materializeExpandedBadgeRawSourceFrame = exports.M2_RAW_SOURCE_PROBE_SCHEMA = exports.m2LocalCoordinate = exports.M2_REPRESENTATION_SCHEMA = void 0;
exports.m2RegistrationBounds = m2RegistrationBounds;
exports.m2CanonicalCoordinate = m2CanonicalCoordinate;
exports.buildM2StructuralOverlapField = buildM2StructuralOverlapField;
exports.buildM2DigitConditionedOverlapField = buildM2DigitConditionedOverlapField;
exports.buildM2OverlapFieldSet = buildM2OverlapFieldSet;
exports.assessM2FrameSweep = assessM2FrameSweep;
exports.transitionM1ToM2 = transitionM1ToM2;
exports.materializeBadgeM2Representation = materializeBadgeM2Representation;
exports.encodeMaterializedBadgeM2Representation = encodeMaterializedBadgeM2Representation;
exports.decodeMaterializedBadgeM2Representation = decodeMaterializedBadgeM2Representation;
exports.materializeExpandedBadgeRawFrameProbe = materializeExpandedBadgeRawFrameProbe;
exports.materializeExpandedBadgeRawFrameProbeWithControl = materializeExpandedBadgeRawFrameProbeWithControl;
const m2RawFrameStatsControl_1 = require("./m2RawFrameStatsControl");
/**
 * M2 deliberately keeps the proven M1 B+W worldview intact.
 *
 * Schema v2 (chainspot #m2-rootcause): `rawTrace.observations` was removed
 * from MaterializedBadgeM2Representation's wire shape (it used to duplicate
 * the raw-source probe's final-margin per-pixel array by value once per
 * representation). See the EVIDENCE-RETENTION POLICY comment above
 * M2_RAW_SOURCE_PROBE_SCHEMA for the full accounting.
 */
exports.M2_REPRESENTATION_SCHEMA = 'chainspot.badge-representation-m2/v2';
function sorted(values) {
    return Uint32Array.from([...new Set(values)].sort((a, b) => a - b));
}
function asSet(values) {
    return new Set(values);
}
function difference(left, right) {
    return sorted([...left].filter((value) => !right.has(value)));
}
function intersection(left, right) {
    return sorted([...left].filter((value) => right.has(value)));
}
function fingerprint(values) {
    return [...values]
        .sort((a, b) => a[1] - b[1] || a[0] - b[0])
        .map(([x, y]) => `${x}:${y}`)
        .join(',');
}
function pixelXY(specimen, pixel) {
    const x = pixel % specimen.raster.width;
    return [x, (pixel - x) / specimen.raster.width];
}
function m2RegistrationBounds(specimen) {
    if (!specimen.ownedBwPixels.length)
        throw new Error(`${specimen.id}: M1 has no owned pixels`);
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    for (const pixel of specimen.ownedBwPixels) {
        const [x, y] = pixelXY(specimen, pixel);
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
    }
    return [minX, minY, maxX - minX + 1, maxY - minY + 1];
}
function localKey(specimen, pixel) {
    const [x0, y0] = m2RegistrationBounds(specimen);
    const [x, y] = pixelXY(specimen, pixel);
    return `${x - x0},${y - y0}`;
}
function localCoordinate(specimen, pixel) {
    const [x0, y0] = m2RegistrationBounds(specimen);
    const [x, y] = pixelXY(specimen, pixel);
    return [x - x0, y - y0];
}
exports.m2LocalCoordinate = localCoordinate;
/**
 * Map a pixel-center from one M1-relative frame to a common integer frame.
 *
 * M1 supplies the only geometry used here: the tight owned B+W bbox.  The
 * candidate support ring is represented by local coordinates -1..width (and
 * -1..height), so candidates immediately outside the object remain visible.
 * When bbox sizes differ, pixel centers are linearly mapped into the largest
 * observed ring and rounded to its integer lattice.  This is intentionally a
 * small, explicit registration rule; it is not a geometric fit or a new
 * detector.  Collisions are counted once per specimen at a canonical cell.
 */
function canonicalCoordinate(specimen, pixel, frame, anchor) {
    const [x0, y0, width, height] = anchor ?? m2RegistrationBounds(specimen);
    const [x, y] = pixelXY(specimen, pixel);
    const sourceWidth = width + 2;
    const sourceHeight = height + 2;
    const sourceX = x - x0 + 1;
    const sourceY = y - y0 + 1;
    const canonicalX = Math.round(((sourceX + 0.5) * frame.width) / sourceWidth - 0.5);
    const canonicalY = Math.round(((sourceY + 0.5) * frame.height) / sourceHeight - 0.5);
    return [canonicalX - 1, canonicalY - 1];
}
function m2CanonicalCoordinate(specimen, pixel, canonicalSize) {
    if (!canonicalSize.every((value) => Number.isInteger(value) && value >= 3))
        throw new RangeError('M2 canonical size must be integer dimensions of at least 3');
    return canonicalCoordinate(specimen, pixel, {
        width: canonicalSize[0],
        height: canonicalSize[1]
    });
}
function maxObjectFrame(specimens) {
    if (!specimens.length)
        throw new Error('M2 overlap field needs at least one specimen');
    let width = 0;
    let height = 0;
    for (const specimen of specimens) {
        const [, , specimenWidth, specimenHeight] = m2RegistrationBounds(specimen);
        width = Math.max(width, specimenWidth + 2);
        height = Math.max(height, specimenHeight + 2);
    }
    return { width, height };
}
function maxDigitFrame(specimens, index, character) {
    let maxWidth = 3;
    let maxHeight = 3;
    for (const specimen of specimens) {
        const label = specimen.badge.label;
        for (const [digitIndex, digit] of specimen.badge.digits.entries()) {
            if (label !== null &&
                label[digitIndex] === digit.predicted &&
                digit.predicted === character &&
                digitIndex === index) {
                maxWidth = Math.max(maxWidth, digit.bbox[2] + 2);
                maxHeight = Math.max(maxHeight, digit.bbox[3] + 2);
            }
        }
    }
    return { width: maxWidth, height: maxHeight };
}
function validDigitContextForPixel(specimen, pixel) {
    const context = digitContext(specimen, pixel);
    return context?.valid ? context : null;
}
function supportObservationMap(observations, eligibleSampleIds) {
    return [...observations.entries()]
        .sort(([, left], [, right]) => left.coordinate[1] - right.coordinate[1] || left.coordinate[0] - right.coordinate[0])
        .map(([, value]) => ({
        localPixel: value.coordinate,
        numOverlaps: value.ids.size,
        eligibleCount: eligibleSampleIds.length,
        overlapFraction: eligibleSampleIds.length ? value.ids.size / eligibleSampleIds.length : 0,
        contributorIds: [...value.ids].sort()
    }));
}
function specimenIds(specimens) {
    const ids = new Set();
    for (const specimen of specimens) {
        if (ids.has(specimen.id))
            throw new Error(`duplicate M2 overlap specimen '${specimen.id}'`);
        ids.add(specimen.id);
    }
    return [...ids];
}
/** Build the global structural recurrence field from every supplied sample. */
function buildM2StructuralOverlapField(specimens) {
    const ids = specimenIds(specimens);
    const frame = maxObjectFrame(specimens);
    const map = new Map();
    const contributions = [];
    let excludedCandidateCount = 0;
    for (const specimen of specimens) {
        const seen = new Set();
        const sourcePixels = new Set(specimen.aaPixels);
        let sourceCandidateCount = 0;
        for (const pixel of sourcePixels) {
            // A validated digit is a separate coordinate population.  An
            // unvalidated digit is intentionally excluded rather than guessed.
            if (digitContext(specimen, pixel)) {
                excludedCandidateCount++;
                continue;
            }
            sourceCandidateCount++;
            const coordinate = canonicalCoordinate(specimen, pixel, frame);
            const key = `${coordinate[0]},${coordinate[1]}`;
            if (seen.has(key))
                continue;
            seen.add(key);
            const observation = map.get(key) ?? { coordinate, ids: new Set() };
            observation.ids.add(specimen.id);
            map.set(key, observation);
        }
        contributions.push({
            sampleId: specimen.id,
            sourceCandidateCount,
            uniqueCanonicalCellCount: seen.size,
            collisionCount: sourceCandidateCount - seen.size
        });
    }
    return {
        channel: 'structural',
        coordinateFrame: 'm1-bbox-plus-one-support-ring',
        canonicalSize: [frame.width, frame.height],
        sampleIds: ids,
        eligibleSampleIds: ids,
        contributions,
        excludedCandidateCount,
        observations: supportObservationMap(map, ids)
    };
}
/**
 * Build one digit-conditioned recurrence field.  It is keyed by the
 * validated digit's position and character, and coordinates are relative to
 * that digit bbox rather than pretending different glyphs share the same
 * object-local geometry.
 */
function buildM2DigitConditionedOverlapField(specimens, index, character) {
    const ids = specimenIds(specimens);
    const eligible = specimens.filter((specimen) => specimen.badge.label !== null &&
        specimen.badge.label[index] === character &&
        specimen.badge.digits[index]?.predicted === character);
    const eligibleIds = eligible.map((specimen) => specimen.id);
    const frame = maxDigitFrame(specimens, index, character);
    const map = new Map();
    const contributions = [];
    let excludedCandidateCount = 0;
    for (const specimen of eligible) {
        const digit = specimen.badge.digits[index];
        if (!digit)
            continue;
        const seen = new Set();
        const sourcePixels = new Set(specimen.aaPixels);
        let sourceCandidateCount = 0;
        for (const pixel of sourcePixels) {
            const context = validDigitContextForPixel(specimen, pixel);
            if (!context || context.index !== index || context.character !== character) {
                excludedCandidateCount++;
                continue;
            }
            sourceCandidateCount++;
            const coordinate = canonicalCoordinate(specimen, pixel, frame, digit.bbox);
            const key = `${coordinate[0]},${coordinate[1]}`;
            if (seen.has(key))
                continue;
            seen.add(key);
            const observation = map.get(key) ?? { coordinate, ids: new Set() };
            observation.ids.add(specimen.id);
            map.set(key, observation);
        }
        contributions.push({
            sampleId: specimen.id,
            sourceCandidateCount,
            uniqueCanonicalCellCount: seen.size,
            collisionCount: sourceCandidateCount - seen.size
        });
    }
    return {
        channel: 'digit-conditioned',
        coordinateFrame: 'digit-bbox-plus-one-support-ring',
        canonicalSize: [frame.width, frame.height],
        sampleIds: ids,
        eligibleSampleIds: eligibleIds,
        contributions,
        digitCondition: { index, character },
        excludedCandidateCount,
        observations: supportObservationMap(map, eligibleIds)
    };
}
/** Materialize both non-overlapping observational channels for an E library. */
function buildM2OverlapFieldSet(specimens) {
    const structural = buildM2StructuralOverlapField(specimens);
    const descriptors = new Set();
    for (const specimen of specimens) {
        const label = specimen.badge.label;
        if (label === null)
            continue;
        for (const [index, digit] of specimen.badge.digits.entries()) {
            if (label[index] !== digit.predicted)
                continue;
            const key = `${index}:${digit.predicted}`;
            descriptors.add(key);
        }
    }
    const digitConditioned = [...descriptors]
        .sort()
        .map((descriptor) => {
        const [indexValue, character] = descriptor.split(':');
        return buildM2DigitConditionedOverlapField(specimens, Number(indexValue), character);
    });
    return { sampleIds: specimenIds(specimens), structural, digitConditioned };
}
function hasValidatedDigitEvidence(specimen) {
    const label = specimen.badge.label;
    if (label === null || specimen.badge.digits.length !== label.length)
        return false;
    return specimen.badge.digits.every((digit, index) => digit.predicted === label[index]);
}
function adjacentToDigitGeometry(specimen, pixel) {
    const [x, y] = pixelXY(specimen, pixel);
    for (const digit of specimen.badge.digits) {
        const [x0, y0, width, height] = digit.bbox;
        if (x >= x0 - 1 && x <= x0 + width && y >= y0 - 1 && y <= y0 + height)
            return true;
    }
    return false;
}
function digitContext(specimen, pixel) {
    const [x, y] = pixelXY(specimen, pixel);
    const label = specimen.badge.label;
    return (specimen.badge.digits
        .map((digit, index) => ({
        index,
        character: digit.predicted,
        bbox: digit.bbox,
        valid: label !== null &&
            label.length === specimen.badge.digits.length &&
            label[index] === digit.predicted
    }))
        .find(({ bbox }) => {
        const [x0, y0, width, height] = bbox;
        return x >= x0 - 1 && x <= x0 + width && y >= y0 - 1 && y <= y0 + height;
    }) ?? null);
}
function sameDigitContext(target, peer, condition) {
    if (!peer.valid || peer.character !== target.character)
        return false;
    if (condition === 'same-digit')
        return true;
    return peer.index === target.index;
}
function validateOptions(options) {
    const minimumSupportCount = options.minimumSupportCount ?? 2;
    const minimumSupportFraction = options.minimumSupportFraction ?? 1;
    return {
        registrationMethod: options.registrationMethod,
        digitCondition: options.digitCondition ?? 'all',
        minimumSupportCount,
        minimumSupportFraction,
        frameSweep: options.frameSweep
    };
}
/**
 * Judge whether a sequence of increasingly large context frames has stopped
 * discovering repeat-supported signal. The final two exact support sets must
 * match and the final set must not touch the frame boundary.
 */
function assessM2FrameSweep(samples) {
    if (!samples.length)
        return {
            status: 'not-measured',
            samples: 0,
            latestMarginPx: null,
            stableSet: false,
            boundarySupportedPixelCount: 0,
            unobservedSampleCount: 0,
            latestSetFingerprint: null,
            sweep: [],
            reason: 'no expanded context frames were materialized'
        };
    const ordered = [...samples].sort((a, b) => a.marginPx - b.marginPx);
    const latest = ordered[ordered.length - 1];
    const prior = ordered.length > 1 ? ordered[ordered.length - 2] : undefined;
    const latestSetFingerprint = fingerprint(latest.supportedPixels);
    const stableSet = !!prior && latestSetFingerprint === fingerprint(prior.supportedPixels);
    const unobservedSampleCount = latest.unobservedSampleCount ?? 0;
    const adequate = stableSet && latest.boundarySupportedPixelCount === 0 && unobservedSampleCount === 0;
    const sweep = ordered.map((sample) => ({
        ...sample,
        supportedPixels: sample.supportedPixels.map(([x, y]) => [x, y])
    }));
    return {
        status: adequate ? 'adequate' : 'insufficient',
        samples: ordered.length,
        latestMarginPx: latest.marginPx,
        stableSet,
        boundarySupportedPixelCount: latest.boundarySupportedPixelCount,
        unobservedSampleCount,
        latestSetFingerprint,
        sweep,
        reason: adequate
            ? 'repeat-supported set stabilized across the final expansion and clears the boundary'
            : unobservedSampleCount > 0
                ? 'source/crop truncation leaves part of the latest frame unobserved'
                : !stableSet
                    ? 'repeat-supported set changed at the latest expansion'
                    : 'repeat-supported signal still touches the latest frame boundary'
    };
}
/**
 * Compute exact M1→M2 accounting from retained pixel identities. This is a
 * projection over sets, not a score and not a detector: M1 pixels are copied
 * verbatim and only supplied AA candidates may expand the M2 universe.
 */
function transitionM1ToM2(m1AvailablePixels, m1ExplainedPixels, discoveredPixels, newlyExplainedPixels) {
    const m1Available = asSet(m1AvailablePixels);
    const m1Explained = asSet(m1ExplainedPixels);
    const discovered = asSet(discoveredPixels);
    const newlyExplained = asSet(newlyExplainedPixels);
    if ([...m1Explained].some((pixel) => !m1Available.has(pixel)))
        throw new Error('M1 explained pixels must be a subset of M1 available pixels');
    if ([...discovered].some((pixel) => m1Available.has(pixel)))
        throw new Error('M2 discovered pixels must be new relative to M1 available pixels');
    if ([...newlyExplained].some((pixel) => !discovered.has(pixel)))
        throw new Error('M2 newly explained pixels must be a subset of discovered pixels');
    const m2Available = new Set([...m1Available, ...discovered]);
    const m2Explained = new Set([...m1Explained, ...newlyExplained]);
    if ([...m2Explained].some((pixel) => !m2Available.has(pixel)))
        throw new Error('M2 explained pixels must be a subset of M2 available pixels');
    const preserved = intersection(m1Explained, m2Explained);
    const lost = difference(m1Explained, m2Explained);
    const unexplained = difference(m2Available, m2Explained);
    const stillUnexplained = difference(discovered, m2Explained);
    return {
        m1: {
            availablePixels: sorted(m1Available),
            explainedPixels: sorted(m1Explained),
            unexplainedPixels: difference(m1Available, m1Explained)
        },
        m2: {
            availablePixels: sorted(m2Available),
            explainedPixels: sorted(m2Explained),
            unexplainedPixels: unexplained
        },
        transition: {
            preservedPixels: preserved,
            lostPixels: lost,
            discoveredPixels: sorted(discovered),
            newlyExplainedPixels: sorted(newlyExplained),
            stillUnexplainedPixels: stillUnexplained,
            regressionLoss: m1Explained.size ? lost.length / m1Explained.size : null,
            discoveryLoss: discovered.size ? stillUnexplained.length / discovered.size : null
        }
    };
}
function findOverlapObservation(field, coordinate) {
    return field.observations.find((observation) => observation.localPixel[0] === coordinate[0] &&
        observation.localPixel[1] === coordinate[1]);
}
function targetOverlapObservation(target, pixel, fields) {
    const context = digitContext(target, pixel);
    if (context && !context.valid)
        return { class: 'unsupported' };
    if (context) {
        const field = fields.digitConditioned.find((candidate) => candidate.digitCondition?.index === context.index &&
            candidate.digitCondition.character === context.character);
        if (field) {
            const coordinate = canonicalCoordinate(target, pixel, { width: field.canonicalSize[0], height: field.canonicalSize[1] }, context.bbox);
            const observation = findOverlapObservation(field, coordinate);
            return {
                observation,
                class: observation && observation.numOverlaps > 1 ? 'digit-conditioned' : 'unresolved'
            };
        }
        return { class: 'unresolved' };
    }
    const coordinate = m2CanonicalCoordinate(target, pixel, fields.structural.canonicalSize);
    const observation = findOverlapObservation(fields.structural, coordinate);
    return {
        observation,
        // This label is a projection for the legacy observation shape only.
        // The complete numOverlaps field remains authoritative; one specimen is
        // intentionally not called "common".
        class: observation && observation.numOverlaps > 1 ? 'structural-common' : 'unresolved'
    };
}
/** Materialize one Badge M2 from the existing Badge AA candidates. */
function materializeBadgeM2Representation(target, peers, options) {
    const resolved = validateOptions(options);
    const specimens = [target, ...peers];
    const ids = new Set();
    for (const specimen of specimens) {
        if (ids.has(specimen.id))
            throw new Error(`duplicate M2 specimen id '${specimen.id}'`);
        ids.add(specimen.id);
        const owned = asSet(specimen.ownedBwPixels);
        const aa = asSet(specimen.aaPixels);
        if ([...owned].some((pixel) => aa.has(pixel)))
            throw new Error(`${specimen.id}: M1-owned and AA candidate pixels overlap`);
    }
    const overlap = options.overlapFieldSet ?? buildM2OverlapFieldSet(specimens);
    const alignedSampleIds = overlap.sampleIds;
    const excludedSampleIds = [];
    const candidatePixels = sorted(target.aaPixels);
    const observations = [];
    for (const pixel of candidatePixels) {
        const resolvedObservation = targetOverlapObservation(target, pixel, overlap);
        const support = resolvedObservation.observation;
        const [x, y] = localCoordinate(target, pixel);
        observations.push({
            localPixel: [x, y],
            supportCount: support?.numOverlaps ?? 0,
            alignedSampleCount: support?.eligibleCount ?? 0,
            supportFraction: support?.overlapFraction ?? 0,
            class: resolvedObservation.class,
            sampleIds: [...(support?.contributorIds ?? [])]
        });
    }
    // Count recurrence is an observation, never an ownership promotion.  The
    // first M2 slice deliberately leaves every newly recognized candidate
    // unexplained until a later, explicitly named refinement consumes it.
    const frame = assessM2FrameSweep([]);
    const graduatedAa = [];
    const provisionalAa = [];
    const unresolvedAa = candidatePixels;
    const accounting = transitionM1ToM2(target.ownedBwPixels, target.ownedBwPixels, candidatePixels, graduatedAa);
    const digitCondition = resolved.digitCondition;
    return {
        schema: exports.M2_REPRESENTATION_SCHEMA,
        objectId: target.id,
        registration: {
            method: resolved.registrationMethod,
            sampleCount: specimens.length,
            alignedSampleCount: specimens.length,
            sampleUnit: 'distinct-badge-objects',
            alignedSampleIds,
            excludedSampleIds,
            alignment: 'exact-m1-owned-bbox-dimensions-plus-top-left-translation',
            digitCondition,
            minimumSupportCount: resolved.minimumSupportCount,
            minimumSupportFraction: resolved.minimumSupportFraction,
            provenance: resolved.registrationMethod === 'same-raster-m1-geometry'
                ? 'same-raster recurrence over independently addressed M1 badge geometries; not multisampling'
                : 'independently registered materialized samples'
        },
        m1: accounting.m1,
        m2: accounting.m2,
        aa: {
            candidatePixels,
            explainedPixels: sorted(graduatedAa),
            provisionalPixels: sorted(provisionalAa),
            unresolvedPixels: sorted(unresolvedAa),
            observations
        },
        transition: accounting.transition,
        frame,
        overlapRef: 'badgeEvidence.m2Library.overlap'
    };
}
/** Stable content payload for the E/Storybook seam. */
function encodeMaterializedBadgeM2Representation(value) {
    return new TextEncoder().encode(JSON.stringify(value, (_key, field) => field instanceof Uint32Array
        ? { $chainspotTypedArray: 'u32', data: Array.from(field) }
        : field));
}
function decodeMaterializedBadgeM2Representation(bytes) {
    const value = JSON.parse(new TextDecoder().decode(bytes), (_key, field) => {
        if (!field || typeof field !== 'object' || !('$chainspotTypedArray' in field))
            return field;
        const tagged = field;
        if (tagged.$chainspotTypedArray !== 'u32' || !Array.isArray(tagged.data))
            throw new Error('M2 representation has an unsupported typed-array payload');
        return Uint32Array.from(tagged.data);
    });
    if (value.schema !== exports.M2_REPRESENTATION_SCHEMA)
        throw new Error(`unsupported M2 representation schema '${String(value.schema)}'`);
    return value;
}
/* ------------------------------------------------------------------------- *
 * M2 expanded-frame raw-source probe
 *
 * CORRECTED: the functions above are NOT a wire-compatible adapter for old
 * (v1) E artifacts. `decodeMaterializedBadgeM2Representation()` throws on
 * any schema mismatch, and M2_REPRESENTATION_SCHEMA was bumped v1 -> v2 in
 * this same change (below), so it now throws on a v1 artifact too. No v1
 * artifacts exist on disk to decode (checked: none under artifacts/). New
 * M2 work must use the probe below. In particular, the probe never uses
 * aaPixels, residuePixels, or region.rgba to discover a repeat. It reads
 * every requested crop directly from the full RGBA source.
 *
 * EVIDENCE-RETENTION POLICY (schema v2, chainspot #m2-rootcause):
 * only the FINAL materialized margin (the one that fed the adequacy/
 * promotion decision) keeps its full per-pixel `observations` array.  Every
 * superseded margin in `trace.margins[]` retains a SUMMARY only -- marginPx,
 * frameSize, status, exactSupportedCoordinates/exactBoundary/
 * quantizedBoundary, clippedSampleIds, and unobservedSampleCount, i.e. every
 * field of M2RawMarginTrace except `observations` -- so the convergence
 * trail across margins stays readable without re-embedding per-pixel exact/
 * quantized replay for margins nothing downstream reads. `observations` is
 * therefore optional on M2RawMarginTrace and present on at most one entry of
 * `trace.margins[]`. Per-target and per-representation raw traces (
 * M2TargetRawTrace) do not duplicate that array either: they carry
 * `finalMarginPx` and callers join back to `trace.margins.find(m =>
 * m.marginPx === finalMarginPx).observations` instead of re-embedding it.
 * Before this schema version, the final margin's observations were embedded
 * by value 36 times (once per target + once per representation, PLUS a
 * further whole-array duplicate of `representations` itself under
 * `rawProbe.representations`, found only by running the real corpus and
 * inspecting the artifact) and every superseded margin kept full per-pixel
 * data, producing a ~1.68 GB artifact that crashed `JSON.stringify` past
 * V8's max string length on an 18-badge corpus run; every one of those is
 * a zero-evidence-loss dedup/reference fix.
 *
 * SUPERSEDED-MARGIN REPLAY (revised -- was overstated as an unqualified
 * "loss"): `scanRawMargin`'s per-registration eligibility test is `x <
 * sampleWidth_r + marginPx` (and the y analogue, using that registration's
 * OWN `ownedBbox` width/height, not the shared canonical `baseWidth`/
 * `baseHeight`) -- monotonically NON-DECREASING in marginPx per
 * registration: a registration can only GAIN eligibility for a local
 * coordinate as marginPx grows, never lose it. So whenever every registered
 * specimen shares one owned-bbox width/height -- true of every fixture in
 * this repo's raw-probe unit tests -- eligibility at any coordinate is
 * IDENTICAL at every margin that scans it, and a superseded margin's true
 * observation there is exactly, byte-for-byte, the corresponding entry of
 * the final margin's retained array: recoverable by restriction using the
 * retained marginPx + frameSize, zero loss, no re-run needed.
 * That does NOT generalize to non-uniform registrations. The real
 * DashsTrack corpus measured owned-bbox widths of 54-57px (uniform 42px
 * height) across its 18 registrations: e.g. a width-54 registration (vs.
 * baseWidth 57) is eligible for local x=60 at marginPx=32 (60 < 54+32) but
 * was NOT eligible at marginPx=5 (60 is not < 54+5=59). For a coordinate
 * adjacent to a narrower/shorter registration's own edge, "restriction"
 * from the final margin's array would silently over-count that
 * coordinate's eligible-sample set relative to what an earlier, superseded
 * margin's scan actually computed there -- that per-pixel replay is a real,
 * standing loss on non-uniform corpora, it is not retained, and restriction
 * does not reconstruct it. The interior majority of coordinates -- and
 * every coordinate on this repo's uniform-dimension test fixtures -- remain
 * exactly recoverable by restriction.
 * ------------------------------------------------------------------------- */
exports.M2_RAW_SOURCE_PROBE_SCHEMA = 'chainspot.badge-m2-raw-source/v2';
function rawKey(x, y) {
    return `${x},${y}`;
}
function sortedCoordinates(values) {
    return [...new Set(values)]
        .map((value) => value.split(',').map(Number))
        .sort((a, b) => a[1] - b[1] || a[0] - b[0])
        .map(([x, y]) => [x, y]);
}
function rawRgba(image, x, y) {
    const offset = (y * image.width + x) * 4;
    return [image.data[offset] ?? 0, image.data[offset + 1] ?? 0, image.data[offset + 2] ?? 0, image.data[offset + 3] ?? 0];
}
function rawM1Object(specimen, m1) {
    const object = m1.objects.find((candidate) => candidate.id === specimen.id && candidate.kind === 'badge');
    if (!object || object.accounting.status !== 'known' || !object.accounting.availablePixels.length)
        return null;
    const pixels = object.accounting.availablePixels;
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    for (const pixel of pixels) {
        const x = pixel % m1.raster.width;
        const y = Math.floor(pixel / m1.raster.width);
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
    }
    return { object, bbox: [minX, minY, maxX - minX + 1, maxY - minY + 1] };
}
function registrationFor(specimen, m1, image) {
    const found = rawM1Object(specimen, m1);
    if (!found)
        return null;
    const [x0, y0, width, height] = found.bbox;
    const exact = new Set();
    for (const use of found.object.componentUses) {
        if (use.role !== 'glyph')
            continue;
        const component = m1.components.find((candidate) => candidate.id === use.componentId);
        if (!component)
            continue;
        for (const pixel of component.pixels) {
            const x = pixel % m1.raster.width;
            const y = Math.floor(pixel / m1.raster.width);
            exact.add(rawKey(x - x0, y - y0));
        }
    }
    const halo = new Set();
    for (const value of exact) {
        const [x, y] = value.split(',').map(Number);
        for (let dy = -1; dy <= 1; dy++)
            for (let dx = -1; dx <= 1; dx++) {
                if (dx === 0 && dy === 0)
                    continue;
                const xx = x + dx;
                const yy = y + dy;
                halo.add(rawKey(xx, yy));
            }
    }
    for (const value of exact)
        halo.delete(value);
    const clippedSides = [x0 < 0 ? 'left' : '', y0 < 0 ? 'top' : '', x0 + width > image.width ? 'right' : '', y0 + height > image.height ? 'bottom' : ''].filter(Boolean);
    return {
        sampleId: specimen.id,
        m1ObjectId: found.object.id,
        ownedBbox: found.bbox,
        translation: [x0, y0],
        glyphExactCount: exact.size,
        glyphHaloCount: halo.size,
        glyphExactCoordinates: sortedCoordinates(exact),
        glyphHaloCoordinates: sortedCoordinates(halo),
        sourceFrame: 'full-rgba-image',
        provenance: `M1 owned bbox [${found.bbox.join(',')}], integer top-left translation only; glyph exact components + 1px halo; no resampling/fit${clippedSides.length ? `; source clipping=${clippedSides.join('|')}` : ''}`,
        specimen,
        glyphExactSet: exact,
        glyphHaloSet: halo,
        m1OwnedSet: new Set(found.object.accounting.status === 'known' ? found.object.accounting.availablePixels : [])
    };
}
function quantizedRgba(rgba, binWidth) {
    return [
        Math.floor(rgba[0] / binWidth),
        Math.floor(rgba[1] / binWidth),
        Math.floor(rgba[2] / binWidth),
        Math.floor(rgba[3] / binWidth)
    ];
}
function groupKey(rgba) {
    return rgba.join(',');
}
function boundaryFor(coordinates, margin, baseWidth, baseHeight, clippedBySide) {
    const count = {
        left: coordinates.filter(([x]) => x === -margin).length,
        right: coordinates.filter(([x]) => x === baseWidth + margin - 1).length,
        top: coordinates.filter(([, y]) => y === -margin).length,
        bottom: coordinates.filter(([, y]) => y === baseHeight + margin - 1).length
    };
    const side = (name) => ({
        count: count[name],
        status: clippedBySide[name].length ? 'unknown' : count[name] ? 'supported' : 'clear',
        affectedSampleIds: [...clippedBySide[name]].sort()
    });
    return {
        left: side('left'),
        right: side('right'),
        top: side('top'),
        bottom: side('bottom'),
        total: new Set(coordinates.filter(([x, y]) => x === -margin || x === baseWidth + margin - 1 || y === -margin || y === baseHeight + margin - 1).map(([x, y]) => rawKey(x, y))).size,
        status: Object.values(clippedBySide).some((values) => values.length) ? 'unknown' : count.left + count.right + count.top + count.bottom ? 'supported' : 'clear'
    };
}
function scanRawMargin(image, registrations, margin, baseWidth, baseHeight, minimumSupportCount, binWidth) {
    const clippedBySide = { left: [], right: [], top: [], bottom: [] };
    for (const registration of registrations) {
        const [x, y, width, height] = registration.ownedBbox;
        if (x - margin < 0)
            clippedBySide.left.push(registration.sampleId);
        if (x + width + margin > image.width)
            clippedBySide.right.push(registration.sampleId);
        if (y - margin < 0)
            clippedBySide.top.push(registration.sampleId);
        if (y + height + margin > image.height)
            clippedBySide.bottom.push(registration.sampleId);
    }
    const clippedSampleIds = [...new Set(Object.values(clippedBySide).flat())].sort();
    const clippedSet = new Set(clippedSampleIds);
    const observations = [];
    const exactSupported = [];
    const exactModalSupported = [];
    const quantizedSupported = [];
    for (let y = -margin; y < baseHeight + margin; y++) {
        for (let x = -margin; x < baseWidth + margin; x++) {
            const exactGroups = new Map();
            const quantizedGroups = new Map();
            const eligibleSampleIds = [];
            const eligibleRgba = [];
            for (const registration of registrations) {
                const [, , sampleWidth, sampleHeight] = registration.ownedBbox;
                if (x < -margin || y < -margin || x >= sampleWidth + margin || y >= sampleHeight + margin)
                    continue;
                const local = rawKey(x, y);
                if (registration.glyphExactSet.has(local) || registration.glyphHaloSet.has(local))
                    continue;
                const [x0, y0] = registration.translation;
                const sourceX = x0 + x;
                const sourceY = y0 + y;
                if (sourceX < 0 || sourceY < 0 || sourceX >= image.width || sourceY >= image.height)
                    continue;
                const rgba = rawRgba(image, sourceX, sourceY);
                eligibleSampleIds.push(registration.sampleId);
                eligibleRgba.push(rgba);
                const exactKey = groupKey(rgba);
                const exactPrior = exactGroups.get(exactKey) ?? { rgba, ids: [] };
                exactPrior.ids.push(registration.sampleId);
                exactGroups.set(exactKey, exactPrior);
                const bins = quantizedRgba(rgba, binWidth);
                const quantizedKey = groupKey(bins);
                const quantizedPrior = quantizedGroups.get(quantizedKey) ?? { bins, ids: [] };
                quantizedPrior.ids.push(registration.sampleId);
                quantizedGroups.set(quantizedKey, quantizedPrior);
            }
            const exactValues = [...exactGroups.values()].sort((a, b) => groupKey(a.rgba).localeCompare(groupKey(b.rgba)));
            const quantizedValues = [...quantizedGroups.values()].sort((a, b) => groupKey(a.bins).localeCompare(groupKey(b.bins)));
            const exactSupportCount = exactValues.reduce((max, group) => Math.max(max, group.ids.length), 0);
            const modalGroup = exactValues.reduce((best, group) => group.ids.length > (best?.ids.length ?? -1) ? group : best, undefined);
            const modalRgba = modalGroup?.rgba ?? null;
            const modalSupportCount = modalGroup?.ids.length ?? 0;
            const modalSupportFraction = eligibleSampleIds.length ? modalSupportCount / eligibleSampleIds.length : 0;
            const sampleSd = eligibleRgba.length >= 2
                ? [0, 1, 2, 3].map((channel) => {
                    const mean = eligibleRgba.reduce((sum, value) => sum + value[channel], 0) / eligibleRgba.length;
                    return Math.sqrt(eligibleRgba.reduce((sum, value) => sum + (value[channel] - mean) ** 2, 0) / (eligibleRgba.length - 1));
                })
                : null;
            const quantizedSupportCount = quantizedValues.reduce((max, group) => Math.max(max, group.ids.length), 0);
            const exactSupportedValue = exactSupportCount >= minimumSupportCount;
            const quantizedSupportedValue = quantizedSupportCount >= minimumSupportCount;
            if (exactSupportedValue)
                exactSupported.push(rawKey(x, y));
            if (modalSupportCount >= minimumSupportCount)
                exactModalSupported.push(rawKey(x, y));
            if (quantizedSupportedValue)
                quantizedSupported.push(rawKey(x, y));
            observations.push({
                localPixel: [x, y],
                eligibleSampleIds: eligibleSampleIds.sort(),
                exactGroups: exactValues.map((group) => ({ rgba: group.rgba, sampleIds: [...group.ids].sort(), count: group.ids.length })),
                quantizedGroups: quantizedValues.map((group) => ({ bins: group.bins, sampleIds: [...group.ids].sort(), count: group.ids.length })),
                exactSupportCount,
                exactSupported: exactSupportedValue,
                modalRgba,
                modalSupportCount,
                modalSupportFraction,
                sampleSd,
                sampleSdDenominator: sampleSd ? 'n-1' : null,
                nullModel: {
                    p: 0.5,
                    sampleCount: eligibleSampleIds.length,
                    probabilityAllMatch: eligibleSampleIds.length === 18 ? 3.814697265625e-6 : null,
                    percentAllMatch: eligibleSampleIds.length === 18 ? 0.0003814697265625 : null
                },
                quantizedSupportCount,
                quantizedSupported: quantizedSupportedValue
            });
        }
    }
    const exactCoordinates = sortedCoordinates(exactSupported);
    const quantizedCoordinates = sortedCoordinates(quantizedSupported);
    return {
        marginPx: margin,
        frameSize: [baseWidth + margin * 2, baseHeight + margin * 2],
        observations,
        exactSupportedCoordinates: exactCoordinates,
        exactModalSupportedCoordinates: sortedCoordinates(exactModalSupported),
        quantizedSupportedCoordinates: quantizedCoordinates,
        exactBoundary: boundaryFor(exactCoordinates, margin, baseWidth, baseHeight, clippedBySide),
        quantizedBoundary: boundaryFor(quantizedCoordinates, margin, baseWidth, baseHeight, clippedBySide),
        clippedSampleIds,
        unobservedSampleCount: clippedSet.size,
        status: clippedSet.size ? 'unknown' : 'measured'
    };
}
function targetPartition(target, registration, coordinates, ownedCoordinates) {
    const m1 = registration.m1OwnedSet;
    const aa = new Set(target.aaPixels);
    const residue = new Set(target.residuePixels);
    const byPartition = {
        'm1-owned': [],
        'old-aa': [],
        'old-residue': [],
        exterior: []
    };
    for (const coordinate of coordinates) {
        const [x, y] = coordinate;
        const sourceX = registration.translation[0] + x;
        const sourceY = registration.translation[1] + y;
        const globalPixel = sourceX >= 0 && sourceY >= 0 && sourceX < target.raster.width && sourceY < target.raster.height
            ? sourceY * target.raster.width + sourceX
            : -1;
        const partition = globalPixel >= 0 && m1.has(globalPixel)
            ? 'm1-owned'
            : globalPixel >= 0 && aa.has(globalPixel)
                ? 'old-aa'
                : globalPixel >= 0 && residue.has(globalPixel)
                    ? 'old-residue'
                    : 'exterior';
        byPartition[partition].push([x, y]);
    }
    const ordered = Object.fromEntries(Object.keys(byPartition).map((key) => [key, byPartition[key].map(([x, y]) => [x, y])]));
    return {
        targetId: target.id,
        exactSupportedCoordinates: coordinates,
        exactOwnedCoordinates: ownedCoordinates,
        byPartition: ordered,
        counts: {
            'm1-owned': ordered['m1-owned'].length,
            'old-aa': ordered['old-aa'].length,
            'old-residue': ordered['old-residue'].length,
            exterior: ordered.exterior.length
        }
    };
}
function m1AccountingFor(specimen, m1) {
    const object = m1.objects.find((candidate) => candidate.id === specimen.id && candidate.kind === 'badge');
    if (!object || object.accounting.status !== 'known') {
        return { availablePixels: new Uint32Array(), explainedPixels: new Uint32Array(), unexplainedPixels: new Uint32Array() };
    }
    return {
        availablePixels: Uint32Array.from(object.accounting.availablePixels),
        explainedPixels: Uint32Array.from(object.accounting.explainedPixels),
        unexplainedPixels: Uint32Array.from(object.accounting.unexplainedPixels)
    };
}
function rawRepresentation(target, registration, m1, margins, adequate, minimumSupportCount, allRegistrations, targetTrace) {
    const m1Accounting = m1AccountingFor(target, m1);
    const candidatePixels = sorted(target.aaPixels);
    const margin = margins[margins.length - 1];
    const observationByKey = new Map((margin?.observations ?? []).map((observation) => [rawKey(...observation.localPixel), observation]));
    const ownedCoordinateSet = new Set(targetTrace.exactOwnedCoordinates.map(([x, y]) => rawKey(x, y)));
    const observations = [];
    for (const pixel of candidatePixels) {
        const x = pixel % target.raster.width - registration.translation[0];
        const y = Math.floor(pixel / target.raster.width) - registration.translation[1];
        const observation = observationByKey.get(rawKey(x, y));
        const group = observation?.exactGroups.reduce((best, value) => value.count > (best?.count ?? 0) ? value : best, undefined);
        observations.push({
            localPixel: [x, y],
            supportCount: observation?.exactSupportCount ?? 0,
            alignedSampleCount: observation?.eligibleSampleIds.length ?? 0,
            supportFraction: observation?.eligibleSampleIds.length ? (observation.exactSupportCount / observation.eligibleSampleIds.length) : 0,
            class: observation?.exactSupported ? 'structural-common' : 'unresolved',
            sampleIds: group?.sampleIds ?? []
        });
    }
    const m1Set = new Set(m1Accounting.availablePixels);
    const discovered = [];
    for (const [x, y] of targetTrace.exactOwnedCoordinates) {
        const sourceX = registration.translation[0] + x;
        const sourceY = registration.translation[1] + y;
        if (sourceX < 0 || sourceY < 0 || sourceX >= target.raster.width || sourceY >= target.raster.height)
            continue;
        const pixel = sourceY * target.raster.width + sourceX;
        if (!m1Set.has(pixel))
            discovered.push(pixel);
    }
    const accounting = transitionM1ToM2(m1Accounting.availablePixels, m1Accounting.explainedPixels, discovered, discovered);
    const provisional = adequate
        ? Array.from(candidatePixels).filter((pixel) => {
            const observation = observationByKey.get(rawKey(pixel % target.raster.width - registration.translation[0], Math.floor(pixel / target.raster.width) - registration.translation[1]));
            return !!observation?.exactSupported && observation.modalSupportCount < allRegistrations.length;
        })
        : [];
    const explainedCandidates = adequate
        ? Array.from(candidatePixels).filter((pixel) => {
            const observation = observationByKey.get(rawKey(pixel % target.raster.width - registration.translation[0], Math.floor(pixel / target.raster.width) - registration.translation[1]));
            const localKey = rawKey(pixel % target.raster.width - registration.translation[0], Math.floor(pixel / target.raster.width) - registration.translation[1]);
            return ownedCoordinateSet.has(localKey) && !!observation && observation.modalSupportCount === allRegistrations.length && observation.eligibleSampleIds.length === allRegistrations.length;
        })
        : [];
    const unresolved = candidatePixels.filter((pixel) => !provisional.includes(pixel) && !explainedCandidates.includes(pixel));
    return {
        schema: exports.M2_REPRESENTATION_SCHEMA,
        objectId: target.id,
        registration: {
            method: 'independent-registered-samples',
            sampleCount: allRegistrations.length,
            alignedSampleCount: allRegistrations.length,
            sampleUnit: 'distinct-badge-objects',
            alignedSampleIds: allRegistrations.map((value) => value.sampleId).sort(),
            excludedSampleIds: [],
            alignment: 'exact-m1-owned-bbox-dimensions-plus-top-left-translation',
            digitCondition: 'all',
            minimumSupportCount,
            minimumSupportFraction: 0,
            provenance: 'full RGBA source expanded-frame recurrence; integer M1 top-left translation only; exact RGBA is authoritative; not JPEG-safe'
        },
        m1: accounting.m1,
        m2: accounting.m2,
        aa: {
            candidatePixels,
            explainedPixels: sorted(explainedCandidates),
            provisionalPixels: sorted(provisional),
            unresolvedPixels: sorted(unresolved),
            observations
        },
        transition: accounting.transition,
        frame: assessM2FrameSweep(margins.map((value) => ({
            marginPx: value.marginPx,
            supportedPixels: value.exactSupportedCoordinates,
            boundarySupportedPixelCount: value.exactBoundary.total,
            unobservedSampleCount: value.unobservedSampleCount
        }))),
        overlapRef: 'badgeEvidence.m2Library.overlap',
        rawTrace: targetTrace
    };
}
/**
 * Drop a superseded margin's full per-pixel `observations` down to the
 * summary fields already computed for it. Every other field on
 * M2RawMarginTrace is unchanged; only the heavy per-pixel array is omitted.
 * See the EVIDENCE-RETENTION POLICY comment above M2_RAW_SOURCE_PROBE_SCHEMA.
 */
function summarizeSupersededMargin(margin) {
    if (!margin.observations)
        return margin;
    const { observations: _observations, ...summary } = margin;
    return summary;
}
/**
 * Materialize the M2 expanded-frame model from the real source raster.
 * Every sample is translated by its M1-owned bbox top-left. No scaling,
 * fitting, candidate mask, residue mask, or pre-cropped region participates
 * in discovery. The final exact support set is the only authoritative result.
 */
function materializeExpandedBadgeRawFrameProbe(input) {
    const { image, specimens, m1 } = input;
    if (!Number.isInteger(image.width) || !Number.isInteger(image.height) || image.width <= 0 || image.height <= 0)
        throw new RangeError('M2 raw source image dimensions must be positive integers');
    if (image.data.length !== image.width * image.height * 4)
        throw new Error('M2 raw source image RGBA does not match declared dimensions');
    const options = input.options ?? {};
    const start = options.startMarginPx ?? options.marginStartPx ?? 2;
    const step = options.marginStepPx ?? 1;
    const cap = options.safetyCapMarginPx ?? options.maxMarginPx ?? 32;
    const minimumSupportCount = options.minimumSupportCount ?? 2;
    const binWidth = options.quantizedBinWidth ?? 8;
    if (!Number.isInteger(start) || start < 2 || !Number.isInteger(step) || step < 1 || !Number.isInteger(cap) || cap < start)
        throw new RangeError('M2 raw source margins require start >= 2, positive step, and cap >= start');
    if (!Number.isInteger(minimumSupportCount) || minimumSupportCount < 2)
        throw new RangeError('M2 exact RGBA minimum support must be an integer >= 2');
    if (!Number.isInteger(binWidth) || binWidth < 1)
        throw new RangeError('M2 quantized RGBA bin width must be a positive integer');
    const ids = new Set();
    for (const specimen of specimens) {
        if (ids.has(specimen.id))
            throw new Error(`duplicate M2 raw specimen id '${specimen.id}'`);
        ids.add(specimen.id);
    }
    const registrations = [];
    const excludedSampleIds = [];
    for (const specimen of [...specimens].sort((a, b) => a.id.localeCompare(b.id))) {
        if (specimen.raster.width !== image.width || specimen.raster.height !== image.height) {
            excludedSampleIds.push(specimen.id);
            continue;
        }
        const registration = registrationFor(specimen, m1, image);
        if (registration)
            registrations.push(registration);
        else
            excludedSampleIds.push(specimen.id);
    }
    const baseWidth = registrations.length ? Math.max(...registrations.map((value) => value.ownedBbox[2])) : 0;
    const baseHeight = registrations.length ? Math.max(...registrations.map((value) => value.ownedBbox[3])) : 0;
    const margins = [];
    const sampleCountValid = specimens.length === 18;
    const ownershipGate = options.ownershipGate;
    const ownershipEnabled = ownershipGate?.status === 'measured' && ownershipGate.significant;
    let status = registrations.length && sampleCountValid && !excludedSampleIds.length ? 'insufficient' : 'unknown';
    let reason = !sampleCountValid
        ? `expected exactly 18 distinct MaterializedBadgeEvidence samples; received ${specimens.length}`
        : excludedSampleIds.length
            ? `M1 registration unavailable for samples: ${excludedSampleIds.join(', ')}`
            : 'safety cap reached before exact support stabilized and cleared every boundary';
    let finalMargin;
    let previous;
    for (let margin = start; margin <= cap; margin += step) {
        const current = scanRawMargin(image, registrations, margin, baseWidth, baseHeight, minimumSupportCount, binWidth);
        margins.push(current);
        finalMargin = current;
        // The margin pushed on the PRIOR iteration is now superseded by `current`
        // no matter what happens below: strip its full per-pixel observations
        // down to a summary immediately so at most one entry in `margins[]` ever
        // holds the heavy array at once. `previous` (below) still references the
        // pre-strip object for this iteration's stability comparison, since
        // summarizeSupersededMargin() returns a new object rather than mutating.
        if (margins.length >= 2)
            margins[margins.length - 2] = summarizeSupersededMargin(margins[margins.length - 2]);
        const stable = !!previous && fingerprint(previous.exactSupportedCoordinates) === fingerprint(current.exactSupportedCoordinates);
        if (sampleCountValid && !excludedSampleIds.length && stable && current.unobservedSampleCount === 0 && current.exactBoundary.total === 0) {
            status = 'adequate';
            reason = 'exact RGBA repeat support stabilized and clears every untruncated frame boundary';
            break;
        }
        previous = current;
    }
    if (status !== 'adequate' && finalMargin?.unobservedSampleCount) {
        status = 'unknown';
        reason = !sampleCountValid
            ? `${reason}; source clipping leaves part of the latest expanded frame unobserved`
            : 'source clipping leaves part of the latest expanded frame unobserved';
    }
    const targets = [];
    const representations = [];
    for (const registration of registrations) {
        const target = registration.specimen;
        // `finalMargin` is always the last-pushed margins[] entry (see the loop
        // above): summarizeSupersededMargin() only ever strips the entry BEHIND
        // it, so its full `observations` array is guaranteed present here.
        const exactOwnedCoordinates = ownershipEnabled && status === 'adequate' && finalMargin
            ? (finalMargin.observations ?? []).filter((observation) => observation.modalSupportCount === 18 && observation.eligibleSampleIds.length === 18).map((observation) => observation.localPixel)
            : [];
        const partition = targetPartition(target, registration, finalMargin?.exactSupportedCoordinates ?? [], exactOwnedCoordinates);
        const targetTrace = {
            targetId: target.id,
            finalMarginPx: finalMargin?.marginPx ?? null,
            finalExactSupportedCoordinates: finalMargin?.exactSupportedCoordinates ?? [],
            exactOwnedCoordinates,
            partition
        };
        targets.push(targetTrace);
        representations.push(rawRepresentation(target, registration, m1, margins, status === 'adequate', minimumSupportCount, registrations, targetTrace));
    }
    const trace = {
        algorithm: {
            exact: { authoritative: true, equality: 'exact-rgba-tuple', tuple: '(r,g,b,a)', minimumSupportCount, nullModel: { p: 0.5, eighteenSampleProbability: 3.814697265625e-6, eighteenSamplePercent: 0.0003814697265625, assumption: 'independent Bernoulli trials' } },
            quantized: { authoritative: false, equality: 'floor-channel-bin', binWidth, equation: 'q(c)=floor(c/binWidth)' },
            modelProvenance: 'Raw source RGB(A) appearance at every registered coordinate; exact tuple equality is baseline. JPEG/compressed images can change exact tuples, so exact recurrence is not a JPEG-invariant claim.'
        },
        margins,
        registrations: registrations.map(({ specimen: _specimen, glyphExactSet: _exact, glyphHaloSet: _halo, ...registration }) => registration),
        excludedSampleIds,
        final: {
            status,
            reason,
            targets,
            exactSupportedCoordinates: finalMargin?.exactSupportedCoordinates ?? [],
            exactModalSupportedCoordinates: finalMargin?.exactModalSupportedCoordinates ?? [],
            quantizedSupportedCoordinates: finalMargin?.quantizedSupportedCoordinates ?? [],
            finalMarginPx: finalMargin?.marginPx ?? null,
            ownership: {
                promoted: ownershipEnabled && status === 'adequate',
                criterion: ownershipGate?.criterion ?? 'OFF: requires adequate frame and measured significant circular-shift control'
            }
        }
    };
    return {
        schema: exports.M2_RAW_SOURCE_PROBE_SCHEMA,
        state: status === 'adequate' ? 'materialized' : 'insufficient',
        provenance: {
            source: 'full-rgba-image',
            exactBaseline: 'authoritative',
            quantizedDiagnostic: 'non-authoritative',
            jpegCaveat: 'Exact RGBA recurrence is authoritative for this raster; JPEG recompression may alter channel tuples and is not an exact-match guarantee.'
        },
        trace,
        representations
    };
}
/** Alias with the longer name used by some callers. */
exports.materializeExpandedBadgeRawSourceFrame = materializeExpandedBadgeRawFrameProbe;
/**
 * One-call producer seam: discover the raw trace, run the deterministic
 * circular-shift control, then decorate the same trace with the gated 18/18
 * ownership projection. The initial discovery is never repeated by a caller.
 */
function materializeExpandedBadgeRawFrameProbeWithControl(input) {
    const { control, ...rawOptions } = input.options;
    const discovered = materializeExpandedBadgeRawFrameProbe({ ...input, options: rawOptions });
    const controlResult = (0, m2RawFrameStatsControl_1.materializeM2RawFrameStatsControl)(discovered.trace, {
        ...control,
        imageId: input.m1.provenance.imageId,
        paramsHash: input.m1.provenance.paramsHash,
        featureId: 'badgeM2Aa'
    });
    const alpha = control.alpha ?? 0.05;
    const finalStats = controlResult.margins.find((margin) => margin.marginPx === discovered.trace.final.finalMarginPx)?.bySupportThreshold['18'];
    const significant = discovered.trace.final.status === 'adequate' && controlResult.status === 'measured' && !!finalStats && finalStats.globalMaxExactOverlap.observed === 18 && finalStats.globalMaxExactOverlap.empiricalP <= alpha;
    const criterion = `adequate frame AND exact modal 18/18 AND circular-shift global-max empirical p<=${alpha}; observed=${finalStats?.globalMaxExactOverlap.observed ?? 'UNKNOWN'} p=${finalStats?.globalMaxExactOverlap.empiricalP ?? 'UNKNOWN'}; cluster statistic is corroborative, not multiplied`;
    const finalized = materializeExpandedBadgeRawFrameProbe({
        ...input,
        options: {
            ...rawOptions,
            ownershipGate: { status: controlResult.status, significant, criterion }
        }
    });
    return {
        ...finalized,
        statistics: controlResult,
        trace: { ...finalized.trace, control: controlResult, statistics: controlResult }
    };
}
//# sourceMappingURL=m2Representation.js.map