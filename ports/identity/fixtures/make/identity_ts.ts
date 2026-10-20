// Makes fixtures/identity-ts.fixture.json: ChainSpot's own courseSignature.ts (bare clone, main) run on the same inputs the JS port gets.
// Usage: bun identity_ts.ts <dir holding src/lib from `git archive main src/lib`> <points.json> <out.json>
// points.json = { name: { badges: [{holeNumber,xPx,yPx}], baskets: [] } } read through the store (tk.identity.badgePoints).
const [, , root, pointsFile, outFile] = process.argv;
const { computeSignatureDescriptor, hashSignatureDescriptor, matchSignatures } = await import(`${root}/src/lib/courseSignature`);
const points = JSON.parse(await Bun.file(pointsFile).text());
// the synthetic courses of ChainSpot's tests/unit/courseSignature.test.ts (copied, not imported)
function syntheticCourse(n: number, offset = 0) {
  const badges: any[] = [], baskets: any[] = [];
  for (let i = 1; i <= n; i += 1) {
    const holeNumber = i + offset, bx = 100 * i + 60 * Math.sin(i * 1.7) + 20 * Math.cos(i * 0.4), by = 200 + 45 * Math.cos(i * 0.9) + 15 * i;
    badges.push({ holeNumber, xPx: bx, yPx: by });
    baskets.push({ holeNumber, xPx: bx + 80 * Math.cos(i * 1.3) + 40, yPx: by + 60 * Math.sin(i * 1.3) + 55 });
  }
  return { badges, baskets };
}
const sim = (c: any, s: number, r: number, tx: number, ty: number) => {
  const f = (p: any) => ({ ...p, xPx: s * (p.xPx * Math.cos(r) - p.yPx * Math.sin(r)) + tx, yPx: s * (p.xPx * Math.sin(r) + p.yPx * Math.cos(r)) + ty });
  return { badges: c.badges.map(f), baskets: c.baskets.map(f) };
};
const inputs: Record<string, any> = {};
for (const [k, v] of Object.entries<any>(points)) inputs[k] = { badges: v.badges, baskets: [] };
const base = syntheticCourse(18), twelve = syntheticCourse(12), eleven = syntheticCourse(AFF());
function AFF() { return 11; }
inputs['syn18'] = base; inputs['syn18-sim'] = sim(base, 1.3, (12 * Math.PI) / 180, 300, -150); inputs['syn18-rot-scale'] = sim(base, 1.8, 0.3, 40, -12);
inputs['syn12'] = twelve; inputs['syn12-sim'] = sim(twelve, 1.1, 0.15, 50, 20);
const corrupted = sim(twelve, 1.1, 0.15, 50, 20); corrupted.badges[0] = { ...corrupted.badges[0], xPx: corrupted.badges[0].xPx + 4000, yPx: corrupted.badges[0].yPx - 3500 }; inputs['syn12-corrupt'] = corrupted;
inputs['syn11'] = eleven; inputs['syn11-affine'] = { badges: eleven.badges.map((p: any) => ({ ...p, xPx: p.xPx * 2.2, yPx: p.yPx * 0.6 })), baskets: eleven.baskets.map((p: any) => ({ ...p, xPx: p.xPx * 2.2, yPx: p.yPx * 0.6 })) };
inputs['syn5'] = syntheticCourse(5);
inputs['unrelated'] = { badges: Array.from({ length: 18 }, (_, i) => ({ holeNumber: i + 1, xPx: 40 * (i % 5) + 7 * Math.sin(i * 5.1), yPx: 40 * Math.floor(i / 5) + 7 * Math.cos(i * 3.3) })), baskets: [] };
inputs['degenerate'] = { badges: Array.from({ length: 6 }, (_, i) => ({ holeNumber: i + 1, xPx: 100, yPx: 100 })), baskets: [] };
const names = Object.keys(inputs), descriptors: any = {}, hashes: any = {}, matches: any = {};
for (const n of names) {
  const d = computeSignatureDescriptor(inputs[n]); descriptors[n] = d; hashes[n] = d.ok ? await hashSignatureDescriptor(d) : null;
}
for (const a of names) for (const b of names) {
  const m = matchSignatures(inputs[a], inputs[b]);
  matches[`${a}|${b}`] = { matched: m.matched, normalizedRms: Number.isFinite(m.normalizedRms) ? m.normalizedRms : null, confidence: m.confidence, usedHoleNumbers: m.usedHoleNumbers, droppedHoleNumbers: m.droppedHoleNumbers, model: m.model, coefficients: m.transform ? m.transform.coefficients : null };
}
await Bun.write(outFile, JSON.stringify({ source: 'ChainSpot main:src/lib/courseSignature.ts run under bun', inputs, descriptors, hashes, matches }));
console.log(names.length, 'inputs;', Object.keys(matches).length, 'matches');
