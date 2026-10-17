/**
 * fg.s3.pxTees.materialize (stages/s3.json): px.tees leaves every run as
 * inspectable artifacts serialized from the live board value, witnessed by
 * the provider's own materializer (materializeS3Subtraction over the
 * captured S3 run). Full-stack layer integrity against every prior layer
 * (S1 owned + muted, S2 claimed) goes through the shared stack ledger
 * (fg/layers.mjs), raster-recounted, with the mute-fringe overlap recorded
 * as explainedByMuteOverlap rather than failed; what S2 recorded as
 * leaving must be what S3 finds entering.
 *
 * Inputs are Parts and registered Calculations only: px.tees, px.badges,
 * px.baskets from the provider board; tk.stage.S3.captured (plan
 * fingerprint, canonical raster); tk.fg.s2.pxBaskets.materialize.record,
 * the S2 materialization FG's record as a Part (an earlier stage's record
 * crosses the stage boundary through the store, not through requires,
 * which is within-stage); fn.provider.S3.materializeSubtraction,
 * fn.provider.S1.materializeSubtractions, fn.tk.sha256.
 *
 * Ported from runEarly.mjs; artifacts artifacts/s3/px.tees.json,
 * teePx.rgba.bin, remaining.rgba.bin; record stages[S3].materialization /
 * materializations.S3.
 */
import { defineGuarantee } from '../guarantee.mjs';
import { layerLedger, s1Sets } from '../layers.mjs';
import { legacyArtifact, prettyJsonBytes, unionOf, viewBytes, zeroAlphaCount } from '../legacy.mjs';
import { serializeTee } from './serialize.mjs';

const ID = 'fg.s3.pxTees.materialize';
const PART = 'px.tees';
const PRODUCED_BY = 'Tee.findPx';
const CAPTURED = 'tk.stage.S3.captured';
const S2_RECORD = 'tk.fg.s2.pxBaskets.materialize.record';
const MATERIALIZER = 'fn.provider.S3.materializeSubtraction';
const S1_MATERIALIZER = 'fn.provider.S1.materializeSubtractions';
const SHA = 'fn.tk.sha256';

