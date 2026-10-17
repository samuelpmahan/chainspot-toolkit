/**
 * Pixel sets as runs (fg/delta layer, browser-safe).
 *
 * A pixel set is a sorted list of flat raster indices (y * width + x). In a
 * Δ stream they travel as RUNS: a flat array [start, length, start, length,
 * ...] over the sorted indices, so a badge plate of 1549 px is ~70 numbers
 * instead of 1549. Every model in fg/delta uses the same encoding, so stream
 * sizes compare models, not encodings.
 */

export function toRuns(indices) {
  const sorted = Array.from(new Set(indices)).sort((a, b) => a - b);
  const runs = [];
  for (let i = 0; i < sorted.length;) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++;
    runs.push(sorted[i], j - i + 1);
    i = j + 1;
  }
  return runs;
}

export function fromRuns(runs) {
  const out = [];
  for (let i = 0; i < runs.length; i += 2) for (let k = 0; k < runs[i + 1]; k++) out.push(runs[i] + k);
  return out;
}

export const countRuns = (runs) => { let n = 0; for (let i = 1; i < runs.length; i += 2) n += runs[i]; return n; };

/**
 * Pixels enclosed by a set but not in it: flood the set's padded bounding box
 * from its border through non-member pixels; whatever the flood cannot reach
 * and the set does not hold is enclosed-unowned (a basket's anti-alias seam
 * between body and shell, a tee's hole, a badge's window residue).
 */
export function enclosedUnowned(indices, width) {
  if (!indices.length) return 0;
  const member = new Set(indices);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of indices) { const x = p % width, y = Math.floor(p / width); if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  x0--; y0--; x1++; y1++;
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  const seen = new Uint8Array(w * h);
  const stack = [0];
  seen[0] = 1;
  let outside = 0;
  while (stack.length) {
    const q = stack.pop();
    outside++;
    const qx = q % w, qy = Math.floor(q / w);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = qx + dx, ny = qy + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const n = ny * w + nx;
      if (seen[n]) continue;
      // a coordinate outside the raster row (x < 0 or x >= width) is never a member
      const gx = x0 + nx, gy = y0 + ny;
      if (gx >= 0 && gx < width && member.has(gy * width + gx)) continue;
      seen[n] = 1;
      stack.push(n);
    }
  }
  return w * h - outside - member.size;
}
