/**
 * Runner glue between the early stage wiring and the fg runtime (node-only).
 *
 * runStageGuarantees discovers every *.fg.mjs under <forkRoot>/fg, loads
 * the stages/*.json declarations, and runs exactly the FGs the named stage
 * declares, through the fg registry (requires order, lane gating, uniform
 * records, frames). It refuses to run when a declared guarantee has no
 * implementation or the implementation drifts from its declaration (part,
 * lane, prose-named requires): with the inline blocks gone, a missing file
 * would otherwise be a guarantee that silently stopped being enforced.
 *
 * Artifacts go through a file sink rooted at <outDir>/artifacts with uris
 * relative to <outDir>, so an FG that names path 's1/px.badges.json' lands
 * at artifacts/s1/px.badges.json and receipts that relative path, exactly
 * the inline layout.
 *
 * Returns { records, published }: published is [[address, value]] in the
 * stage's DECLARATION order (not registry order, which is topological with
 * id tie-breaks), because the receipt objects' key order is part of the
 * receipt bytes. attachPublished puts each value where its address says.
 *
 * Only FGs whose site is 'stage' run here; a site 'forkjoin' FG is declared
 * in the same stages/*.json but runs once per branch inside its fork-join
 * runner (ports/early/s3ForkJoin.mjs). Each held record is then written to
 * the store as the Part tk.<id>.record (producer fn.<id>, inParts the FG's
 * reads), which is how a later stage's FG reads an earlier stage's record.
 *
 * Every FG reads its declared Parts from, and calls its declared
 * Calculations through, the run's PartStore (ports/early/earlyStore.mjs);
 * nothing is passed beside it. The flipbook reads its background the same
 * way, as the Part view.source.background.
 *
 * Sidecars (never in the receipt): <outDir>/fg/<stage>.records.json (uniform
 * records + the declaration cross-check), <stage>.frames.json,
 * <stage>.flipbook.html, <stage>.timings.json. They are written before a
 * GuaranteeFailure is rethrown, so a failed run still renders.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadRegistry } from '../../fg/discover.mjs';
import { createFileSink, nodeSha256 } from '../../fg/node-sink.mjs';
import { framesJson, renderFlipbook } from '../../fg/flipbook.mjs';
import { canonicalJson } from '../../fg/canon.mjs';

export async function runStageGuarantees({ forkRoot, stage, store, outDir, lanes = [] }) {
  const { registry, declarations, report } = await loadRegistry({ root: join(forkRoot, 'fg'), stagesDir: join(forkRoot, 'stages') });
  const declared = declarations.filter((d) => d.stage === stage);
  const declaredIds = declared.map((d) => d.id);
  const missing = report.declaredUnimplemented.filter((id) => declaredIds.includes(id));
  if (missing.length) throw new Error(`${stage} declares FunctionalGuarantees with no fg/**/<id>.fg.mjs implementation: ${missing.join(', ')}`);
  const drift = report.mismatches.filter((m) => declaredIds.includes(m.id));
  if (drift.length) throw new Error(`${stage} FunctionalGuarantee implementations drift from stages/${stage}.json: ${JSON.stringify(drift)}`);
  // Only site 'stage' FGs run here, on the run's store; site 'forkjoin' FGs
  // (fg.s3.teeFamily.*) run once per branch inside their fork-join runner.
  const byId = new Map(registry.guarantees.map((fg) => [fg.id, fg]));
  const ids = declaredIds.filter((id) => byId.get(id).site === 'stage');

  const sink = createFileSink(join(outDir, 'artifacts'), { relativeTo: outDir });
  const sidecarDir = join(outDir, 'fg');
  const writeSidecars = ({ records = {}, frames = [], timings = [] }, failure = null) => {
    mkdirSync(sidecarDir, { recursive: true });
    writeFileSync(join(sidecarDir, `${stage}.records.json`), canonicalJson({
      schema: 'nctk-fg-records@1', stage, order: Object.keys(records), records,
      crossCheck: { declared: ids, mismatches: drift, implementedUndeclared: report.implementedUndeclared },
      failure
    }) + '\n');
    writeFileSync(join(sidecarDir, `${stage}.frames.json`), framesJson(frames) + '\n');
    const background = store.has('view.source.background') ? store.get('view.source.background') : null;
    writeFileSync(join(sidecarDir, `${stage}.flipbook.html`), renderFlipbook(frames, { title: `${stage} FunctionalGuarantees`, background, records, stage: stage.toUpperCase() }));
    writeFileSync(join(sidecarDir, `${stage}.timings.json`), JSON.stringify(timings, null, 2) + '\n');
  };
  let run;
  try {
    run = registry.run({ store, sink, only: ids, lanes, hash: nodeSha256 });
  } catch (error) {
    if (error?.name === 'GuaranteeFailure')
      writeSidecars(error, { guarantee: error.guarantee, reason: error.reason, failed: error.failed });
    throw error;
  }
  writeSidecars(run);
  // Every held record becomes a Part, tk.<id>.record, produced by the
  // Calculation fn.<id> (the FG itself) whose inParts are the FG's declared
  // reads: how a LATER stage's FG gates against this stage's record (S3's
  // stack ledger reads tk.fg.s2.pxBaskets.materialize.record). Within a
  // stage, requires + ctx.records stays the mechanism.
  for (const id of ids) {
    const record = run.records[id];
    if (record?.status !== 'held') continue;
    const fn = `fn.${id}`;
    store.register(fn, {
      inParts: byId.get(id).reads, outParts: [`tk.${id}.record`], lazy: false,
      note: `the FunctionalGuarantee ${id} (stages/${stage}.json), as the Calculation that produced its record`,
      calculate: () => ({ [`tk.${id}.record`]: record })
    });
    store.call(fn, undefined, { caller: `stageGuarantees.${stage}` });
  }
  const published = ids.flatMap((id) => Object.entries(run.outputs[id] ?? {}));
  return { records: run.records, published };
}

/** Place each published value at its receipt address. */
export function attachPublished(published, { stages, materializations, branches }) {
  for (const [address, value] of published) {
    const [bucket, ...rest] = address.split('.');
    if (bucket === 'stages' && rest.length === 2) {
      const stage = stages.find((s) => s.id === rest[0]);
      if (!stage) throw new Error(`published ${address}: no stage ${rest[0]} in this run`);
      stage[rest[1]] = value;
    } else if (bucket === 'materializations' && rest.length === 1) materializations[rest[0]] = value;
    else if (bucket === 'experiments' && rest[0] === 'branches' && rest.length === 2) branches[rest[1]] = value;
    else throw new Error(`published ${address}: not a receipt address this runner attaches`);
  }
}
