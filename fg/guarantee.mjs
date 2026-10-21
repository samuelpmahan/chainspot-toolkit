/**
 * FunctionalGuarantee runtime (toolkit fg layer, browser-safe).
 *
 * Sam's vocabulary: a FunctionalGuarantee (FG) wraps a sequence of
 * Calculations with its own Calculations, and it is the ONE mechanism that
 * logging, tests, metrics, contact sheets and renders all are. The S1-S3
 * FGs are declared as prose in stages/s*.json "guarantees" and were once
 * enforced by copy-pasted ~80-line blocks in ports/early/runEarly.mjs; all
 * of them now live under fg/s1..s3/<id>.fg.mjs. Each block repeated
 * the same skeleton: a fail() helper, serialize the guarded Part from the
 * board, re-execute an independent witness, cross-check totals (often
 * against another FG's record), write artifacts and rehash them after the
 * write, and attach { guarantee, part, producedBy, totals, checks,
 * artifacts } to the stage. This module is that skeleton, once.
 *
 * Inputs (Sam, 2026-10-17: "The point of PxC is that parts go to addressed
 * store so this shouldn't happen. Calcs declare inParts + outParts for this
 * reason."): an FG reads ONLY addressed Parts it declares in `reads` and
 * invokes ONLY registered Calculations it declares in `calls`, both through
 * the PartStore (fg/store.mjs). There is no env side channel: data a runner
 * used to inject (captured gateway results, snapshots, the crop receipt,
 * testimony bytes, hashes) is a Part with a producing Calculation, and code
 * (provider functions, restore, plan execution, hashing) is a registered
 * fn.* Calculation, auto-instrumented by the store on every call.
 *
 *   defineGuarantee({ id, guards, reads?, calls?, requires?, lane?, run(ctx) })
 *     id:       'fg.<stage>.<part>.<verb>', the id stages/*.json declares.
 *     guards:   the Part addresses the FG certifies (the declaration's
 *               `part`). A certified Part need not be on the store: an FG
 *               may itself derive it (serialize the reads into
 *               px.badges.digits, run the op on a restored branch to get
 *               badgeGlyphTemplate), which is what three of S1's four do.
 *     reads:    the ONLY addresses ctx.get/ctx.has may touch; each must
 *               resolve before run() is called (an automatic
 *               `read:<address>` check, so no FG hand-writes "px.badges is
 *               missing"; a toolkit Part is produced lazily by its
 *               Calculation here). Defaults to guards, the case where the
 *               certified Part is itself an input.
 *     calls:    the ONLY fn.* Calculations ctx.call may invoke; each must be
 *               registered on the store (automatic `call:<fn>` check).
 *     requires: FG ids whose RECORDS this FG gates against; the registry
 *               runs them first and ctx.records holds exactly those.
 *     raises:   event names this FG announces (fg/mixins.mjs raises): each lands on the record's events as
 *               { event, payload }, and the registry delivers it to every FG that subscribes to the name.
 *     subscribes: event names this FG hears (fg/mixins.mjs on). A subscription names an EVENT, never an FG id, so
 *               it is not a requires: the registry derives the ordering edge (every raiser of the event runs first)
 *               and ctx.heard(event) returns the deliveries; an event not declared here fails by name, like an
 *               undeclared read. An event nobody raises, and a subscription cycle, fail the cross-check before
 *               anything runs (fg/registry.mjs eventReport).
 *     lane:     optional lane name; the FG is dormant unless that lane is
 *               enabled (the declared "with lane X ON (default OFF)").
 *     site:     'stage' (default): run once per stage on the run's store by
 *               the stage runner; 'forkjoin': run once per branch by a
 *               comparableForkJoin (fg/forkjoin.mjs), never by the stage
 *               runner. The stage declaration names the same site.
 *     run(ctx): returns { totals, ...extra }; extra keys land on the record.
 *     properties / plan: set by fg/compose.mjs guarantee(): the property
 *               (mixin) names the FG is composed of, carried on every record
 *               (dormant ones too) and cross-checked against the stage
 *               declaration's "properties"; plan is the composition's
 *               inspectable execution order. A hand-written FG has neither.
 *   (`env` was removed; passing it is a definition error naming the fix.)
 *
 *   ctx = { id, records, sink,
 *           get(address) / has(address)  a declared read (any other address
 *                                   fails the guarantee by name)
 *           call(fn, args?)         a declared, registered Calculation (any
 *                                   other fails by name); synchronous
 *           fail(reason)            throw now (an opaque Part, a missing input)
 *           check(name, ok, detail) record a named verdict; returns ok
 *           witness(name, fn)       run an independent re-derivation; fn returns
 *                                   a boolean or { ok, ...detail }; a throw is a
 *                                   failed witness, not a crash
 *           artifact(id, kind, bytes|json, dims?, { path }?)  put through the
 *                                   sink, our own sha256 must equal the sink's,
 *                                   and a sink that can read back is re-read and
 *                                   rehashed. json is written as canonicalJson;
 *                                   an FG with a fixed legacy byte layout passes
 *                                   bytes. path (optional) is the sink-relative
 *                                   file path when no id->filename rule fits
 *           publish(address, value) hand a value to the CALLER, uncopied and
 *                                   outside the record (e.g. the legacy receipt
 *                                   object a runner attaches to its stage, whose
 *                                   key order is its byte layout); returned as
 *                                   outputs beside the record
 *           frame({ title, parts, tick?, calculation?, verdicts?, receipt? }) }
 *
 * A Frame is one flipbook page the FG decides to emit:
 *   { fg, branch, seq, tick, calculation, title,
 *     parts: [{ address, kind, sha256, ref, data }], verdicts, receipt }
 * kind is one of FRAME_KINDS. A part carries inline `data` (hashed
 * canonically into sha256) or an `artifact` ref from ctx.artifact (its
 * sha256 and uri are copied). The receipt slice defaults to the checks and
 * witnesses recorded since the previous frame, so each page shows what was
 * verified by the time it was drawn. The same Frame objects feed the static
 * flipbook (fg/flipbook.mjs), the FE, an agent reading JSON, and tests.
 *
 * The record (fixed key order, every value canonical JSON):
 *   { guarantee, status: 'held'|'failed'|'dormant', reason, guards, reads, calls,
 *     requires, lane, totals, checks, witnesses, artifacts,
 *     frames: [{ seq, title, sha256 }], published: [address], ...extra (sorted) }
 * No timings: elapsed time is nondeterministic and the record is hashed
 * evidence, so timings go to the caller's sidecar (registry.runGuarantees
 * returns them separately; the store's onCall hook times every Calculation).
 *
 * Failure: any failed check or witness, a fail() call, an undeclared read or
 * call, or a throw inside run() raises GuaranteeFailure (name
 * 'GuaranteeFailure') carrying the guarantee id, the reason, the failed
 * verdict names, the fully assembled failed record and the frames emitted so
 * far, so a failure still renders.
 */
