/**
 * fg.s2.pxBaskets.materialize (stages/s2.json): px.baskets leaves every run
 * as inspectable artifacts serialized from the live board value,
 * cross-checked against the provider's own materializer
 * (materializeS2Subtraction over the captured S2 run). Layer integrity
 * against the S1 sets is computed from the same live board and recorded
 * through the shared stack ledger (fg/layers.mjs): the claimed basket set
 * must be disjoint from S1's owned set, the remaining-pixel arithmetic is
 * raster-recounted, and a basket sharing px only with a badge's 2-px mute
 * fringe (AlexClark: 3 px) is recorded as explainedByMuteOverlap instead of
 * failing.
 *
 * Inputs are Parts and registered Calculations only: px.baskets and
 * px.badges from the provider board, tk.stage.S2.captured (the S2 clean
 * gateway's own run result) for the family counts, and the provider
 * materializers fn.provider.S2.materializeSubtraction (inParts
 * tk.stage.S2.captured) and fn.provider.S1.materializeSubtractions (the S1
 * witness for the entering layer); px hashes through fn.tk.sha256.
 *
 * Ported from the inline block in ports/early/runEarly.mjs. Artifacts keep
 * their paths and layout (artifacts/s2/px.baskets.json, basketPx.rgba.bin,
 * remaining.rgba.bin); the record is published for the runner to attach as
 * stages[S2].materialization and materializations.S2, and (as every held
 * record) becomes the Part tk.fg.s2.pxBaskets.materialize.record, which
 * S3's stack ledger reads.
 */
import { defineGuarantee } from '../guarantee.mjs';
import { layerLedger, s1Sets } from '../layers.mjs';
import { legacyArtifact, legacyPlain, prettyJsonBytes, unionOf, viewBytes, zeroAlphaCount } from '../legacy.mjs';

const ID = 'fg.s2.pxBaskets.materialize';
const PART = 'px.baskets';
const PRODUCED_BY = 'Basket.findPx';
const CAPTURED = 'tk.stage.S2.captured';
const MATERIALIZER = 'fn.provider.S2.materializeSubtraction';
const S1_MATERIALIZER = 'fn.provider.S1.materializeSubtractions';
const SHA = 'fn.tk.sha256';

