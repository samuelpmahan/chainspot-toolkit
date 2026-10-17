/**
 * fg.s1.pxBadges.materialize (stages/s1.json): px.badges leaves every run as
 * inspectable artifacts serialized from the live board value, cross-checked
 * against the provider's own materializer (materializeS1Subtractions). An
 * opaque or mismatched px.badges fails the run; it never passes silently.
 *
 * Ported from the inline block in ports/early/runEarly.mjs with byte-
 * identical artifacts (artifacts/s1/px.badges.json, badgePx.rgba.bin,
 * muted.rgba.bin) and a byte-identical stage record, which it publishes
 * for the runner to attach as stages[S1].materialization and
 * materializations.S1.
 */
import { defineGuarantee } from '../guarantee.mjs';
import { legacyArtifact, legacyPlain, prettyJsonBytes, unionOf } from './legacy.mjs';

const ID = 'fg.s1.pxBadges.materialize';
const PART = 'px.badges';
const PRODUCED_BY = 'Badge.findPx';

export default defineGuarantee({
  id: ID,
  guards: [PART],
  env: ['dist', 'captured'],
  run(ctx) {
    const { dist, captured } = ctx.env;
    const { materializeS1Subtractions } = dist('stages/S1/clean/index');
    const badges = ctx.board.get(PART);
    if (!Array.isArray(badges) || !badges.length) ctx.fail('px.badges is missing or empty on the board after S1');
    if (!captured.S1?.badges || captured.S1.badges.length !== badges.length) ctx.fail('captured S1 run badges disagree with the board px.badges');
    const serializedBadges = badges.map((badge, index) => {
      if (!badge.px || !badge.has?.mute?.px) ctx.fail(`badge ${index} lacks px or has.mute.px (opaque badge object)`);
      return {
        index, label: badge.label ?? null, rawLabel: badge.rawLabel ?? null, source: badge.source ?? null,
        bbox: badge.bbox ? [...badge.bbox] : null, confidence: badge.confidence ?? null,
        abstentionReason: badge.abstentionReason ?? null, note: badge.note ?? null,
        whitePx: badge.whitePx, blackPx: badge.blackPx,
        px: [...badge.px], pxCount: badge.px.length,
        findPx: { fn: badge.has.findPx.fn, parts: legacyPlain(badge.has.findPx.parts) },
        mute: { fn: badge.has.mute.fn, radiusPx: badge.has.mute.radiusPx, px: [...badge.has.mute.px], pxCount: badge.has.mute.px.length }
      };
    });
    const subtractions = materializeS1Subtractions(captured.S1);
    const totals = {
      badgePx: unionOf(serializedBadges.map((b) => b.px)).size,
      whitePx: serializedBadges.reduce((n, b) => n + b.whitePx, 0),
      blackPx: serializedBadges.reduce((n, b) => n + b.blackPx, 0),
      mutedPx: unionOf(serializedBadges.map((b) => b.mute.px)).size,
      addedMutePx: 0
    };
    totals.addedMutePx = totals.mutedPx - totals.badgePx;
    const serializerMatchesMaterializer = ctx.check('serializerMatchesMaterializer',
      totals.badgePx === subtractions.badgePx.badgePx && totals.mutedPx === subtractions.muted.mutedPx && totals.addedMutePx === subtractions.muted.addedMutePx,
      { serialized: { badgePx: totals.badgePx, mutedPx: totals.mutedPx, addedMutePx: totals.addedMutePx },
        materializer: { badgePx: subtractions.badgePx.badgePx, mutedPx: subtractions.muted.mutedPx, addedMutePx: subtractions.muted.addedMutePx } });
    const { widthPx, heightPx } = subtractions.badgePx;
    for (const [name, raster] of [['badgePx', subtractions.badgePx], ['muted', subtractions.muted]])
      if (raster.rgba.length !== widthPx * heightPx * 4) ctx.fail(`${name} subtraction raster has ${raster.rgba.length} bytes, expected ${widthPx * heightPx * 4}`);
    const badgeSetArtifact = {
      schema: 'nctk-s1-badges-artifact@1', part: PART, producedBy: PRODUCED_BY,
      guarantee: ID, badgeCount: serializedBadges.length,
      image: { widthPx, heightPx }, totals,
      subtractions: {
        badgePx: { badgePx: subtractions.badgePx.badgePx, mutedPx: subtractions.badgePx.mutedPx, overlapPx: subtractions.badgePx.overlapPx, remainingOpaquePx: subtractions.badgePx.remainingOpaquePx },
        muted: { badgePx: subtractions.muted.badgePx, mutedPx: subtractions.muted.mutedPx, addedMutePx: subtractions.muted.addedMutePx, overlapPx: subtractions.muted.overlapPx, remainingOpaquePx: subtractions.muted.remainingOpaquePx }
      },
      badges: serializedBadges
    };
    const dims = { width: widthPx, height: heightPx };
    const setEntry = ctx.artifact('px.badges', 'badge-set-json', prettyJsonBytes(badgeSetArtifact), undefined, { path: 's1/px.badges.json' });
    const badgePxEntry = ctx.artifact('s1.badgePx.rgba', 'rgba', subtractions.badgePx.rgba, dims, { path: 's1/badgePx.rgba.bin' });
    const mutedEntry = ctx.artifact('s1.muted.rgba', 'rgba', subtractions.muted.rgba, dims, { path: 's1/muted.rgba.bin' });
    const entries = [setEntry, badgePxEntry, mutedEntry];
    const objects = ctx.check('objects', serializedBadges.every((b) => b.bbox !== null && b.source !== null));
    const px = ctx.check('px', serializedBadges.every((b) => Array.isArray(b.px) && b.pxCount === b.px.length && b.pxCount > 0));
    const muted = ctx.check('muted', serializedBadges.every((b) => Array.isArray(b.mute.px) && b.mute.pxCount === b.mute.px.length && b.mute.pxCount >= b.pxCount));
    const artifactsRehashedAfterWrite = ctx.check('artifactsRehashedAfterWrite', entries.every((e) => e.rehashed));

    ctx.frame({
      title: `px.badges: ${serializedBadges.length} badges, ${totals.badgePx} px owned`, calculation: PRODUCED_BY,
      parts: [
        { address: PART, kind: 'pxset', artifact: setEntry },
        { address: `${PART}#bbox`, kind: 'bbox', data: { boxes: serializedBadges.filter((b) => b.bbox).map((b) => [...b.bbox, b.label ?? `#${b.index}`]) } },
        { address: `${PART}#ledger`, kind: 'ledger', data: { rows: serializedBadges.map((b) => ({ index: b.index, label: b.label, pxCount: b.pxCount, whitePx: b.whitePx, blackPx: b.blackPx, mutePx: b.mute.pxCount, confidence: b.confidence })) } }
      ],
      verdicts: serializedBadges.map((b) => ({ name: `badge ${b.label ?? `#${b.index}`}`, ok: b.pxCount > 0 && b.mute.pxCount >= b.pxCount }))
    });
    ctx.frame({
      title: `S1 subtractions: ${totals.mutedPx} px muted (${totals.addedMutePx} beyond owned)`, calculation: 'materializeS1Subtractions',
      parts: [
        { address: 's1.badgePx.rgba', kind: 'raster', artifact: badgePxEntry },
        { address: 's1.muted.rgba', kind: 'raster', artifact: mutedEntry },
        { address: 's1.totals', kind: 'ledger', data: { rows: [totals] } }
      ]
    });

    const record = {
      guarantee: ID, part: PART, producedBy: PRODUCED_BY,
      badgeCount: serializedBadges.length, totals,
      checks: { objects, px, muted, serializerMatchesMaterializer, artifactsRehashedAfterWrite },
      artifacts: [legacyArtifact(setEntry), legacyArtifact(badgePxEntry, dims), legacyArtifact(mutedEntry, dims)]
    };
    ctx.publish('stages.S1.materialization', record);
    ctx.publish('materializations.S1', record);
    return { totals, badgeCount: serializedBadges.length, producedBy: PRODUCED_BY };
  }
});
