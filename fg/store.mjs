/**
 * PartStore: the toolkit's addressed store (browser-safe).
 *
 * Sam's doctrine (2026-10-17): "The point of PxC is that parts go to
 * addressed store so this shouldn't happen. Calcs declare inParts +
 * outParts for this reason." A FunctionalGuarantee, a fork-join
 * implementation, a comparator and a runner's sidecar writer reach DATA
 * only as Parts at addresses, and CODE / capabilities (provider runtime
 * functions, snapshot restore, hashing) only as registered Calculations
 * looked up by `fn.*` address. Nothing is passed as a side-channel value.
 *
 * The provider board (source/provider/packages/alg/src/exec/board.ts) is a
 * PxC: get/has/set over open SlotRef addresses plus register/call for fn.*
 * calculations. It does accept new addresses at runtime, but writing the
 * toolkit's Parts onto it would change the board the pinned stage gateways
 * read, snapshot and receipt (PCR write testimony, capturePxC address
 * lists), and its calculations carry no inParts/outParts. So this store is
 * an OVERLAY: reads resolve toolkit Parts first and then fall through to
 * the provider board (`base`), uniformly, while the provider board is never
 * written. Toolkit Parts are write-once and each records the Calculation
 * that produced it and that Calculation's declared inParts.
 *
 *   createPartStore({ base?, name?, onCall? })
 *     base     the provider PxC (or a () => board getter, when the runner's
 *              live board object changes between stages); null for a store
 *              with no provider Parts
 *     onCall   instrumentation hook, called once per Calculation invocation; the entry carries the call's
 *              `emits` (measures its output declared, see emitsOf)
 *              at exit with { seq, parent, depth, calculation, store, caller,
 *              site, inParts, outParts, elapsedMs, status, error }: Sam's
 *              "auto-instrument every Calculation". Nondeterministic (it
 *              carries timings), so it is a sidecar, never hashed evidence.
 *
 *   store.has(address) / store.get(address)
 *              toolkit Part (this store, then its parents), else the
 *              provider board, else a registered Calculation that declares
 *              the address among its outParts is invoked once, lazily, and
 *              its outParts are written. get of an unresolvable address
 *              throws a PartStoreError naming it; has returns false.
 *   store.register(fn, { inParts, outParts, calls, calculate, note })
 *              a Calculation at address fn.*. calculate(io) where
 *                io.in(address)   one of the declared inParts (resolved
 *                                 before calculate runs; any other address
 *                                 throws by name)
 *                io.board         { get, has } over exactly those inParts, for
 *                                 provider functions that take a board
 *                io.args          call-time arguments (non-Part parameters:
 *                                 a branch board handle, an op site name)
 *                io.call(fn, a)   a nested call to one of the declared calls
 *              With outParts, calculate returns { [outPart]: value } for
 *              exactly those addresses and the store writes them (write-
 *              once). Without outParts it is a capability whose return
 *              value goes to the caller. calculate may return a Promise
 *              (the provider's async S0 gateway); call then returns one.
 *              lazy: false keeps a producer from being invoked by a read
 *              (a Calculation that needs call-time args, such as a stage
 *              gateway); reading its Part before the explicit call throws
 *              by name.
 *   store.constant(fn, { [address]: value })
 *              register a Calculation with no inParts that produces exactly
 *              these values: how a root input (a fixture, a file the runner
 *              read) enters the store, still with a named producer.
 *   store.call(fn, args)    invoke a registered Calculation (instrumented).
 *   store.scope({ who, reads, calls })
 *              the view an FG or an implementation sees: get/has only for
 *              the declared reads, call only for the declared calls; any
 *              other address or Calculation throws a PartStoreError naming
 *              who reached for what.
 *   store.branch(base, { name, alias?, sharedParts? })
 *              a child store over another provider board (a restored
 *              snapshot): provider reads resolve ONLY against the child's
 *              own base (never the parent's live board), toolkit Parts and
 *              Calculations resolve through the parent, and the child's own
 *              writes stay in the child. With alias { address: 'address@v' }
 *              the child reads and writes the variant wherever code names
 *              the plain address; with sharedParts: true its Parts are
 *              written into the parent's map, so they outlive the branch.
 *              A fork-join branch is both: a key prefix, not a separate
 *              store (Sam: "model this one after Redis").
 *   store.provenance(address)   { address, producedBy, inParts, key, store } or
 *              { address, producedBy: 'provider-board', key } or null
 *   store.manifest()            this store's toolkit Parts and Calculations
 *
 * The keyspace (Sam, 2026-10-18: "ComparableForkJoin exists so that everything is included by default. This is made
 * tractable by the warm caching of PxC. If you model this one after Redis you don't even need separate branches"):
 *   address@variant        a variant of a Part is its own address (px.tees.refined@structural); nothing collides, so
 *                          every implementation can run and be kept side by side in ONE store
 *   store.point(address, 'address@variant', { by })
 *                          the accepted variant: get(address) follows the pointer (write-once, with its author)
 *   store.variants(address)  the variant addresses present or declared for an address
 *   store.keyOf(address)   the content key of a Part: for a produced Part, the cache key of the call that made it;
 *                          for a provider Part, a digest of its value (typed arrays by their bytes); for a constant Part, a digest
 *                          of its own value without its locators (LOCATORS: attempt, run), per Part, never of the bundle
 *   cache key              sha256 of { fn, code, args, inputs: [[inPart, keyOf(inPart)]...] }; code is the
 *                          Calculation's declared `code` key, else the digest of calculate's source. A call whose key is
 *                          in the store's cache writes its outParts from the cache without computing (the call is
 *                          logged with cached: 1). createPartStore({ cache }) takes any { has, get, set }; the default
 *                          is a Map shared by the store and its branches, so a variant computed once in a run is never
 *                          computed twice; a runner passes a persistent cache to make the next run warm.
 *   codeSalt               createPartStore({ codeSalt }): a runner's module-closure sha (fg/closure.mjs closureSha), mixed into every
 *                          Calculation's code key, so code a calculate calls but does not contain still changes the key
 *   store.keyspace()       every Part of this store with its key and producer: the snapshot as a key dump
 *
 * Address namespaces (the early runner's table of Parts, producers and
 * inParts is in ports/early/earlyStore.mjs):
 *   px.*, badges, localImage, viewport, ...  provider Parts (the provider
 *                 board), plus slot Parts a fork-join branch writes
 *                 (px.tees.familyMembers) into its own branch store
 *   tk.*          toolkit data Parts (source intake, stage captures, snapshots)
 *   view.*        view-only Parts (flipbook backgrounds); never receipt bytes
 *   testimony.*   human testimony (Sam's annotations) and its derived frames
 *   fn.provider.* provider capabilities registered by the runner
 *   fn.tk.*, fn.view.*, fn.testimony.*  toolkit Calculations
 */

