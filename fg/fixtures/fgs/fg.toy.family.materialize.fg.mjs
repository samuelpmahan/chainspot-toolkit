/**
 * Toy downstream FG over 'px.blobs.family' (written by whichever
 * fn.toy.findFamily implementation ran): gates against the
 * fg.toy.blobs.materialize RECORD, never the board, the way
 * fg.s1.pxBadges.assembly gates against the materialize and digits
 * records. Members must be ids the materialize record serialized, and the
 * member px total cannot exceed its union.
 */
import { defineGuarantee } from '../../guarantee.mjs';

export default defineGuarantee({
  id: 'fg.toy.family.materialize',
  guards: ['px.blobs.family'],
  reads: ['px.blobs.family', 'px.blobs'],
  requires: ['fg.toy.blobs.materialize'],
  run(ctx) {
    const base = ctx.records['fg.toy.blobs.materialize'];
    const family = ctx.get('px.blobs.family');
    const blobs = ctx.get('px.blobs');
    const members = [...family.members].sort();
    const unknown = members.filter((id) => !base.blobIds.includes(id));
    ctx.check('membersAreMaterializedBlobs', unknown.length === 0, { unknown });
    const memberPx = blobs.blobs.filter((b) => members.includes(b.id)).reduce((n, b) => n + b.px.length, 0);
    ctx.check('memberPxWithinUnion', memberPx <= base.totals.pxUnion, { memberPx, pxUnion: base.totals.pxUnion });
    ctx.frame({
      title: `family by ${family.rule}`, calculation: 'fn.toy.findFamily',
      parts: [
        { address: 'px.blobs.family', kind: 'pxset', data: { width: blobs.width, height: blobs.height, px: blobs.blobs.filter((b) => members.includes(b.id)).flatMap((b) => b.px).sort((p, q) => p - q) } },
        { address: 'px.blobs.family.count', kind: 'scalar', data: { value: members.length } }
      ],
      verdicts: base.blobIds.map((id) => ({ name: id, ok: members.includes(id) }))
    });
    return { totals: { memberCount: members.length, memberPx }, members, rule: family.rule };
  }
});
