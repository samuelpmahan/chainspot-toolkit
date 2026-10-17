/**
 * Information value of an attention region (fg/attention layer, browser-safe).
 *
 *   reasonsOf(region, meta, { testimony }) -> [{ reason, weight, detail? }]
 *   scoreOf(reasons, changedPx)            -> number (max weight + 1/4 of the rest + a px tie-break < 1)
 *   testimonyCheck(claims, window, testimony) -> { rows, disagree, agree, uncovered }
 *   rankRegions(regions)                   -> regions sorted by score, ties by step then (y, x)
 *
 * The order is the point: verdict flips and eliminations, disagreements
 * with testimony, failed checks and UNKNOWN oracles first; re-owns next;
 * first claims after; refinements (a split into sub-parts of the same
 * owner) and evidence notes last. Weights are a table, not a model: change
 * WEIGHTS and the ranking changes the same way everywhere.
 *
 * testimony: { points: [{ kind: 'tee' | 'basket', x, y, id }] } in the
 * CANONICAL frame (the caller maps source y to canonical y). It is used for
 * ranking and for a separate comparison column, never to write a question.
 */
export const WEIGHTS = {
  'obj:eliminated': 10, 'obj:verdict-negative': 10, 'obj:relabel': 8, 'obj:elimRecorded': 8, 'obj:verdict-excused': 7,
  'obj:refit': 6, 'obj:moved': 4, 'obj:removed': 5, 'obj:elimRetested': 4, 'obj:verdict-set': 3, 'obj:added': 3,
  'obj:renamed': 1, 'obj:edited': 1, 'obj:elimDropped': 1, 'obj:row': 1, 'row:uncertain': 7, 'row:negative': 6,
  'px:-own': 6, 'px:reassigned': 7, 'px:role-reown': 5, 'px:-mute': 3, 'px:+own': 3, 'px:+mute': 1, 'px:evidence': 1, 'px:-evidence': 1, 'px:split': 1,
  'step:failed-check': 9, 'step:violation': 8, 'lane:unknown': 5, 'testimony:disagree': 9
};

const UNCERTAIN = /abstain|unknown|disagree|unsure/i;

export function reasonsOf(region, meta = {}, { testimonyRows = null } = {}) {
  const r = new Map();
  const add = (reason, detail) => { if (!r.has(reason)) r.set(reason, { reason, weight: WEIGHTS[reason] ?? 1, detail: [] }); if (detail) r.get(reason).detail.push(detail); };
  for (const c of region.objects) {
    if (c.op === 'verdict') add(/ELIM|REJECT|FAIL/i.test(c.verdict) ? 'obj:verdict-negative' : /EXCUSED/i.test(c.verdict) ? 'obj:verdict-excused' : 'obj:verdict-set', `${c.id} ${c.prev ?? 'unset'}→${c.verdict}`);
    else if (c.op === 'row') {
      const row = c.row ?? {};
      const words = JSON.stringify(row);
      if (UNCERTAIN.test(words) && !/"agreement":"agree"/.test(words)) add('row:uncertain', `${c.id}`);
      else if (/ELIMINATED|EXCUSED/.test(row.verdict ?? '')) add('row:negative', `${c.id} ${row.verdict}`);
      else add('obj:row', c.id);
    } else add(`obj:${c.op}`, c.id);
  }
  for (const byCls of Object.values(region.pxByAddress)) for (const [cls, n] of Object.entries(byCls)) {
    if (cls === 'split') add('px:split', `${n} px`);
    else if (cls.endsWith(':reassigned')) add('px:reassigned', `${n} px`);
    else if (cls.includes('->')) add('px:role-reown', `${n} px ${cls}`);
    else if (cls === '-own' || cls === '-mute' || cls === '+own' || cls === '+mute') add(`px:${cls}`, `${n} px`);
    else add(cls.startsWith('-') ? 'px:-evidence' : 'px:evidence', `${n} px ${cls}`);
  }
  for (const v of meta.verdicts ?? []) if (v.ok === false) add('step:failed-check', v.name);
  if (meta.violations?.length) add('step:violation', `${meta.violations.length} fold violations at this step`);
  if (meta.laneStatus && /UNKNOWN/i.test(`${meta.laneStatus.oracle ?? ''} ${meta.laneStatus.status ?? ''}`)) add('lane:unknown', `${meta.lane}: ${meta.laneStatus.oracle ?? meta.laneStatus.status}`);
  for (const t of testimonyRows ?? []) if (t.agrees === false) add('testimony:disagree', `${t.id}: receipt ${t.says}, testimony ${t.testimony}`);
  return [...r.values()].map((x) => ({ ...x, detail: x.detail.slice(0, 6) })).sort((a, b) => b.weight - a.weight || (a.reason < b.reason ? -1 : 1));
}

export function scoreOf(reasons, changedPx = 0) {
  if (!reasons.length) return 0;
  const w = reasons.map((x) => x.weight).sort((a, b) => b - a);
  const rest = w.slice(1).reduce((s, x) => s + x, 0);
  return Math.round((w[0] + rest / 4 + Math.min(0.99, Math.log10(1 + changedPx) / 5)) * 1000) / 1000;
}

const TOL = { tee: 14, basket: 20, badge: 20 };
/**
 * For each receipt claim about an object (is / isNot a tee or basket), is
 * there a testimony point of that kind within tolerance of its center?
 * Points inside the window that no claim is near are 'uncovered'.
 */
export function testimonyCheck(claims, window, testimony) {
  if (!testimony?.points?.length) return null;
  const rows = [];
  const used = new Set();
  for (const c of claims) {
    const tol = TOL[c.subject];
    if (!tol) continue;
    const near = testimony.points.filter((p) => p.kind === c.subject).map((p) => ({ p, d: Math.hypot(p.x - c.center[0], p.y - c.center[1]) })).filter((x) => x.d <= tol).sort((a, b) => a.d - b.d)[0];
    if (near) used.add(near.p.id);
    const testimonyIs = Boolean(near);
    rows.push({ id: c.id, address: c.address, subject: c.subject, says: c.says, testimony: testimonyIs ? `${c.subject} ${near.p.id} at ${Math.round(near.d * 10) / 10} px` : `no ${c.subject} within ${tol} px`, agrees: (c.says === 'is') === testimonyIs });
  }
  const [x, y, w, h] = window;
  const uncovered = testimony.points.filter((p) => !used.has(p.id) && p.x >= x && p.x < x + w && p.y >= y && p.y < y + h && rows.some((r) => r.subject === p.kind)).map((p) => `${p.kind} ${p.id}`);
  return { rows, agree: rows.filter((r) => r.agrees).length, disagree: rows.filter((r) => !r.agrees).length, uncovered };
}

export function rankRegions(regions) {
  return [...regions].sort((a, b) => b.score - a.score || a.k - b.k || a.window[1] - b.window[1] || a.window[0] - b.window[0]);
}
