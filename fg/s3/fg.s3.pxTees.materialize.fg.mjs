/**
 * fg.s3.pxTees.materialize (stages/s3.json): px.tees leaves every run as
 * inspectable artifacts serialized from the live board value, witnessed by
 * the provider's own materializer (materializeS3Subtraction over the
 * captured S3 run). Full-stack layer integrity against every prior layer
 * (S1 owned + muted, S2 claimed) goes through the shared stack ledger
 * (conserved:S3), raster-recounted, with the mute-fringe overlap recorded
 * as explainedByMuteOverlap rather than failed; what the S2 FG's record
 * (the Part tk.fg.s2.pxBaskets.materialize.record) says was leaving must
 * be what S3 finds entering.
 *
 * A composition of properties (fg/mixins.mjs); the specific remainder is
 * the tee serializer (fg/s3/serialize.mjs) and the artifact/frame layouts.
 * Artifacts artifacts/s3/px.tees.json, teePx.rgba.bin, remaining.rgba.bin
 * (bytes unchanged); record stages[S3].materialization / materializations.S3.
 */
import { step } from '../compose.mjs';
import { materializeGuarantee } from '../skeletons.mjs';
import { conserved, framed, materialized, objectsFrame, witnessed } from '../mixins.mjs';
import { unionOf, viewBytes } from '../legacy.mjs';
import { serializeTee } from './serialize.mjs';

const ID = 'fg.s3.pxTees.materialize';
const PART = 'px.tees';
const PRODUCED_BY = 'Tee.findPx';
const MATERIALIZER = 'fn.provider.S3.materializeSubtraction';
const UNITS = {};

const serialize = (env, s, { tees, captured }) => {
  const pxSha = (px) => env.call('fn.tk.sha256', { bytes: viewBytes(px) });
  const serialized = tees.map((tee, index) => {
    if (!tee.px || !tee.bbox) env.fail(`tee ${index} lacks px or bbox (opaque tee object)`);
    return serializeTee(tee, index, pxSha);
  });
  const claimed = unionOf(serialized.map((t) => t.px));
  const claimedVisits = serialized.reduce((n, t) => n + t.pxCount, 0);
  return { serialized, claimed, claimedVisits, image: captured.image, planFingerprint: captured.plan.planFingerprint, totals: { claimedPx: claimed.size, claimedVisits, overlapWithinLayerPx: claimedVisits - claimed.size } };
};

const witness = witnessed.provider(MATERIALIZER, {
  name: 'serializerMatchesMaterializer', as: 'materializer',
  run: (call, s) => {
    const w = call();
    const serialized = { teePx: s.claimed.size, overlapPx: s.claimedVisits - s.claimed.size };
    return { ok: w.teePx === serialized.teePx && w.overlapPx === serialized.overlapPx, serialized, materializer: { teePx: w.teePx, overlapPx: w.overlapPx } };
  }
});

const rasterRecount = conserved.raster({
  name: 'materializerRasterZeroesTeePx',
  rasters: (s) => [{ rgba: s.provided.materializer.rgba, px: s.provided.materializer.teePx }],
  balance: (s) => { const w = s.provided.materializer; return { name: 'materializerFrameBalances', remainingOpaquePx: w.remainingOpaquePx, framePx: w.widthPx * w.heightPx, px: w.teePx }; }
});

const assemble = step('assemble px.tees artifact', (env, s) => {
  const w = s.provided.materializer;
  const witnessSummary = { teePx: w.teePx, overlapPx: w.overlapPx, remainingOpaquePx: w.remainingOpaquePx };
  env.check('objects', s.serialized.every((t) => Array.isArray(t.bbox) && t.bbox.length === 4 && Array.isArray(t.innerBbox) && t.innerBbox.length === 4));
  env.check('px', s.serialized.every((t) => Array.isArray(t.px) && t.pxCount === t.px.length && t.pxCount > 0));
  return {
    witnessSummary, dims: { width: w.widthPx, height: w.heightPx },
    setArtifact: {
      schema: 'nctk-s3-tees-artifact@1', part: PART, producedBy: PRODUCED_BY,
      guarantee: ID, teeCount: s.serialized.length,
      note: 'Tees carry no engine label; label is the 1-based order used by the pinned S3 contract receipt.',
      planFingerprint: s.planFingerprint,
      image: { widthPx: w.widthPx, heightPx: w.heightPx },
      totals: s.totals, witness: witnessSummary, layerIntegrity: s.layerIntegrity,
      tees: s.serialized
    }
  };
});

