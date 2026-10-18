// node adjacent.mjs <course> <attempt> <out.json>   (docs/evidence/occluders)
// "Bright components adjacent to known occluders" (Sam): S1 bright components that touch an opaque Part (S1 badge, S2
// basket, within 2 px) and are mostly owned by no Part. What a Part owns is inferred from its structure (ownedPx in
// fg/pxset.mjs), never picked by field. Writes them per course for rendering.
import { readFileSync, writeFileSync } from 'node:fs';
import { deserialize } from 'node:v8';
import { ownedPx } from '../../../fg/pxset.mjs';
const [course, attempt, outFile] = process.argv.slice(2);
const out = `/home/user/chainspot-toolkit/attempts/stages/${attempt}/fork/stage-output`, A = `${out}/early/artifacts`;
const board = new Map(deserialize(readFileSync(`${out}/early/s3.pxc.bin`))), f = board.get('px.components').bright;
const W = f.mask.width, H = f.mask.height, labels = f.labels;
const badges = board.get('px.badges'), baskets = board.get('px.baskets');
const tees = JSON.parse(readFileSync(`${A}/s3fix/px.tees.refined.json`, 'utf8')).tees;   // a lane Part: not on the board yet
const owner = new Int32Array(W * H).fill(-1), names = [];
const own = (name, part) => { const k = names.push(name) - 1; for (const p of ownedPx(W, H, part).px) owner[p] = k; };
badges.forEach((b) => own(`Badge ${b.label}`, b));
baskets.forEach((k, i) => own(`S2 basket ${i}`, k));
tees.forEach((t, i) => own(`S3 tee ${i}`, t));
const isOcc = (k) => k >= 0 && !names[k].startsWith('S3 tee');
const area = new Map(), unowned = new Map(), touches = new Map();
for (let i = 0; i < W * H; i++) {
  const l = labels[i]; if (!l) continue;
  area.set(l, (area.get(l) ?? 0) + 1);
  if (owner[i] >= 0) continue;
  unowned.set(l, (unowned.get(l) ?? 0) + 1);
  const x = i % W, y = (i / W) | 0;
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
    const o = owner[yy * W + xx];
    if (isOcc(o)) { if (!touches.has(l)) touches.set(l, new Set()); touches.get(l).add(names[o]); }
  }
}
const comps = new Map(f.components.map((c) => [c.label, c]));
const rows = [...touches].filter(([l]) => unowned.get(l) / area.get(l) >= 0.5).map(([l, set]) => {
  const px = []; for (let i = 0; i < W * H; i++) if (labels[i] === l && owner[i] < 0) px.push(i);
  const xs = px.map((i) => i % W), ys = px.map((i) => (i / W) | 0), x0 = Math.min(...xs), y0 = Math.min(...ys);
  return { label: l, area: area.get(l), unownedPx: unowned.get(l), inComponentList: comps.has(l), bbox: [x0, y0, Math.max(...xs) - x0 + 1, Math.max(...ys) - y0 + 1], touches: [...set], px };
});
writeFileSync(outFile, JSON.stringify({ course, W, H, baskets: baskets.map((k) => k.bbox), rows }));
console.log(course, 'bright components', f.components.length, '| touching an occluder and mostly unowned:', rows.length, '| areas', rows.map((r) => r.area).sort((a, b) => a - b).join(' '));
