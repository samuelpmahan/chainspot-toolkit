/**
 * fg.s3.teeFamily.precision (stages/s3.json; lane s3-findfamily-forkjoin,
 * default OFF): every member a fn.Tee.findFamily implementation admitted is
 * judged against Sam's annotation testimony, the same way on every branch.
 *
 *   agrees     an annotated tee point lies inside the member's frame bbox,
 *              padded by 2 px (canonical frame)
 *   disagrees  no annotated tee point does: an impostor at S3
 *   uncovered  annotated tee points no member covers: recall information,
 *              never a failure at S3 (recall is S4's job)
 *
 * Testimony is a Part, never an injected value: testimony.source.annotation
 * (produced by the runner's fn.testimony.locate from tk.source.sha256: the
 * one testimony/<specimen>/*.annotation.json whose sourceImage names this
 * run's source; value { path, specimen, sha256, bytes }) is parsed and
 * hashed HERE, so the record carries the hash of exactly the testimony that
 * judged. The annotation frame is the source frame; the canonical points
 * are the Part testimony.source.teePoints (fn.testimony.teePoints over the
 * annotation and tk.source.cropReceipt: canonical y = source y minus the S0
 * crop receipt's upperRowsRemoved), which a witness re-derives from the
 * annotation bytes. The guarantee checks that the annotation names this
 * run's source image (tk.source.sha256) and that the receipt's crop
 * arithmetic matches the canonical raster on the board.
 *
 * The guarantee certifies the JUDGEMENT (faithful testimony, frame
 * conversion, every member judged exactly once, both directions of the
 * point/member relation agree); a precision below 1 is a finding recorded
 * as data, not a guarantee failure, and nothing here claims acceptance.
 */
import { defineGuarantee } from '../guarantee.mjs';
import { canonicalJson, sha256Hex } from '../canon.mjs';
import { ACCEPTANCE, TEE_FAMILY_SLOT, insidePadded, judgeMembers, testimonyTeePoints } from './teeFamily.mjs';

const { part: PART, slot: SLOT, judgePadPx: PAD } = TEE_FAMILY_SLOT;
const ANNOTATION = 'testimony.source.annotation';
const TEE_POINTS = 'testimony.source.teePoints';

