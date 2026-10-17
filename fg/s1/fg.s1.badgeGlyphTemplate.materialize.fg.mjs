/**
 * fg.s1.badgeGlyphTemplate.materialize (stages/s1.json): the default-OFF G1
 * whole-glyph template deviation is executed on a restored S1 snapshot
 * branch through the provider's own gateway, under the provider's own
 * badge-glyph-template-on config, and its verdicts are serialized and
 * witnessed by the provider's pure classifyBadgeAgainstTemplates over the
 * same board inputs. The baseline reader's labels are never overwritten;
 * the template output is evidence alongside, exactly as the feature's own
 * contract states.
 *
 * The certified Part (badgeGlyphTemplate) exists only on the FG's own
 * branch, so this FG runs a Calculation itself: it reads px.badges from the
 * live board and everything else from the restored S1 snapshot (env).
 * Ported from runEarly.mjs with a byte-identical artifact
 * (artifacts/s1/badgeGlyphTemplate.json) and stage record
 * (stages[S1].glyphTemplateMaterialization, materializations.S1BadgeGlyphTemplate).
 */
import { defineGuarantee } from '../guarantee.mjs';
import { legacyArtifact, legacyPlain, prettyJsonBytes } from './legacy.mjs';

const ID = 'fg.s1.badgeGlyphTemplate.materialize';
const PART = 'badgeGlyphTemplate';
const PRODUCED_BY = 'badgeGlyphTemplate (g1.badgeGlyphTemplate)';
const SEAM = 'classifyBadgeAgainstTemplates(localImage, read, viewportTopPx, DEFAULT_BADGE_GLYPH_TEMPLATE_KNOBS)';
const WITNESS_FIELDS = ['badgeId', 'currentLabel', 'templateLabel', 'templateBestLabel', 'templateScore', 'templateMargin', 'templateAbstention', 'readerConfidence', 'agreement'];

