/**
 * fg.s2.pxBaskets.materialize (stages/s2.json): px.baskets leaves every run
 * as inspectable artifacts serialized from the live board value, witnessed
 * by the provider's own materializer (materializeS2Subtraction over the
 * captured S2 run), with layer integrity against the S1 sets through the
 * shared stack ledger (conserved:S2): disjoint from S1 owned, raster-
 * recounted, a basket sharing px only with a badge's 2-px mute fringe
 * (AlexClark: 3 px) recorded as explainedByMuteOverlap instead of failing.
 *
 * A composition of properties (fg/mixins.mjs); the specific remainder is
 * the basket serializer and the artifact/frame layouts. Artifacts keep
 * their paths and bytes (artifacts/s2/px.baskets.json, basketPx.rgba.bin,
 * remaining.rgba.bin); the record is published at stages[S2].materialization
 * / materializations.S2 and, as every held record, becomes the Part
 * tk.fg.s2.pxBaskets.materialize.record that S3's stack ledger reads.
 */
import { step } from '../compose.mjs';
import { materializeGuarantee } from '../skeletons.mjs';
import { conserved, framed, materialized, objectsFrame, witnessed } from '../mixins.mjs';
import { legacyPlain, unionOf, viewBytes } from '../legacy.mjs';

const ID = 'fg.s2.pxBaskets.materialize';
const PART = 'px.baskets';
const PRODUCED_BY = 'Basket.findPx';
const UNITS = {};
const CAPTURED = 'tk.stage.S2.captured';
const MATERIALIZER = 'fn.provider.S2.materializeSubtraction';

