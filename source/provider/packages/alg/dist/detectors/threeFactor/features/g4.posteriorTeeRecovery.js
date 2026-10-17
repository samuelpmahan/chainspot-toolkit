"use strict";
/**
 * Experimental posterior tee-recovery reconciliation.
 *
 * It consumes the frozen G4 recovery + teeBadgeLock testimony, reopens only
 * the conflict island, and ranks material shard hypotheses against NULL.
 *
 * A selected hypothesis is then written down as a REAL recovered tee, not as a
 * sidecar opinion: a recovered tee is as valid as a visible one, it is just
 * recorded differently. That means a wrong pick shows up on the endpoint image
 * where a human sees it, instead of hiding in a table nobody renders.
 * It rewrites `assignment` with those exact tee-to-badge decisions while
 * leaving basket selection to the existing pair evidence.
 *
 * "Posterior" here means normalized model weight, not a calibrated real-
 * world probability. The receipt exposes every likelihood term and model
 * provenance so the number cannot masquerade as unexplained certainty.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.posteriorTeeRecoveryFeature = exports.posteriorTeeRecoveryOperation = void 0;
const assignment_1 = require("../assignment");
const g3_teeRecovery_1 = require("./g3.teeRecovery");
const g3_phantomTee_1 = require("./g3.phantomTee");
const g4_scoring_1 = require("./g4.scoring");
const g4_search_1 = require("./g4.search");
const g5_ribbon_1 = require("./g5.ribbon");
const g5_routing_1 = require("./g5.routing");
const g5_zfit_1 = require("./g5.zfit");
const g4_posteriorTeeRecoveryReceipt_1 = require("./g4.posteriorTeeRecoveryReceipt");
const FEATURE_ID = 'posteriorTeeRecovery';
const UNIT_ID = 'teeBadgeLock';
const RASTER_TOLERANCE_PX = 1.25;
function finite(value) {
    return typeof value === 'number' && Number.isFinite(value);
}
function median(values) {
    const sorted = [...values].filter(Number.isFinite).sort((a, b) => a - b);
    if (!sorted.length)
        return 0;
    const m = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[m] : (sorted[m - 1] + sorted[m]) / 2;
}
function robustModel(values, floor, provenance) {
    const finiteValues = values.filter(Number.isFinite);
    if (!finiteValues.length) {
        return {
            median: 0,
            scale: floor,
            sampleCount: 0,
            provenance: `${provenance}; UNKNOWN/no samples`
        };
    }
    const center = median(finiteValues);
    const mad = median(finiteValues.map((value) => Math.abs(value - center)));
    return {
        median: center,
        scale: Math.max(floor, 1.4826 * mad),
        sampleCount: finiteValues.length,
        provenance
    };
}
function axialErrorDeg(candidate) {
    const a = candidate.badgeAxisAngleRad;
    const b = candidate.teeToBadgeAngleRad;
    if (!finite(a) || !finite(b))
        return null;
    const d = Math.atan2(Math.sin(a - b), Math.cos(a - b));
    return (Math.abs(d) * 180) / Math.PI;
}
function explains(candidate, point) {
    const fit = candidate.fit;
    const dx = point[0] - fit.centerXPx;
    const dy = point[1] - fit.centerYPx;
    const c = Math.cos(fit.angleRad);
    const s = Math.sin(fit.angleRad);
    const u = dx * c + dy * s;
    const v = -dx * s + dy * c;
    const hw = fit.halfWidthPx + RASTER_TOLERANCE_PX;
    const hh = fit.halfHeightPx + RASTER_TOLERANCE_PX;
    if (Math.abs(u) > hw || Math.abs(v) > hh)
        return false;
    const thickness = Math.max(0, fit.supportThicknessPx ?? Math.min(fit.halfWidthPx, fit.halfHeightPx));
    return (Math.abs(u) >= fit.halfWidthPx - thickness - RASTER_TOLERANCE_PX ||
        Math.abs(v) >= fit.halfHeightPx - thickness - RASTER_TOLERANCE_PX);
}
function componentLabels(candidate) {
    const labels = new Set();
    for (const id of candidate.supportingComponentIds) {
        const componentGroup = id.split(':')[0] ?? '';
        for (const token of componentGroup.split('+')) {
            const label = Number(token);
            if (Number.isFinite(label))
                labels.add(label);
        }
    }
    return [...labels].sort((a, b) => a - b);
}
function studentTLikeLogLikelihood(z, weight) {
    return -weight * Math.log1p((z * z) / 3);
}
function scoreCandidate(candidate, badge, consideredComponents, distanceModel, axisModel, knobs) {
    const fit = candidate.localizationFit ?? candidate.fit;
    const centerYPx = fit.centerYPx + (candidate.coordinateFrame === 'original' ? 0 : (candidate.viewportTopPx ?? 0));
    const distancePx = Math.hypot(fit.centerXPx - badge.cxPx, centerYPx - badge.cyPx);
    const axisError = axialErrorDeg(candidate);
    const unexplainedPixels = candidate.fragmentPixels.filter((point) => !explains(candidate, point)).length;
    const supportTerm = knobs.supportLogWeight * Math.log1p(candidate.fragmentPixels.length);
    const distanceTerm = distanceModel.sampleCount === 0
        ? 0
        : studentTLikeLogLikelihood((distancePx - distanceModel.median) / distanceModel.scale, knobs.distanceTailWeight);
    const axisTerm = axisModel.sampleCount === 0
        ? 0
        : -0.5 *
            knobs.axisWeight *
            (((axisError ?? axisModel.median + 3 * axisModel.scale) - axisModel.median) /
                axisModel.scale) **
                2;
    const contradictionTerm = Math.log(knobs.contradictionOddsPerPixel) * unexplainedPixels;
    const multiplicityAndPriorTerm = Math.log(knobs.observableToNullPriorOdds) - Math.log(Math.max(1, consideredComponents));
    const logWeightVsNull = supportTerm + distanceTerm + axisTerm + contradictionTerm + multiplicityAndPriorTerm;
    return {
        kind: 'candidate',
        id: candidate.id,
        badgeId: badge.detId,
        hole: badge.label,
        componentLabels: componentLabels(candidate),
        centerXPx: fit.centerXPx,
        centerYPx,
        supportPixels: candidate.fragmentPixels.length,
        unexplainedPixels,
        distancePx,
        axisErrorDeg: axisError,
        logTerms: {
            support: supportTerm,
            distance: distanceTerm,
            axis: axisTerm,
            contradictions: contradictionTerm,
            multiplicityAndPrior: multiplicityAndPriorTerm
        },
        logWeightVsNull
    };
}
function normalizeTarget(hypotheses) {
    const maxLog = Math.max(0, ...hypotheses.map((hypothesis) => hypothesis.logWeightVsNull));
    const weights = hypotheses.map((hypothesis) => Math.exp(hypothesis.logWeightVsNull - maxLog));
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    hypotheses.forEach((hypothesis, index) => {
        hypothesis.posteriorWithinTarget = weights[index] / total;
    });
    return hypotheses.sort((a, b) => (b.posteriorWithinTarget ?? 0) - (a.posteriorWithinTarget ?? 0));
}
function sharesEvidence(hypothesis, used) {
    return hypothesis.componentLabels.some((label) => used.has(label));
}
function enumerateJoint(targets, topKPerTarget) {
    const out = [];
    function visit(index, used, selections, logWeight) {
        if (index === targets.length) {
            out.push({ logWeight, selections: [...selections] });
            return;
        }
        const choices = targets[index].hypotheses.slice(0, topKPerTarget);
        for (const hypothesis of choices) {
            if (sharesEvidence(hypothesis, used))
                continue;
            const nextUsed = new Set(used);
            for (const label of hypothesis.componentLabels)
                nextUsed.add(label);
            selections.push(hypothesis);
            visit(index + 1, nextUsed, selections, logWeight + hypothesis.logWeightVsNull);
            selections.pop();
        }
    }
    visit(0, new Set(), [], 0);
    return out.sort((a, b) => b.logWeight - a.logWeight);
}
function normalizeJoint(joint) {
    if (!joint.length)
        return [];
    const maxLog = joint[0].logWeight;
    const weights = joint.map((row) => Math.exp(row.logWeight - maxLog));
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    return joint.slice(0, 10).map((row, index) => ({
        posterior: weights[index] / total,
        logWeight: row.logWeight,
        selections: row.selections
    }));
}
function phantomHole(note) {
    const match = note.match(/\bhole\s+(\d+)\b/);
    return match ? Number(match[1]) : null;
}
function emptyModel(name) {
    return { median: 0, scale: 1, sampleCount: 0, provenance: `${name}; not evaluated` };
}
function disabledEvidence(enabled) {
    return {
        schema: 'posterior-tee-recovery@1',
        enabled,
        status: enabled ? 'no-conflicts' : 'disabled',
        evidenceModels: { distance: emptyModel('distance'), axis: emptyModel('axis') },
        targetBadgeIds: [],
        targets: [],
        jointTop: [],
        phantomProposals: [],
        completions: { unaffectedLocks: 0, observable: 0, phantom: 0, unresolvedNulls: 0, total: 0 }
    };
}
function inferPosterior(board, ctx, knobs) {
    const measurement = board.get('measurement');
    const assignment = board.get('assignment');
    const teeBadge = board.get('teeBadgeLock');
    const badges = board.get('badges');
    const baskets = board.get('baskets');
    const visibleTees = board.get('tees');
    const stage = board.get('stage');
    const viewport = board.get('viewport');
    const sprites = board.has('sprites') ? board.get('sprites') : undefined;
    const visibleLocks = teeBadge.locks.filter((lock) => lock.tier === 'visible' && finite(lock.chordPx));
    const distanceModel = robustModel(visibleLocks.map((lock) => lock.chordPx), knobs.distanceScaleFloorPx, `median/MAD over ${visibleLocks.length} frozen visible teeBadgeLock chordPx values`);
    const axisSamples = visibleLocks
        .map((lock) => lock.axisErrorDeg)
        .filter((value) => finite(value));
    const axisModel = robustModel(axisSamples, knobs.axisScaleFloorDeg, `median/MAD over ${axisSamples.length} frozen visible teeBadgeLock axis-error values`);
    const targetBadgeIds = new Set(teeBadge.abstentions.map((row) => row.badgeId));
    const lockByBadge = new Map(teeBadge.locks.map((row) => [row.badgeId, row]));
    const assignmentByTee = new Map(assignment.assignments.map((row) => [row.teeId, row]));
    for (const lock of teeBadge.locks) {
        if (lock.tier !== 'recovered')
            continue;
        const assignmentOwner = assignmentByTee.get(lock.teeId);
        if (!assignmentOwner || assignmentOwner.badgeId === lock.badgeId)
            continue;
        targetBadgeIds.add(lock.badgeId);
        if (!lockByBadge.has(assignmentOwner.badgeId))
            targetBadgeIds.add(assignmentOwner.badgeId);
    }
    if (targetBadgeIds.size === 0) {
        return {
            schema: 'posterior-tee-recovery@1',
            enabled: true,
            status: 'no-conflicts',
            evidenceModels: { distance: distanceModel, axis: axisModel },
            targetBadgeIds: [],
            targets: [],
            jointTop: [],
            phantomProposals: [],
            completions: {
                unaffectedLocks: teeBadge.locks.length,
                observable: 0,
                phantom: 0,
                unresolvedNulls: 0,
                total: teeBadge.locks.length
            }
        };
    }
    if (targetBadgeIds.size > knobs.maxConflictTargets) {
        return {
            schema: 'posterior-tee-recovery@1',
            enabled: true,
            status: 'abstained-too-large',
            evidenceModels: { distance: distanceModel, axis: axisModel },
            targetBadgeIds: [...targetBadgeIds],
            targets: [],
            jointTop: [],
            phantomProposals: [],
            completions: {
                unaffectedLocks: teeBadge.locks.filter((lock) => !targetBadgeIds.has(lock.badgeId)).length,
                observable: 0,
                phantom: 0,
                unresolvedNulls: targetBadgeIds.size,
                total: teeBadge.locks.filter((lock) => !targetBadgeIds.has(lock.badgeId)).length
            }
        };
    }
    const basketFallback = baskets[0]?.detId ?? 'UNKNOWN';
    const assignmentMask = {
        assignments: badges
            .filter((badge) => /^\d+$/.test(badge.label ?? '') && !targetBadgeIds.has(badge.detId))
            .map((badge) => ({ badgeId: badge.detId, basketId: basketFallback }))
    };
    const built = (0, g3_teeRecovery_1.buildTeeRecoveryCandidates)(stage, badges, baskets, visibleTees, viewport.topPx, {
        assignment: assignmentMask,
        sprites,
        occlusion: ctx.occlusion
    });
    const posteriorTargets = built.searchOutcomes
        .filter((outcome) => targetBadgeIds.has(outcome.badgeId))
        .map((outcome) => {
        const badge = badges.find((candidate) => candidate.detId === outcome.badgeId);
        const raw = [outcome.winner, ...outcome.runnerUps].filter((value) => value !== undefined);
        const hypotheses = raw.map((candidate) => scoreCandidate(candidate, badge, outcome.consideredComponents, distanceModel, axisModel, knobs));
        hypotheses.push({
            kind: 'null',
            id: 'NULL',
            badgeId: badge.detId,
            hole: badge.label,
            componentLabels: [],
            logWeightVsNull: 0
        });
        return {
            badgeId: badge.detId,
            hole: badge.label,
            consideredComponents: outcome.consideredComponents,
            hypotheses: normalizeTarget(hypotheses)
        };
    });
    const joint = enumerateJoint(posteriorTargets, knobs.topKPerTarget);
    const jointTop = normalizeJoint(joint);
    const map = jointTop[0];
    const nullSelections = map?.selections.filter((selection) => selection.kind === 'null') ?? [];
    const rawPhantoms = nullSelections.length
        ? (0, g3_phantomTee_1.synthesizePhantomTees)(measurement, assignment.assignments, 0, nullSelections.length)
        : [];
    const phantomProposals = [];
    const unresolvedNulls = [];
    for (const selection of nullSelections) {
        const hole = Number(selection.hole);
        const phantom = rawPhantoms.find((candidate) => phantomHole(candidate.provenance.note) === hole);
        if (!Number.isInteger(hole) || !phantom) {
            unresolvedNulls.push(selection);
            continue;
        }
        phantomProposals.push({
            badgeId: selection.badgeId,
            hole,
            xPx: phantom.xPx,
            yPx: phantom.yPx,
            provenance: phantom.provenance
        });
    }
    const unaffectedLocks = teeBadge.locks.filter((lock) => !targetBadgeIds.has(lock.badgeId)).length;
    const observable = map?.selections.filter((selection) => selection.kind === 'candidate').length ?? 0;
    const phantom = phantomProposals.length;
    return {
        schema: 'posterior-tee-recovery@1',
        enabled: true,
        status: 'resolved',
        evidenceModels: { distance: distanceModel, axis: axisModel },
        targetBadgeIds: [...targetBadgeIds],
        targets: posteriorTargets.map((target) => ({
            badgeId: target.badgeId,
            hole: target.hole,
            consideredComponents: target.consideredComponents,
            topHypotheses: target.hypotheses.slice(0, knobs.topKPerTarget)
        })),
        jointTop,
        phantomProposals,
        completions: {
            unaffectedLocks,
            observable,
            phantom,
            unresolvedNulls: unresolvedNulls.length,
            total: unaffectedLocks + observable + phantom
        }
    };
}
function publishRecoveredTees(board, ctx, evidence, badges) {
    const badgeById = new Map(badges.map((badge) => [badge.detId, badge]));
    // A reopened badge already owns a frozen RECOVERED tee, and that tee is
    // exactly what the posterior just overruled. Appending without retiring it
    // would leave the badge owning two endpoints and the run reporting more
    // locks than badges -- so the superseded tees are dropped by position here.
    // Visible-tier tees are never touched: those were observed, not inferred.
    const teeBadge = board.get('teeBadgeLock');
    const teeById = new Map(board.get('assignment.tees').map((tee) => [tee.detId, tee]));
    const targets = new Set(evidence.targetBadgeIds);
    const superseded = [];
    const supersededTeeIds = new Set();
    for (const lock of teeBadge.locks) {
        if (lock.tier !== 'recovered' || !targets.has(lock.badgeId))
            continue;
        const tee = teeById.get(lock.teeId);
        if (tee && finite(tee.xPx) && finite(tee.yPx)) {
            superseded.push({ x: tee.xPx, y: tee.yPx });
            supersededTeeIds.add(lock.teeId);
            // The render layer must drop the G3 shard this overrules, or the
            // badge shows two endpoints. Match by BADGE IDENTITY, not position:
            // G3 draws its shards as `pixelSet` (no centre point) with a ref of
            // `tee-shard-<badgeId>-<componentGroup>:tee-shard`, so the badge id
            // is the only thing both sides reliably share.
            ctx.overlay(UNIT_ID, {
                type: 'point',
                xPx: tee.xPx,
                yPx: tee.yPx,
                verdict: 'rejected',
                visualRole: 'tee-rejection',
                ref: `posteriorTeeRecovery:retired:${encodeURIComponent(lock.badgeId)}:${lock.teeId}`,
                reason: `frozen recovered tee ${lock.teeId} for ${lock.badgeId} overruled by posterior selection`,
                // Say which one plainly. `tee-recovered-N` is named by its index
                // into G3's accepted-candidate list, so publishing N here means no
                // consumer has to parse it back out of an id or guess by position.
                values: {
                    teeIndex: Number(/tee-recovered-(\d+)$/.exec(lock.teeId)?.[1] ?? -1),
                    ...(finite(lock.hole) ? { hole: lock.hole } : {})
                }
            });
        }
    }
    const isSuperseded = (tee) => superseded.some((point) => Math.abs(point.x - tee.xPx) < 0.5 && Math.abs(point.y - tee.yPx) < 0.5);
    const existing = board
        .get('recoveredTees')
        .filter((tee) => !isSuperseded(tee));
    const retired = board.get('recoveredTees').length - existing.length;
    const additions = [];
    for (const selection of evidence.jointTop[0]?.selections ?? []) {
        if (selection.kind !== 'candidate')
            continue;
        const hole = selection.hole ?? 'UNKNOWN';
        additions.push({
            xPx: selection.centerXPx,
            yPx: selection.centerYPx,
            score: selection.posteriorWithinTarget ?? 0,
            provenance: {
                source: 'tee-shard-recovery',
                note: `posterior-selected shard ${selection.id} for hole ${hole}: ${selection.supportPixels}px support, ${selection.unexplainedPixels}px unexplained, ${selection.distancePx.toFixed(1)}px from badge`,
                ...(selection.posteriorWithinTarget === undefined
                    ? {}
                    : { score: selection.posteriorWithinTarget })
            }
        });
        // The endpoint is not complete until something OWNS it. teeBadgeLock has
        // already run by now and will not re-lock, so a badge it abstained on
        // would end up with a tee and no lock -- 18 tees but 17 locks. Emit the
        // ownership edge here; featureRenders retires the lock this supersedes.
        const badge = badgeById.get(selection.badgeId);
        if (badge) {
            ctx.overlay(UNIT_ID, {
                type: 'polyline',
                path: [
                    [badge.cxPx, badge.cyPx],
                    [selection.centerXPx, selection.centerYPx]
                ],
                verdict: 'accepted',
                visualRole: 'tee-badge-path',
                ref: `${FEATURE_ID}:ray:${encodeURIComponent(selection.badgeId)}:${encodeURIComponent(selection.id)}`,
                values: {
                    ...(finite(Number(selection.hole)) ? { hole: Number(selection.hole) } : {}),
                    distancePx: selection.distancePx
                }
            });
        }
        ctx.overlay(UNIT_ID, {
            type: 'point',
            xPx: selection.centerXPx,
            yPx: selection.centerYPx,
            verdict: 'accepted',
            visualRole: 'tee-shard',
            ref: `${FEATURE_ID}:selected:${encodeURIComponent(selection.badgeId)}:${encodeURIComponent(selection.id)}`,
            values: {
                ...(finite(Number(selection.hole)) ? { hole: Number(selection.hole) } : {}),
                posterior: selection.posteriorWithinTarget ?? 0,
                distancePx: selection.distancePx,
                supportPixels: selection.supportPixels,
                unexplainedPixels: selection.unexplainedPixels
            }
        });
    }
    for (const phantom of evidence.phantomProposals) {
        additions.push({ xPx: phantom.xPx, yPx: phantom.yPx, provenance: phantom.provenance });
        const phantomBadge = badgeById.get(phantom.badgeId);
        if (phantomBadge) {
            ctx.overlay(UNIT_ID, {
                type: 'polyline',
                path: [
                    [phantomBadge.cxPx, phantomBadge.cyPx],
                    [phantom.xPx, phantom.yPx]
                ],
                verdict: 'accepted',
                visualRole: 'tee-badge-path',
                ref: `${FEATURE_ID}:ray:${encodeURIComponent(phantom.badgeId)}:hole-${phantom.hole}`,
                values: { hole: phantom.hole }
            });
        }
        ctx.overlay(UNIT_ID, {
            type: 'point',
            xPx: phantom.xPx,
            yPx: phantom.yPx,
            verdict: 'accepted',
            visualRole: 'phantom-center',
            ref: `${FEATURE_ID}:phantom:${encodeURIComponent(phantom.badgeId)}:hole-${phantom.hole}`,
            reason: phantom.provenance.note,
            values: { hole: phantom.hole }
        });
    }
    const recoveredTees = [...existing, ...additions];
    board.set('recoveredTees', recoveredTees);
    ctx.measure(UNIT_ID, 'posteriorRecoveredTeesPublished', additions.length);
    ctx.measure(UNIT_ID, 'posteriorRecoveredTeesRetired', retired);
    return { recoveredTees, supersededTeeIds };
}
/** Reattach the posterior's decisions to STABLE tee identity.
 *
 * `reassigned` is a full, independent rerun of `assignThreeFactor` over the
 * posterior's merged recoveredTees list. `assignThreeFactor` (and the
 * identical logic in exec/operations.ts's `assignment.pairs`) mints every
 * `tee-recovered-N` id by SORTED POSITION (y, x, provenance note) over
 * whichever recoveredTees array it is handed -- see assignment.ts's
 * `recoveredTee`. That numbering is only stable *within one call*: adding or
 * dropping any entry shifts the sorted index, and therefore the minted id,
 * of every OTHER recovered tee that sorts after it. c05521a's bug was
 * publishing `reassigned.tees` verbatim as the new `assignment.tees` --
 * silently renumbering tees for badges the posterior never reopened, so
 * frozen teeBadgeLock testimony (`tee-recovered-N`) started resolving to a
 * different physical tee for those badges (AlexClark H8/H10/H11 etc.).
 *
 * The fix: `preAssignment` (exactly what teeBadgeLock last saw) is the base
 * for every badge outside `evidence.targetBadgeIds` (C1) -- both its `tees`
 * and its `assignments` entries pass through with untouched identity. Only
 * `targets` (the posterior's actual candidate/phantom picks, C2) are pulled
 * from `reassigned`, matched back to `preAssignment.tees` by geometry so a
 * tee that already existed keeps its old id, and a genuinely new tee gets a
 * fresh id continuing past the highest existing `tee-recovered-N` index (the
 * scheme the receipt code already parses via `/tee-recovered-(\d+)$/`, so a
 * distinct namespace would need a second parser -- continuing the same
 * counter does not). `supersededTeeIds` drops the frozen recovered tees the
 * posterior is overruling from that base, mirroring what `recoveredTees`
 * (the RecoveredTeeInput board slot) already does.
 */
