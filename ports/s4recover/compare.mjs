/**
 * The fn.Tee.recover comparator (browser-safe): joins the branches'
 * recovered tees by geometric identity (contracts/tee.pose@1, 2 px / 2 deg),
 * tabulates each branch's testimony judge, and emits frames:
 *   1. a ledger page over the whole canonical frame (recovered centers per
 *      branch, Sam's points), with the per-branch table
 *   2. one page per hole that any branch recovered or that is still
 *      missing after S3: an upscaled crop with known occluders shaded, the
 *      template outline of every branch's pose, the badge ray, and Sam's
 *      point.
 */
import { geometricJoin } from '../../fg/identity.mjs';
import { encodePngRgb, base64 } from '../../fg/png.mjs';
import { TEE_RECOVER_SLOT, ACCEPTANCE, OCC, OCC_NAMES, CLASS, padCorners, createRecoveryContext, recoveryInputs } from './teeRecover.mjs';

const r3 = (v) => Math.round(v * 1000) / 1000;
const BRANCH_COLORS = { greedyOccluded: [0, 255, 0], greedyOccludedNoBadgeRay: [0, 220, 255], pinned: [255, 0, 255] };
const OCC_SHADE = { [OCC.badge]: [230, 25, 75], [OCC.mute]: [245, 130, 48], [OCC.basket]: [67, 99, 216], [OCC.basketFringe]: [120, 140, 255], [OCC.recoveredBasket]: [66, 212, 244], [OCC.tee]: [145, 30, 180] };
const TINT_SHADE = [255, 255, 0];
export const LEGEND = 'shading: red S1 badge px, orange S1 mute px, blue S2 basket px, light blue basket outline fringe (+2 px), cyan S4 recovered basket box, purple S3 tee pad, yellow translucent path/C1/C2 overlay class; outlines: green greedyOccluded, cyan greedyOccludedNoBadgeRay, magenta pinned S4; white line: badge ray (pose center -> badge plate center); yellow cross: Sam\'s annotated tee point; white cross: badge plate center when inside the crop';

export function renderHoleCrop(ctx, { center, size = TEE_RECOVER_SLOT.cropPx, scale = TEE_RECOVER_SLOT.cropScale, poses = [], point = null, plate = null }) {
  const { W, H, raster: { rgba }, occ, cls } = ctx;
  const x0 = Math.round(center[0] - size / 2), y0 = Math.round(center[1] - size / 2), S = size * scale;
  const rgb = new Uint8Array(S * S * 3).fill(96);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const sx = x0 + x, sy = y0 + y;
    if (sx < 0 || sy < 0 || sx >= W || sy >= H) continue;
    const i = sy * W + sx, k = i * 4;
    let c = [rgba[k], rgba[k + 1], rgba[k + 2]];
    const shade = occ ? (OCC_SHADE[occ[i]] ?? (cls[i] === CLASS.TINT ? TINT_SHADE : null)) : null;   // no template: no occluder classes
    if (shade) c = c.map((v, j) => Math.round(0.6 * v + 0.4 * shade[j]));
    for (let yy = 0; yy < scale; yy++) for (let xx = 0; xx < scale; xx++) { const d = ((y * scale + yy) * S + x * scale + xx) * 3; rgb[d] = c[0]; rgb[d + 1] = c[1]; rgb[d + 2] = c[2]; }
  }
  // canvas coords: px center (x, y) -> ((x - x0 + 0.5) * scale)
  const P = ([x, y]) => [(x - x0 + 0.5) * scale, (y - y0 + 0.5) * scale];
  const put = (X, Y, col) => { X = Math.round(X); Y = Math.round(Y); if (X < 0 || Y < 0 || X >= S || Y >= S) return; const d = (Y * S + X) * 3; rgb[d] = col[0]; rgb[d + 1] = col[1]; rgb[d + 2] = col[2]; };
  const line = (a, b, col, dash = 0) => {
    const [ax, ay] = P(a), [bx, by] = P(b), n = Math.ceil(Math.hypot(bx - ax, by - ay));
    for (let t = 0; t <= n; t++) { if (dash && Math.floor(t / dash) % 2) continue; put(ax + (bx - ax) * t / n, ay + (by - ay) * t / n, col); }
  };
  const cross = (p, col, arm) => { const [X, Y] = P(p); for (let d = -arm; d <= arm; d++) for (const w of [-1, 0, 1]) { put(X + d, Y + w, col); put(X + w, Y + d, col); } };
  for (const ps of poses) {
    if (plate) line(ps.center, plate, [255, 255, 255], 4);
    if (ctx.tpl) { const cs = padCorners(ctx.tpl, ps.center, ps.angleRad); for (let k = 0; k < 4; k++) line(cs[k], cs[(k + 1) % 4], ps.color); }
    cross(ps.center, ps.color, 3);
  }
  if (plate && plate[0] >= x0 && plate[1] >= y0 && plate[0] < x0 + size && plate[1] < y0 + size) cross(plate, [255, 255, 255], 6);
  if (point) cross(point, [255, 225, 25], 7);
  return { origin: [x0, y0], width: S, height: S, scale, png: base64(encodePngRgb({ width: S, height: S, rgb })) };
}

