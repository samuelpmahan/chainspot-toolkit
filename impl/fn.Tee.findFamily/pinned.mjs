/**
 * fn.Tee.findFamily / pinned: the provider's own family selection, the
 * baseline resemblance rule. The pinned selectTeeFamily is re-run over the
 * measured (ring, frame) pairs on the restored S3 board (px.tees.family
 * .measured: the rings Part's candidates paired with their measured frame
 * components): the largest set of framed candidates whose frame
 * major/minor/area sit within log-ratios 1.25/1.25/1.5 of a seed.
 *
 * parts -> members (fg/s3/teeFamily.mjs memberPose). Reads px.tees.family
 * by address and calls the pinned provider function as the registered
 * Calculation fn.provider.S3.selectTeeFamily (the provider is reached
 * through the runner's store, never an injected value).
 */
import { memberPose } from '../../fg/s3/teeFamily.mjs';

export const reads = ['px.tees.family'];
export const calls = ['fn.provider.S3.selectTeeFamily'];

export default function pinned(parts) {
  const family = parts.get('px.tees.family');
  const selected = parts.call('fn.provider.S3.selectTeeFamily', { measured: family.measured });
  return selected.members
    .map((m) => memberPose(m.ring, m.frame, { rule: 'selectTeeFamily resemblance', anchor: selected.anchor ? selected.anchor.ring === m.ring : false }))
    .sort((a, b) => (a.center[1] - b.center[1]) || (a.center[0] - b.center[0]));
}
