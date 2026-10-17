/**
 * FunctionalGuarantees as higher-order functions over Compositions
 * (browser-safe).
 *
 * Sam: "FGs modeled to be mixins"; "FGs should allow any dependency
 * modeling needed. Unit and component tests. Forced renders. Functional
 * like functional programming. Define execution flow like CompForkJoin."
 *
 * A Composition is a value describing a unit of execution flow over the
 * PartStore: the simplest is one Calculation (calc) or one read; a span is
 * a sequence of them. An FG is a function Composition -> Composition. Two
 * families:
 *
 *   decorators (fg/mixins.mjs: materialized, witnessed, conserved, gated,
 *     delta, judged, framed, published, lane, instrumented): run the inner
 *     Composition, then ADD checks / witnesses / artifacts / frames /
 *     record fields; they never change a value the inner one produced.
 *   flow combinators (here: sequence, fork, forkJoin, branchRun, reuse):
 *     define how inner Compositions execute (in order, per variant on its
 *     own branch, once per key).
 *
 * Both are applied by plain function composition, so the order is the
 * code's order and inspectable (plan): pipe(c, f, g) = g(f(c)); the
 * innermost runs first. State is one explicit value `s` threaded through
 * run(env, s) -> s; nothing else is shared. Dependencies are only declared
 * Parts (reads) and Calculations (calls): every Composition carries its
 * own, and guarantee() unions them into the FG's declaration, so the
 * store's scoping rule (an undeclared read or call fails by name) holds for
 * every mixin as for hand-written code.
 *
 *   composition({ kind, name, property?, reads?, calls?, requires?, lane?,
 *                 children?, run(env, s) -> s })       the primitive
 *   read(...addresses)            s.parts[address] = the declared Part
 *   calc(fn, { args?, as? })      s[as ?? fn] = env.call(fn, args?(s))
 *   step(name, fn)                the FG's specific remainder: fn(env, s)
 *                                 returns s (or a patch merged into s)
 *   sequence(...cs)               run each on the state in order (a span)
 *   pipe(c, ...decorators)        decorators applied in order (innermost first)
 *   decorator({ name, property, kind?, reads?, calls?, requires?, lane?,
 *               after(env, s) })  -> (inner) => Composition: run inner, then after
 *   branchRun({ restore, op?, execute?, site, calculate? | calculateWith(env)?, outputs?, calls? })
 *                                 property branched:<site>. One op on a
 *                                 restored provider branch (fg/branchOp.mjs),
 *                                 canonical pixels asserted unchanged;
 *                                 s.branch = { branch, ticks, result, after },
 *                                 s.rerun() repeats it on a fresh branch
 *   fork({ name, variants: { v: Composition }, join(results, env, s) })
 *                                 run every variant on a copy of s (its own
 *                                 branch if it restores one); a throw is that
 *                                 variant's result, never the fork's; join
 *                                 reduces them into s[name]; inside an FG a
 *                                 variant's env.fail() still fails the FG
 *                                 (comparableForkJoin
 *                                 and the ablation fork are joins of this shape)
 *   forkJoin(spec)                fg/forkjoin.mjs comparableForkJoin as a
 *                                 Composition (needs env.store: runner level)
 *   reuse(c, { key })             run c once per key per run (env.cache); a
 *                                 second use replays the patch it produced
 *
 *   guarantee({ id, guards, reads?, calls?, requires?, lane?, site?, result? }, c)
 *     -> defineGuarantee(...) whose run threads s through c, with two
 *     default decorators: instrumented (the FG's Calculation calls, counted,
 *     onto the record) and rendered (forced render: a Composition that
 *     guarantees a span must emit at least one Frame; an FG that renders
 *     nothing fails). result(s) -> { totals, ...extra } for the record;
 *     s.out holds what mixins contributed to it. The FG carries
 *     properties (declared in stages/*.json, cross-checked) and plan.
 *   runComposition(c, { store, sink?, id?, lanes?, records? })
 *     run a Composition (a flow, a test span) directly against a store as
 *     an ad-hoc guarantee; env.store is the store (fork/forkJoin need it)
 *   unitTest / componentTest({ id, calculation | span, fixtures, args?, expect })
 *     a guarantee that applies one Calculation (unit) or a span (component)
 *     to fixture Parts and asserts; asNodeTest(fg, setup) -> a node:test body
 */