const serialize = (env, s, { baskets, captured }) => {
  const pxSha = (px) => env.call('fn.tk.sha256', { bytes: viewBytes(px) });
  const serialized = baskets.map((basket, index) => {
    if (!basket.px || !basket.bbox) env.fail(`basket ${index} lacks px or bbox (opaque basket object)`);
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
  const claimed = unionOf(serialized.map((b) => b.px));
  const claimedVisits = serialized.reduce((n, b) => n + b.pxCount, 0);
  return { serialized, claimed, claimedVisits, image: captured.image, totals: { claimedPx: claimed.size, claimedVisits, overlapWithinLayerPx: claimedVisits - claimed.size } };
};

const witness = witnessed.provider(MATERIALIZER, {
  name: 'serializerMatchesMaterializer', as: 'materializer',
  run: (call, s) => {
    const w = call();
    const serialized = { basketPx: s.claimed.size, overlapPx: s.claimedVisits - s.claimed.size };
    return { ok: w.basketPx === serialized.basketPx && w.overlapPx === serialized.overlapPx, serialized, materializer: { basketPx: w.basketPx, overlapPx: w.overlapPx } };
  }
});

const rasterRecount = conserved.raster({
  name: 'materializerRasterZeroesBasketPx',
  rasters: (s) => [{ rgba: s.provided.materializer.rgba, px: s.provided.materializer.basketPx }],
  balance: (s) => { const w = s.provided.materializer; return { name: 'materializerFrameBalances', remainingOpaquePx: w.remainingOpaquePx, framePx: w.widthPx * w.heightPx, px: w.basketPx }; }
});

const assemble = step('assemble px.baskets artifact', (env, s) => {
  const w = s.provided.materializer;
  const witnessSummary = { basketPx: w.basketPx, overlapPx: w.overlapPx, remainingOpaquePx: w.remainingOpaquePx };
  env.check('objects', s.serialized.every((b) => Array.isArray(b.bbox) && b.bbox.length === 4));
  env.check('px', s.serialized.every((b) => Array.isArray(b.px) && b.pxCount === b.px.length && b.pxCount > 0));
  return {
    witnessSummary, dims: { width: w.widthPx, height: w.heightPx },
    setArtifact: {
      schema: 'nctk-s2-baskets-artifact@1', part: PART, producedBy: PRODUCED_BY,
      guarantee: ID, basketCount: s.serialized.length,
      note: 'Baskets carry no engine label; label is the 1-based order used by the pinned S2 contract receipt.',
      image: { widthPx: w.widthPx, heightPx: w.heightPx },
      totals: s.totals, witness: witnessSummary, layerIntegrity: s.layerIntegrity,
      baskets: s.serialized
    }
  };
});

const artifacts = materialized({
  artifacts: (s) => [
    { id: 'px.baskets', kind: 'basket-set-json', path: 's2/px.baskets.json', json: s.setArtifact },
    { id: 's2.basketPx.rgba', kind: 'rgba', path: 's2/basketPx.rgba.bin', bytes: s.provided.materializer.rgba, dims: s.dims },
    { id: 's2.remaining.rgba', kind: 'rgba', path: 's2/remaining.rgba.bin', bytes: s.remainingRgba, dims: s.dims }
  ]
});

const frames = framed((s) => {
  const { widthPx, heightPx } = s.provided.materializer;
  const li = s.layerIntegrity;
  return [
    objectsFrame({
      title: `px.baskets: ${s.serialized.length} baskets, ${s.claimed.size} px claimed`, calculation: PRODUCED_BY,
      address: PART, artifact: s.entries['px.baskets'], image: { widthPx, heightPx }, px: [...s.claimed].sort((a, b) => a - b),
      objects: s.serialized, box: (b) => [...b.bbox, b.label],
      row: (b) => ({ index: b.index, label: b.label, bbox: b.bbox.join(','), pxCount: b.pxCount, whitePx: b.whitePx, blackPx: b.blackPx, shellBlackPx: b.shell.blackPxCount }),
      verdict: (b) => ({ name: `basket ${b.label}: ${b.pxCount} px`, ok: b.pxCount > 0 && b.bbox.length === 4 })
    }),
    {
      title: `S2 layer ledger: ${li.remainingEnteringPx} px entering, ${li.remainingLeavingPx} leaving${li.explainedByMuteOverlap ? ` (${s.muteFringe.length} px shared with S1 mute fringe)` : ''}`,
      calculation: 'materializeS2Subtraction',
      parts: [
        { address: 's2.muteFringeOverlap', kind: 'pxset', data: { width: widthPx, height: heightPx, px: s.muteFringe } },
        { address: 's2.basketPx.rgba', kind: 'raster', artifact: s.entries['s2.basketPx.rgba'] },
        { address: 's2.remaining.rgba', kind: 'raster', artifact: s.entries['s2.remaining.rgba'] },
        { address: 's2.layerIntegrity', kind: 'ledger', data: { rows: [{ ...li, intersections: JSON.stringify(li.intersections), rasterRecount: JSON.stringify(li.rasterRecount) }] } }
      ],
      verdicts: [
        { name: 'set arithmetic balances', ok: li.balanceHolds },
        { name: 'raster recount agrees with set arithmetic', ok: li.rasterRecountHolds },
        { name: `disagreement explained by ${li.muteFringeOverlapPx} px of S1 mute fringe`, ok: li.rasterRecountHolds || li.explainedByMuteOverlap },
        { name: 'S1 witness agrees on the entering layer', ok: li.s1WitnessAgrees }
      ]
    }
  ];
});

export default materializeGuarantee({
  stage: 'S2', noun: { one: 'basket', many: 'baskets' }, producedBy: PRODUCED_BY, units: UNITS,
  serialize, serializeCalls: ['fn.tk.sha256'], witness, checks: [rasterRecount], layered: true, assemble, artifacts, frames,
  body: (s) => ({ basketCount: s.serialized.length, familyCount: s.parts[CAPTURED].family.members.length, shellMemberCount: s.parts[CAPTURED].shellFamily.members.length, totals: s.totals, witness: s.witnessSummary, layerIntegrity: s.layerIntegrity })
});
