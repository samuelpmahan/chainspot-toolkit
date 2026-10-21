/**
 * Assumptions: bounds on VARIABLE quantities, kept as optimizations, stated, loud and self-correcting (browser-safe).
 *
 * DOCTRINE (Sam, 2026-10-21): "states and justifies the assumptions but fails loudly AND TRIES TO CORRECT". A bound on a
 * quantity that varies from hole to hole or course to course (hole length, leg length, tee-to-badge distance, the reach to a
 * basket, how far a bend may move) is not a law: a 1,700 ft hole is about 52 R1. Such a bound stays, because it makes the
 * search cheap, when it is
 *   stated:          one named entry here (stateAssumption), its value in the unit the quantity follows (R1 for a map
 *                    distance), its evidence (the measured range, on which courses, the margin) and its widening rule;
 *   loud:            a search whose answer sits at the bound's edge, or that finds nothing inside it, records a violation
 *                    (in its Part value, and as emits: assumptionsViolated, assumptionsRecovered, `violated:<name>`, `recovered:<name>`),
 *                    which profileSummary / `pxc profile` / `pxc doctor --attempt` list beside the opaque hot spots;
 *                    nothing is clipped silently and nothing throws;
 *   self-correcting: on a violation the bound widens (x factor, up to what the skeleton or the image allows) and the search
 *                    runs again; the record says what each widening found.
 * A window or a step of a measurement (a profile's lateral reach, a read-ahead, a search step) is not an assumption: it takes
 * the unit of what it measures and is never registered here.
 */

/** Every stated assumption, by name (one registry for the whole toolkit; modules state theirs when loaded). */
export const ASSUMPTIONS = new Map();

/**
 * State an assumption. name: unique; quantity: what it bounds; value + unit: the bound (unit 'R1' = rC1px, the image's C1 radius;
 * a bound in another unit names it); evidence: the measured range it rests on (courses, values, margin); widening: { factor,
 * limit } (limit: what bounds the widening, in words: the image diagonal, the skeleton). Returns the frozen entry.
 */
export function stateAssumption({ name, quantity, value, unit, evidence, widening = {} }) {
  if (!name || !quantity || !(value > 0) || !unit || !evidence) throw new Error(`stateAssumption: name, quantity, value > 0, unit and evidence are all required (${name})`);
  const a = Object.freeze({ name, quantity, value, unit, evidence, widening: Object.freeze({ factor: widening.factor ?? 2, limit: widening.limit ?? 'the image diagonal' }) });
  const had = ASSUMPTIONS.get(name);
  if (had && JSON.stringify(had) !== JSON.stringify(a)) throw new Error(`stateAssumption: '${name}' is stated twice, differently`);
  ASSUMPTIONS.set(name, a);
  return a;
}

const r2 = (v) => (Number.isFinite(v) ? Math.round(v * 100) / 100 : v);

/**
 * Run a bounded search under an assumption. unitPx: px per unit of the assumption (R1 in px for 'R1'); limitPx: the widest bound
 * the skeleton or the image allows (px); run(boundPx) -> { result, found, atEdge, at? } (at: the value found, px, for the record).
 * The stated bound first; while the answer is at its edge or nothing is found, the bound widens by the factor (capped at
 * limitPx) and the search runs again. -> { result, boundPx, violation } with violation null when the stated bound held, else
 * { assumption, statedPx, outcome, tries: [{ boundPx, found, atEdge, atPx }], recovered, ...detail }: recovered when a widened
 * search answered inside its bound (or at the limit itself, which is the skeleton's or the image's edge, not an assumption's).
 * A bound that cannot be stated (no unit: rC1 not measured) runs the search at limitPx and records that as the condition.
 */
export function underAssumption(a, { unitPx, limitPx = Infinity, run, detail = {} }) {
  if (!(unitPx > 0)) {
    const r = run(limitPx);
    return { result: r.result, boundPx: limitPx, violation: null, condition: `${a.name}: no ${a.unit} measured, the search ran to its limit (${r2(limitPx)} px)` };
  }
  const statedPx = Math.min(a.value * unitPx, limitPx), tries = [];
  let boundPx = statedPx, r = run(boundPx);
  tries.push({ boundPx: r2(boundPx), found: Boolean(r.found), atEdge: Boolean(r.atEdge), atPx: r2(r.at ?? null) });
  if (r.found && !r.atEdge) return { result: r.result, boundPx, violation: null };
  const first = r;
  while (boundPx < limitPx && (!r.found || r.atEdge)) {
    boundPx = Math.min(limitPx, boundPx * a.widening.factor);
    r = run(boundPx);
    tries.push({ boundPx: r2(boundPx), found: Boolean(r.found), atEdge: Boolean(r.atEdge), atPx: r2(r.at ?? null) });
  }
  const recovered = Boolean(r.found) && (!r.atEdge || boundPx >= limitPx);
  const violation = { assumption: a.name, value: a.value, unit: a.unit, statedPx: r2(statedPx), outcome: first.found ? 'the answer sits at the bound' : 'nothing found inside the bound',
    tries, recovered, ...detail };
  // a widening that found nothing keeps the stated search's answer (the record says so); else the widened answer
  return { result: r.found ? r.result : first.result, boundPx: r.found ? boundPx : statedPx, violation };
}

/** The emits of a Calculation whose searches recorded these violations (numbers only: the profile sums them per Calculation). */
export function violationEmits(violations) {
  const v = (violations ?? []).filter(Boolean);
  if (!v.length) return {};
  const out = { assumptionsViolated: v.length, assumptionsRecovered: v.filter((x) => x.recovered).length };
  for (const x of v) {
    out[`violated:${x.assumption}`] = (out[`violated:${x.assumption}`] ?? 0) + 1;
    if (x.recovered) out[`recovered:${x.assumption}`] = (out[`recovered:${x.assumption}`] ?? 0) + 1;
  }
  return out;
}

/**
 * Every assumption violation in an instrumentation document (the store's call log), per Calculation and assumption:
 * [{ calculation, assumption, violated, recovered, calls }].
 */
export function assumptionViolations(doc) {
  const by = new Map();
  for (const e of doc?.calculations ?? []) {
    const em = e.emits ?? {};
    for (const [k, n] of Object.entries(em)) {
      if (!k.startsWith('violated:') || !(n > 0)) continue;
      const key = `${e.calculation} ${k}`, r = by.get(key) ?? { calculation: e.calculation, assumption: k.slice('violated:'.length), violated: 0, recovered: 0, calls: 0 };
      r.violated += n; r.recovered += em[`recovered:${r.assumption}`] ?? 0; r.calls++; by.set(key, r);
    }
  }
  return [...by.values()].sort((a, b) => b.violated - a.violated);
}
export const assumptionLines = (rows) => rows.map((r) => `ASSUMPTION VIOLATED ${r.assumption} in ${r.calculation}: ${r.violated}x over ${r.calls} call(s), ${r.recovered} recovered by widening${ASSUMPTIONS.get(r.assumption) ? ` (stated ${ASSUMPTIONS.get(r.assumption).value} ${ASSUMPTIONS.get(r.assumption).unit}: ${ASSUMPTIONS.get(r.assumption).quantity})` : ''}`);