import { PXSET_QUERIES, resolvePxSet } from './pxset.mjs';
import { renderValue } from './render.mjs';
import { digest, sha256Hex, plain } from './canon.mjs';

/** Every store renders any Part by address (renderable, a default property of Parts). */
export const RENDER_PART = 'fn.q.part.render';

const FN = /^fn\.[A-Za-z0-9_.\-/@]+$/;
const STORE = Symbol.for('chainspot.fg.store');
const now = () => globalThis.performance?.now?.() ?? Date.now();
const roundMs = (ms) => Math.round(ms * 1000) / 1000;
const isPromise = (v) => Boolean(v && typeof v.then === 'function');
const addressList = (list, what) => {
  if (!Array.isArray(list) || !list.every((a) => typeof a === 'string' && a)) throw new PartStoreError(`${what} must be a list of addresses`);
  return Object.freeze([...list]);
};

export class PartStoreError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = 'PartStoreError';
  }
}

export const isPartStore = (value) => Boolean(value && value[STORE]);

/**
 * The emit channel, for every Calculation call: a produced Part (or a capability's return value) that carries an
 * `emits` field holding a plain object of measures has it copied (detached) onto the call's instrumentation entry. A
 * Calculation declares its measures on its output and is profiled without knowing anything about profiling.
 */
function emitsOf(values) {
  let out = null;
  for (const v of values) {
    if (v && typeof v === 'object' && !Array.isArray(v) && v.emits && typeof v.emits === 'object' && !Array.isArray(v.emits))
      out = { ...(out ?? {}), ...JSON.parse(JSON.stringify(v.emits)) };
  }
  return out;
}

