/**
 * fg.s1.badgeGlyphTemplate.materialize (stages/s1.json): the default-OFF G1
 * whole-glyph template deviation is executed on a restored S1 snapshot
 * branch through the provider's own gateway, under the provider's own
 * badge-glyph-template-on config (the Part tk.s1.badgeGlyphTemplate.plan),
 * and its verdicts are serialized and witnessed by the provider's pure
 * classifyBadgeAgainstTemplates over the same branch inputs. The baseline
 * reader's labels are never overwritten: agreement with the reader is
 * judged and recorded, never gated. New with the port: the branch is
 * asserted pixel-invariant like every other branch run (branched).
 *
 * Artifact artifacts/s1/badgeGlyphTemplate.json (bytes unchanged); record
 * stages[S1].glyphTemplateMaterialization / materializations.S1BadgeGlyphTemplate.
 */
import { branchRun, guarantee, pipe, read, sequence, step } from '../compose.mjs';
import { framed, judged, materialized, published, unitful, witnessed } from '../mixins.mjs';
import { legacyPlain } from '../legacy.mjs';

const ID = 'fg.s1.badgeGlyphTemplate.materialize';
const PART = 'badgeGlyphTemplate';
const PRODUCED_BY = 'badgeGlyphTemplate (g1.badgeGlyphTemplate)';
const SEAM = 'classifyBadgeAgainstTemplates(localImage, read, viewportTopPx, DEFAULT_BADGE_GLYPH_TEMPLATE_KNOBS)';
const PLAN = 'tk.s1.badgeGlyphTemplate.plan';
const CLASSIFY = 'fn.provider.S1.classifyBadgeAgainstTemplates';
const WITNESS_FIELDS = ['badgeId', 'currentLabel', 'templateLabel', 'templateBestLabel', 'templateScore', 'templateMargin', 'templateAbstention', 'readerConfidence', 'agreement'];
const UNITS = {
  templateScore: 'Dice coefficient (fraction)', templateMargin: 'Dice difference, best - runner-up (fraction)', readerConfidence: 'fraction (reader confidence)',
  counts: 'count (badges)', totals: 'count (badges)', agree: 'count (badges)', disagree: 'count (badges)', templateAbstained: 'count (badges)', readerAbstained: 'count (badges)', bothAbstained: 'count (badges)'
};

const plan = step('the compiled template-on plan', (env, s) => {
  if (!s.parts[PLAN].op) env.fail('badgeGlyphTemplate operation unavailable in the compiled template-on plan');
});

const verdicts = step('read the branch verdicts', (env, s) => {
  const { branch } = s.branch;
  if (!branch.has(PART)) env.fail('badgeGlyphTemplate branch produced no verdicts');
  const raw = branch.get(PART);
  const badges = s.parts['px.badges'];
  if (!Array.isArray(raw) || raw.length !== badges.length) env.fail(`template verdicts (${raw?.length}) disagree with px.badges (${badges.length})`);
  return { serialized: raw.map(legacyPlain), reads: branch.get('badges') };
});

// The provider's pure classifier over the same branch inputs (localImage bitmap, reads, viewport shift, default knobs).
const witness = witnessed.provider(CLASSIFY, {
  name: 'serializerMatchesWitness', as: 'classify',
  run: (call, s) => {
    const localImage = s.branch.branch.get('localImage');
    const bitmap = { width: localImage.width, height: localImage.height, data: localImage.data };
    const { topPx } = s.branch.branch.get('viewport');
    for (let i = 0; i < s.reads.length; i++) {
      const w = call({ bitmap, read: s.reads[i], topPx });
      for (const k of WITNESS_FIELDS)
        if (JSON.stringify(w[k] ?? null) !== JSON.stringify(s.serialized[i][k] ?? null))
          return { ok: false, verdict: i, field: k, serialized: s.serialized[i][k] ?? null, witness: w[k] ?? null };
    }
    return true;
  }
});

const reader = judged('baselineReader', {
  judge: (s) => {
    const counts = { agree: 0, disagree: 0, templateAbstained: 0, readerAbstained: 0, bothAbstained: 0 };
    const unknown = s.serialized.filter((v) => !(v.agreement in counts)).map((v) => v.agreement);
    for (const v of s.serialized) if (v.agreement in counts) counts[v.agreement]++;
    return { matches: counts.disagree === 0, counts, unknown };
  }
});

const assemble = step('assemble the verdict artifact', (env, s) => {
  const { counts, unknown } = s.judged.baselineReader;
  if (unknown.length) env.fail(`template verdict carries unknown agreement '${unknown[0]}'`);
  env.check('agreementCountsSum', Object.values(counts).reduce((a, b) => a + b, 0) === s.serialized.length, { counts, verdicts: s.serialized.length });
  const { config } = s.parts[PLAN];
  const witnessSummary = { kind: 'provider pure function', seam: SEAM, fieldsCompared: WITNESS_FIELDS, matches: s.witnesses.classify.ok };
  return {
    counts, config, witnessSummary,
    artifact: {
      schema: 'nctk-s1-badge-glyph-template-artifact@1', part: PART, producedBy: PRODUCED_BY,
      guarantee: ID, badgeCount: s.serialized.length,
      config, counts, witness: witnessSummary,
      verdicts: s.serialized
    }
  };
});

const objects = step('objects', (env, s) => { env.check('objects', s.serialized.every((v) => typeof v.badgeId === 'string' && typeof v.agreement === 'string')); });

const frames = framed((s) => [{
  title: `badgeGlyphTemplate: ${s.counts.agree} agree, ${s.counts.disagree} disagree, ${s.counts.templateAbstained} template-abstained`,
  calculation: PRODUCED_BY, tick: s.parts[PLAN].op.id,
  parts: [
    { address: PART, kind: 'ledger', artifact: s.entries[PART], data: { rows: s.serialized.map((v) => Object.fromEntries(WITNESS_FIELDS.map((k) => [k, v[k] ?? null]))) } },
    { address: `${PART}#bbox`, kind: 'bbox', data: { boxes: s.parts['px.badges'].filter((b) => b.bbox).map((b, i) => [...b.bbox, `${b.label ?? '?'}:${s.serialized[i]?.agreement ?? '?'}`]) } },
    { address: `${PART}#counts`, kind: 'ledger', data: { rows: [s.counts] } }
  ],
  verdicts: s.serialized.map((v) => ({ name: `${v.badgeId}: reader ${v.currentLabel ?? '-'} / template ${v.templateLabel ?? '-'} (${v.agreement})`, ok: v.agreement !== 'disagree' }))
}]);

export default guarantee({
  id: ID, guards: [PART], audit: [unitful({ units: UNITS })],
  result: (s) => ({ totals: s.counts, badgeCount: s.serialized.length, producedBy: PRODUCED_BY, config: s.config })
}, pipe(sequence(pipe(read('px.badges', PLAN), plan), branchRun({ restore: 'fn.provider.restore.S1', execute: 'fn.provider.S1.badgeGlyphTemplate.execute', site: 's1.badgeGlyphTemplate' })),
  verdicts, witness, reader, assemble,
  materialized({ artifacts: (s) => [{ id: PART, kind: 'glyph-template-verdicts-json', path: 's1/badgeGlyphTemplate.json', json: s.artifact }] }),
  objects, frames,
  published({
    stage: 'S1', key: 'glyphTemplateMaterialization', materialization: 'S1BadgeGlyphTemplate',
    header: () => ({ part: PART, producedBy: PRODUCED_BY }),
    body: (s) => ({ badgeCount: s.serialized.length, config: s.config, counts: s.counts, witness: s.witnessSummary })
  })));