import { canonicalJson, digest, plain, sha256Hex, toBytes, utf8 } from './canon.mjs';
import { createPartStore, isPartStore } from './store.mjs';

export const FRAME_KINDS = Object.freeze(['pxset', 'bbox', 'points', 'ledger', 'scalar', 'raster']);
const GUARANTEE = Symbol.for('chainspot.fg.guarantee');
const ID = /^fg\.[A-Za-z0-9_.-]+$/;
const FN = /^fn\.[A-Za-z0-9_.\-/@]+$/;

export class GuaranteeFailure extends Error {
  constructor(guarantee, reason, { failed = [], record = null, frames = [], cause } = {}) {
    super(`${guarantee} FunctionalGuarantee failed: ${reason}`, cause ? { cause } : undefined);
    this.name = 'GuaranteeFailure';
    this.guarantee = guarantee;
    this.reason = reason;
    this.failed = failed;
    this.record = record;
    this.frames = frames;
  }
}

class Abort extends Error {}

const nameList = (list) => Array.isArray(list) && list.every((a) => typeof a === 'string' && a);

export const GUARANTEE_SITES = Object.freeze(['stage', 'forkjoin']);

const EVENT = /^[A-Za-z][A-Za-z0-9_.:-]*$/;
export const isEventName = (name) => typeof name === 'string' && EVENT.test(name);

