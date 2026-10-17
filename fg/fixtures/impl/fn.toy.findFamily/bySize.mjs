/** fn.toy.findFamily, implementation A: a blob is family when it has at least 4 px. */
export const reads = ['px.blobs'];
export default function bySize(parts) {
  const { blobs } = parts.get('px.blobs');
  return { rule: 'size>=4', members: blobs.filter((b) => b.px.length >= 4).map((b) => b.id) };
}
