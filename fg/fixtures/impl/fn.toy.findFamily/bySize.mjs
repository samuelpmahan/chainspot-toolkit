/** fn.toy.findFamily, implementation A: a blob is family when it has at least 4 px. */
export default function bySize(board) {
  const { blobs } = board.get('px.blobs');
  board.set('px.blobs.family', { rule: 'size>=4', members: blobs.filter((b) => b.px.length >= 4).map((b) => b.id) });
}
