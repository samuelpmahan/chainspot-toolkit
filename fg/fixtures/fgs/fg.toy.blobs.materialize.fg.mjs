/**
 * Toy materialize FG over 'px.blobs': serialize every blob from the board
 * into an artifact, check each blob is non-empty and in bounds, witness the
 * px union by a second code path (a bitmap count instead of a Set), and
 * emit two frames (the blobs with their bboxes, then the per-blob ledger).
 */
import { defineGuarantee } from '../../guarantee.mjs';

const bboxOf = (px, width) => {
  const xs = px.map((p) => p % width), ys = px.map((p) => Math.floor(p / width));
  const x = Math.min(...xs), y = Math.min(...ys);
  return [x, y, Math.max(...xs) - x + 1, Math.max(...ys) - y + 1];
};

export default defineGuarantee({
  id: 'fg.toy.blobs.materialize',
  guards: ['px.blobs'],
  run(ctx) {
    const part = ctx.get('px.blobs');
    if (!Array.isArray(part?.blobs)) ctx.fail('px.blobs carries no blob list (opaque Part)');
    const { width, height } = part;
    const blobs = part.blobs.map((b) => ({ id: b.id, px: [...b.px].sort((p, q) => p - q), pxCount: b.px.length, bbox: b.px.length ? bboxOf(b.px, width) : null }));
    ctx.check('everyBlobHasPx', blobs.every((b) => b.pxCount > 0), { empty: blobs.filter((b) => !b.pxCount).map((b) => b.id) });
    ctx.check('pxInBounds', blobs.every((b) => b.px.every((p) => p >= 0 && p < width * height)));
    const union = new Set(blobs.flatMap((b) => b.px)).size;
    ctx.witness('unionByBitmap', () => {
      const bitmap = new Uint8Array(width * height);
      for (const b of part.blobs) for (const p of b.px) bitmap[p] = 1;
      const count = bitmap.reduce((n, v) => n + v, 0);
      return { ok: count === union, count };
    });
    const artifact = ctx.artifact('px.blobs', 'blob-set-json', { schema: 'toy-blobs@1', part: 'px.blobs', width, height, blobs });
    ctx.frame({
      title: 'px.blobs materialized', calculation: 'fn.toy.findBlobs',
      parts: [
        ...blobs.map((b) => ({ address: `px.blobs#${b.id}`, kind: 'pxset', data: { width, height, px: b.px } })),
        { address: 'px.blobs.bbox', kind: 'bbox', data: { boxes: blobs.filter((b) => b.bbox).map((b) => [...b.bbox, b.id]) } }
      ]
    });
    ctx.frame({
      title: 'px.blobs ledger',
      parts: [
        { address: 'px.blobs.ledger', kind: 'ledger', artifact, data: { rows: blobs.map((b) => ({ id: b.id, pxCount: b.pxCount, bbox: b.bbox })) } },
        { address: 'px.blobs.union', kind: 'scalar', data: { value: union, unit: 'px' } }
      ]
    });
    return { totals: { blobCount: blobs.length, pxUnion: union }, blobIds: blobs.map((b) => b.id) };
  }
});
