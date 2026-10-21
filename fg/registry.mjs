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
 *   Events (fg/mixins.mjs emits / on). An FG declares emits: [event] and subscribes: [event]. A subscription
 *       names an event, not an FG id, so it is its own field and not a requires; the registry turns it into the
 *       same thing a requires is, an ordering edge: every emitter of an event runs before each subscriber, ties
 *       by id, so the order (and the record stream) stays deterministic. An explicit order among subscribers is a
 *       requires between them (gated). The payloads travel on the emitters' records (events) and are delivered
 *       through ctx.heard(event). Dormancy follows: a subscriber whose emitters are all dormant is dormant.
 *       eventReport(fgs) -> { errors, warnings }, never throws, before anything runs:
 *         error   unemitted  a subscriber whose event no assembled FG emits (it could never fire)
 *         error   cycle      a loop through subscriptions (and requires); a pure requires cycle stays orderGuarantees'
 *         warning unheard    an event emitted that nobody subscribes to (legal, like a C# event with no handlers;
 *                            a mistyped name on the subscriber side is already the unemitted error)
 *       orderGuarantees / createRegistry throw on the errors (a compile error); crossCheck reports them as
 *       mismatches (field 'subscribes') and the warnings as eventWarnings.
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

/** event -> ids of the FGs that emit it, sorted. */
const emittersOf = (fgs) => {
  const map = new Map();
  for (const fg of fgs) for (const event of fg.emits ?? []) map.set(event, [...(map.get(event) ?? []), fg.id]);
  for (const ids of map.values()) ids.sort();
  return map;
};

/**
 * What an FG waits for, as [{ id, via }] sorted by id: its requires (via: []) plus every emitter of each event it
 * subscribes to (via: the events, sorted). An id that is both lists its events. A subscribed event nobody emits
 * adds no edge (eventReport / orderGuarantees name it).
 */
const dependencies = (fg, emitters) => {
  const via = new Map((fg.requires ?? []).map((id) => [id, []]));
  for (const event of [...(fg.subscribes ?? [])].sort())
    for (const id of emitters.get(event) ?? []) via.set(id, [...(via.get(id) ?? []), event]);
  return [...via].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([id, events]) => ({ id, via: events }));
};

const hops = (ids, byId, emitters) => ids.slice(0, -1).map((id, i) => dependencies(byId.get(id), emitters).find((d) => d.id === ids[i + 1])?.via ?? []);
const cycleText = (ids, labels) => ids.map((id, i) => (i < labels.length ? `${id} ${labels[i].length ? `-[${labels[i].join(', ')}]->` : '->'}` : id)).join(' ');

/**
 * Events before anything runs: { errors, warnings } (never throws), in id / event order.
 *   unemitted  { kind, id, event, emittedEvents }  a subscriber whose event no FG in fgs emits
 *   cycle      { kind, path, events }              a loop with at least one subscription on it; path starts and ends
 *                                                  at the same id, events lists the subscriptions hop by hop
 *   unheard    { kind, event, emitters }           (warning) an emitted event nobody subscribes to
 */
export function eventReport(fgs) {
  const emitters = emittersOf(fgs);
  const byId = new Map(fgs.map((fg) => [fg.id, fg]));
  const errors = [], warnings = [];
  const sorted = [...fgs].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const fg of sorted)
    for (const event of [...(fg.subscribes ?? [])].sort())
      if (!emitters.has(event)) errors.push({ kind: 'unemitted', id: fg.id, event, emittedEvents: [...emitters.keys()].sort() });
  const heard = new Set(fgs.flatMap((fg) => fg.subscribes ?? []));
  for (const event of [...emitters.keys()].sort()) if (!heard.has(event)) warnings.push({ kind: 'unheard', event, emitters: emitters.get(event) });
  // cycles: depth-first over what each FG waits for; a back edge closes one. A cycle is reported once.
  const state = new Map();
  const seen = new Set();
  const visit = (id, stack) => {
    state.set(id, 'visiting');
    for (const dep of dependencies(byId.get(id), emitters)) {
      if (!byId.has(dep.id)) continue;   // a requires nobody registered: orderGuarantees names it
      if (state.get(dep.id) === 'visiting') {
        const path = [...stack.slice(stack.indexOf(dep.id)), dep.id];
        const labels = hops(path, byId, emitters);
        const key = [...new Set(path)].sort().join('|');
        if (labels.some((l) => l.length) && !seen.has(key)) { seen.add(key); errors.push({ kind: 'cycle', path, events: labels.flat() }); }
      } else if (!state.has(dep.id)) visit(dep.id, [...stack, dep.id]);
    }
    state.set(id, 'done');
  };
  for (const fg of sorted) if (!state.has(fg.id)) visit(fg.id, [fg.id]);
  return { errors, warnings };
}