import { defineGuarantee, runGuarantee } from './guarantee.mjs';
import { runBranchOp, BRANCH_CALLS } from './branchOp.mjs';
import { comparableForkJoin } from './forkjoin.mjs';
import { createMemorySink } from './sinks.mjs';
import { createPartStore } from './store.mjs';
import { plain } from './canon.mjs';

const COMPOSITION = Symbol.for('chainspot.fg.composition');
const uniq = (lists) => [...new Set(lists.flat())];
export const isComposition = (v) => Boolean(v && v[COMPOSITION]);

export function composition({ kind, name, property = null, reads = [], calls = [], requires = [], lane = null, children = [], run }) {
  if (typeof run !== 'function') throw new Error(`composition ${name}: run(env, s) is required`);
  for (const child of children) if (!isComposition(child)) throw new Error(`composition ${name}: child is not a Composition`);
  const lanes = uniq([lane ? [lane] : [], children.map((c) => (c.lane ? [c.lane] : [])).flat()]);
  if (lanes.length > 1) throw new Error(`composition ${name}: lanes ${lanes.join(', ')} conflict`);
  return Object.freeze({
    [COMPOSITION]: true, kind, name, property,
    reads: uniq([children.map((c) => c.reads).flat(), reads]),
    calls: uniq([children.map((c) => c.calls).flat(), calls]),
    requires: uniq([children.map((c) => c.requires).flat(), requires]),
    lane: lanes[0] ?? null,
    properties: [...children.flatMap((c) => c.properties), ...(property ? [property] : [])],
    plan: [...children.flatMap((c) => c.plan), { kind, name, property }],
    children, run
  });
}

const merge = (s, patch) => (patch === undefined || patch === s ? s : { ...s, ...patch });

export const read = (...addresses) => composition({
  kind: 'read', name: `read ${addresses.join(', ')}`, reads: addresses,
  run: (env, s) => ({ ...s, parts: { ...(s.parts ?? {}), ...Object.fromEntries(addresses.map((a) => [a, env.get(a)])) } })
});

export const calc = (fn, { args = null, as = fn } = {}) => composition({
  kind: 'calc', name: fn, calls: [fn],
  run: (env, s) => ({ ...s, [as]: env.call(fn, args ? args(s) : undefined) })
});

export const step = (name, fn, { reads = [], calls = [] } = {}) => (inner) => composition({
  kind: 'specific', name, reads, calls, children: inner ? [inner] : [],
  run: (env, s) => { const t = inner ? inner.run(env, s) : s; return merge(t, fn(env, t)); }
});

export const sequence = (...cs) => composition({
  kind: 'flow', name: 'sequence', children: cs,
  run: (env, s) => cs.reduce((t, c) => c.run(env, t), s)
});

export const pipe = (c, ...decorators) => decorators.reduce((inner, d) => {
  if (typeof d !== 'function') throw new Error('pipe: a decorator is (Composition) => Composition');
  const out = d(inner);
  if (!isComposition(out)) throw new Error('pipe: a decorator returned something that is not a Composition');
  return out;
}, c);

/** A decorator: run inner, then `after` adds verdicts/artifacts/frames/record fields. */
export const decorator = ({ name, property, kind = 'mixin', reads = [], calls = [], requires = [], lane = null, after }) => (inner) => composition({
  kind, name, property, reads, calls, requires, lane, children: inner ? [inner] : [],
  run: (env, s) => { const t = inner ? inner.run(env, s) : s; return merge(t, after(env, t)); }
});

/** The start of a pipe that has nothing to run yet (all mixins). */
export const identity = composition({ kind: 'flow', name: 'identity', run: (env, s) => s });

const CANONICAL = 'tk.stage.S0.canonicalRgbaSha256';
const IMAGE = 'px.image.cropped';

/**
 * One op on a restored provider branch (flow). With `op` the toolkit
 * Calculation `calculate` runs as a one-op compiled plan through the
 * provider gateway (fg/branchOp.mjs); with `execute` a registered provider
 * Calculation runs over the restored board ({ board }). Either way the
 * branch's canonical raster must hash to tk.stage.S0.canonicalRgbaSha256
 * before and after (a branch never mutates pixels).
 */
