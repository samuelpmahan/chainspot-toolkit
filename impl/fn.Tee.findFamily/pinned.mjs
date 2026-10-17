/**
 * fn.Tee.findFamily / pinned: the provider's own family selection, the
 * baseline resemblance rule. The pinned selectTeeFamily is re-run over the
 * measured (ring, frame) pairs on the restored S3 board (px.tees.family
 * .measured: the rings Part's candidates paired with their measured frame
 * components): the largest set of framed candidates whose frame
 * major/minor/area sit within log-ratios 1.25/1.25/1.5 of a seed.
 *
 * (board, env) -> members (fg/s3/teeFamily.mjs memberPose). env.selectTeeFamily
 * is the pinned provider function, injected by the runner because the
 * provider is reached through its dist() loader, not an import path.
 */
import { memberPose } from '../../fg/s3/teeFamily.mjs';

export default function pinned(board, env) {
  if (typeof env?.selectTeeFamily !== 'function') throw new Error('pinned findFamily needs env.selectTeeFamily (the pinned provider function)');
  const family = board.get('px.tees.family');
  const selected = env.selectTeeFamily(family.measured);
  return selected.members
    .map((m) => memberPose(m.ring, m.frame, { rule: 'selectTeeFamily resemblance', anchor: selected.anchor ? selected.anchor.ring === m.ring : false }))
    .sort((a, b) => (a.center[1] - b.center[1]) || (a.center[0] - b.center[0]));
}