export function orderGuarantees(fgs, only = null) {
  const byId = new Map();
  for (const fg of fgs) {
    if (byId.has(fg.id)) throw new Error(`fg registry: duplicate guarantee id ${fg.id}`);
    byId.set(fg.id, fg);
  }
  const emitters = emittersOf(fgs);
  const roots = only ? [...only] : [...byId.keys()];
  for (const id of roots) if (!byId.has(id)) throw new Error(`fg registry: ${id} is not a registered guarantee`);
  const order = [];
  const state = new Map(); // id -> 'visiting' | 'done'
  const visit = (id, path) => {
    if (state.get(id) === 'done') return;
    if (state.get(id) === 'visiting') {
      const loop = [...path.slice(path.indexOf(id)), id];
      const labels = hops(loop, byId, emitters);
      throw new Error(labels.some((l) => l.length) ? `fg registry: subscription cycle ${cycleText(loop, labels)}` : `fg registry: requires cycle ${[...path, id].join(' -> ')}`);
    }
    const fg = byId.get(id);
    if (!fg) throw new Error(`fg registry: ${path.at(-1)} requires ${id}, which is not registered`);
    for (const event of [...(fg.subscribes ?? [])].sort())
      if (!emitters.has(event)) throw new Error(`fg registry: ${id} subscribes to ${event}, which no registered guarantee emits`);
    state.set(id, 'visiting');
    for (const dep of dependencies(fg, emitters)) visit(dep.id, [...path, id]);
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
  const emitters = emittersOf(guarantees);
  const deliveries = {};   // event -> [{ from, payload }] in run order, from the held emitters' records
  for (const fg of orderGuarantees(guarantees, only)) {
    const dormantDep = fg.requires.find((id) => records[id]?.status === 'dormant');
    const silent = (fg.subscribes ?? []).find((event) => emitters.get(event).every((id) => records[id]?.status === 'dormant'));
    if (fg.lane && !enabled.has(fg.lane)) { records[fg.id] = dormantRecord(fg, `lane ${fg.lane} is OFF`); continue; }
    if (dormantDep) { records[fg.id] = dormantRecord(fg, `requires dormant ${dormantDep}`); continue; }
    if (silent) { records[fg.id] = dormantRecord(fg, `subscribes to ${silent}, whose emitters are all dormant (${emitters.get(silent).join(', ')})`); continue; }
    const required = Object.fromEntries(fg.requires.map((id) => [id, records[id]]));
    const started = now();
    try {
      const events = Object.fromEntries((fg.subscribes ?? []).map((event) => [event, deliveries[event] ?? []]));
      const out = runGuarantee(fg, { store: parts, records: required, sink, branch, events, ...(hash ? { hash } : {}) });
      records[fg.id] = out.record;
      for (const { event, payload } of out.record.events ?? []) (deliveries[event] ??= []).push({ from: fg.id, payload });
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
export const DEFAULT_PROPERTIES = Object.freeze(['instrumented', 'profiled', 'rendered']);
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
  const events = eventReport(fgs);
  for (const e of events.errors)
    mismatches.push(e.kind === 'unemitted'
      ? { id: e.id, field: 'subscribes', problem: 'unemitted', event: e.event, emittedEvents: e.emittedEvents }
      : { id: e.path[0], field: 'subscribes', problem: 'cycle', path: e.path, events: e.events });
  return {
    declared: declared.size,
    implemented: implemented.size,
    eventWarnings: events.warnings,
    declaredUnimplemented: [...declared.keys()].filter((id) => !implemented.has(id)).sort(),
    implementedUndeclared: [...implemented.keys()].filter((id) => !declared.has(id)).sort(),
    mismatches
  };
}
