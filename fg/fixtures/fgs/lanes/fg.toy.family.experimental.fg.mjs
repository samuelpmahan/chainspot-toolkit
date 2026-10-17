/**
 * Toy lane-gated FG: dormant unless lane toy-lane is enabled, like
 * fg.s1.pxBadges.assembly under lane s1-badge-assembly (default OFF).
 */
import { defineGuarantee } from '../../../guarantee.mjs';

export default defineGuarantee({
  id: 'fg.toy.family.experimental',
  guards: ['px.blobs.family'],
  requires: ['fg.toy.family.materialize'],
  lane: 'toy-lane',
  run(ctx) {
    const { members } = ctx.records['fg.toy.family.materialize'];
    ctx.check('nonEmptyFamily', members.length > 0);
    return { totals: { memberCount: members.length } };
  }
});