function commitPosteriorAssignments(preAssignment, reassigned, evidence, supersededTeeIds) {
    const targets = [
        ...(evidence.jointTop[0]?.selections ?? []).flatMap((selection) => selection.kind === 'candidate'
            ? [{ badgeId: selection.badgeId, xPx: selection.centerXPx, yPx: selection.centerYPx }]
            : []),
        ...evidence.phantomProposals.map((phantom) => ({
            badgeId: phantom.badgeId,
            xPx: phantom.xPx,
            yPx: phantom.yPx
        }))
    ];
    if (targets.length === 0) {
        return supersededTeeIds.size === 0
            ? preAssignment
            : { ...preAssignment, tees: preAssignment.tees.filter((tee) => !supersededTeeIds.has(tee.detId)) };
    }
    let nextNewIndex = Math.max(-1, ...preAssignment.tees.map((tee) => Number(/^tee-recovered-(\d+)$/.exec(tee.detId)?.[1] ?? -1))) + 1;
    const stableByGeometry = new Map(preAssignment.tees.map((tee) => [`${tee.xPx}:${tee.yPx}`, tee]));
    const newTees = [];
    const committed = [];
    const targetBadgeIds = new Set(targets.map((target) => target.badgeId));
    const committedTeeIds = new Set();
    for (const target of targets) {
        const reassignedTee = reassigned.tees.find((candidate) => Math.abs(candidate.xPx - target.xPx) <= 0.5 && Math.abs(candidate.yPx - target.yPx) <= 0.5);
        if (!reassignedTee)
            throw new Error(`posterior assignment: published tee missing for ${target.badgeId}`);
        const geometryKey = `${reassignedTee.xPx}:${reassignedTee.yPx}`;
        let stableTee = stableByGeometry.get(geometryKey);
        if (!stableTee) {
            stableTee = { ...reassignedTee, detId: `tee-recovered-${nextNewIndex++}` };
            stableByGeometry.set(geometryKey, stableTee);
            newTees.push(stableTee);
        }
        committedTeeIds.add(stableTee.detId);
        const ranked = reassigned.scoredPairs
            .filter((pair) => pair.raw.badgeId === target.badgeId && pair.raw.teeId === reassignedTee.detId)
            .sort((a, b) => b.score - a.score || a.raw.basketId.localeCompare(b.raw.basketId));
        const selected = ranked[0];
        if (!selected) {
            throw new Error(`posterior assignment: no routed pair carries ${target.badgeId} -> ${reassignedTee.detId}`);
        }
        committed.push({
            badgeId: target.badgeId,
            teeId: stableTee.detId,
            basketId: selected.raw.basketId,
            score: selected.score,
            rank: selected.rank,
            ownership: 'selected',
            alternatives: ranked.slice(1, 4).map((pair) => ({
                teeId: pair.raw.teeId,
                basketId: pair.raw.basketId,
                score: pair.score
            }))
        });
    }
    return {
        ...preAssignment,
        tees: [...preAssignment.tees.filter((tee) => !supersededTeeIds.has(tee.detId)), ...newTees],
        assignments: [
            ...preAssignment.assignments.filter((row) => !targetBadgeIds.has(row.badgeId) && !committedTeeIds.has(row.teeId)),
            ...committed
        ].sort((a, b) => a.badgeId.localeCompare(b.badgeId))
    };
}
function executePosteriorTeeRecovery(board, ctx) {
    const stop = ctx.span(UNIT_ID);
    const state = ctx.resolve(exports.posteriorTeeRecoveryFeature);
    const evidence = state.enabled
        ? inferPosterior(board, ctx, state.knobs)
        : disabledEvidence(false);
    if (state.enabled) {
        // Snapshot exactly what teeBadgeLock (and every frozen lock) last saw,
        // before this feature changes anything -- the base every untouched
        // badge is preserved from (C1; see commitPosteriorAssignments).
        const preAssignment = board.get('assignment');
        const { recoveredTees, supersededTeeIds } = publishRecoveredTees(board, ctx, evidence, board.get('badges'));
        const measurement = board.get('measurement');
        // Still a full recompute over the merged recoveredTees list -- routing
        // and scoring for the posterior's own picks need it -- but its ids are
        // used only to source geometry/scoring for reopened badges, never
        // published verbatim; see commitPosteriorAssignments for why.
        const reassigned = (0, assignment_1.assignThreeFactor)(measurement, recoveredTees, ctx.resolve(g5_zfit_1.zfitFeature).knobs, ctx.resolve(g4_scoring_1.g4ScoringFeature).knobs, ctx.resolve(g4_search_1.g4SearchFeature).knobs, ctx.resolve(g5_ribbon_1.g5RibbonFeature).knobs, ctx.resolve(g5_routing_1.g5RoutingFeature).knobs);
        const assignment = commitPosteriorAssignments(preAssignment, reassigned, evidence, supersededTeeIds);
        board.set('assignment', assignment);
        board.set('assignment.tees', assignment.tees);
        board.set('assignment.rawPairs', assignment.scoredPairs.map((pair) => pair.raw));
    }
    board.set(FEATURE_ID, evidence);
    ctx.measure(UNIT_ID, 'posteriorTargets', evidence.targetBadgeIds.length);
    ctx.measure(UNIT_ID, 'posteriorObservableCompletions', evidence.completions.observable);
    ctx.measure(UNIT_ID, 'posteriorPhantomCompletions', evidence.completions.phantom);
    ctx.measure(UNIT_ID, 'posteriorTotalCompletions', evidence.completions.total);
    ctx.measure(UNIT_ID, 'posteriorUnresolvedNulls', evidence.completions.unresolvedNulls);
    stop();
}
function artifacts(board) {
    const evidence = board.get(FEATURE_ID);
    return [
        {
            kind: 'measurementTable',
            id: 'posteriorTeeRecovery.evidence',
            bytes: new TextEncoder().encode(JSON.stringify(evidence))
        }
    ];
}
exports.posteriorTeeRecoveryOperation = {
    spec: {
        id: FEATURE_ID,
        kind: 'decide',
        gate: 'G4',
        unit: UNIT_ID,
        consumes: [
            'stage',
            'badges',
            'baskets',
            'tees',
            'sprites',
            'viewport',
            'measurement',
            'assignment',
            'teeBadgeLock',
            'recoveredTees'
        ],
        produces: [FEATURE_ID, 'recoveredTees', 'assignment', 'assignment.tees', 'assignment.rawPairs'],
        features: [FEATURE_ID],
        note: 'posterior reconciliation over the evidence-derived tee-recovery conflict island; commits each selected tee to its chosen badge'
    },
    run(board, ctx) {
        executePosteriorTeeRecovery(board, ctx);
    },
    extractArtifacts: artifacts
};
exports.posteriorTeeRecoveryFeature = {
    id: FEATURE_ID,
    gate: 'G4',
    kind: 'deviation',
    defaultEnabled: false,
    resolveOnlyWhenConfigured: true,
    note: 'Posterior tee recovery: jointly rank shard/NULL hypotheses using course-local evidence models, then publish the selected hypotheses as real recovered tees.',
    render: g4_posteriorTeeRecoveryReceipt_1.POSTERIOR_TEE_RECOVERY_RENDER,
    knobs: {
        observableToNullPriorOdds: {
            default: 17,
            note: 'Prior odds for some observable shard hypothesis versus NULL before candidate multiplicity; 17 is the spike prior of roughly one NULL slot per 18-hole card.',
            validate: (value) => finite(value) && value > 0 ? null : 'observableToNullPriorOdds must be > 0'
        },
        topKPerTarget: {
            default: 12,
            note: 'Maximum normalized target hypotheses admitted to exact joint conflict enumeration.',
            validate: (value) => Number.isInteger(value) && value >= 1 && value <= 32
                ? null
                : 'topKPerTarget must be an integer in [1,32]'
        },
        maxConflictTargets: {
            default: 4,
            note: 'Exact joint enumeration is intentionally limited to small ambiguity islands; larger islands abstain instead of approximating silently.',
            validate: (value) => Number.isInteger(value) && value >= 1 && value <= 6
                ? null
                : 'maxConflictTargets must be an integer in [1,6]'
        },
        supportLogWeight: {
            default: 2,
            note: 'Multiplier on log1p(visible supporting pixel count).',
            validate: (value) => finite(value) && value >= 0 ? null : 'supportLogWeight must be >= 0'
        },
        distanceTailWeight: {
            default: 2,
            note: 'Weight of the heavy-tailed course-local badge-distance likelihood.',
            validate: (value) => finite(value) && value >= 0 ? null : 'distanceTailWeight must be >= 0'
        },
        axisWeight: {
            default: 1,
            note: 'Weight of the course-local robust axis-error likelihood.',
            validate: (value) => (finite(value) && value >= 0 ? null : 'axisWeight must be >= 0')
        },
        distanceScaleFloorPx: {
            default: 1,
            note: 'Numerical floor for the per-image median/MAD tee-to-badge distance model.',
            validate: (value) => finite(value) && value > 0 ? null : 'distanceScaleFloorPx must be > 0'
        },
        axisScaleFloorDeg: {
            default: 0.5,
            note: 'Numerical floor for the per-image median/MAD axis-error model.',
            validate: (value) => finite(value) && value > 0 ? null : 'axisScaleFloorDeg must be > 0'
        },
        contradictionOddsPerPixel: {
            default: 0.5,
            note: 'Likelihood multiplier for each visible candidate pixel not explained by the fitted tee support; smooth evidence, not a hard disqualifier.',
            validate: (value) => finite(value) && value > 0 && value <= 1
                ? null
                : 'contradictionOddsPerPixel must be in (0,1]'
        }
    },
    operations: [exports.posteriorTeeRecoveryOperation]
};
//# sourceMappingURL=g4.posteriorTeeRecovery.js.map