export const branchRun = ({ restore, op = null, execute = null, site, calculate = null, calculateWith = null, outputs, calls = [] }) => {
  if (!op === !execute) throw new Error(`branchRun ${site}: exactly one of op or execute`);
  const once = (env, canonicalRgbaSha256) => {
    if (op) return runBranchOp(env, { restore, op, site, calculate: calculateWith ? calculateWith(env) : calculate, outputs, canonicalRgbaSha256 });
    const branch = env.call(restore);
    const rasterSha = () => env.call('fn.tk.sha256', { bytes: branch.get(IMAGE).rgba });
    const before = rasterSha();
    const result = env.call(execute, { board: branch });
    const after = rasterSha();
    if (before !== after || before !== canonicalRgbaSha256) env.fail(`${site} branch mutated canonical pixels`);
    return { branch, ticks: [], result, after };
  };
  return composition({
    kind: 'flow', name: `branchRun ${site}`, property: `branched:${site}`,
    reads: [CANONICAL], calls: [restore, ...(execute ? [execute, 'fn.tk.sha256'] : BRANCH_CALLS), ...calls],
    run: (env, s) => {
      const canonicalRgbaSha256 = env.get(CANONICAL);
      return { ...s, op, canonicalRgbaSha256, branch: once(env, canonicalRgbaSha256), rerun: () => once(env, canonicalRgbaSha256) };
    }
  });
};

/**
 * Fork into variants, each run on a copy of s, joined by join(results, env, s).
 * results: { [variant]: { s, error } } in variant-name order. A variant that
 * throws is recorded as its result (error message); the fork still joins.
 */
export const fork = ({ name, variants, join }) => {
  const names = Object.keys(variants).sort();
  if (!names.length) throw new Error(`fork ${name}: no variants`);
  return composition({
    kind: 'flow', name: `fork ${name}`, property: `forked:${name}`, children: names.map((n) => variants[n]),
    run: (env, s) => {
      const results = {};
      for (const n of names) {
        try { results[n] = { s: variants[n].run(env, { ...s, variant: n }), error: null }; } catch (error) { results[n] = { s: null, error: String(error?.message ?? error) }; }
      }
      return { ...s, [name]: join(results, env, s) };
    }
  });
};

/** comparableForkJoin as a Composition; spec as fg/forkjoin.mjs, store from env, result at s[as]. */
export const forkJoin = ({ as = 'forkJoin', ...spec }) => composition({
  kind: 'flow', name: `forkJoin ${spec.slot}`, property: `forkJoin:${spec.slot}`,
  run: (env, s) => {
    if (!env.store) env.fail(`forkJoin ${spec.slot} needs the run's store: run it with runComposition at the runner level`);
    return { ...s, [as]: comparableForkJoin({ ...spec, store: env.store, restore: spec.restore ?? (() => env.store.call(spec.restoreFn, undefined, { caller: `forkJoin:${spec.slot}` })) }) };
  }
});

/** Run c once per key per run; later uses replay the state patch it produced. */
export const reuse = (c, { key }) => composition({
  kind: 'flow', name: `reuse ${c.name}`, children: [c],
  run: (env, s) => {
    const k = typeof key === 'function' ? key(s) : key;
    if (!env.cache.has(k)) {
      const t = c.run(env, s);
      env.cache.set(k, Object.fromEntries(Object.entries(t).filter(([field, v]) => s[field] !== v)));
    }
    return { ...s, ...env.cache.get(k) };
  }
});

// ------------------------------------------------------------- guarantee

function makeEnv(ctx, fg, { store = null, cache = new Map() } = {}) {
  const calls = new Map();
  const verdicts = [];
  let frames = 0;
  return {
    id: ctx.id, fg, records: ctx.records, sink: ctx.sink, store, cache, calls, verdicts,
    get: ctx.get, has: ctx.has, fail: ctx.fail, publish: ctx.publish, artifact: ctx.artifact,
    call(fn, args) { calls.set(fn, (calls.get(fn) ?? 0) + 1); return ctx.call(fn, args); },
    check(name, ok, detail) { const held = ctx.check(name, ok, detail); verdicts.push({ name, ok: held }); return held; },
    witness(name, fn) { const outcome = ctx.witness(name, fn); verdicts.push({ name, ok: outcome.ok }); return outcome; },
    frameSpecs: [],
    frame(spec) { frames++; this.frameSpecs.push(spec); return ctx.frame(spec); },
    get framesEmitted() { return frames; }
  };
}

/** The verdicts this FG recorded, as the legacy { name: ok } checks map (record order). */
export const verdictMap = (env) => Object.fromEntries(env.verdicts.map((v) => [v.name, v.ok]));

