/** A read-only render constraint over actual provider PCR and captured Parts. */
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('../../../', import.meta.url)));
const require = createRequire(import.meta.url);
const { pcrRenderId } = require(resolve(root, 'packages/alg/dist/exec/pcr'));
const digest = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function fail(message) { throw new Error(`Composed render constraint: ${message}`); }

/** The capture never computes CV here; this only verifies testimony and composes marks. */
export function composeRender(capture, view = {}) {
  if (capture.schema !== 'chainspot-composed-render-capture@1') fail('capture schema');
  const { source, paramsHash, marks, pcrs } = capture;
  if (!source?.sha256 || !source.frame || !paramsHash || !Array.isArray(marks)) fail('missing run or frame identity');
  const seen = new Set();
  const stages = [];
  for (const [group, pcr] of Object.entries(pcrs)) {
    if (pcr.schema !== 'chainspot-pcr@1' || pcr.paramsHash !== paramsHash || !pcr.runResultId)
      fail(`${group}: incompatible actual PCR`);
    const ticks = [];
    for (const { operation, testimony } of pcr.ticks) {
      const id = operation.id;
      if (testimony.opId !== id) fail(`${group}/${id}: mismatched Tick testimony`);
      const items = marks.filter((m) => m.group === group && m.producerTick === id);
      for (const mark of items) {
        if (seen.has(mark.id)) fail(`duplicate mark ${mark.id}`);
        seen.add(mark.id);
        if (mark.sourceSha256 !== source.sha256 || mark.canonicalRgbaSha256 !== source.frame.canonicalRgbaSha256 ||
            !eq(mark.frame, source.frame)) fail(`${mark.id}: source or coordinate frame mismatch`);
        if (mark.paramsHash !== paramsHash || mark.runName !== capture.runName) fail(`${mark.id}: run/config mismatch`);
        if (!testimony.actualProduces.includes(mark.part) || !operation.produces.includes(mark.part))
          fail(`${mark.id}: Part not produced by named Tick`);
        if (mark.payloadSha256 !== digest({ status: mark.status, geometry: mark.geometry, detail: mark.detail }))
          fail(`${mark.id}: captured payload drift`);
        if (!['observed-proposal','observed-pad-geometry','missing-pad-geometry',
              'observed-fragment-inferred-outline','inferred-no-fit','error'].includes(mark.status))
          fail(`${mark.id}: unclassified status`);
      }
      // Every named Tick remains inspectable, including operations whose opaque
      // Part is not materialized into a render mark or is explicitly empty.
      ticks.push({ id, producedParts: testimony.actualProduces,
        materialization: items.length ? 'captured-marks' :
          id === 'posteriorTeeRecovery' ? 'empty-candidate-materialization' : 'unavailable',
        reason: items.length ? null : id === 'posteriorTeeRecovery'
          ? 'The actual posterior run emitted zero injected placements.'
          : 'The executed Tick has testimony, but its opaque Part is not materialized by this view.',
        marks: items });
    }
    stages.push({ id: group, kind: 'legacy-producer-view-group', pcrRunResultId: pcr.runResultId,
      pcrPlanFingerprint: pcr.planFingerprint, ticks });
  }
  if (seen.size !== marks.length) fail('unbound mark outside Stage/Tick testimony');
  const contentId = digest({ sourceSha256: source.sha256, frame: source.frame, paramsHash,
    runName: capture.runName, providerIdentity: capture.providerIdentity,
    stageTicks: stages.map((stage) => [stage.id, stage.pcrRunResultId, stage.pcrPlanFingerprint,
      stage.ticks.map((tick) => [tick.id, tick.producedParts, tick.materialization, tick.reason])]),
    payloads: marks.map(({ id, group, producerTick, part, status, payloadSha256 }) =>
      [id, group, producerTick, part, status, payloadSha256]) });
  const visibility = Object.fromEntries(stages.map((stage) => [stage.id, view[stage.id] !== false]));
  const tickVisibility = Object.fromEntries(stages.map((stage) => [stage.id,
    Object.fromEntries(stage.ticks.map((tick) => [tick.id, view.ticks?.[`${stage.id}/${tick.id}`] !== false]))]));
  const renderIds = Object.fromEntries(stages.map((stage) => [stage.id,
    pcrRenderId(pcrs[stage.id], { sourceSha256: source.sha256,
      frame: source.frame, payloadContentId: contentId, visible: visibility[stage.id],
      tickVisibility: tickVisibility[stage.id] })]));
  return { schema: 'chainspot-composed-render@1', source, runName: capture.runName,
    providerIdentity: capture.providerIdentity,
    paramsHash, contentId, visibility, tickVisibility, renderIds, counts: capture.counts, stages,
    pcrLimitation: 'PCR runResultId covers Tick testimony, not opaque Part values; contentId additionally seals captured mark payloads.' };
}