/** A value's content key: canonical JSON with every typed array replaced by the digest of its bytes (a raster hashes once, by bytes). */
const isTyped = (v) => ArrayBuffer.isView(v) && !(v instanceof DataView);
function withByteDigests(v, depth = 0) {
  if (isTyped(v)) return { '@typed': v.constructor.name, length: v.length, sha256: sha256Hex(v) };
  if (v instanceof ArrayBuffer) return { '@typed': 'ArrayBuffer', length: v.byteLength, sha256: sha256Hex(new Uint8Array(v)) };
  if (Array.isArray(v)) return v.map((x) => withByteDigests(x, depth + 1));
  if (v instanceof Map) return { '@map': [...v].map(([k, x]) => [withByteDigests(k, depth + 1), withByteDigests(x, depth + 1)]) };
  if (v instanceof Set) return { '@set': [...v].map((x) => withByteDigests(x, depth + 1)) };
  if (v && typeof v === 'object') { const o = {}; for (const k of Object.keys(v)) if (typeof v[k] !== 'function') o[k] = withByteDigests(v[k], depth + 1); return o; }
  return v;
}
export const contentKey = (value) => digest(withByteDigests(value));
/** Top-level fields that say where a root input was read from, not what it is: ignored when a constant is keyed. */
export const LOCATORS = Object.freeze(['attempt', 'run']);
const withoutLocators = (value, locators) => {
  if (!locators.length || !value || typeof value !== 'object' || Array.isArray(value) || isTyped(value) || value instanceof Map || value instanceof Set) return value;
  return Object.fromEntries(Object.entries(value).filter(([k]) => !locators.includes(k)));
};
export const variantOf = (address, name) => `${address}@${name}`;

/** The image size of a store's raster Part (px.image.cropped, else the canonical pixels). */
export function imageDims(store) {
  for (const a of ['px.image.cropped', 'px.course.canonicalPixels']) if (store.has(a)) return store.get(a);
  throw new PartStoreError('no raster Part for the image size (px.image.cropped / px.course.canonicalPixels)');
}

/**
 * Register a family of PxC queries: { 'fn.q.<family>.<name>': (resolvedArgs, rawArgs) => ({ value, unit }) }. The one
 * way a query enters a store (scripts/pxc.mjs scaffold query writes a table for it): every answer is cached by its
 * arguments (Parts are write-once), profiled (emits computed/cached), and must carry a unit. resolve(ref) turns an
 * argument that is a Part reference into the value the math wants (default: store.get for string arguments).
 */
export function registerQueries(store, table, { resolve = (ref) => store.get(ref), note = 'PxC query' } = {}) {
  const answers = new Map();
  for (const [fn, q] of Object.entries(table)) store.register(fn, { note,
    calculate: (io) => {
      const args = io.args ?? {}, key = `${fn} ${JSON.stringify(args)}`;
      if (answers.has(key)) return { ...answers.get(key), emits: { cached: 1 } };
      const resolved = Object.fromEntries(Object.entries(args).map(([k, v]) => [k, typeof v === 'string' ? resolve(v) : v]));
      const ans = q(resolved, args);
      if (!ans || !('value' in ans) || typeof ans.unit !== 'string') throw new PartStoreError(`${fn} must answer { value, unit }`);
      answers.set(key, ans);
      return { ...ans, emits: { computed: 1 } };
    } });
}

/** The name of the capability every store offers: the calls made by args.caller and nested under them. */
export const INSTRUMENTATION_CALLS = 'fn.tk.instrumentation.calls';

/** The calls made by `caller` (an FG id, an implementation, a Calculation) and everything nested under them. */
export function callSubtree(entries, caller) {
  const inTree = new Set(), sorted = [...entries].sort((a, b) => a.seq - b.seq);
  for (const e of sorted) if (e.caller === caller || (e.parent != null && inTree.has(e.parent))) inTree.add(e.seq);
  return sorted.filter((e) => inTree.has(e.seq));
}

/**
 * Profiled is a default property of every Calculation: every store keeps the log of its calls (and its branches'),
 * each entry timed with the emits its output declared, and offers it back as the capability INSTRUMENTATION_CALLS.
 * onCall stays a hook for runners that also stream entries elsewhere.
 */