/** The record step: s.record = { totals, ...result(s), ...what mixins put in s.out }. */
const recorded = (result) => decorator({
  name: 'record', property: null, kind: 'flow',
  after: (env, s) => { const { totals = null, ...extra } = result(s) ?? {}; return { record: { totals, ...extra, ...(s.out ?? {}) } }; }
});
/** Default decorators: every composed FG is instrumented and must render. */
const instrumented = decorator({
  name: 'instrumented', property: 'instrumented',
  after: (env, s) => ({ record: { ...s.record, callCount: Object.fromEntries(env.calls) } })
});
const rendered = decorator({
  name: 'rendered (forced render)', property: 'rendered',
  after: (env) => { env.check('rendered', env.framesEmitted > 0, { framesCount: env.framesEmitted }); }
});

/**
 * audit: decorators that run over the assembled record (after result(s)),
 * e.g. [unitful({ units })] from fg/mixins.mjs.
 */
export function guarantee({ id, guards, reads = [], calls = [], requires = [], lane = null, site = 'stage', result = (s) => ({ totals: s.totals ?? null }), audit = [] }, c, runtime = {}) {
  if (!isComposition(c)) throw new Error(`guarantee ${id}: the second argument must be a Composition`);
  const full = pipe(c, recorded(result), ...audit, instrumented, rendered);
  return defineGuarantee({
    id, guards, site,
    reads: uniq([reads, full.reads]), calls: uniq([calls, full.calls]), requires: uniq([requires, full.requires]),
    lane: full.lane ?? lane,
    properties: full.properties,
    plan: full.plan,
    run(ctx) {
      const env = makeEnv(ctx, { id, lane: full.lane ?? lane }, runtime);
      return full.run(env, { parts: {}, out: {} }).record;
    }
  });
}

/** Run a Composition directly against a store (a runner-level flow, a test span). */
export function runComposition(c, { store, sink = createMemorySink(), id = `fg.compose.${c.name.replace(/[^A-Za-z0-9_.-]+/g, '_')}`, guards = ['compose'], records = {}, result } = {}) {
  const fg = guarantee({ id, guards, ...(result ? { result } : {}) }, c, { store });
  return runGuarantee(fg, { store, sink, records });
}

// ------------------------------------------------------------- test FGs

/**
 * A test is an FG: apply one Calculation (unit) or a span (component) to
 * fixture Parts and assert. fixtures { [address]: value } enter the test
 * store through one named constant Calculation; register(store) adds the
 * real Calculations under test. expect(s, env) records checks (env.check)
 * or returns { [checkName]: boolean }. Forced render applies: the outcome
 * is rendered as a ledger frame, so a test run is inspectable like a run.
 */
export function unitTest({ id, calculation, args = null, reads = [], expect, frame = null }) {
  return testGuarantee({ id, guards: [calculation], span: calc(calculation, { args, as: 'out' }), reads, expect, frame, kind: 'unit' });
}
export function componentTest({ id, span, reads = [], expect, frame = null, guards = [span.name] }) {
  return testGuarantee({ id, guards, span, reads, expect, frame, kind: 'component' });
}
function testGuarantee({ id, guards, span, reads, expect, frame, kind }) {
  const asserted = step(`${kind} test assertions`, (env, s) => {
    const named = expect(s, env);
    if (named && typeof named === 'object') for (const [name, ok] of Object.entries(named)) env.check(name, ok === true);
    env.frame(frame ? frame(s, env) : {
      title: `${kind} test ${id}: ${env.verdicts.filter((v) => v.ok).length}/${env.verdicts.length} assertions hold`, calculation: span.name,
      parts: [{ address: `${id}#assertions`, kind: 'ledger', data: { rows: env.verdicts.map((v) => ({ ...v })) } }]
    });
    return { assertions: env.verdicts.length };
  });
  return guarantee({ id, guards, reads, result: (s) => ({ totals: { assertions: s.assertions ?? null }, test: kind }) }, pipe(sequence(read(...reads), span), asserted));
}

/** A node:test body for a test FG: build the fixture store, run, throw on failure. */
export const asNodeTest = (fg, { fixtures = {}, register = () => {}, base = null, sink = createMemorySink() } = {}) => () => {
  const store = createPartStore({ base, name: fg.id });
  if (Object.keys(fixtures).length) store.constant('fn.test.fixtures', fixtures);
  register(store);
  return runGuarantee(fg, { store, sink });
};

export const describePlan = (fg) => plain(fg.plan ?? []);
