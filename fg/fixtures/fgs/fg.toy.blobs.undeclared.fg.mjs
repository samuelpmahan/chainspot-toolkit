/** Toy FG with no stage declaration: crossCheck must report it, not crash. */
import { defineGuarantee } from '../../guarantee.mjs';

export default defineGuarantee({
  id: 'fg.toy.blobs.undeclared',
  guards: ['px.blobs'],
  run(ctx) {
    return { totals: { blobCount: ctx.board.get('px.blobs').blobs.length } };
  }
});