export function createPartStore({ base = null, name = 'root', onCall = null, cache = new Map(), codeSalt = null } = {}) {
  const log = [];
  const store = makeStore({ base, name, parent: null, shared: { seq: 0, stack: [], log, cache, codeSalt, baseKeys: new WeakMap(), onCall: (entry) => { log.push(entry); onCall?.(entry); } } });
  // The PxC is queryable: pixel-set math lives in fg/pxset.mjs and is invoked from outside by Part address.
  registerQueries(store, PXSET_QUERIES, { resolve: (ref) => resolvePxSet((a) => store.get(a), ref, () => imageDims(store)) });
  // renderable is a default property of every Part: any address renders by the shape of its value (fg/render.mjs)
  const rendered = new Map();
  store.register(RENDER_PART, { note: 'default render of the Part at args.a (fg/render.mjs), cached by address',
    calculate: (io) => {
      const a = io.args?.a;
      if (!rendered.has(a)) { let d = null; try { d = imageDims(store); } catch { /* an image-free store renders without px coordinates */ } rendered.set(a, renderValue(a, store.get(a), d, 0, { deflate: io.args?.deflate ?? null })); }
      const r = rendered.get(a);
      return { value: r, unit: 'frame parts', emits: { parts: r.parts.length, unrenderable: r.kind === 'unrenderable' ? 1 : 0 } };
    } });
  store.register(INSTRUMENTATION_CALLS, { note: 'the calls made by args.caller and nested under them (timings: sidecar data, never hashed)',
    calculate: (io) => callSubtree(log, io.args?.caller ?? null).filter((e) => e.calculation !== INSTRUMENTATION_CALLS) });
  return store;
}

