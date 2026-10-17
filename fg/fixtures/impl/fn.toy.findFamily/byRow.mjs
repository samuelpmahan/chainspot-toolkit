/** fn.toy.findFamily, implementation B: a blob is family when its top row is in the upper half. */
export const reads = ['px.blobs'];
export default function byRow(parts) {
  const { width, height, blobs } = parts.get('px.blobs');
  const top = (b) => Math.floor(Math.min(...b.px) / width);
  return { rule: 'top<half', members: blobs.filter((b) => top(b) < height / 2).map((b) => b.id) };
}
