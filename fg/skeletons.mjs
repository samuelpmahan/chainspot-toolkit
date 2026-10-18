/**
 * FG skeletons: a stage's guarantee written once as a composition of properties, so a new stage supplies only what is
 * its own (Sam, 2026-10-18: "Write two reusable FG skeletons ... This sounds very useful").
 *
 * assemblyGuarantee: the S1-S3 assembly FGs (fg.s1.pxBadges.assembly, fg.s2.pxBaskets.assembly,
 * fg.s3.pxTees.assembly). Each re-assembles a stage's Parts from their component evidence on a branch restored from the
 * stage snapshot (lane `<stage>-<one>-assembly`, default OFF), and must reproduce the baseline Part exactly:
 *
 *   branchRun -> lane -> subject -> delta (vs the baseline px) -> gated (against other FGs' records) -> reproduction
 *   -> witnessed.branch (a second branch reproduces it) -> rederived (an independent path) -> assemble -> materialized
 *   (+ reread) -> frames -> published (+ lane evidence)
 *
 * Everything named by convention from { stage, noun } (op id, site, lane, restore, artifact path and kind, record keys);
 * the stage supplies its spec, its consumes, the Calculation, its reproduction rows and checks, its re-derivation
 * witness, its frames, its gates and its lane's benefit / falsifier.
 *
 * materializeGuarantee: the S1-S3 set materialize FGs (fg.s1.pxBadges.materialize, fg.s2.pxBaskets.materialize,
 * fg.s3.pxTees.materialize). The stage's px.<many> Part leaves the run as artifacts serialized from the live board value,
 * witnessed by the provider's own materializer:
 *
 *   read (px.<many>, tk.stage.<stage>.captured) -> serialize (the Part present, non-empty, and agreeing with the captured
 *   run) -> witness -> checks -> conserved.layer (when layered) -> assemble -> artifacts -> frames -> published
 *
 * The stage supplies its serializer, witness, checks, artifact assembly, artifacts, frames and record body.
 */
import { branchRun, guarantee, pipe, read, step } from './compose.mjs';
import { conserved, delta as deltaMixin, framed, gated, lane, materialized, published, sameCanon, unitful, witnessed } from './mixins.mjs';
import { legacyCanon } from './legacy.mjs';

const cap = (w) => w[0].toUpperCase() + w.slice(1);

/**
 * stage 'S1'; noun { one: 'badge', many: 'badges' }; spec { part, assemblyCalculation, specDelta, calculation };
 * consumes: the Parts the Calculation reads (in calculate's argument order); calculate(...consumed);
 * note: the op note; units: unitful's units; delta?: { out, outPx, exact } (default: each object's fusedPx);
 * gates: [[fgId, checks]]; reproduction(env, s) -> rows (each with .exact; runs its own checks);
 * rederived: a witnessed.path composition; frames(s, { op, part }) -> frames; branch: { benefit, falsifier, body? }.
 */