export default defineGuarantee({
  id: ID,
  guards: [PART],
  reads: [PART, 'px.badges', 'px.baskets', CAPTURED, S2_RECORD],
  calls: [MATERIALIZER, S1_MATERIALIZER, SHA],
  run(ctx) {
    const tees = ctx.get(PART);
    const captured = ctx.get(CAPTURED);
    if (!Array.isArray(tees) || !tees.length) ctx.fail('px.tees is missing or empty on the board after S3');
    if (!captured?.tees || captured.tees.length !== tees.length) ctx.fail('captured S3 run tees disagree with the board px.tees');
    const pxSha = (px) => ctx.call(SHA, { bytes: viewBytes(px) });
    const serializedTees = tees.map((tee, index) => {
      if (!tee.px || !tee.bbox) ctx.fail(`tee ${index} lacks px or bbox (opaque tee object)`);
      return serializeTee(tee, index, pxSha);
    });
    const claimed = unionOf(serializedTees.map((t) => t.px));
    const claimedVisits = serializedTees.reduce((n, t) => n + t.pxCount, 0);
    const witness = ctx.call(MATERIALIZER);
    const { widthPx, heightPx } = witness;
    const serializerMatchesMaterializer = ctx.check('serializerMatchesMaterializer',
      witness.teePx === claimed.size && witness.overlapPx === claimedVisits - claimed.size,
      { serialized: { teePx: claimed.size, overlapPx: claimedVisits - claimed.size }, materializer: { teePx: witness.teePx, overlapPx: witness.overlapPx } });
    const witnessZeroed = zeroAlphaCount(witness.rgba);
    ctx.check('materializerRasterZeroesTeePx', witnessZeroed === witness.teePx, { zeroed: witnessZeroed, teePx: witness.teePx });
    ctx.check('materializerFrameBalances', witness.remainingOpaquePx === widthPx * heightPx - witness.teePx,
      { remainingOpaquePx: witness.remainingOpaquePx, framePx: widthPx * heightPx, teePx: witness.teePx });

    // Full-stack layer integrity vs every prior layer on this same live board.
    const badges = ctx.get('px.badges');
    const baskets = ctx.get('px.baskets');
    if (!Array.isArray(badges) || !badges.length) ctx.fail('px.badges missing on the board; cannot judge the S3 layer against S1');
    if (!Array.isArray(baskets) || !baskets.length) ctx.fail('px.baskets missing on the board; cannot judge the S3 layer against S2');
    const s1 = s1Sets(badges);
    const s2Claimed = unionOf(baskets.map((b) => b.px));
    const { ledger: layerIntegrity, remainingRgba, s1Consumed } = layerLedger({
      width: widthPx, height: heightPx, rgba: captured.image.rgba, s1, priors: [{ name: 'S2Claimed', set: s2Claimed }], claimed, claimedVisits
    });
    // Stack agreement with the S2 FG's own recorded leaving figure (same
    // run, same board): what S2 said was left must be what S3 found.
    const s2Leaving = ctx.get(S2_RECORD).layerIntegrity.remainingLeavingPx;
    layerIntegrity.s2RecordedRemainingLeavingPx = s2Leaving;
    layerIntegrity.stackAgreesWithS2Record = s2Leaving === layerIntegrity.remainingEnteringPx;
    ctx.check('stackAgreesWithS2Record', layerIntegrity.stackAgreesWithS2Record,
      { s3RemainingEnteringPx: layerIntegrity.remainingEnteringPx, s2RecordedRemainingLeavingPx: s2Leaving });
    ctx.check('layerLedgerHolds', layerIntegrity.rasterRecountHolds || layerIntegrity.explainedByMuteOverlap, {
      rasterRecount: layerIntegrity.rasterRecount, setArithmetic: { remainingEnteringPx: layerIntegrity.remainingEnteringPx, remainingLeavingPx: layerIntegrity.setArithmeticLeavingPx ?? layerIntegrity.remainingLeavingPx },
      intersections: layerIntegrity.intersections, muteFringeOverlapPx: layerIntegrity.muteFringeOverlapPx
    });
    // S1 witness agreement for the bottom of the stack (same run, same board).
    const s1Witness = ctx.call(S1_MATERIALIZER);
    layerIntegrity.s1WitnessRemainingAfterMutedPx = s1Witness.muted.remainingOpaquePx;
    layerIntegrity.s1WitnessAgrees = s1Witness.muted.remainingOpaquePx === layerIntegrity.framePx - s1Consumed.size;
    ctx.check('s1WitnessAgrees', layerIntegrity.s1WitnessAgrees,
      { s1WitnessRemainingAfterMutedPx: s1Witness.muted.remainingOpaquePx, stackFramePxMinusS1Consumed: layerIntegrity.framePx - s1Consumed.size });

    const planFingerprint = captured.plan.planFingerprint;
    const totals = { claimedPx: claimed.size, claimedVisits, overlapWithinLayerPx: claimedVisits - claimed.size };
    const witnessSummary = { teePx: witness.teePx, overlapPx: witness.overlapPx, remainingOpaquePx: witness.remainingOpaquePx };
    const teeSetArtifact = {
      schema: 'nctk-s3-tees-artifact@1', part: PART, producedBy: PRODUCED_BY,
      guarantee: ID, teeCount: serializedTees.length,
      note: 'Tees carry no engine label; label is the 1-based order used by the pinned S3 contract receipt.',
      planFingerprint,
      image: { widthPx, heightPx },
      totals, witness: witnessSummary, layerIntegrity,
      tees: serializedTees
    };
    const dims = { width: widthPx, height: heightPx };
    const setEntry = ctx.artifact('px.tees', 'tee-set-json', prettyJsonBytes(teeSetArtifact), undefined, { path: 's3/px.tees.json' });
    const teePxEntry = ctx.artifact('s3.teePx.rgba', 'rgba', witness.rgba, dims, { path: 's3/teePx.rgba.bin' });
    const remainingEntry = ctx.artifact('s3.remaining.rgba', 'rgba', remainingRgba, dims, { path: 's3/remaining.rgba.bin' });
    const entries = [setEntry, teePxEntry, remainingEntry];
    const objects = ctx.check('objects', serializedTees.every((t) => Array.isArray(t.bbox) && t.bbox.length === 4 && Array.isArray(t.innerBbox) && t.innerBbox.length === 4));
    const px = ctx.check('px', serializedTees.every((t) => Array.isArray(t.px) && t.pxCount === t.px.length && t.pxCount > 0));
    const artifactsRehashedAfterWrite = ctx.check('artifactsRehashedAfterWrite', entries.every((e) => e.rehashed));

    const fringe = [...claimed].filter((p) => s1.muted.has(p) && !s1.owned.has(p));
    ctx.frame({
      title: `px.tees: ${serializedTees.length} tees, ${claimed.size} px claimed`, calculation: PRODUCED_BY,
      parts: [
        { address: PART, kind: 'pxset', artifact: setEntry, data: { width: widthPx, height: heightPx, px: [...claimed].sort((a, b) => a - b) } },
        { address: `${PART}#bbox`, kind: 'bbox', data: { boxes: serializedTees.map((t) => [...t.bbox, t.label]) } },
        { address: `${PART}#center`, kind: 'points', data: { points: serializedTees.map((t) => [...t.center, t.label]) } },
        { address: `${PART}#ledger`, kind: 'ledger', data: { rows: serializedTees.map((t) => ({ index: t.index, label: t.label, center: t.center.map((v) => v.toFixed(1)).join(','), bbox: t.bbox.join(','), angleRad: t.angleRad, pxCount: t.pxCount })) } }
      ],
      verdicts: serializedTees.map((t) => ({ name: `tee ${t.label}: ${t.pxCount} px`, ok: t.pxCount > 0 }))
    });
    ctx.frame({
      title: `S3 stack ledger: ${layerIntegrity.remainingEnteringPx} px entering (S2 recorded ${s2Leaving}), ${layerIntegrity.remainingLeavingPx} leaving`,
      calculation: 'materializeS3Subtraction',
      parts: [
        { address: 's3.muteFringeOverlap', kind: 'pxset', data: { width: widthPx, height: heightPx, px: fringe } },
        { address: 's3.teePx.rgba', kind: 'raster', artifact: teePxEntry },
        { address: 's3.remaining.rgba', kind: 'raster', artifact: remainingEntry },
        { address: 's3.layerIntegrity', kind: 'ledger', data: { rows: [{ ...layerIntegrity, intersections: JSON.stringify(layerIntegrity.intersections), rasterRecount: JSON.stringify(layerIntegrity.rasterRecount) }] } }
      ],
      verdicts: [
        { name: 'set arithmetic balances', ok: layerIntegrity.balanceHolds },
        { name: 'stack agrees with the S2 record', ok: layerIntegrity.stackAgreesWithS2Record },
        { name: 'raster recount agrees with set arithmetic', ok: layerIntegrity.rasterRecountHolds },
        { name: `disagreement explained by ${layerIntegrity.muteFringeOverlapPx} px of S1 mute fringe`, ok: layerIntegrity.rasterRecountHolds || layerIntegrity.explainedByMuteOverlap },
        { name: 'S1 witness agrees on the bottom of the stack', ok: layerIntegrity.s1WitnessAgrees }
      ]
    });

    const record = {
      guarantee: ID, part: PART, producedBy: PRODUCED_BY,
      teeCount: serializedTees.length, planFingerprint,
      totals, witness: witnessSummary, layerIntegrity,
      checks: { objects, px, serializerMatchesMaterializer, artifactsRehashedAfterWrite },
      artifacts: [legacyArtifact(setEntry), legacyArtifact(teePxEntry, dims), legacyArtifact(remainingEntry, dims)]
    };
    ctx.publish('stages.S3.materialization', record);
    ctx.publish('materializations.S3', record);
    return { totals, teeCount: serializedTees.length, layerIntegrity, producedBy: PRODUCED_BY };
  }
});