export function defineGuarantee({ id, guards, reads = guards, calls = [], requires = [], raises = [], subscribes = [], lane = null, site = 'stage', properties = [], plan = null, run, ...rest }) {
  if (typeof id !== 'string' || !ID.test(id)) throw new Error(`defineGuarantee: id ${JSON.stringify(id)} is not an fg.* id`);
  if ('env' in rest)
    throw new Error(`defineGuarantee ${id}: env was removed; declare data as Parts in reads and capabilities as registered fn.* Calculations in calls`);
  const unknown = Object.keys(rest);
  if (unknown.length) throw new Error(`defineGuarantee ${id}: unknown option(s) ${unknown.join(', ')}`);
  if (!nameList(guards) || !guards.length)
    throw new Error(`defineGuarantee ${id}: guards must be a non-empty list of Part addresses`);
  if (!nameList(reads)) throw new Error(`defineGuarantee ${id}: reads must be a list of Part addresses`);
  if (!nameList(calls) || !calls.every((fn) => FN.test(fn))) throw new Error(`defineGuarantee ${id}: calls must be a list of fn.* Calculation addresses`);
  if (!Array.isArray(requires) || !requires.every((r) => typeof r === 'string' && ID.test(r)))
    throw new Error(`defineGuarantee ${id}: requires must be a list of fg.* ids`);
  if (requires.includes(id)) throw new Error(`defineGuarantee ${id}: requires itself`);
  for (const [field, list] of [['raises', raises], ['subscribes', subscribes]])
    if (!Array.isArray(list) || !list.every(isEventName)) throw new Error(`defineGuarantee ${id}: ${field} must be a list of event names`);
  const own = subscribes.find((event) => raises.includes(event));
  if (own) throw new Error(`defineGuarantee ${id}: subscribes to its own event ${own}`);
  if (lane !== null && (typeof lane !== 'string' || !lane)) throw new Error(`defineGuarantee ${id}: lane must be a lane name or null`);
  if (!GUARANTEE_SITES.includes(site)) throw new Error(`defineGuarantee ${id}: site must be one of ${GUARANTEE_SITES.join(', ')}`);
  if (typeof run !== 'function') throw new Error(`defineGuarantee ${id}: run(ctx) is required`);
  if (!nameList(properties)) throw new Error(`defineGuarantee ${id}: properties must be a list of property names (fg/compose.mjs)`);
  return Object.freeze({ [GUARANTEE]: true, id, guards: [...guards], reads: [...reads], calls: [...calls], requires: [...requires], raises: [...raises], subscribes: [...subscribes], lane, site,
    properties: Object.freeze([...properties]), plan: plan ? Object.freeze(plan) : null, run });
}

export const isGuarantee = (value) => Boolean(value && value[GUARANTEE]);

/** A PartStore over `store` (as is), or over a plain board (wrapped as the store's provider base). */
export const asStore = (storeOrBoard) => (isPartStore(storeOrBoard) ? storeOrBoard : createPartStore({ base: storeOrBoard ?? null }));

function baseRecord(fg) {
  return { guarantee: fg.id, status: null, reason: null, guards: fg.guards, reads: fg.reads, calls: fg.calls, requires: fg.requires, lane: fg.lane,
    ...(fg.properties?.length ? { properties: fg.properties } : {}),
    ...(fg.raises?.length ? { raises: fg.raises } : {}), ...(fg.subscribes?.length ? { subscribes: fg.subscribes } : {}) };
}

export function dormantRecord(fg, reason) {
  return { ...baseRecord(fg), status: 'dormant', reason, totals: null, checks: [], witnesses: [], artifacts: [], frames: [], published: [] };
}

