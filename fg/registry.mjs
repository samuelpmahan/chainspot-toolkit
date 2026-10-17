/**
 * FunctionalGuarantee registry: automatic wiring (browser-safe).
 *
 * Sam's direction: "make wiring automatic so we can impl as needed and
 * compare". Each FG used to be a hand-placed block in runEarly.mjs whose
 * dependencies were implicit (fg.s1.pxBadges.assembly reached for the
 * s1Materialization and s1DigitsMaterialization locals and failed if they
 * were null). Within a stage, `requires` + ctx.records is the dependency;
 * across stages a record travels as the Part tk.<id>.record (written by
 * ports/early/stageGuarantees.mjs), never as a requires. Here an FG declares `requires`, and the registry does the
 * rest:
 *
 *   orderGuarantees(fgs, only?)  topological order by requires, ties broken
 *       by id so the order (and therefore every record stream) is
 *       deterministic; `only` pulls in its transitive requires
 *       automatically. Duplicate ids, a missing required id, and cycles
 *       throw: those are wiring errors, not guarantee failures.
 *
 *   runGuarantees({ guarantees, store | board, sink, only?, lanes?, branch?, hash? })
 *       -> { records, frames, outputs, timings }
 *       store: the PartStore every FG reads its declared Parts from and
 *       calls its declared Calculations through (a plain board is wrapped
 *       once, so every FG of the run shares one store); records: { [id]:
 *       record } in run order; frames: every FG's frames concatenated in
 *       run order (the flipbook stream); outputs: { [id]: { [address]:
 *       value } }, what each FG ctx.publish()ed for the caller (hash, the
 *       runtime's artifact hashing, passes through); timings: the
 *       nondeterministic sidecar [{ guarantee, elapsedMs }], never inside
 *       a record. A lane-gated FG whose lane is not enabled, or any FG
 *       requiring a dormant one, gets a dormant record instead of running.
 *       A GuaranteeFailure stops the run (the declared onFailure is "the
 *       run fails") and is rethrown with .records/.frames/.timings holding
 *       everything up to and including the failed record.
 *
 *   crossCheck(fgs, declarations) -> report (never throws). declarations
 *       are the stages/*.json "guarantees" entries (fg/discover.mjs loads
 *       them). It reports declared-but-unimplemented, implemented-but-
 *       undeclared, and per-FG mismatches: a Part the declared `part`
 *       names ('px.tees.rings + px.tees.family' names two) not among the
 *       FG's guards; the lane parsed from appliesTo ("with lane X ON")
 *       differing from the FG's lane; declared "properties" differing from
 *       the FG's composed properties (propertyMismatch); the declaration's site (default
 *       'stage') differing from the FG's; and fg.* ids the declaration's prose
 *       `requires` mentions that the FG does not require (the prose is the
 *       only place those dependencies are written down today).
 */
import { asStore, dormantRecord, runGuarantee, GuaranteeFailure } from './guarantee.mjs';
import { createMemorySink } from './sinks.mjs';

const now = () => globalThis.performance?.now?.() ?? Date.now();
const roundMs = (ms) => Math.round(ms * 1000) / 1000;

export function orderGuarantees(fgs, only = null) {
  const byId = new Map();
  for (const fg of fgs) {
    if (byId.has(fg.id)) throw new Error(`fg registry: duplicate guarantee id ${fg.id}`);
    byId.set(fg.id, fg);
  }
  const roots = only ? [...only] : [...byId.keys()];
  for (const id of roots) if (!byId.has(id)) throw new Error(`fg registry: ${id} is not a registered guarantee`);
  const order = [];
  const state = new Map(); // id -> 'visiting' | 'done'
  const visit = (id, path) => {
    if (state.get(id) === 'done') return;
    if (state.get(id) === 'visiting') throw new Error(`fg registry: requires cycle ${[...path, id].join(' -> ')}`);
    const fg = byId.get(id);
    if (!fg) throw new Error(`fg registry: ${path.at(-1)} requires ${id}, which is not registered`);
    state.set(id, 'visiting');
    for (const dep of [...fg.requires].sort()) visit(dep, [...path, id]);
    state.set(id, 'done');
    order.push(fg);
  };
  for (const id of roots.sort()) visit(id, []);
  return order;
}

