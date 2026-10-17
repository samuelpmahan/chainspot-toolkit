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
 * live board and the compiled template-on plan as the Part
 * tk.s1.badgeGlyphTemplate.plan (fn.provider.S1.badgeGlyphTemplate.compile),
 * restores a branch with fn.provider.restore.S1 (inParts
 * tk.stage.S1.snapshot), executes the op there with
 * fn.provider.S1.badgeGlyphTemplate.execute and witnesses with
 * fn.provider.S1.classifyBadgeAgainstTemplates. The restored branch is the
 * value fn.provider.restore.S1 returns, read directly by this FG.
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
const PLAN = 'tk.s1.badgeGlyphTemplate.plan';
const RESTORE = 'fn.provider.restore.S1';
const EXECUTE = 'fn.provider.S1.badgeGlyphTemplate.execute';
const CLASSIFY = 'fn.provider.S1.classifyBadgeAgainstTemplates';
const WITNESS_FIELDS = ['badgeId', 'currentLabel', 'templateLabel', 'templateBestLabel', 'templateScore', 'templateMargin', 'templateAbstention', 'readerConfidence', 'agreement'];

export default defineGuarantee({
  id: ID,
  guards: [PART],
  reads: ['px.badges', PLAN],
  calls: [RESTORE, EXECUTE, CLASSIFY],
  run(ctx) {
    const template = ctx.get(PLAN);
    if (!template.op) ctx.fail('badgeGlyphTemplate operation unavailable in the compiled template-on plan');
    const templateOp = template.op;
    const branch = ctx.call(RESTORE);
    ctx.call(EXECUTE, { board: branch });
    if (!branch.has(PART)) ctx.fail('badgeGlyphTemplate branch produced no verdicts');
    const verdicts = branch.get(PART);
    const reads = branch.get('badges');
    const badges = ctx.get('px.badges');
    if (!Array.isArray(verdicts) || verdicts.length !== badges.length) ctx.fail(`template verdicts (${verdicts?.length}) disagree with px.badges (${badges.length})`);
    const serializedVerdicts = verdicts.map(legacyPlain);
    // Independent witness: the provider's pure classifier over the same
    // branch inputs (localImage bitmap, reads, viewport shift, default knobs).
    const witness = ctx.witness('serializerMatchesWitness', () => {
      const localImage = branch.get('localImage');
      const bitmap = { width: localImage.width, height: localImage.height, data: localImage.data };
      const { topPx } = branch.get('viewport');
      for (let i = 0; i < reads.length; i++) {
        const w = ctx.call(CLASSIFY, { bitmap, read: reads[i], topPx });
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
    const { config } = template;
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