/** Frame emitter shared by guarantees and comparableForkJoin comparisons. */
export function createFrameEmitter({ fg, branch = null, onFail = (reason) => { throw new Error(reason); }, slice = () => ({}) }) {
  const frames = [];
  const emit = ({ title, parts = [], tick = null, calculation = null, verdicts = [], receipt } = {}) => {
    if (typeof title !== 'string' || !title) onFail(`frame ${frames.length} has no title`);
    if (!Array.isArray(parts)) onFail(`frame "${title}" parts must be a list`);
    const normalized = parts.map((part, i) => {
      if (!part || typeof part.address !== 'string') onFail(`frame "${title}" part ${i} has no address`);
      if (!FRAME_KINDS.includes(part.kind)) onFail(`frame "${title}" part ${part.address} has kind ${JSON.stringify(part.kind)}; expected one of ${FRAME_KINDS.join(', ')}`);
      if (part.artifact) return { address: part.address, kind: part.kind, sha256: part.artifact.sha256, ref: part.artifact.uri, data: part.data === undefined ? null : plain(part.data) };
      if (part.data === undefined) onFail(`frame "${title}" part ${part.address} carries neither data nor an artifact ref`);
      const data = plain(part.data);
      return { address: part.address, kind: part.kind, sha256: digest(data), ref: null, data };
    });
    const frame = {
      fg, branch, seq: frames.length, tick, calculation, title,
      parts: normalized, verdicts: plain(verdicts), receipt: receipt === undefined ? slice() : plain(receipt)
    };
    frames.push(frame);
    return frame;
  };
  return { frames, emit };
}

/**
 * Run one guarantee. store: a PartStore (fg/store.mjs), or a plain board
 * (`board`), which is wrapped as the provider base of a fresh store.
 * records: { [requiredId]: record } (exactly fg.requires).
 * hash: bytes -> sha256 hex for the runtime's own artifact hashing (never
 * reachable by the FG); defaults to the pure-JS digest, a Node runner
 * passes node:crypto's (10 MB rasters are hashed 3x each).
 * events: { [event]: [{ from, payload }] } the deliveries for fg.subscribes (the registry builds it from the
 * raisers' records); ctx.heard(event) returns that list.
 * Returns { record, frames, outputs }; throws GuaranteeFailure.
 */