function makeStore({ base, name, parent, shared, alias = {}, sharedParts = false }) {
  const parts = sharedParts && parent ? parent._parts : new Map(); // address -> { value, producedBy, inParts, key } or { pointerTo, producedBy, inParts, key }
  const A = (address) => alias[address] ?? address;   // the alias: a plain address names its variant on this branch
  const calcs = new Map(); // fn -> spec
  const producers = new Map(); // outPart address -> fn (registered here)
  const failures = new Map(); // address -> error of a failed lazy production
  const producing = new Set();
  const board = () => (typeof base === 'function' ? base() : base);
  const chain = function* () { for (let s = self; s; s = s.parent) yield s; };
  const ownPart = (address) => { for (const s of chain()) if (s._parts.has(address)) return s._parts.get(address); return null; };
  const findCalc = (fn) => { for (const s of chain()) if (s._calcs.has(fn)) return s._calcs.get(fn); return null; };
  const producerOwner = (address) => { for (const s of chain()) if (s._producers.has(address)) return s; return null; };
  const onBase = (address) => { const b = board(); return Boolean(b && typeof b.has === 'function' && b.has(address)); };

  const write = (address, value, producedBy, inParts, key = null) => {
    if (ownPart(address)) throw new PartStoreError(`Part '${address}' is write-once; ${ownPart(address).producedBy} already produced it`);
    if (onBase(address)) throw new PartStoreError(`Part '${address}' is a provider-board address; a toolkit Calculation (${producedBy}) may not shadow it`);
    parts.set(address, Object.freeze({ value, producedBy, inParts, key }));
  };
  // The roots key: every root input this store can reach (provider-board Parts and constant Parts, along the chain). A
  // Calculation that calls queries can read any Part through them (queries declare no inParts), so its declared inParts do
  // not bound what it saw: its cache key carries the roots key instead (a cross-run cache otherwise serves one course's
  // answer to another: golden's S4 recovered tees on lenard, 2026-10-18).
  const rootsKey = () => {
    const rows = [];
    for (const s of chain()) {
      const b = s === self ? board() : null;
      if (b && typeof b.keys === 'function') for (const address of b.keys()) rows.push([address, keyOf(address)]);
      for (const [fn, spec] of s._calcs) if (spec.rootKey) for (const address of spec.outParts) rows.push([address, keyOf(address)]);
    }
    return digest(rows.sort((x, y) => (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0)));
  };
  // the content key of any Part this store can see: a produced Part carries the key of the call that made it; a provider
  // or constant Part is digested once (by object identity, so a raster hashes once per run)
  const keyOf = (address) => {
    const own = ownPart(address);
    if (own) { if (own.pointerTo) return keyOf(own.pointerTo); if (own.key) return own.key; const k = contentKey(own.value); return k; }
    if (onBase(address)) {
      const v = board().get(address);
      if (v && typeof v === 'object') { if (!shared.baseKeys.has(v)) shared.baseKeys.set(v, contentKey(v)); return shared.baseKeys.get(v); }
      return contentKey(v);
    }
    const owner = producerOwner(address);
    if (owner) { owner._produce(address); return keyOf(address); }
    throw new PartStoreError(`keyOf: no Part at '${address}' on store ${name}`);
  };
  const codeKey = (code) => (shared.codeSalt ? digest({ code, salt: shared.codeSalt }) : code);   // no salt: the key means what it always meant
  const cacheable = (args) => { try { plain(args ?? null); return true; } catch { return false; } };

  // Lazy production of a Part whose producer is registered on THIS store.
  const produceHere = (address) => {
    if (parts.has(address)) return;
    if (failures.has(address)) throw failures.get(address);
    const fn = producers.get(address);
    if (producing.has(address)) throw new PartStoreError(`Part '${address}': production cycle through ${fn}`);
    producing.add(address);
    try {
      const result = self.call(fn, undefined, { caller: `lazy:${address}` });
      if (isPromise(result)) {
        result.catch(() => {});
        throw new PartStoreError(`Part '${address}': producing Calculation ${fn} is asynchronous; call it explicitly before reading the Part`);
      }
    } catch (error) {
      const failure = error instanceof PartStoreError && error.message.startsWith(`Part '${address}'`)
        ? error : new PartStoreError(`Part '${address}': producing Calculation ${fn} failed: ${error?.message ?? error}`, { cause: error });
      failures.set(address, failure);
      throw failure;
    } finally { producing.delete(address); }
  };

  const self = {
    [STORE]: true,
    name,
    parent,
    _parts: parts,
    _calcs: calcs,
    _producers: producers,

    has(address) {
      address = A(address);
      if (ownPart(address)) return true;
      if (onBase(address)) return true;
      const owner = producerOwner(address);
      if (!owner || !owner._calcs.get(owner._producers.get(address)).lazy) return false;
      try { owner._produce(address); return true; } catch { return false; }
    },

    get(address) {
      address = A(address);
      const own = ownPart(address);
      if (own) return own.pointerTo ? self.get(own.pointerTo) : own.value;
      if (onBase(address)) return board().get(address);
      const owner = producerOwner(address);
      if (owner && !owner._calcs.get(owner._producers.get(address)).lazy)
        throw new PartStoreError(`Part '${address}' has not been produced yet on store ${name}; its Calculation ${owner._producers.get(address)} runs only when called explicitly`);
      if (owner) { owner._produce(address); return ownPart(address).value; }
      throw new PartStoreError(`no Part at '${address}' on store ${name}: no toolkit Part, no registered Calculation declares it among its outParts, and it is not on the provider board`);
    },

    _produce: produceHere,

    register(fn, { inParts = [], outParts = [], calls = [], calculate, lazy = true, note = null, code = null, rootKey = null } = {}) {
      if (typeof fn !== 'string' || !FN.test(fn)) throw new PartStoreError(`register: ${JSON.stringify(fn)} is not a fn.* Calculation address`);
      if (findCalc(fn)) throw new PartStoreError(`register: Calculation '${fn}' is already registered`);
      if (typeof calculate !== 'function') throw new PartStoreError(`register ${fn}: calculate(io) is required`);
      const spec = Object.freeze({
        address: fn, store: name, note, lazy: lazy !== false,
        rootKey,
        code: codeKey(code ?? sha256Hex(String(calculate))),   // the code key: pass the module graph's digest when a helper can change the result; the store's codeSalt (a runner's module closure, fg/closure.mjs) is mixed into every key
        inParts: addressList(inParts, `register ${fn}: inParts`).map(A),
        outParts: addressList(outParts, `register ${fn}: outParts`).map(A),
        calls: addressList(calls, `register ${fn}: calls`),
        calculate
      });
      for (const address of spec.outParts) {
        if (ownPart(address)) throw new PartStoreError(`register ${fn}: outPart '${address}' was already produced by ${ownPart(address).producedBy}`);
        const owner = producerOwner(address);
        if (owner) throw new PartStoreError(`register ${fn}: outPart '${address}' is already declared by ${owner._producers.get(address)}`);
        if (onBase(address)) throw new PartStoreError(`register ${fn}: outPart '${address}' is a provider-board address`);
      }
      calcs.set(fn, spec);
      for (const address of spec.outParts) producers.set(address, fn);
      return spec;
    },

    constant(fn, values, { locators = LOCATORS } = {}) {
      const outParts = Object.keys(values);
      // a root input is keyed by its content, per Part: the Part's key digests its own value (typed arrays by their bytes) without
      // its locators (where it was read from: the attempt id, the run directory). The same pixels on a new attempt, or an
      // upstream re-run that produced the same recovered tees, key identically, and one changed Part does not re-key the others.
      const rootKey = (address, value) => digest({ root: address, content: contentKey(withoutLocators(value, locators)) });
      return self.register(fn, { outParts, rootKey, calculate: () => ({ ...values }) });
    },

    registered: (fn) => Boolean(findCalc(fn)),
    calculation: (fn) => findCalc(fn),

    call(fn, args, { caller = null } = {}) {
      const spec = findCalc(fn);
      if (!spec) throw new PartStoreError(`Calculation '${fn}' is not registered on store ${name}`);
      const entry = {
        seq: shared.seq++, parent: shared.stack.at(-1) ?? null, depth: shared.stack.length,
        calculation: fn, store: name, caller, site: typeof args?.site === 'string' ? args.site : null,
        inParts: spec.inParts, outParts: spec.outParts, elapsedMs: null, status: 'running', error: null, emits: null, key: null, cached: false, computedMs: null
      };
      const started = now();
      let key = null, toCache = null;
      shared.stack.push(entry.seq);
      let popped = false;
      const pop = () => { if (!popped) { popped = true; shared.stack.splice(shared.stack.lastIndexOf(entry.seq), 1); } };
      const exit = (status, error = null) => {
        pop();
        entry.elapsedMs = roundMs(now() - started);
        entry.status = status;
        entry.error = error ? String(error?.message ?? error) : null;
        if (status === 'ok' && toCache) shared.cache.set(key, { result: toCache, elapsedMs: entry.elapsedMs });
        shared.onCall?.(entry);
      };
      try {
        const inputs = new Map();
        for (const address of spec.inParts) {
          if (!self.has(address)) throw new PartStoreError(`${fn}: declared inPart '${address}' is not on store ${name}${failureNote(address)}`);
          inputs.set(address, self.get(address));
        }
        const read = (address) => {
          address = A(address);
          if (!inputs.has(address)) throw new PartStoreError(`${fn} read '${address}', which is not among its declared inParts`);
          return inputs.get(address);
        };
        const io = Object.freeze({
          in: read,
          board: Object.freeze({ get: read, has: (address) => inputs.has(address) }),
          args,
          call: (inner, innerArgs) => {
            if (!spec.calls.includes(inner)) throw new PartStoreError(`${fn} called '${inner}', which is not among its declared calls`);
            return self.call(inner, innerArgs, { caller: fn });
          }
        });
        // the cache key of this call: the Calculation, its code, its arguments and the content keys of its inputs
        key = spec.outParts.length && !spec.rootKey && cacheable(args) ? digest({ fn, code: spec.code, args: plain(args ?? null), inputs: spec.inParts.map((a) => [a, keyOf(a)]), ...(spec.calls?.length ? { roots: rootsKey() } : {}) }) : null;
        entry.key = key;
        const finish = (result, fromCache = false) => {
          if (spec.outParts.length) {
            if (!result || typeof result !== 'object') throw new PartStoreError(`${fn} must return { [outPart]: value } for ${spec.outParts.join(', ')}`);
            const out = Object.fromEntries(Object.entries(result).map(([k, v]) => [A(k), v]));   // a branch writes the variant its alias names
            const keys = Object.keys(out);
            const missing = spec.outParts.filter((a) => !keys.includes(a));
            const extra = keys.filter((a) => !spec.outParts.includes(a));
            if (missing.length || extra.length) throw new PartStoreError(`${fn} returned outParts that differ from its declaration (missing: ${missing.join(', ') || '-'}; undeclared: ${extra.join(', ') || '-'})`);
            for (const address of spec.outParts) write(address, out[address], fn, spec.inParts, spec.rootKey ? spec.rootKey(address, out[address]) : key);
            if (key && !fromCache && shared.cache) toCache = out;
            entry.emits = emitsOf(spec.outParts.map((a) => out[a]));
          } else entry.emits = emitsOf([result]);
          if (fromCache) { entry.cached = true; entry.emits = { ...(entry.emits ?? {}), cached: 1 }; }
          return result;
        };
        if (key && shared.cache?.has(key)) {
          const hit = shared.cache.get(key);
          const out = finish(hit.result, true); entry.computedMs = hit.elapsedMs ?? null;   // a hit is charged what it cost to compute, once
          exit('ok'); return out;
        }
        const result = spec.calculate(io);
        if (isPromise(result)) {
          pop();
          return result.then((value) => { const out = finish(value); exit('ok'); return out; }, (error) => { exit('threw', error); throw error; });
        }
        const out = finish(result);
        exit('ok');
        return out;
      } catch (error) {
        if (entry.status === 'running') exit('threw', error);
        throw error;
      }
    },

    scope({ who, reads = [], calls = [] }) {
      const allowedReads = new Set(reads.map(A));
      const allowedCalls = new Set(calls);
      const guardRead = (address) => {
        if (!allowedReads.has(A(address))) throw new PartStoreError(`${who} read undeclared address '${address}' (declare it in reads)`);
      };
      return Object.freeze({
        get: (address) => { guardRead(address); return self.get(address); },
        has: (address) => { guardRead(address); return self.has(address); },
        call: (fn, callArgs) => {
          if (!allowedCalls.has(fn)) throw new PartStoreError(`${who} called undeclared Calculation '${fn}' (declare it in calls)`);
          return self.call(fn, callArgs, { caller: who });
        }
      });
    },

    /** Every call this store and its branches made so far (the default profile). */
    calls: () => [...shared.log],

    branch(branchBase, { name: branchName = `${name}/branch`, alias: branchAlias = {}, sharedParts: branchShared = false } = {}) {
      return makeStore({ base: branchBase, name: branchName, parent: self, shared, alias: branchAlias, sharedParts: branchShared });
    },

    /** The accepted variant: get(address) follows the pointer. Write-once, by a named author (a comparator FG, a runner). */
    point(address, target, { by = 'pointer' } = {}) {
      if (!self.has(target)) throw new PartStoreError(`point ${address}: target '${target}' is not on store ${name}`);
      if (ownPart(address)) throw new PartStoreError(`point ${address}: the address is already written (${ownPart(address).producedBy})`);
      if (onBase(address)) throw new PartStoreError(`point ${address}: a provider-board address cannot be pointed`);
      parts.set(address, Object.freeze({ pointerTo: target, producedBy: by, inParts: [target], key: keyOf(target) }));
    },
    /** The variants of an address (address@name) this store can see: written, declared by a Calculation, or on the board. */
    variants(address) {
      const out = new Set();
      for (const s of chain()) { for (const a of s._parts.keys()) if (a.startsWith(`${address}@`)) out.add(a); for (const a of s._producers.keys()) if (a.startsWith(`${address}@`)) out.add(a); }
      return [...out].sort();
    },
    keyOf: (address) => keyOf(A(address)),
    alias: Object.freeze({ ...alias }),
    /** Every Part of this store with its key: the snapshot as a key dump. */
    keyspace() {
      return [...parts.keys()].sort().map((address) => { const p = parts.get(address); return { address, key: p.key ?? keyOf(address), producedBy: p.producedBy, pointerTo: p.pointerTo ?? null }; });
    },

    provenance(address) {
      address = A(address);
      const own = ownPart(address);
      if (own) {
        for (const s of chain()) if (s._parts.has(address)) return { address, producedBy: own.producedBy, inParts: own.inParts, key: own.key ?? null, pointerTo: own.pointerTo ?? null, store: s.name };
      }
      if (onBase(address)) return { address, producedBy: 'provider-board', inParts: null, key: keyOf(address), store: name };
      return null;
    },

    manifest() {
      return {
        store: name,
        parts: [...parts.keys()].sort().map((address) => ({ address, producedBy: parts.get(address).producedBy, inParts: parts.get(address).inParts, key: parts.get(address).key ?? null, pointerTo: parts.get(address).pointerTo ?? null })),
        calculations: [...calcs.values()].sort((a, b) => a.address.localeCompare(b.address))
          .map(({ address, inParts, outParts, calls, lazy, note }) => ({ address, inParts, outParts, calls, lazy, note }))
      };
    }
  };
  const failureNote = (address) => {
    for (const s of chain()) if (s._producers.has(address)) return ` (its producer ${s._producers.get(address)} failed)`;
    return '';
  };
  return self;
}
