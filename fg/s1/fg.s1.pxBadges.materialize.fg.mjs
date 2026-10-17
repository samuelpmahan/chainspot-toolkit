/**
 * fg.s1.pxBadges.materialize (stages/s1.json): px.badges leaves every run as
 * inspectable artifacts serialized from the live board value, witnessed by
 * the provider's own materializer (materializeS1Subtractions over the
 * captured S1 run), whose two subtraction rasters must recount exactly the
 * owned and muted sets (conserved:raster). An opaque or mismatched
 * px.badges fails the run; it never passes silently.
 *
 * A composition of properties (fg/mixins.mjs); the specific remainder is
 * the badge serializer and the artifact/frame layouts. Artifacts keep their
 * bytes (artifacts/s1/px.badges.json, badgePx.rgba.bin, muted.rgba.bin);
 * the record is published at stages[S1].materialization / materializations.S1.
 */
import { guarantee, pipe, read, step } from '../compose.mjs';
import { conserved, framed, materialized, objectsFrame, published, unitful, witnessed } from '../mixins.mjs';
import { legacyPlain, unionOf } from '../legacy.mjs';

const ID = 'fg.s1.pxBadges.materialize';
const PART = 'px.badges';
const PRODUCED_BY = 'Badge.findPx';
const CAPTURED = 'tk.stage.S1.captured';
const MATERIALIZER = 'fn.provider.S1.materializeSubtractions';
const UNITS = { confidence: 'fraction (reader confidence)', radiusPx: 'px' };

