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
 *   store.branch(base, { name })
 *              a child store over another provider board (a restored
 *              snapshot): provider reads resolve ONLY against the child's
 *              own base (never the parent's live board), toolkit Parts and
 *              Calculations resolve through the parent, and the child's own
 *              writes stay in the child.
 *   store.provenance(address)   { address, producedBy, inParts, store } or
 *              { address, producedBy: 'provider-board' } or null
 *   store.manifest()            this store's toolkit Parts and Calculations
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
export function createPartStore({ base = null, name = 'root', onCall = null } = {}) {
  const log = [];
  const store = makeStore({ base, name, parent: null, shared: { seq: 0, stack: [], log, onCall: (entry) => { log.push(entry); onCall?.(entry); } } });
  // The PxC is queryable: pixel-set math lives in fg/pxset.mjs and is invoked from outside by Part address. Answers
  // are cached by their arguments (Parts are write-once, so a cached answer can never go stale).
  const answers = new Map();
  const dims = () => { for (const a of ['px.image.cropped', 'px.course.canonicalPixels']) if (store.has(a)) return store.get(a); throw new PartStoreError('pxset queries: no raster Part for the image size'); };
  for (const [fn, q] of Object.entries(PXSET_QUERIES)) store.register(fn, { note: 'PxC query (fg/pxset.mjs), cached by its arguments',
    calculate: (io) => {
      const key = `${fn} ${JSON.stringify(io.args)}`;
      if (answers.has(key)) return { ...answers.get(key), emits: { cached: 1 } };
      const sets = Object.fromEntries(Object.entries(io.args).map(([k, ref]) => [k, resolvePxSet((a) => store.get(a), ref, dims)]));
      const ans = q(sets, { address: io.args.a });
      answers.set(key, ans);
      return { ...ans, emits: { computed: 1 } };
    } });
  // renderable is a default property of every Part: any address renders by the shape of its value (fg/render.mjs)
  const rendered = new Map();
  store.register(RENDER_PART, { note: 'default render of the Part at args.a (fg/render.mjs), cached by address',
    calculate: (io) => {
      const a = io.args?.a;
      if (!rendered.has(a)) { let d = null; try { d = dims(); } catch { /* an image-free store renders without px coordinates */ } rendered.set(a, renderValue(a, store.get(a), d)); }
      const r = rendered.get(a);
      return { value: r, unit: 'frame parts', emits: { parts: r.parts.length, unrenderable: r.kind === 'unrenderable' ? 1 : 0 } };
    } });
  store.register(INSTRUMENTATION_CALLS, { note: 'the calls made by args.caller and nested under them (timings: sidecar data, never hashed)',
    calculate: (io) => callSubtree(log, io.args?.caller ?? null).filter((e) => e.calculation !== INSTRUMENTATION_CALLS) });
  return store;
}

function makeStore({ base, name, parent, shared }) {
  const parts = new Map(); // address -> { value, producedBy, inParts }
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

  const write = (address, value, producedBy, inParts) => {
    if (ownPart(address)) throw new PartStoreError(`Part '${address}' is write-once; ${ownPart(address).producedBy} already produced it`);
    if (onBase(address)) throw new PartStoreError(`Part '${address}' is a provider-board address; a toolkit Calculation (${producedBy}) may not shadow it`);
    parts.set(address, Object.freeze({ value, producedBy, inParts }));
  };

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
      if (ownPart(address)) return true;
      if (onBase(address)) return true;
      const owner = producerOwner(address);
      if (!owner || !owner._calcs.get(owner._producers.get(address)).lazy) return false;
      try { owner._produce(address); return true; } catch { return false; }
    },

    get(address) {
      const own = ownPart(address);
      if (own) return own.value;
      if (onBase(address)) return board().get(address);
      const owner = producerOwner(address);
      if (owner && !owner._calcs.get(owner._producers.get(address)).lazy)
        throw new PartStoreError(`Part '${address}' has not been produced yet on store ${name}; its Calculation ${owner._producers.get(address)} runs only when called explicitly`);
      if (owner) { owner._produce(address); return ownPart(address).value; }
      throw new PartStoreError(`no Part at '${address}' on store ${name}: no toolkit Part, no registered Calculation declares it among its outParts, and it is not on the provider board`);
    },

    _produce: produceHere,

    register(fn, { inParts = [], outParts = [], calls = [], calculate, lazy = true, note = null } = {}) {
      if (typeof fn !== 'string' || !FN.test(fn)) throw new PartStoreError(`register: ${JSON.stringify(fn)} is not a fn.* Calculation address`);
      if (findCalc(fn)) throw new PartStoreError(`register: Calculation '${fn}' is already registered`);
      if (typeof calculate !== 'function') throw new PartStoreError(`register ${fn}: calculate(io) is required`);
      const spec = Object.freeze({
        address: fn, store: name, note, lazy: lazy !== false,
        inParts: addressList(inParts, `register ${fn}: inParts`),
        outParts: addressList(outParts, `register ${fn}: outParts`),
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

    constant(fn, values) {
      const outParts = Object.keys(values);
      return self.register(fn, { outParts, calculate: () => ({ ...values }) });
    },

    registered: (fn) => Boolean(findCalc(fn)),
    calculation: (fn) => findCalc(fn),

    call(fn, args, { caller = null } = {}) {
      const spec = findCalc(fn);
      if (!spec) throw new PartStoreError(`Calculation '${fn}' is not registered on store ${name}`);
      const entry = {
        seq: shared.seq++, parent: shared.stack.at(-1) ?? null, depth: shared.stack.length,
        calculation: fn, store: name, caller, site: typeof args?.site === 'string' ? args.site : null,
        inParts: spec.inParts, outParts: spec.outParts, elapsedMs: null, status: 'running', error: null, emits: null
      };
      const started = now();
      shared.stack.push(entry.seq);
      let popped = false;
      const pop = () => { if (!popped) { popped = true; shared.stack.splice(shared.stack.lastIndexOf(entry.seq), 1); } };
      const exit = (status, error = null) => {
        pop();
        entry.elapsedMs = roundMs(now() - started);
        entry.status = status;
        entry.error = error ? String(error?.message ?? error) : null;
        shared.onCall?.(entry);
      };
      try {
        const inputs = new Map();
        for (const address of spec.inParts) {
          if (!self.has(address)) throw new PartStoreError(`${fn}: declared inPart '${address}' is not on store ${name}${failureNote(address)}`);
          inputs.set(address, self.get(address));
        }
        const read = (address) => {
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
        const finish = (result) => {
          if (spec.outParts.length) {
            if (!result || typeof result !== 'object') throw new PartStoreError(`${fn} must return { [outPart]: value } for ${spec.outParts.join(', ')}`);
            const keys = Object.keys(result);
            const missing = spec.outParts.filter((a) => !keys.includes(a));
            const extra = keys.filter((a) => !spec.outParts.includes(a));
            if (missing.length || extra.length) throw new PartStoreError(`${fn} returned outParts that differ from its declaration (missing: ${missing.join(', ') || '-'}; undeclared: ${extra.join(', ') || '-'})`);
            for (const address of spec.outParts) write(address, result[address], fn, spec.inParts);
          }
          entry.emits = emitsOf(spec.outParts.length ? spec.outParts.map((a) => result[a]) : [result]);
          return result;
        };
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
      const allowedReads = new Set(reads);
      const allowedCalls = new Set(calls);
      const guardRead = (address) => {
        if (!allowedReads.has(address)) throw new PartStoreError(`${who} read undeclared address '${address}' (declare it in reads)`);
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

    branch(branchBase, { name: branchName = `${name}/branch` } = {}) {
      return makeStore({ base: branchBase, name: branchName, parent: self, shared });
    },

    provenance(address) {
      const own = ownPart(address);
      if (own) {
        for (const s of chain()) if (s._parts.has(address)) return { address, producedBy: own.producedBy, inParts: own.inParts, store: s.name };
      }
      if (onBase(address)) return { address, producedBy: 'provider-board', inParts: null, store: name };
      return null;
    },

    manifest() {
      return {
        store: name,
        parts: [...parts.keys()].sort().map((address) => ({ address, producedBy: parts.get(address).producedBy, inParts: parts.get(address).inParts })),
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
