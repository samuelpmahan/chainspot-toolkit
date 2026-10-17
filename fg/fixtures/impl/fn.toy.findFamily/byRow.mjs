/** fn.toy.findFamily, implementation B: a blob is family when its top row is in the upper half. */
export default function byRow(board) {
  const { width, height, blobs } = board.get('px.blobs');
  const top = (b) => Math.floor(Math.min(...b.px) / width);
  board.set('px.blobs.family', { rule: 'top<half', members: blobs.filter((b) => top(b) < height / 2).map((b) => b.id) });
}