const serialize = step('serialize px.badges', (env, s) => {
  const badges = s.parts[PART];
  const captured = s.parts[CAPTURED];
  if (!Array.isArray(badges) || !badges.length) env.fail('px.badges is missing or empty on the board after S1');
  if (!captured?.badges || captured.badges.length !== badges.length) env.fail('captured S1 run badges disagree with the board px.badges');
  const serialized = badges.map((badge, index) => {
    if (!badge.px || !badge.has?.mute?.px) env.fail(`badge ${index} lacks px or has.mute.px (opaque badge object)`);
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
  const totals = {
    badgePx: unionOf(serialized.map((b) => b.px)).size,
    whitePx: serialized.reduce((n, b) => n + b.whitePx, 0),
    blackPx: serialized.reduce((n, b) => n + b.blackPx, 0),
    mutedPx: unionOf(serialized.map((b) => b.mute.px)).size,
    addedMutePx: 0
  };
  totals.addedMutePx = totals.mutedPx - totals.badgePx;
  return { serialized, totals };
});

const witness = witnessed.provider(MATERIALIZER, {
  name: 'serializerMatchesMaterializer', as: 'materializer',
  run: (call, s) => {
    const m = call();
    const serialized = { badgePx: s.totals.badgePx, mutedPx: s.totals.mutedPx, addedMutePx: s.totals.addedMutePx };
    const materializer = { badgePx: m.badgePx.badgePx, mutedPx: m.muted.mutedPx, addedMutePx: m.muted.addedMutePx };
    return { ok: serialized.badgePx === materializer.badgePx && serialized.mutedPx === materializer.mutedPx && serialized.addedMutePx === materializer.addedMutePx, serialized, materializer };
  }
});

const rasters = step('check the subtraction rasters', (env, s) => {
  const m = s.provided.materializer;
  const { widthPx, heightPx } = m.badgePx;
  for (const [name, raster] of [['badgePx', m.badgePx], ['muted', m.muted]])
    if (raster.rgba.length !== widthPx * heightPx * 4) env.fail(`${name} subtraction raster has ${raster.rgba.length} bytes, expected ${widthPx * heightPx * 4}`);
  return { dims: { width: widthPx, height: heightPx } };
});

// New with the port: the provider's rasters are recounted like S2's and S3's
// (before, S1 only checked their byte length).
const rasterRecount = conserved.raster({
  name: 'materializerRastersZeroOwnedAndMuted',
  rasters: (s) => [{ rgba: s.provided.materializer.badgePx.rgba, px: s.provided.materializer.badgePx.badgePx }, { rgba: s.provided.materializer.muted.rgba, px: s.provided.materializer.muted.mutedPx }],
  balance: (s) => { const m = s.provided.materializer.muted; return { name: 'materializerFrameBalances', remainingOpaquePx: m.remainingOpaquePx, framePx: s.dims.width * s.dims.height, px: m.mutedPx }; }
});

const assemble = step('assemble px.badges artifact', (env, s) => {
  const m = s.provided.materializer;
  env.check('objects', s.serialized.every((b) => b.bbox !== null && b.source !== null));
  env.check('px', s.serialized.every((b) => Array.isArray(b.px) && b.pxCount === b.px.length && b.pxCount > 0));
  env.check('muted', s.serialized.every((b) => Array.isArray(b.mute.px) && b.mute.pxCount === b.mute.px.length && b.mute.pxCount >= b.pxCount));
  return {
    setArtifact: {
      schema: 'nctk-s1-badges-artifact@1', part: PART, producedBy: PRODUCED_BY,
      guarantee: ID, badgeCount: s.serialized.length,
      image: { widthPx: s.dims.width, heightPx: s.dims.height }, totals: s.totals,
      subtractions: {
        badgePx: { badgePx: m.badgePx.badgePx, mutedPx: m.badgePx.mutedPx, overlapPx: m.badgePx.overlapPx, remainingOpaquePx: m.badgePx.remainingOpaquePx },
        muted: { badgePx: m.muted.badgePx, mutedPx: m.muted.mutedPx, addedMutePx: m.muted.addedMutePx, overlapPx: m.muted.overlapPx, remainingOpaquePx: m.muted.remainingOpaquePx }
      },
      badges: s.serialized
    }
  };
});

const artifacts = materialized({
  artifacts: (s) => [
    { id: 'px.badges', kind: 'badge-set-json', path: 's1/px.badges.json', json: s.setArtifact },
    { id: 's1.badgePx.rgba', kind: 'rgba', path: 's1/badgePx.rgba.bin', bytes: s.provided.materializer.badgePx.rgba, dims: s.dims },
    { id: 's1.muted.rgba', kind: 'rgba', path: 's1/muted.rgba.bin', bytes: s.provided.materializer.muted.rgba, dims: s.dims }
  ]
});

const frames = framed((s) => [
  objectsFrame({
    title: `px.badges: ${s.serialized.length} badges, ${s.totals.badgePx} px owned`, calculation: PRODUCED_BY,
    address: PART, artifact: s.entries['px.badges'], objects: s.serialized,
    box: (b) => (b.bbox ? [...b.bbox, b.label ?? `#${b.index}`] : null),
    row: (b) => ({ index: b.index, label: b.label, pxCount: b.pxCount, whitePx: b.whitePx, blackPx: b.blackPx, mutePx: b.mute.pxCount, confidence: b.confidence }),
    verdict: (b) => ({ name: `badge ${b.label ?? `#${b.index}`}`, ok: b.pxCount > 0 && b.mute.pxCount >= b.pxCount })
  }),
  {
    title: `S1 subtractions: ${s.totals.mutedPx} px muted (${s.totals.addedMutePx} beyond owned)`, calculation: 'materializeS1Subtractions',
    parts: [
      { address: 's1.badgePx.rgba', kind: 'raster', artifact: s.entries['s1.badgePx.rgba'] },
      { address: 's1.muted.rgba', kind: 'raster', artifact: s.entries['s1.muted.rgba'] },
      { address: 's1.totals', kind: 'ledger', data: { rows: [s.totals] } }
    ]
  }
]);

export default guarantee({
  id: ID, guards: [PART], audit: [unitful({ units: UNITS })],
  result: (s) => ({ totals: s.totals, badgeCount: s.serialized.length, producedBy: PRODUCED_BY })
}, pipe(read(PART, CAPTURED),
  serialize, witness, rasters, rasterRecount, assemble, artifacts, frames,
  published({
    stage: 'S1', key: 'materialization', materialization: 'S1',
    header: () => ({ part: PART, producedBy: PRODUCED_BY }),
    body: (s) => ({ badgeCount: s.serialized.length, totals: s.totals })
  })));