export default defineGuarantee({
  id: TEE_FAMILY_SLOT.precision,
  guards: [PART],
  reads: [PART, 'px.image.cropped', ANNOTATION, TEE_POINTS, 'tk.source.cropReceipt', 'tk.source.sha256'],
  requires: [TEE_FAMILY_SLOT.materialize],
  lane: TEE_FAMILY_SLOT.lane,
  site: 'forkjoin',
  run(ctx) {
    const testimony = ctx.get(ANNOTATION);
    const cropReceipt = ctx.get('tk.source.cropReceipt');
    const sourceSha256 = ctx.get('tk.source.sha256');
    const bytes = testimony?.bytes instanceof Uint8Array ? testimony.bytes : ctx.fail(`${ANNOTATION}.bytes must be the annotation file bytes`);
    const testimonySha256 = sha256Hex(bytes);
    let annotation;
    try { annotation = JSON.parse(new TextDecoder().decode(bytes)); } catch (e) { ctx.fail(`testimony ${testimony.path} is not JSON: ${e.message}`); }
    const image = ctx.get('px.image.cropped');
    ctx.check('testimonyNamesThisSource', annotation.sourceImage?.sha256 === sourceSha256, { annotated: annotation.sourceImage?.sha256 ?? null, run: sourceSha256 });
    ctx.check('testimonyFrameIsSourceFrame', annotation.sourceImage?.widthPx === cropReceipt.originalPx.width && annotation.sourceImage?.heightPx === cropReceipt.originalPx.height,
      { annotation: [annotation.sourceImage?.widthPx, annotation.sourceImage?.heightPx], source: [cropReceipt.originalPx.width, cropReceipt.originalPx.height] });
    ctx.check('cropReceiptMatchesCanonical',
      image.widthPx === cropReceipt.originalPx.width && image.heightPx === cropReceipt.originalPx.height - cropReceipt.upperRowsRemoved - cropReceipt.lowerRowsRemoved,
      { canonical: [image.widthPx, image.heightPx], receipt: { upperRowsRemoved: cropReceipt.upperRowsRemoved, lowerRowsRemoved: cropReceipt.lowerRowsRemoved, originalPx: cropReceipt.originalPx } });

    const { points } = ctx.get(TEE_POINTS);
    // Witness: the canonical points re-derived here from the annotation
    // bytes and the crop receipt equal the Part the judge consumes.
    ctx.witness('teePointsFromAnnotation', () => canonicalJson(testimonyTeePoints(annotation, cropReceipt)) === canonicalJson(points));
    const members = ctx.get(PART).members;
    const judged = judgeMembers(members, points, { padPx: PAD });
    const t = judged.totals;
    ctx.check('everyMemberJudgedOnce', judged.verdicts.length === members.length && judged.verdicts.every((v, i) => v.index === i), { members: members.length, verdicts: judged.verdicts.length });
    ctx.check('verdictsBalance', t.agrees + t.disagrees === t.members && t.coveredPoints + t.uncoveredPoints === t.annotatedPoints, t);
    // Witness: point-major re-judgement, never reading judgeMembers' verdicts.
    ctx.witness('pointMajorAgrees', () => {
      const covering = new Map(members.map((_, i) => [i, 0]));
      for (const p of points) for (let i = 0; i < members.length; i++) if (insidePadded(p.canonical, members[i].bbox, PAD)) covering.set(i, covering.get(i) + 1);
      const disagree = judged.verdicts.filter((v) => (covering.get(v.index) > 0) !== (v.verdict === 'agrees')).map((v) => v.index);
      return disagree.length ? { ok: false, disagree } : true;
    });

    const label = ctx.get(PART).implementation;
    const agree = judged.verdicts.filter((v) => v.verdict === 'agrees');
    const disagree = judged.verdicts.filter((v) => v.verdict === 'disagrees');
    ctx.frame({
      title: `${label}: precision ${t.precision} (${t.agrees}/${t.members} agree with Sam's annotation; ${t.uncoveredPoints} annotated point(s) uncovered)`,
      calculation: SLOT,
      parts: [
        { address: `${PART}#agrees`, kind: 'bbox', data: { boxes: agree.map((v) => [...v.bbox, `#${v.index}`]) } },
        { address: `${PART}#disagrees`, kind: 'bbox', data: { boxes: disagree.map((v) => [...v.bbox, `#${v.index}`]) } },
        { address: 'testimony.tees', kind: 'points', data: { points: points.map((p) => [...p.canonical, `hole ${p.hole}`]) } },
        { address: `${PART}#verdicts`, kind: 'ledger', data: { rows: judged.verdicts.map((v) => ({ ...v, holes: v.holes.join(' ') })) } },
        { address: `${PART}#precision`, kind: 'scalar', data: { value: t.precision, unit: `(${t.agrees}/${t.members})` } }
      ],
      verdicts: judged.verdicts.map((v) => ({ name: `#${v.index} ${v.verdict}${v.holes.length ? ` (hole ${v.holes.join(', ')})` : ''}`, ok: v.verdict === 'agrees' }))
    });
    return {
      totals: t,
      acceptance: ACCEPTANCE,
      testimony: { path: testimony.path, sha256: testimonySha256, authoredBy: 'Sam (hand annotation)', frame: 'source', canonicalRule: `canonical y = source y - ${cropReceipt.upperRowsRemoved} (S0 cropReceipt.upperRowsRemoved)` },
      padPx: PAD,
      points,
      verdicts: judged.verdicts,
      uncovered: judged.uncovered,
      sharedPoints: judged.sharedPoints
    };
  }
});