export default defineGuarantee({
  id: ID,
  guards: [PART],
  reads: [PART, 'px.badges', CAPTURED],
  calls: [MATERIALIZER, S1_MATERIALIZER, SHA],
  run(ctx) {
    const baskets = ctx.get(PART);
    const captured = ctx.get(CAPTURED);
    if (!Array.isArray(baskets) || !baskets.length) ctx.fail('px.baskets is missing or empty on the board after S2');
    if (!captured?.baskets || captured.baskets.length !== baskets.length) ctx.fail('captured S2 run baskets disagree with the board px.baskets');
    const pxSha = (px) => ctx.call(SHA, { bytes: viewBytes(px) });
    const serializedBaskets = baskets.map((basket, index) => {
      if (!basket.px || !basket.bbox) ctx.fail(`basket ${index} lacks px or bbox (opaque basket object)`);
      return {
        index, label: String(index + 1),
        bbox: [...basket.bbox],
        whitePx: basket.whitePx, blackPx: basket.blackPx,
        px: [...basket.px], pxCount: basket.px.length,
        pxSha256: pxSha(basket.px),
        findPx: { fn: basket.has.findPx.fn, body: legacyPlain(basket.has.findPx.body) },
        shell: { fn: basket.has.findShellFamily.fn, margins: legacyPlain(basket.has.findShellFamily.margins), blackPx: [...basket.has.findShellFamily.blackPx], blackPxCount: basket.has.findShellFamily.blackPx.length },
        detectFamily: { fn: basket.has.detectFamily.fn, body: legacyPlain(basket.has.detectFamily.body) }
      };
    });
    const claimed = unionOf(serializedBaskets.map((b) => b.px));
    const claimedVisits = serializedBaskets.reduce((n, b) => n + b.pxCount, 0);
    // Independent witness: the provider's own S2 materializer over the
    // captured run (not the board serialization above).
    const witness = ctx.call(MATERIALIZER);
    const { widthPx, heightPx } = witness;
    const serializerMatchesMaterializer = ctx.check('serializerMatchesMaterializer',
      witness.basketPx === claimed.size && witness.overlapPx === claimedVisits - claimed.size,
      { serialized: { basketPx: claimed.size, overlapPx: claimedVisits - claimed.size }, materializer: { basketPx: witness.basketPx, overlapPx: witness.overlapPx } });
    const witnessZeroed = zeroAlphaCount(witness.rgba);
    ctx.check('materializerRasterZeroesBasketPx', witnessZeroed === witness.basketPx, { zeroed: witnessZeroed, basketPx: witness.basketPx });
    ctx.check('materializerFrameBalances', witness.remainingOpaquePx === widthPx * heightPx - witness.basketPx,
      { remainingOpaquePx: witness.remainingOpaquePx, framePx: widthPx * heightPx, basketPx: witness.basketPx });

    // Layer integrity vs the S1 sets on this same live board.
    const badges = ctx.get('px.badges');
    if (!Array.isArray(badges) || !badges.length) ctx.fail('px.badges missing on the board; cannot judge the S2 layer against S1');
    const s1 = s1Sets(badges);
    const { ledger: layerIntegrity, remainingRgba, s1Consumed } = layerLedger({ width: widthPx, height: heightPx, rgba: captured.image.rgba, s1, priors: [], claimed, claimedVisits });
    ctx.check('layerLedgerHolds', layerIntegrity.rasterRecountHolds || layerIntegrity.explainedByMuteOverlap, {
      rasterRecount: layerIntegrity.rasterRecount, setArithmetic: { remainingEnteringPx: layerIntegrity.remainingEnteringPx, remainingLeavingPx: layerIntegrity.setArithmeticLeavingPx ?? layerIntegrity.remainingLeavingPx },
      intersections: layerIntegrity.intersections, muteFringeOverlapPx: layerIntegrity.muteFringeOverlapPx
    });
    // S1 witness agreement for the entering layer (same run, same board).
    const s1Witness = ctx.call(S1_MATERIALIZER);
    layerIntegrity.s1WitnessRemainingAfterMutedPx = s1Witness.muted.remainingOpaquePx;
    layerIntegrity.s1WitnessAgrees = s1Witness.muted.remainingOpaquePx === layerIntegrity.framePx - s1Consumed.size;

    const totals = { claimedPx: claimed.size, claimedVisits, overlapWithinLayerPx: claimedVisits - claimed.size };
    const witnessSummary = { basketPx: witness.basketPx, overlapPx: witness.overlapPx, remainingOpaquePx: witness.remainingOpaquePx };
    const basketSetArtifact = {
      schema: 'nctk-s2-baskets-artifact@1', part: PART, producedBy: PRODUCED_BY,
      guarantee: ID, basketCount: serializedBaskets.length,
      note: 'Baskets carry no engine label; label is the 1-based order used by the pinned S2 contract receipt.',
      image: { widthPx, heightPx },
      totals, witness: witnessSummary, layerIntegrity,
      baskets: serializedBaskets
    };
    const dims = { width: widthPx, height: heightPx };
    const setEntry = ctx.artifact('px.baskets', 'basket-set-json', prettyJsonBytes(basketSetArtifact), undefined, { path: 's2/px.baskets.json' });
    const basketPxEntry = ctx.artifact('s2.basketPx.rgba', 'rgba', witness.rgba, dims, { path: 's2/basketPx.rgba.bin' });
    const remainingEntry = ctx.artifact('s2.remaining.rgba', 'rgba', remainingRgba, dims, { path: 's2/remaining.rgba.bin' });
    const entries = [setEntry, basketPxEntry, remainingEntry];
    const objects = ctx.check('objects', serializedBaskets.every((b) => Array.isArray(b.bbox) && b.bbox.length === 4));
    const px = ctx.check('px', serializedBaskets.every((b) => Array.isArray(b.px) && b.pxCount === b.px.length && b.pxCount > 0));
    const artifactsRehashedAfterWrite = ctx.check('artifactsRehashedAfterWrite', entries.every((e) => e.rehashed));

    const fringe = [...claimed].filter((p) => s1.muted.has(p) && !s1.owned.has(p));
    ctx.frame({
      title: `px.baskets: ${serializedBaskets.length} baskets, ${claimed.size} px claimed`, calculation: PRODUCED_BY,
      parts: [
        { address: PART, kind: 'pxset', artifact: setEntry, data: { width: widthPx, height: heightPx, px: [...claimed].sort((a, b) => a - b) } },
        { address: `${PART}#bbox`, kind: 'bbox', data: { boxes: serializedBaskets.map((b) => [...b.bbox, b.label]) } },
        { address: `${PART}#ledger`, kind: 'ledger', data: { rows: serializedBaskets.map((b) => ({ index: b.index, label: b.label, bbox: b.bbox.join(','), pxCount: b.pxCount, whitePx: b.whitePx, blackPx: b.blackPx, shellBlackPx: b.shell.blackPxCount })) } }
      ],
      verdicts: serializedBaskets.map((b) => ({ name: `basket ${b.label}: ${b.pxCount} px`, ok: b.pxCount > 0 && b.bbox.length === 4 }))
    });
    ctx.frame({
      title: `S2 layer ledger: ${layerIntegrity.remainingEnteringPx} px entering, ${layerIntegrity.remainingLeavingPx} leaving${layerIntegrity.explainedByMuteOverlap ? ` (${fringe.length} px shared with S1 mute fringe)` : ''}`,
      calculation: 'materializeS2Subtraction',
      parts: [
        { address: 's2.muteFringeOverlap', kind: 'pxset', data: { width: widthPx, height: heightPx, px: fringe } },
        { address: 's2.basketPx.rgba', kind: 'raster', artifact: basketPxEntry },
        { address: 's2.remaining.rgba', kind: 'raster', artifact: remainingEntry },
        { address: 's2.layerIntegrity', kind: 'ledger', data: { rows: [{ ...layerIntegrity, intersections: JSON.stringify(layerIntegrity.intersections), rasterRecount: JSON.stringify(layerIntegrity.rasterRecount) }] } }
      ],
      verdicts: [
        { name: 'set arithmetic balances', ok: layerIntegrity.balanceHolds },
        { name: 'raster recount agrees with set arithmetic', ok: layerIntegrity.rasterRecountHolds },
        { name: `disagreement explained by ${layerIntegrity.muteFringeOverlapPx} px of S1 mute fringe`, ok: layerIntegrity.rasterRecountHolds || layerIntegrity.explainedByMuteOverlap },
        { name: 'S1 witness agrees on the entering layer', ok: layerIntegrity.s1WitnessAgrees }
      ]
    });

    const record = {
      guarantee: ID, part: PART, producedBy: PRODUCED_BY,
      basketCount: serializedBaskets.length,
      familyCount: captured.family.members.length,
      shellMemberCount: captured.shellFamily.members.length,
      totals, witness: witnessSummary, layerIntegrity,
      checks: { objects, px, serializerMatchesMaterializer, artifactsRehashedAfterWrite },
      artifacts: [legacyArtifact(setEntry), legacyArtifact(basketPxEntry, dims), legacyArtifact(remainingEntry, dims)]
    };
    ctx.publish('stages.S2.materialization', record);
    ctx.publish('materializations.S2', record);
    return { totals, basketCount: serializedBaskets.length, layerIntegrity, producedBy: PRODUCED_BY };
  }
});
