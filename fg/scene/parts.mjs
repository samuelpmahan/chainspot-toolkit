/**
 * Scene Parts with structure (Sam, 2026-10-17: "give each thing Structure which is hopefully Legible").
 * Every rendered element is a Part with geometry, so occlusion is accounted for by name, opaque or translucent:
 *
 *   C1S       solid ring, centre = its basket's BasketPoint, radius R1 (LOCAL: the image's map scale, 10 m), stroke w1
 *             (GLOBAL, screen px 2.75-3.5) (translucent, colour ~(166,171,180))
 *   C2D       dashed ring, centre = BasketPoint, radius R2 = 2 x R1 (GLOBAL ratio, measured 1.95-2.01), stroke w2; dash
 *             period LOCAL (21.5-33.5 px; ~10 or ~21 dashes per circle by scale regime); dash phase not modelled yet, so
 *             coverage is the whole annulus (conservative)
 *   HolePath  the hallway: TeeBadgeSegment (tee front stroke -> past the badge, always straight: the badge precedes the
 *             first bend) + Badge -> [Bend]* -> BasketPoint; width W LOCAL per image (31-52 px; learn it from the image's
 *             own tee->badge segments), round caps (translucent tint)
 * Scopes: fg/scene/invariants.mjs and docs/evidence/ledger/ (GLOBAL = holds on full courses AND zoomed views).
 *   Badge / Basket / Tee sprites are opaque and keep their S1-S3 pixel sets.
 *
 * Ring structure per image lives in baselines/scene/<course>.rings.json (measured, with units).
 */
const segDist = (p, a, b) => {
  const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1e-9;
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
};

export function C1S({ name, centre, radiusPx, strokeFwhmPx }) {
  return { kind: 'C1S', name, opaque: false, centre, radiusPx, strokeFwhmPx,
    covers: (p, padPx = 0.5) => Math.abs(Math.hypot(p[0] - centre[0], p[1] - centre[1]) - radiusPx) <= strokeFwhmPx / 2 + padPx };
}

export function C2D({ name, centre, radiusPx, strokeFwhmPx }) {
  return { kind: 'C2D', name, opaque: false, centre, radiusPx, strokeFwhmPx, dashPhaseModelled: false,
    covers: (p, padPx = 0.5) => Math.abs(Math.hypot(p[0] - centre[0], p[1] - centre[1]) - radiusPx) <= strokeFwhmPx / 2 + padPx };
}

/** vertices: [teeCap, ...bends, basketPoint]; the first segment is the TeeBadgeSegment. */
export function HolePath({ name, vertices, widthPx }) {
  return { kind: 'HolePath', name, opaque: false, vertices, widthPx,
    teeBadgeSegment: vertices.slice(0, 2),
    covers: (p, padPx = 0) => vertices.slice(1).some((b, i) => segDist(p, vertices[i], b) <= widthPx / 2 + padPx) };
}

/** Rings for every basket candidate of a course from its measured ring structure. */
export function ringsForBaskets(baskets, rings) {
  return baskets.flatMap((k) => [
    C1S({ name: `C1S of ${k.name}`, centre: k.point, radiusPx: rings.C1S.radiusPx, strokeFwhmPx: rings.C1S.strokeFwhmPx }),
    C2D({ name: `C2D of ${k.name}`, centre: k.point, radiusPx: rings.C2D.radiusPx, strokeFwhmPx: rings.C2D.strokeFwhmPx })
  ]);
}

/**
 * What crosses a pad footprint (disc of radius R around p, sampled on a 1 px grid): every Part that covers any sample,
 * with the fraction of the footprint it covers. Opaque parts are tested by their pixel sets (ownedPx: Map name -> Set of
 * linear px), translucent parts by geometry.
 */
export function occludersOf(p, R, { parts = [], ownedPx = new Map(), widthPx }) {
  const samples = [];
  for (let dy = -Math.ceil(R); dy <= R; dy++) for (let dx = -Math.ceil(R); dx <= R; dx++) if (dx * dx + dy * dy <= R * R) samples.push([p[0] + dx, p[1] + dy]);
  const hits = [];
  for (const [name, set] of ownedPx) {
    const n = samples.filter((q) => set.has(Math.round(q[1]) * widthPx + Math.round(q[0]))).length;
    if (n) hits.push({ name, opaque: true, fraction: Math.round((n / samples.length) * 1000) / 1000 });
  }
  for (const part of parts) {
    const n = samples.filter((q) => part.covers(q)).length;
    if (n) hits.push({ name: part.name, opaque: false, fraction: Math.round((n / samples.length) * 1000) / 1000 });
  }
  return hits.sort((a, b) => b.fraction - a.fraction);
}