export function compareRecovered({ contract, parentStore }) {
  return ({ branches, frame }) => {
    const names = Object.keys(branches).sort();
    const view = {};
    for (const n of names) {
      const b = branches[n];
      const value = b.store?.has?.(TEE_RECOVER_SLOT.part) ? b.store.get(TEE_RECOVER_SLOT.part) : null;
      const judge = b.records?.[TEE_RECOVER_SLOT.testimony];
      view[n] = { error: b.error, value, recovered: value?.recovered ?? [], judge: judge?.status === 'held' ? judge : null };
    }
    const join = geometricJoin({ sets: Object.fromEntries(names.map((n) => [n, view[n].recovered])), contract });
    const tp = parentStore.get('testimony.source.teePoints');
    const ctx = createRecoveryContext(recoveryInputs(parentStore.get));
    const badgeByLabel = new Map(ctx.badges.map((b, i) => [b.label, { ...b, index: i }]));

    const perBranch = Object.fromEntries(names.map((n) => [n, {
      error: view[n].error?.message ?? null,
      recovered: view[n].recovered.length,
      ...(view[n].judge?.totals ?? {}),
      stillMissingHoles: view[n].judge?.stillMissing ?? null,
      perTee: (view[n].judge?.verdicts ?? []).map((v) => {
        const t = view[n].recovered[v.index];
        return { hole: v.hole, centerPx: t.center, angleDeg: t.angleDeg, verdict: v.verdict, nearestHole: v.nearestHole, errorPx: v.nearestDistancePx, ownHoleErrorPx: v.ownHoleErrorPx, confidence: t.confidence, fromSeed: t.fromSeed ?? null, visibleFramePx: t.evidence?.visibleFramePx, occludedBy: t.evidence?.occludedBy };
      })
    }]));

    const identities = join.identities.map((id) => {
      const at = names.find((n) => id.members[n] !== null);
      const t = view[at].recovered[id.members[at]];
      return { identity: id.id, hole: t.hole, centerPx: t.center, in: names.filter((n) => id.members[n] !== null) };
    });

    frame({
      title: `${TEE_RECOVER_SLOT.slot}: ${names.map((n) => `${n} ${perBranch[n].recovered} recovered / ${perBranch[n].landsOwnHole ?? '?'} on own hole / ${perBranch[n].impostors ?? '?'} impostor`).join('; ')}`,
      calculation: TEE_RECOVER_SLOT.slot,
      parts: [
        ...names.map((n) => ({ address: `cmp.${TEE_RECOVER_SLOT.slot}.${n}`, kind: 'points', data: { points: view[n].recovered.map((t) => [...t.center, `${n} hole ${t.hole}`]) } })),
        { address: 'testimony.tees', kind: 'points', data: { points: tp.points.map((p) => [...p.canonical, `hole ${p.hole}`]) } },
        { address: `cmp.${TEE_RECOVER_SLOT.slot}.table`, kind: 'ledger', data: { rows: names.map((n) => ({ branch: n, recovered: perBranch[n].recovered, landsOwnHole: perBranch[n].landsOwnHole, landsOtherHole: perBranch[n].landsOtherHole, impostors: perBranch[n].impostors, unjudged: perBranch[n].unjudged, meanErrorPx: perBranch[n].meanErrorPx, maxErrorPx: perBranch[n].maxErrorPx, stillMissingHoles: (perBranch[n].stillMissingHoles ?? []).join(' '), error: perBranch[n].error })) } },
        { address: `cmp.${TEE_RECOVER_SLOT.slot}.identities`, kind: 'ledger', data: { rows: identities.map((r) => ({ ...r, centerPx: r.centerPx.join(', '), in: r.in.join(' ') })) } }
      ],
      verdicts: names.map((n) => ({ name: `${n}: ${perBranch[n].landsOwnHole ?? '?'}/${perBranch[n].recovered} land on their own annotated hole (<= ${TEE_RECOVER_SLOT.hitRadiusPx} px)`, ok: perBranch[n].impostors === 0 })),
      receipt: { contract: join.contract, acceptance: ACCEPTANCE }
    });

    // per-hole pages: every hole any branch recovered, and every annotated hole S3 does not cover
    const s3Holes = new Set(names.map((n) => view[n].judge).find(Boolean)?.s3CoveredHoles ?? []);
    const holes = new Set([...names.flatMap((n) => view[n].recovered.map((t) => String(t.hole))), ...tp.points.filter((p) => !s3Holes.has(p.hole)).map((p) => String(p.hole))]);
    const pages = [];
    for (const hole of [...holes].sort((a, b) => Number(a) - Number(b))) {
      const point = tp.points.find((p) => String(p.hole) === hole)?.canonical ?? null;
      const badge = badgeByLabel.get(hole) ?? null;
      const poses = names.flatMap((n) => view[n].recovered.filter((t) => String(t.hole) === hole).map((t) => ({ branch: n, ...t, color: BRANCH_COLORS[n] ?? [255, 255, 255] })));
      const anchor = point ?? poses[0]?.center ?? badge?.plateCenter;
      if (!anchor) continue;
      const crop = renderHoleCrop(ctx, { center: anchor, poses, point, plate: badge?.plateCenter ?? null });
      const rows = names.map((n) => {
        const i = view[n].recovered.findIndex((t) => String(t.hole) === hole);
        if (i < 0) {
          const miss = (view[n].value?.missed ?? []).find((m) => String(m.hole) === hole);
          return { branch: n, result: 'none', reason: miss?.reason ?? (s3Holes.has(Number(hole)) ? 'S3 tee present' : '-'), lastBest: miss?.lastBest ? `${miss.lastBest.center?.join(', ')} @ ${miss.lastBest.angleDeg} deg, score ${miss.lastBest.score}, accepted ${miss.lastBest.accepted}` : null };
        }
        const t = view[n].recovered[i], v = view[n].judge?.verdicts?.[i];
        return {
          branch: n, result: v?.verdict ?? '?', centerPx: t.center.join(', '), angleDeg: t.angleDeg, sizePx: (t.sizePx ?? []).join(' x '),
          errorToSamPx: point ? r3(Math.hypot(point[0] - t.center[0], point[1] - t.center[1])) : null,
          badgeRayResidualDeg: t.badgeRayResidualDeg, visibleFramePx: t.evidence?.visibleFramePx, templateFramePx: t.evidence?.templateFramePx,
          negativePx: (t.evidence?.negativeFramePx ?? 0) + (t.evidence?.negativeInteriorPx ?? 0), outsideWhitePx: t.evidence?.outsideWhitePx,
          occludedByPx: Object.entries(t.evidence?.occludedBy ?? {}).filter(([, c]) => c).map(([k, c]) => `${k} ${c}`).join(', '),
          confidence: t.confidence, fromSeed: t.fromSeed ?? null
        };
      });
      pages.push({ hole, rows });
      frame({
        title: `hole ${hole}: ${rows.map((r) => `${r.branch} ${r.result}${r.errorToSamPx !== undefined && r.errorToSamPx !== null ? ` (${r.errorToSamPx} px)` : ''}`).join(' | ')}`,
        calculation: TEE_RECOVER_SLOT.slot,
        parts: [
          { address: `cmp.${TEE_RECOVER_SLOT.slot}.crop.hole${hole}`, kind: 'raster', data: crop },
          { address: `cmp.${TEE_RECOVER_SLOT.slot}.hole${hole}`, kind: 'ledger', data: { rows } }
        ],
        verdicts: rows.map((r) => ({ name: `${r.branch}: ${r.result}`, ok: r.result === 'lands-own-hole' })),
        receipt: { legend: LEGEND, cropPx: TEE_RECOVER_SLOT.cropPx, scale: TEE_RECOVER_SLOT.cropScale, origin: crop.origin, samPointPx: point, badgePlateCenterPx: badge?.plateCenter ?? null, template: ctx.tpl }
      });
    }

    return {
      slot: TEE_RECOVER_SLOT.slot, contract: join.contract, acceptance: ACCEPTANCE,
      template: ctx.tpl, assignment: ctx.assignment, seeds: ctx.seeds, s3CoveredHoles: [...s3Holes],
      branches: perBranch, identities, matched: join.matched, only: join.only, partial: join.partial, collisions: join.collisions, ambiguous: join.ambiguous,
      holes: pages
    };
  };
}
