// Dump every occluder candidate for each still-missing tee: occlusion-only feasible centres, and the hallway step at
// each occluder's centroid pose, for rendering.
import { writeFileSync } from 'node:fs';
const T = await import('/home/user/chainspot-toolkit/ports/s4recover/teeRecover.mjs');
const { loadAttemptParts } = await import('/home/user/chainspot-toolkit/ports/s4recover/run.mjs');
const [course, attempt, holes, out] = process.argv.slice(2);
const parts = loadAttemptParts({ specimen: course, attempt });
const ctx = T.createRecoveryContext(T.recoveryInputs((k) => parts.values[k]));
ctx.hallway = T.learnHallwayWidth(ctx);
const res = { course, hallway: ctx.hallway, tpl: { L: ctx.tpl.lengthPx, W: ctx.tpl.widthPx }, holes: {} };
for (const h of holes.split(',')) {
  const bi = ctx.badges.findIndex((b) => String(b.label) === h), plate = ctx.badges[bi].plateCenter;
  const raw = T.occluderSearch(ctx, bi, { hallwayTest: false, keepCenters: true });
  const withHall = T.occluderSearch(ctx, bi, { keepCenters: true });
  for (const r of raw.regions) {
    const hw = withHall.regions.find((x) => x.occluder === r.occluder);
    r.hallwayCenters = hw?.centers ?? [];
    r.stepAtCentroid = T.hallwayStep(ctx, r.centroid, plate, ctx.hallway.widthPx).stepLum;
    // what lies BEHIND the pad (away from the badge): the hallway ends at the tee, so a true tee has no hallway behind it
    const dx = plate[0] - r.centroid[0], dy = plate[1] - r.centroid[1], D = Math.hypot(dx, dy);
    const behind = [r.centroid[0] - dx / D * 60, r.centroid[1] - dy / D * 60];
    r.stepBehind = T.hallwayStep(ctx, r.centroid, behind, ctx.hallway.widthPx).stepLum;
  }
  res.holes[h] = { plate, distanceRangePx: raw.distanceRangePx, regions: raw.regions };
}
writeFileSync(out, JSON.stringify(res));
