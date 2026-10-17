/**
 * Scene: the state every Δ model folds into (fg/delta layer, browser-safe).
 *
 *   scene = { frame: { width, height }, parts: { [address]: { value, meta } } }
 *     value: a Part value (facets, fg/delta/kinds.mjs)
 *     meta:  { stage, lane, by: [calculation], base, supersedes: [address] }
 *
 * The models differ in how they ENCODE changes; they must agree on the
 * scene they fold to (projection P3 checks it at every step). Everything
 * here is a projection of a scene: the ownership layer (the frame
 * partition), pixel conservation, and a compact per-part summary.
 *
 * Ownership layer rules (per pixel, over parts not superseded by another):
 *   own claims  > 1  -> same top owner: dupAgree (two Parts agree on who
 *                       owns it), else conflict (a conservation violation)
 *   own + mute       -> reownedFromMute (ownership-by-enclosure)
 *   mute claims > 1  -> muteOverlap
 *   cand / elim      -> evidence, never a claim
 * Every claim has alpha 1 (no alpha evidence exists in S0..S3); the alpha
 * check is the sum of own alphas <= 1 per pixel, i.e. conflict == 0.
 */
import { fromRuns, countRuns, enclosedUnowned } from './px.mjs';
import { splitKey, topOwner } from './kinds.mjs';
import { canonicalJson } from '../canon.mjs';

export const emptyScene = (frame) => ({ frame: { ...frame }, parts: {} });
export const cloneScene = (s) => ({ frame: s.frame, parts: { ...s.parts } });

export function supersededSet(scene) {
  const out = new Set();
  for (const [addr, p] of Object.entries(scene.parts)) for (const s of p.meta?.supersedes ?? []) if (s !== addr) out.add(s);
  return out;
}

export function layer(scene) {
  const { width, height } = scene.frame;
  const framePx = width * height;
  const superseded = supersededSet(scene);
  const own = new Map(), mute = new Map();
  let outOfFrame = 0;
  for (const [addr, part] of Object.entries(scene.parts)) {
    if (superseded.has(addr)) continue;
    for (const [key, runs] of Object.entries(part.value.px ?? {})) {
      const { role } = splitKey(key);
      if (role !== 'own' && role !== 'mute') continue;
      const into = role === 'own' ? own : mute;
      for (const p of fromRuns(runs)) {
        if (p < 0 || p >= framePx) { outOfFrame++; continue; }
        const list = into.get(p);
        const claim = { part: addr, owner: topOwner(key), alpha: 1 };
        if (list) list.push(claim); else into.set(p, [claim]);
      }
    }
  }
  let dupAgree = 0, conflict = 0, reownedFromMute = 0, muteOverlap = 0, alphaOver = 0;
  const conflictsByParts = {};
  for (const [p, claims] of own) {
    if (claims.length > 1) {
      if (new Set(claims.map((c) => c.owner)).size === 1) dupAgree++;
      else {
        conflict++;
        const k = [...new Set(claims.map((c) => c.part))].sort().join(' x ');
        conflictsByParts[k] = (conflictsByParts[k] ?? 0) + 1;
      }
      if (claims.reduce((s, c) => s + c.alpha, 0) > 1 && new Set(claims.map((c) => c.owner)).size > 1) alphaOver++;
    }
    if (mute.has(p)) reownedFromMute++;
  }
  for (const [p, claims] of mute) if (!own.has(p) && claims.length > 1) muteOverlap++;
  let consumed = own.size;
  for (const p of mute.keys()) if (!own.has(p)) consumed++;
  return {
    framePx, ownedPx: own.size, mutedOnlyPx: consumed - own.size, consumedPx: consumed, remainingPx: framePx - consumed,
    reownedFromMutePx: reownedFromMute, dupAgreePx: dupAgree, conflictPx: conflict, conflictsByParts, muteOverlapPx: muteOverlap,
    alphaOverPx: alphaOver, outOfFramePx: outOfFrame, superseded: [...superseded].sort()
  };
}

/** Enclosed-unowned pixels per owner, per part (seams, holes, window residue). */
export function seams(scene, { roles = ['own'] } = {}) {
  const out = {};
  const superseded = supersededSet(scene);
  for (const [addr, part] of Object.entries(scene.parts)) {
    if (superseded.has(addr) || !part.value.px) continue;
    const byOwner = new Map();
    for (const [key, runs] of Object.entries(part.value.px)) {
      const { role } = splitKey(key);
      if (!roles.includes(role)) continue;
      const o = topOwner(key);
      if (!byOwner.has(o)) byOwner.set(o, []);
      byOwner.get(o).push(...fromRuns(runs));
    }
    if (!byOwner.size) continue;
    const counts = [...byOwner.entries()].map(([o, px]) => [o, enclosedUnowned(px, scene.frame.width)]);
    const vals = counts.map(([, n]) => n).sort((a, b) => a - b);
    out[addr] = { owners: counts.length, min: vals[0], median: vals[Math.floor(vals.length / 2)], max: vals[vals.length - 1], total: vals.reduce((a, b) => a + b, 0), byOwner: Object.fromEntries(counts) };
  }
  return out;
}

export function partStats(value) {
  const roles = {};
  for (const [key, runs] of Object.entries(value.px ?? {})) { const { role } = splitKey(key); roles[role] = (roles[role] ?? 0) + countRuns(runs); }
  return {
    objects: value.objects ? Object.keys(value.objects).length : undefined,
    elim: value.elim ? Object.keys(value.elim).length : undefined,
    px: Object.keys(roles).length ? roles : undefined,
    scalars: value.scalars ? Object.keys(value.scalars).length : undefined,
    rows: value.ledger ? Object.keys(value.ledger).length : undefined
  };
}

/** The UI's view of a scene: per-part stats plus the ownership layer. */
export function sceneSummary(scene) {
  const parts = {};
  for (const addr of Object.keys(scene.parts).sort()) parts[addr] = JSON.parse(canonicalJson(partStats(scene.parts[addr].value)));
  const l = layer(scene);
  return { parts, layer: { ownedPx: l.ownedPx, mutedOnlyPx: l.mutedOnlyPx, remainingPx: l.remainingPx, conflictPx: l.conflictPx, dupAgreePx: l.dupAgreePx, reownedFromMutePx: l.reownedFromMutePx } };
}

/** Content of a scene without lineage metadata (models may differ only there). */
export const sceneContent = (scene) => canonicalJson(Object.fromEntries(Object.keys(scene.parts).sort().map((a) => [a, scene.parts[a].value])));