export function runGuarantee(fg, { store, board, records = {}, sink, branch = null, hash = sha256Hex, events = {} }) {
  if (!isGuarantee(fg)) throw new Error('runGuarantee: not a defineGuarantee() value');
  if (!sink || typeof sink.putArtifact !== 'function') throw new Error(`runGuarantee ${fg.id}: a sink with putArtifact is required`);
  const parts = asStore(store ?? board);
  const view = parts.scope({ who: fg.id, reads: fg.reads, calls: fg.calls });
  const checks = [];
  const witnesses = [];
  const artifacts = [];
  const outputs = {};
  const names = new Set();
  let abortReason = null;
  let mark = { checks: 0, witnesses: 0 };

  const abort = (reason) => { abortReason = String(reason); throw new Abort(abortReason); };
  const claim = (name) => {
    if (typeof name !== 'string' || !name) abort('a check or witness has no name');
    if (names.has(name)) abort(`check/witness name ${name} used twice`);
    names.add(name);
  };
  const slice = () => {
    const out = {
      checks: checks.slice(mark.checks).map(({ name, ok }) => ({ name, ok })),
      witnesses: witnesses.slice(mark.witnesses).map(({ name, ok }) => ({ name, ok }))
    };
    mark = { checks: checks.length, witnesses: witnesses.length };
    return out;
  };
  const emitter = createFrameEmitter({ fg: fg.id, branch, onFail: abort, slice });

  const required = {};
  for (const id of fg.requires) if (records[id]) required[id] = records[id];

  const ctx = Object.freeze({
    id: fg.id,
    records: Object.freeze(required),
    sink,
    get(address) {
      if (!fg.reads.includes(address)) abort(`read of undeclared address ${address} (declare it in reads)`);
      return view.get(address);
    },
    has(address) {
      if (!fg.reads.includes(address)) abort(`read of undeclared address ${address} (declare it in reads)`);
      return view.has(address);
    },
    heard(event) {
      if (!fg.subscribes.includes(event)) abort(`heard of undeclared event ${event} (declare it in subscribes)`);
      return Object.freeze((events[event] ?? []).map((d) => Object.freeze({ ...d })));
    },
    call(fn, args) {
      if (!fg.calls.includes(fn)) abort(`call of undeclared Calculation ${fn} (declare it in calls)`);
      if (!parts.registered(fn)) abort(`call of unregistered Calculation ${fn}`);
      const result = view.call(fn, args);
      if (result && typeof result.then === 'function') { result.catch(() => {}); abort(`Calculation ${fn} returned a Promise; guarantees are synchronous`); }
      return result;
    },
    fail: abort,
    check(name, ok, detail = null) {
      claim(name);
      checks.push({ name, ok: ok === true, detail: plain(detail) });
      return ok === true;
    },
    witness(name, fn) {
      claim(name);
      let outcome;
      try {
        const result = fn();
        if (result && typeof result.then === 'function') throw new Error('witness returned a Promise; witnesses are synchronous');
        const { ok, ...detail } = typeof result === 'boolean' ? { ok: result } : (result ?? { ok: false });
        outcome = { name, ok: ok === true, detail: Object.keys(detail).length ? plain(detail) : null };
      } catch (error) {
        outcome = { name, ok: false, detail: { error: String(error?.message ?? error) } };
      }
      witnesses.push(outcome);
      return outcome;
    },
    artifact(id, kind, data, dims, { path } = {}) {
      if (typeof id !== 'string' || !id) abort('artifact id is required');
      if (artifacts.some((a) => a.id === id)) abort(`artifact ${id} put twice`);
      const bytes = ArrayBuffer.isView(data) || data instanceof ArrayBuffer ? new Uint8Array(toBytes(data)) : utf8(canonicalJson(data) + '\n');
      const sha256 = hash(bytes);
      const ref = sink.putArtifact(kind, id, bytes, dims, path ? { path } : undefined);
      if (!ref || ref.sha256 !== sha256) abort(`artifact ${id}: sink hash ${ref?.sha256} != computed ${sha256}`);
      let rehashed = false;
      if (typeof sink.readArtifact === 'function') {
        const back = sink.readArtifact(ref.id);
        if (!back || hash(back) !== sha256) abort(`artifact ${id} hash mismatch after write`);
        rehashed = true;
      }
      const entry = { id, kind, sha256, bytes: bytes.length, uri: ref.uri ?? null, dims: dims ? plain(dims) : null, rehashed };
      artifacts.push(entry);
      return entry;
    },
    publish(address, value) {
      if (typeof address !== 'string' || !address) abort('publish needs an address');
      if (Object.hasOwn(outputs, address)) abort(`published ${address} twice`);
      outputs[address] = value;
    },
    frame: (spec) => emitter.emit(spec)
  });

  let result = null;
  let thrown = null;
  try {
    for (const id of fg.requires)
      if (!required[id] || required[id].status !== 'held') abort(`required record ${id} is ${required[id]?.status ?? 'missing'}`);
    for (const address of fg.reads)
      ctx.check(`read:${address}`, parts.has(address), { address });
    for (const fn of fg.calls)
      ctx.check(`call:${fn}`, parts.registered(fn), { calculation: fn });
    if (checks.every((c) => c.ok)) result = fg.run(ctx);
    if (result && typeof result.then === 'function') abort('run() returned a Promise; guarantees are synchronous');
  } catch (error) {
    if (!(error instanceof Abort)) { thrown = error; abortReason = `run threw: ${error?.message ?? error}`; }
  }

  const { totals = null, ...extra } = result && typeof result === 'object' ? result : {};
  const failed = [...checks, ...witnesses].filter((v) => !v.ok).map((v) => v.name);
  const status = abortReason === null && failed.length === 0 ? 'held' : 'failed';
  const reason = abortReason ?? (failed.length ? `failed: ${failed.join(', ')}` : null);
  const record = {
    ...baseRecord(fg), status, reason,
    totals: plain(totals), checks, witnesses, artifacts,
    frames: emitter.frames.map((f) => ({ seq: f.seq, title: f.title, sha256: digest(f) })),
    published: Object.keys(outputs)
  };
  for (const key of Object.keys(extra).sort()) {
    if (key in record) { record.status = 'failed'; record.reason = `run() returned reserved record key ${key}`; break; }
    record[key] = plain(extra[key]);
  }
  if (record.status !== 'held')
    throw new GuaranteeFailure(fg.id, record.reason, { failed, record, frames: emitter.frames, cause: thrown ?? undefined });
  return { record, frames: emitter.frames, outputs };
}

/** Canonical bytes of a record (what gets hashed or diffed). */
export const recordJson = (record) => canonicalJson(record);