export function runGuarantees({ guarantees, store, board, sink = createMemorySink(), only = null, lanes = [], branch = null, hash }) {
  const parts = asStore(store ?? board);
  const enabled = new Set(lanes);
  const records = {};
  const outputs = {};
  const frames = [];
  const timings = [];
  for (const fg of orderGuarantees(guarantees, only)) {
    const dormantDep = fg.requires.find((id) => records[id]?.status === 'dormant');
    if (fg.lane && !enabled.has(fg.lane)) { records[fg.id] = dormantRecord(fg, `lane ${fg.lane} is OFF`); continue; }
    if (dormantDep) { records[fg.id] = dormantRecord(fg, `requires dormant ${dormantDep}`); continue; }
    const required = Object.fromEntries(fg.requires.map((id) => [id, records[id]]));
    const started = now();
    try {
      const out = runGuarantee(fg, { store: parts, records: required, sink, branch, ...(hash ? { hash } : {}) });
      records[fg.id] = out.record;
      outputs[fg.id] = out.outputs;
      frames.push(...out.frames);
    } catch (error) {
      timings.push({ guarantee: fg.id, elapsedMs: roundMs(now() - started) });
      if (error instanceof GuaranteeFailure) {
        records[fg.id] = error.record;
        frames.push(...error.frames);
        Object.assign(error, { records, frames, outputs, timings });
      }
      throw error;
    }
    timings.push({ guarantee: fg.id, elapsedMs: roundMs(now() - started) });
  }
  return { records, frames, outputs, timings };
}

export function createRegistry(guarantees) {
  orderGuarantees(guarantees); // fail fast on duplicates, missing requires, cycles
  return {
    guarantees: [...guarantees],
    ids: guarantees.map((fg) => fg.id).sort(),
    order: (only) => orderGuarantees(guarantees, only).map((fg) => fg.id),
    run: (options) => runGuarantees({ ...options, guarantees })
  };
}

/** The lane a declaration's appliesTo prose gates on, or null. */
export function declarationLane(appliesTo) {
  const match = /\bwith lane ([A-Za-z0-9_.-]+) ON\b/.exec(String(appliesTo ?? ''));
  return match ? match[1] : null;
}

/** fg.* ids mentioned in a declaration's prose requires (excluding itself). */
export function declarationMentions(declaration) {
  const text = (declaration.requires ?? []).join('\n');
  return [...new Set(text.match(/\bfg\.[A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)+/g) ?? [])]
    .filter((id) => id !== declaration.id).sort();
}

/** The Part addresses a declaration's `part` names ('a + b' names two: an FG may certify several Parts). */
export const declaredParts = (part) => String(part).split(/\s*\+\s*/).filter(Boolean);

/**
 * Declared vs implemented properties (fg/compose.mjs): the declaration's
 * "properties" list must name exactly the FG's composed properties, as a
 * multiset (the implementation's order is its execution order; the stage
 * file may list them in reading order). Default properties a composition
 * gets without asking (DEFAULT_PROPERTIES) need not be declared. A composed
 * FG whose declaration names no properties is a mismatch (the stage file
 * would not be readable without the code); a hand-written FG with no
 * declared properties is not.
 */
export const DEFAULT_PROPERTIES = Object.freeze(['instrumented', 'rendered']);
export function propertyMismatch(declaredList, implementedList) {
  const implemented = implementedList.filter((p) => !DEFAULT_PROPERTIES.includes(p) || (declaredList ?? []).includes(p));
  if (declaredList === undefined && !implemented.length) return null;
  const a = [...(declaredList ?? [])].sort(), b = [...implemented].sort();
  if (a.length === b.length && a.every((p, i) => p === b[i])) return null;
  return { declared: declaredList ?? null, implemented: implementedList, missing: b.filter((p) => !a.includes(p)), undeclaredInCode: a.filter((p) => !b.includes(p)) };
}

export function crossCheck(fgs, declarations) {
  const declared = new Map(declarations.map((d) => [d.id, d]));
  const implemented = new Map(fgs.map((fg) => [fg.id, fg]));
  const mismatches = [];
  for (const [id, fg] of [...implemented].sort(([a], [b]) => a.localeCompare(b))) {
    const d = declared.get(id);
    if (!d) continue;
    if (d.part && !declaredParts(d.part).every((part) => fg.guards.includes(part))) mismatches.push({ id, field: 'part', declared: d.part, implemented: fg.guards });
    const lane = declarationLane(d.appliesTo);
    if (lane !== fg.lane) mismatches.push({ id, field: 'lane', declared: lane, implemented: fg.lane });
    const site = d.site ?? 'stage';
    if (site !== (fg.site ?? 'stage')) mismatches.push({ id, field: 'site', declared: site, implemented: fg.site ?? 'stage' });
    const unrequired = declarationMentions(d).filter((m) => declared.has(m) && !fg.requires.includes(m));
    if (unrequired.length) mismatches.push({ id, field: 'requires', declared: unrequired, implemented: fg.requires });
    const props = propertyMismatch(d.properties, fg.properties ?? []);
    if (props) mismatches.push({ id, field: 'properties', ...props });
  }
  return {
    declared: declared.size,
    implemented: implemented.size,
    declaredUnimplemented: [...declared.keys()].filter((id) => !implemented.has(id)).sort(),
    implementedUndeclared: [...implemented.keys()].filter((id) => !declared.has(id)).sort(),
    mismatches
  };
}
