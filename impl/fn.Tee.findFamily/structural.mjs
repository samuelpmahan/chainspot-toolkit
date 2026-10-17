/**
 * fn.Tee.findFamily / structural: the toolkit-layer structural refinement
 * (ports/early/s3FamilyFix.mjs computeFamilyFix, declared spec delta
 * refine.s3.findFamily.structural): an anchored pad model and per-candidate
 * structural tests; members are the ADMITTED plus EXCUSED candidates.
 *
 * Reads only Parts on the restored S3 board (px.tees.rings, px.tees.family,
 * px.components, px.image.cropped, px.badges, px.baskets). The fork-join
 * needs only the member poses, so makeTee returns the (ring, frame) pair
 * instead of materializing tee objects (that is fg.s3.pxTeesFamilyFix's job
 * on its own lane).
 *
 * (board, env) -> members (fg/s3/teeFamily.mjs memberPose).
 */
import { memberPose } from '../../fg/s3/teeFamily.mjs';
import { computeFamilyFix } from '../../ports/early/s3FamilyFix.mjs';

export default function structural(board) {
  const { rows } = computeFamilyFix({
    rings: board.get('px.tees.rings'), family: board.get('px.tees.family'),
    fields: board.get('px.components'), image: board.get('px.image.cropped'),
    badges: board.get('px.badges'), baskets: board.get('px.baskets'),
    makeTee: (pair) => pair
  });
  return rows.filter((r) => r.verdict !== 'ELIMINATED')
    .map((r) => {
      if (!r.frame) throw new Error(`structural findFamily admitted unframed candidate ${r.index}; a member pose needs a frame`);
      return memberPose(r.ring, r.frame, { verdict: r.verdict, anchor: r.anchor });
    })
    .sort((a, b) => (a.center[1] - b.center[1]) || (a.center[0] - b.center[0]));
}
