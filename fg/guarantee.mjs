/**
 * FunctionalGuarantee runtime (toolkit fg layer, browser-safe).
 *
 * Sam's vocabulary: a FunctionalGuarantee (FG) wraps a sequence of
 * Calculations with its own Calculations, and it is the ONE mechanism that
 * logging, tests, metrics, contact sheets and renders all are. The S1-S3
 * FGs are declared as prose in stages/s*.json "guarantees" and enforced by
 * copy-pasted ~80-line blocks in ports/early/runEarly.mjs, each repeating
 * the same skeleton: a fail() helper, serialize the guarded Part from the
 * board, re-execute an independent witness, cross-check totals (often
 * against another FG's record), write artifacts and rehash them after the
 * write, and attach { guarantee, part, producedBy, totals, checks,
 * artifacts } to the stage. This module is that skeleton, once:
 *
 *   defineGuarantee({ id, guards, requires?, lane?, run(ctx) })
 *     id:       'fg.<stage>.<part>.<verb>', the id stages/*.json declares.
 *     guards:   Part addresses the FG guards; each must be on the board
 *               before run() is called (an automatic check, so no FG
 *               hand-writes "px.badges is missing").
 *     requires: FG ids whose RECORDS this FG gates against; the registry
 *               runs them first and ctx.records holds exactly those.
 *     lane:     optional lane name; the FG is dormant unless that lane is
 *               enabled (the declared "with lane X ON (default OFF)").
 *     run(ctx): returns { totals, ...extra }; extra keys land on the record.
 *
 *   ctx = { id, board, records, sink,
 *           fail(reason)            throw now (an opaque Part, a missing input)
 *           check(name, ok, detail) record a named verdict; returns ok
 *           witness(name, fn)       run an independent re-derivation; fn returns
 *                                   a boolean or { ok, ...detail }; a throw is a
 *                                   failed witness, not a crash
 *           artifact(id, kind, bytes|json, dims?)  put through the sink, our own
 *                                   sha256 must equal the sink's, and a sink that
 *                                   can read back is re-read and rehashed
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
 *   { guarantee, status: 'held'|'failed'|'dormant', reason, guards, requires,
 *     lane, totals, checks, witnesses, artifacts, frames: [{ seq, title, sha256 }],
 *     ...extra (sorted) }
 * No timings: elapsed time is nondeterministic and the record is hashed
 * evidence, so timings go to the caller's sidecar (registry.runGuarantees
 * returns them separately, as ports/early/instrument.mjs does).
 *
 * Failure: any failed check or witness, a fail() call, or a throw inside
 * run() raises GuaranteeFailure (name 'GuaranteeFailure') carrying the
 * guarantee id, the reason, the failed verdict names, the fully assembled
 * failed record and the frames emitted so far, so a failure still renders.
 */
import { canonicalJson, digest, plain, sha256Hex, toBytes, utf8 } from './canon.mjs';

export const FRAME_KINDS = Object.freeze(['pxset', 'bbox', 'points', 'ledger', 'scalar', 'raster']);
const GUARANTEE = Symbol.for('chainspot.fg.guarantee');
const ID = /^fg\.[A-Za-z0-9_.-]+$/;

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

export function defineGuarantee({ id, guards, requires = [], lane = null, run }) {
  if (typeof id !== 'string' || !ID.test(id)) throw new Error(`defineGuarantee: id ${JSON.stringify(id)} is not an fg.* id`);
  if (!Array.isArray(guards) || !guards.length || !guards.every((a) => typeof a === 'string' && a))
    throw new Error(`defineGuarantee ${id}: guards must be a non-empty list of Part addresses`);
  if (!Array.isArray(requires) || !requires.every((r) => typeof r === 'string' && ID.test(r)))
    throw new Error(`defineGuarantee ${id}: requires must be a list of fg.* ids`);
  if (requires.includes(id)) throw new Error(`defineGuarantee ${id}: requires itself`);
  if (lane !== null && (typeof lane !== 'string' || !lane)) throw new Error(`defineGuarantee ${id}: lane must be a lane name or null`);
  if (typeof run !== 'function') throw new Error(`defineGuarantee ${id}: run(ctx) is required`);
  return Object.freeze({ [GUARANTEE]: true, id, guards: [...guards], requires: [...requires], lane, run });
}

export const isGuarantee = (value) => Boolean(value && value[GUARANTEE]);

function baseRecord(fg) {
  return { guarantee: fg.id, status: null, reason: null, guards: fg.guards, requires: fg.requires, lane: fg.lane };
}

export function dormantRecord(fg, reason) {
  return { ...baseRecord(fg), status: 'dormant', reason, totals: null, checks: [], witnesses: [], artifacts: [], frames: [] };
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
 * Run one guarantee. records: { [requiredId]: record } (exactly fg.requires).
 * Returns { record, frames }; throws GuaranteeFailure.
 */
export function runGuarantee(fg, { board, records = {}, sink, branch = null }) {
  if (!isGuarantee(fg)) throw new Error('runGuarantee: not a defineGuarantee() value');
  if (!sink || typeof sink.putArtifact !== 'function') throw new Error(`runGuarantee ${fg.id}: a sink with putArtifact is required`);
  const checks = [];
  const witnesses = [];
  const artifacts = [];
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
    board,
    records: Object.freeze(required),
    sink,
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
    artifact(id, kind, data, dims) {
      if (typeof id !== 'string' || !id) abort('artifact id is required');
      if (artifacts.some((a) => a.id === id)) abort(`artifact ${id} put twice`);
      const bytes = ArrayBuffer.isView(data) || data instanceof ArrayBuffer ? new Uint8Array(toBytes(data)) : utf8(canonicalJson(data) + '\n');
      const sha256 = sha256Hex(bytes);
      const ref = sink.putArtifact(kind, id, bytes, dims);
      if (!ref || ref.sha256 !== sha256) abort(`artifact ${id}: sink hash ${ref?.sha256} != computed ${sha256}`);
      let rehashed = false;
      if (typeof sink.readArtifact === 'function') {
        const back = sink.readArtifact(ref.id);
        if (!back || sha256Hex(back) !== sha256) abort(`artifact ${id} hash mismatch after write`);
        rehashed = true;
      }
      const entry = { id, kind, sha256, bytes: bytes.length, uri: ref.uri ?? null, dims: dims ? plain(dims) : null, rehashed };
      artifacts.push(entry);
      return entry;
    },
    frame: (spec) => emitter.emit(spec)
  });

  let result = null;
  let thrown = null;
  try {
    for (const id of fg.requires)
      if (!required[id] || required[id].status !== 'held') abort(`required record ${id} is ${required[id]?.status ?? 'missing'}`);
    for (const address of fg.guards)
      ctx.check(`guarded:${address}`, typeof board?.has === 'function' && board.has(address), { address });
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
    frames: emitter.frames.map((f) => ({ seq: f.seq, title: f.title, sha256: digest(f) }))
  };
  for (const key of Object.keys(extra).sort()) {
    if (key in record) { record.status = 'failed'; record.reason = `run() returned reserved record key ${key}`; break; }
    record[key] = plain(extra[key]);
  }
  if (record.status !== 'held')
    throw new GuaranteeFailure(fg.id, record.reason, { failed, record, frames: emitter.frames, cause: thrown ?? undefined });
  return { record, frames: emitter.frames };
}

/** Canonical bytes of a record (what gets hashed or diffed). */
export const recordJson = (record) => canonicalJson(record);
