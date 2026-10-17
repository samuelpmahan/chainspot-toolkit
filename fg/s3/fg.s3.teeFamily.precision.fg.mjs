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
 * is parsed and hashed HERE, so the record carries the hash of exactly the
 * testimony that judged; it must name this run's source image and its frame
 * must be the source frame, and the S0 crop receipt's arithmetic must match
 * the canonical raster. The canonical points (testimony.source.teePoints)
 * are re-derived from the annotation bytes by a witness, and a point-major
 * re-judgement must agree with the member-major judge.
 *
 * The guarantee certifies the JUDGEMENT; a precision below 1 is a finding
 * recorded as data (judged), never a failure, and nothing claims acceptance.
 */
import { guarantee, pipe, read, step } from '../compose.mjs';
import { framed, gated, judged, lane, unitful, witnessed } from '../mixins.mjs';
import { canonicalJson, sha256Hex } from '../canon.mjs';
import { ACCEPTANCE, TEE_FAMILY_SLOT, insidePadded, judgeMembers, testimonyTeePoints } from './teeFamily.mjs';

const { part: PART, slot: SLOT, judgePadPx: PAD } = TEE_FAMILY_SLOT;
const ANNOTATION = 'testimony.source.annotation';
const TEE_POINTS = 'testimony.source.teePoints';
const UNITS = {
  totals: 'count (members / annotated points), precision a fraction', precision: 'fraction (agrees / members)', members: 'count', agrees: 'count', disagrees: 'count',
  annotatedPoints: 'count', coveredPoints: 'count', uncoveredPoints: 'count', hole: 'hole number (ordinal)', holes: 'hole number (ordinal)', uncovered: 'hole number (ordinal)', sharedPoints: 'hole number (ordinal)', source: 'px (source frame)',
  upperRowsRemoved: 'px (rows)', lowerRowsRemoved: 'px (rows)', originalPx: 'px', annotation: 'px', canonicalPx: 'px', receipt: 'px'
};

const testimony = step('parse and hash the testimony', (env, s) => {
  const t = s.parts[ANNOTATION], crop = s.parts['tk.source.cropReceipt'], sourceSha256 = s.parts['tk.source.sha256'];
  const bytes = t?.bytes instanceof Uint8Array ? t.bytes : env.fail(`${ANNOTATION}.bytes must be the annotation file bytes`);
  let annotation;
  try { annotation = JSON.parse(new TextDecoder().decode(bytes)); } catch (e) { env.fail(`testimony ${t.path} is not JSON: ${e.message}`); }
  const image = s.parts['px.image.cropped'];
  env.check('testimonyNamesThisSource', annotation.sourceImage?.sha256 === sourceSha256, { annotated: annotation.sourceImage?.sha256 ?? null, run: sourceSha256 });
  env.check('testimonyFrameIsSourceFrame', annotation.sourceImage?.widthPx === crop.originalPx.width && annotation.sourceImage?.heightPx === crop.originalPx.height,
    { annotation: [annotation.sourceImage?.widthPx, annotation.sourceImage?.heightPx], source: [crop.originalPx.width, crop.originalPx.height] });
  env.check('cropReceiptMatchesCanonical', image.widthPx === crop.originalPx.width && image.heightPx === crop.originalPx.height - crop.upperRowsRemoved - crop.lowerRowsRemoved,
    { canonicalPx: [image.widthPx, image.heightPx], receipt: { upperRowsRemoved: crop.upperRowsRemoved, lowerRowsRemoved: crop.lowerRowsRemoved, originalPx: crop.originalPx } });
  return { annotation, crop, testimonySha256: sha256Hex(bytes), points: s.parts[TEE_POINTS].points, members: s.parts[PART].members, implementation: s.parts[PART].implementation };
});

// The canonical points re-derived here from the annotation bytes and the crop receipt equal the Part the judge consumes.
const points = witnessed.path('testimonyTeePoints', {
  name: 'teePointsFromAnnotation', as: 'teePoints',
  run: (s) => canonicalJson(testimonyTeePoints(s.annotation, s.crop)) === canonicalJson(s.points)
});