export function assemblyGuarantee({ stage, noun, spec, consumes, calculate, note, units, delta = {}, gates = [], reproduction, rederived, frames, branch }) {
  const { one, many } = noun, Many = cap(many), st = stage.toLowerCase();
  const id = `fg.${st}.px${Many}.assembly`, part = spec.part, base = `px.${many}`;
  const exactKey = `exact${Many}`, ofKey = `of${Many}`, countKey = `${one}Count`;
  const op = {
    id: `early.${stage}.${one}Assembly`, kind: 'measure', gate: 'shared', unit: `early-${st}-${one}-assembly`,
    consumes, produces: [part], calculations: [spec.assemblyCalculation], accessConformance: 'exact', note
  };

  const subject = step('read the branch Part', (env, s) => {
    const assembly = s.branch.branch.get(part);
    if (!assembly || !Array.isArray(assembly[many])) env.fail(`branch did not produce ${part}`);
    const baseline = env.get(base);
    if (assembly[many].length !== baseline.length) env.fail(`assembly ${one} count ${assembly[many].length} != baseline ${base} count ${baseline.length}`);
    return { assembly, base: baseline, totals: assembly.totals };
  }, { reads: consumes });

  const ledger = step('reproduction ledger', (env, s) => {
    const rows = reproduction(env, s);
    return { reproduction: rows, [exactKey]: rows.filter((r) => r.exact).length };
  });

  const assemble = step('assemble the assembly artifact', (env, s) => {
    const r = s.witnessReturns.rederivation;
    const witnesses = { reexecution: s.witnesses.reexecution, rederivation: r?.summary ? { ...r.summary, exact: s.witnesses.rederivation.ok } : null };
    return {
      receiptWitnesses: witnesses,
      artifact: {
        schema: `nctk-${st}-${one}-assembly-artifact@1`, part, producedBy: spec.assemblyCalculation,
        guarantee: id, specDelta: spec.specDelta, calculation: spec.calculation,
        image: s.assembly.image, totals: s.totals, emits: s.assembly.emits,
        reproduction: s.reproduction, witnesses,
        [many]: s.assembly[many]
      }
    };
  });

  const counts = (s) => ({ [exactKey]: s[exactKey], [ofKey]: s.reproduction.length });
  return guarantee({
    id, guards: [part], audit: [unitful({ units })],
    result: (s) => ({ totals: s.totals, [countKey]: s.totals[countKey], specDelta: spec.specDelta, [exactKey]: s[exactKey] })
  }, pipe(
    branchRun({ restore: `fn.provider.restore.${stage}`, op, site: `${st}.${one}Assembly`, calculate }),
    lane(`${st}-${one}-assembly`),
    subject,
    deltaMixin({ out: delta.out ?? part, base, by: spec.assemblyCalculation, exact: delta.exact ?? `all${Many}ReproducedExactly`,
      outPx: delta.outPx ?? ((s) => s.assembly[many].map((r, i) => [`#${i}`, r.fusedPx])), basePx: (s) => s.base.map((b, i) => [`#${i}`, b.px]) }),
    ...gates.map(([fg, checks]) => gated(fg, { checks })),
    ledger,
    witnessed.branch({ canonical: (s, run) => legacyCanon(run.result) }),
    rederived,
    assemble,
    materialized({
      artifacts: (s) => [{ id: part, kind: `${one}-assembly-json`, path: `${st}assembly/${part}.json`, json: s.artifact }],
      reread: (s, read) => { const back = read(part); return sameCanon(back[many], s.assembly[many]) && sameCanon(back.totals, s.totals); }
    }),
    framed((s) => frames(s, { op, part })),
    published({
      stage, key: `${one}AssemblyMaterialization`, materialization: `${stage}${cap(one)}Assembly`,
      header: () => ({ specDelta: spec.specDelta, part, producedBy: spec.assemblyCalculation }),
      body: (s) => ({ [countKey]: s.totals[countKey], totals: s.totals, reproduction: { ...counts(s), [many]: s.reproduction }, witnesses: s.receiptWitnesses }),
      branch: {
        key: `${stage}ASM`, benefit: branch.benefit, falsifier: branch.falsifier,
        body: branch.body ?? ((s) => ({ partAddress: part, totals: s.totals, reproduction: counts(s) }))
      }
    })));
}

/**
 * stage 'S2'; noun { one: 'basket', many: 'baskets' }; producedBy 'Basket.findPx'; units;
 * serialize(env, s, { [many], captured }) -> { serialized, totals, ... } (serializeCalls: the Calculations it calls);
 * witness, checks [...], assemble, artifacts, frames: compositions in that order; layered: conserved.layer(stage) after the
 * checks; body(s): the published record body (default { <one>Count, totals }).
 */
export function materializeGuarantee({ stage, noun, producedBy, units = {}, serialize, serializeCalls = [], witness, checks = [], layered = false, assemble, artifacts, frames, body = null }) {
  const { one, many } = noun, Many = cap(many), st = stage.toLowerCase();
  const id = `fg.${st}.px${Many}.materialize`, part = `px.${many}`, captured = `tk.stage.${stage}.captured`, countKey = `${one}Count`;
  const serialized = step(`serialize ${part}`, (env, s) => {
    const objects = s.parts[part], run = s.parts[captured];
    if (!Array.isArray(objects) || !objects.length) env.fail(`${part} is missing or empty on the board after ${stage}`);
    if (!run?.[many] || run[many].length !== objects.length) env.fail(`captured ${stage} run ${many} disagree with the board ${part}`);
    return serialize(env, s, { [many]: objects, captured: run });
  }, { calls: serializeCalls });
  return guarantee({
    id, guards: [part], audit: [unitful({ units })],
    result: (s) => ({ totals: s.totals, [countKey]: s.serialized.length, ...(layered ? { layerIntegrity: s.layerIntegrity } : {}), producedBy })
  }, pipe(read(part, captured),
    serialized, witness, ...checks, ...(layered ? [conserved.layer(stage)] : []), assemble, artifacts, frames,
    published({
      stage, key: 'materialization', materialization: stage,
      header: () => ({ part, producedBy }),
      body: body ?? ((s) => ({ [countKey]: s.serialized.length, totals: s.totals }))
    })));
}