const artifacts = materialized({
  artifacts: (s) => [
    { id: 'px.tees', kind: 'tee-set-json', path: 's3/px.tees.json', json: s.setArtifact },
    { id: 's3.teePx.rgba', kind: 'rgba', path: 's3/teePx.rgba.bin', bytes: s.provided.materializer.rgba, dims: s.dims },
    { id: 's3.remaining.rgba', kind: 'rgba', path: 's3/remaining.rgba.bin', bytes: s.remainingRgba, dims: s.dims }
  ]
});

const frames = framed((s) => {
  const { widthPx, heightPx } = s.provided.materializer;
  const li = s.layerIntegrity;
  return [
    objectsFrame({
      title: `px.tees: ${s.serialized.length} tees, ${s.claimed.size} px claimed`, calculation: PRODUCED_BY,
      address: PART, artifact: s.entries['px.tees'], image: { widthPx, heightPx }, px: [...s.claimed].sort((a, b) => a - b),
      objects: s.serialized, box: (t) => [...t.bbox, t.label], points: (t) => [...t.center, t.label],
      row: (t) => ({ index: t.index, label: t.label, center: t.center.map((v) => v.toFixed(1)).join(','), bbox: t.bbox.join(','), angleRad: t.angleRad, pxCount: t.pxCount }),
      verdict: (t) => ({ name: `tee ${t.label}: ${t.pxCount} px`, ok: t.pxCount > 0 })
    }),
    {
      title: `S3 stack ledger: ${li.remainingEnteringPx} px entering (S2 recorded ${li.s2RecordedRemainingLeavingPx}), ${li.remainingLeavingPx} leaving`,
      calculation: 'materializeS3Subtraction',
      parts: [
        { address: 's3.muteFringeOverlap', kind: 'pxset', data: { width: widthPx, height: heightPx, px: s.muteFringe } },
        { address: 's3.teePx.rgba', kind: 'raster', artifact: s.entries['s3.teePx.rgba'] },
        { address: 's3.remaining.rgba', kind: 'raster', artifact: s.entries['s3.remaining.rgba'] },
        { address: 's3.layerIntegrity', kind: 'ledger', data: { rows: [{ ...li, intersections: JSON.stringify(li.intersections), rasterRecount: JSON.stringify(li.rasterRecount) }] } }
      ],
      verdicts: [
        { name: 'set arithmetic balances', ok: li.balanceHolds },
        { name: 'stack agrees with the S2 record', ok: li.stackAgreesWithS2Record },
        { name: 'raster recount agrees with set arithmetic', ok: li.rasterRecountHolds },
        { name: `disagreement explained by ${li.muteFringeOverlapPx} px of S1 mute fringe`, ok: li.rasterRecountHolds || li.explainedByMuteOverlap },
        { name: 'S1 witness agrees on the bottom of the stack', ok: li.s1WitnessAgrees }
      ]
    }
  ];
});

export default materializeGuarantee({
  stage: 'S3', noun: { one: 'tee', many: 'tees' }, producedBy: PRODUCED_BY, units: UNITS,
  serialize, serializeCalls: ['fn.tk.sha256'], witness, checks: [rasterRecount], layered: true, assemble, artifacts, frames,
  body: (s) => ({ teeCount: s.serialized.length, planFingerprint: s.planFingerprint, totals: s.totals, witness: s.witnessSummary, layerIntegrity: s.layerIntegrity })
});