const judge = judged('testimony', { judge: (s) => { const j = judgeMembers(s.members, s.points, { padPx: PAD }); return { ...j, matches: j.totals.disagrees === 0 }; } });

const balance = step('every member judged once', (env, s) => {
  const j = s.judged.testimony, t = j.totals;
  env.check('everyMemberJudgedOnce', j.verdicts.length === s.members.length && j.verdicts.every((v, i) => v.index === i), { members: s.members.length, verdicts: j.verdicts.length });
  env.check('verdictsBalance', t.agrees + t.disagrees === t.members && t.coveredPoints + t.uncoveredPoints === t.annotatedPoints, t);
});

// Point-major re-judgement, never reading judgeMembers' verdicts.
const pointMajor = witnessed.path('pointMajorJudgement', {
  name: 'pointMajorAgrees', as: 'pointMajor',
  run: (s) => {
    const covering = new Map(s.members.map((_, i) => [i, 0]));
    for (const p of s.points) for (let i = 0; i < s.members.length; i++) if (insidePadded(p.canonical, s.members[i].bbox, PAD)) covering.set(i, covering.get(i) + 1);
    const disagree = s.judged.testimony.verdicts.filter((v) => (covering.get(v.index) > 0) !== (v.verdict === 'agrees')).map((v) => v.index);
    return disagree.length ? { ok: false, disagree } : true;
  }
});

const frames = framed((s) => {
  const j = s.judged.testimony, t = j.totals;
  const agree = j.verdicts.filter((v) => v.verdict === 'agrees'), disagree = j.verdicts.filter((v) => v.verdict === 'disagrees');
  return [{
    title: `${s.implementation}: precision ${t.precision} (${t.agrees}/${t.members} agree with Sam's annotation; ${t.uncoveredPoints} annotated point(s) uncovered)`,
    calculation: SLOT,
    parts: [
      { address: `${PART}#agrees`, kind: 'bbox', data: { boxes: agree.map((v) => [...v.bbox, `#${v.index}`]) } },
      { address: `${PART}#disagrees`, kind: 'bbox', data: { boxes: disagree.map((v) => [...v.bbox, `#${v.index}`]) } },
      { address: 'testimony.tees', kind: 'points', data: { points: s.points.map((p) => [...p.canonical, `hole ${p.hole}`]) } },
      { address: `${PART}#verdicts`, kind: 'ledger', data: { rows: j.verdicts.map((v) => ({ ...v, holes: v.holes.join(' ') })) } },
      { address: `${PART}#precision`, kind: 'scalar', data: { value: t.precision, unit: `(${t.agrees}/${t.members})` } }
    ],
    verdicts: j.verdicts.map((v) => ({ name: `#${v.index} ${v.verdict}${v.holes.length ? ` (hole ${v.holes.join(', ')})` : ''}`, ok: v.verdict === 'agrees' }))
  }];
});

export default guarantee({
  id: TEE_FAMILY_SLOT.precision, guards: [PART], site: 'forkjoin', audit: [unitful({ units: UNITS })],
  result: (s) => {
    const j = s.judged.testimony;
    return {
      totals: j.totals,
      acceptance: ACCEPTANCE,
      testimony: { path: s.parts[ANNOTATION].path, sha256: s.testimonySha256, authoredBy: 'Sam (hand annotation)', frame: 'source', canonicalRule: `canonical y = source y - ${s.crop.upperRowsRemoved} (S0 cropReceipt.upperRowsRemoved)` },
      padPx: PAD, points: s.points, verdicts: j.verdicts, uncovered: j.uncovered, sharedPoints: j.sharedPoints
    };
  }
}, pipe(read(PART, 'px.image.cropped', ANNOTATION, TEE_POINTS, 'tk.source.cropReceipt', 'tk.source.sha256'),
  lane(TEE_FAMILY_SLOT.lane), gated(TEE_FAMILY_SLOT.materialize),
  testimony, points, judge, balance, pointMajor, frames));