export default defineGuarantee({
  id: ID,
  guards: [PART],
  reads: ['px.badges'],
  env: ['dist', 'stageSnapshots', 'restorePxC', 'instrument'],
  run(ctx) {
    const { dist, stageSnapshots, restorePxC, instrument } = ctx.env;
    const { resolveConfig, DEFAULT_EXECUTION, canonicalJson } = dist('detectors/threeFactor');
    const { compileExecutionPlan } = dist('exec/compile');
    const { executeCompiledPlan } = dist('exec/gateway');
    const { createMemorySink } = dist('exec/sink');
    const { operationImpls, operationCalculationBindings, ARTIFACT_EXTRACTORS } = dist('exec/operations');
    const { sha256HexSyncText } = dist('exec/sha256');
    const { nullFeatureContext, defaultKnobs } = dist('detectors/threeFactor/features/types');
    const { classifyBadgeAgainstTemplates } = dist('detectors/threeFactor/features/g1.badgeGlyphTemplate');
    const { DEFAULT_BADGE_GLYPH_TEMPLATE_KNOBS } = dist('detectors/threeFactor/digits/badgeGlyphTemplateMath');
    const onConfig = structuredClone(dist('detectors/threeFactor/configs/badge-glyph-template-on.json'));
    const resolvedTemplate = resolveConfig(onConfig, DEFAULT_EXECUTION);
    const templateParamsHash = sha256HexSyncText(canonicalJson(resolvedTemplate));
    const templatePlan = compileExecutionPlan(resolvedTemplate, templateParamsHash);
    const templateOp = templatePlan.ops.find((op) => op.id === 'badgeGlyphTemplate');
    if (!templateOp) ctx.fail('badgeGlyphTemplate operation unavailable in the compiled template-on plan');
    const branch = restorePxC(stageSnapshots.S1);
    const templateCtx = {
      ...nullFeatureContext,
      resolve(feature) {
        if (feature.id === 'badgeGlyphTemplate') return { enabled: true, knobs: defaultKnobs(feature) };
        return nullFeatureContext.resolve(feature);
      }
    };
    instrument('s1.badgeGlyphTemplate', executeCompiledPlan,
      { ops: [templateOp], bindings: templatePlan.bindings ?? {}, planFingerprint: templatePlan.planFingerprint, paramsHash: templateParamsHash },
      branch, templateCtx, createMemorySink(),
      { implementations: operationImpls, calculationBindings: operationCalculationBindings, artifactExtractors: ARTIFACT_EXTRACTORS }
    );
    if (!branch.has(PART)) ctx.fail('badgeGlyphTemplate branch produced no verdicts');
    const verdicts = branch.get(PART);
    const reads = branch.get('badges');
    const badges = ctx.board.get('px.badges');
    if (!Array.isArray(verdicts) || verdicts.length !== badges.length) ctx.fail(`template verdicts (${verdicts?.length}) disagree with px.badges (${badges.length})`);
    const serializedVerdicts = verdicts.map(legacyPlain);
    // Independent witness: the provider's pure classifier over the same
    // branch inputs (localImage bitmap, reads, viewport shift, default knobs).
    const witness = ctx.witness('serializerMatchesWitness', () => {
      const localImage = branch.get('localImage');
      const bitmap = { width: localImage.width, height: localImage.height, data: localImage.data };
      const { topPx } = branch.get('viewport');
      for (let i = 0; i < reads.length; i++) {
        const w = classifyBadgeAgainstTemplates(bitmap, reads[i], topPx, DEFAULT_BADGE_GLYPH_TEMPLATE_KNOBS);
        for (const k of WITNESS_FIELDS)
          if (JSON.stringify(w[k] ?? null) !== JSON.stringify(serializedVerdicts[i][k] ?? null))
            return { ok: false, verdict: i, field: k, serialized: serializedVerdicts[i][k] ?? null, witness: w[k] ?? null };
      }
      return true;
    });
    const counts = { agree: 0, disagree: 0, templateAbstained: 0, readerAbstained: 0, bothAbstained: 0 };
    for (const v of serializedVerdicts) {
      if (!(v.agreement in counts)) ctx.fail(`template verdict carries unknown agreement '${v.agreement}'`);
      counts[v.agreement]++;
    }
    const agreementCountsSum = ctx.check('agreementCountsSum', Object.values(counts).reduce((a, b) => a + b, 0) === serializedVerdicts.length, { counts, verdicts: serializedVerdicts.length });
    const config = { name: onConfig.name, paramsHash: templateParamsHash, planFingerprint: templatePlan.planFingerprint };
    const witnessSummary = { kind: 'provider pure function', seam: SEAM, fieldsCompared: WITNESS_FIELDS, matches: witness.ok };
    const templateArtifact = {
      schema: 'nctk-s1-badge-glyph-template-artifact@1', part: PART, producedBy: PRODUCED_BY,
      guarantee: ID, badgeCount: serializedVerdicts.length,
      config, counts, witness: witnessSummary,
      verdicts: serializedVerdicts
    };
    const entry = ctx.artifact('badgeGlyphTemplate', 'glyph-template-verdicts-json', prettyJsonBytes(templateArtifact), undefined, { path: 's1/badgeGlyphTemplate.json' });
    const objects = ctx.check('objects', serializedVerdicts.every((v) => typeof v.badgeId === 'string' && typeof v.agreement === 'string'));
    const artifactsRehashedAfterWrite = ctx.check('artifactsRehashedAfterWrite', entry.rehashed);

    ctx.frame({
      title: `badgeGlyphTemplate: ${counts.agree} agree, ${counts.disagree} disagree, ${counts.templateAbstained} template-abstained`,
      calculation: PRODUCED_BY, tick: templateOp.id,
      parts: [
        { address: PART, kind: 'ledger', artifact: entry, data: { rows: serializedVerdicts.map((v) => Object.fromEntries(WITNESS_FIELDS.map((k) => [k, v[k] ?? null]))) } },
        { address: `${PART}#bbox`, kind: 'bbox', data: { boxes: badges.filter((b) => b.bbox).map((b, i) => [...b.bbox, `${b.label ?? '?'}:${serializedVerdicts[i]?.agreement ?? '?'}`]) } },
        { address: `${PART}#counts`, kind: 'ledger', data: { rows: [counts] } }
      ],
      verdicts: serializedVerdicts.map((v) => ({ name: `${v.badgeId}: reader ${v.currentLabel ?? '-'} / template ${v.templateLabel ?? '-'} (${v.agreement})`, ok: v.agreement !== 'disagree' }))
    });

    const record = {
      guarantee: ID, part: PART, producedBy: PRODUCED_BY,
      badgeCount: serializedVerdicts.length,
      config, counts, witness: witnessSummary,
      checks: { objects, serializerMatchesWitness: witness.ok, agreementCountsSum, artifactsRehashedAfterWrite },
      artifacts: [legacyArtifact(entry)]
    };
    ctx.publish('stages.S1.glyphTemplateMaterialization', record);
    ctx.publish('materializations.S1BadgeGlyphTemplate', record);
    return { totals: counts, badgeCount: serializedVerdicts.length, producedBy: PRODUCED_BY, config };
  }
});
