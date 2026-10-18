/**
 * The FG properties (mixins) the S1-S3 FunctionalGuarantees are composed of
 * (browser-safe). Each is a decorator, (Composition) => Composition
 * (fg/compose.mjs): it runs the inner Composition, then adds checks,
 * witnesses, artifacts, frames or record fields; none changes a value the
 * inner one produced. Each carries the reads / calls / requires / lane it
 * needs, so a composed FG's declaration is the union of its properties'.
 * Its property name (e.g. 'witnessed:fn.provider.S2.materializeSubtraction')
 * is what stages/*.json "properties" names and crossCheck compares.
 *
 * Inventory (the 12 FGs at 6ed6043; which FG had an inline copy of what):
 *
 *   lane:<name>          dormant unless the lane is ON (the runtime gates it)
 *   gated:<fg>           exact equality vs another FG's record: requires within
 *                        a stage, the Part tk.<fg>.record across stages
 *   witnessed:<fn>       an independent re-execution of a registered provider
 *                        Calculation must reproduce what was serialized
 *   witnessed:branch     the branch op re-run on a second restored branch must
 *                        reproduce the result (sha256 of a canonical form)
 *   witnessed:<path>     an independent toolkit code path must reproduce it
 *   conserved:<S>        the layer ledger vs every prior layer (fg/layers.mjs),
 *                        raster-recounted, the mute-fringe overlap explained,
 *                        the prior layer's recorded leaving = this entering,
 *                        and the S1 provider witness on the stack bottom
 *   conserved:raster     alpha-zeroed rasters recount exactly the sets they claim
 *   delta:<base>         M1 base-delta (fg/delta): per-object px vs the declared
 *                        base Part; exact when the property promises no change
 *   judged:<against>     agreement with testimony / a specimen expectation /
 *                        the baseline reader, recorded as data: never a check,
 *                        never acceptance
 *   materialized         artifacts through the sink, rehashed after write
 *                        (artifactsRehashedAfterWrite), optionally re-read and
 *                        compared (artifactsReReadAndCompared)
 *   framed               the FG's Frames (one flipbook page each)
 *   published:<S>.<key>  the legacy receipt record { guarantee, specDelta?,
 *                        part(s), producedBy, ...body, checks, artifacts } at
 *                        stages.<S>.<key> + materializations.<name>, and the
 *                        lane evidence at experiments.branches.<X>
 *   (defaults, fg/compose.mjs) instrumented, rendered (forced render)
 *   (flow, fg/compose.mjs) branched:<site> = branchRun, forked, forkJoin
 */
import { decorator } from './compose.mjs';
import { tickEvidence } from './branchOp.mjs';
import { layerLedger, s1Sets } from './layers.mjs';
import { legacyArtifact, legacyCanon, prettyJsonBytes, unionOf, zeroAlphaCount } from './legacy.mjs';
import { canonicalJson } from './canon.mjs';
import { INSTRUMENTATION_CALLS, profileSummary } from './profile.mjs';

const stageOf = (fgId) => fgId.split('.')[1];
const SHA = 'fn.tk.sha256';

// ------------------------------------------------------------- lane, gated

export const lane = (name) => decorator({ name: `lane ${name}`, property: `lane:${name}`, lane: name, after: () => {} });

/**
 * gated(fgId, checks?): exact equality vs fgId's record. Within a stage the
 * record arrives through requires (ctx.records); across stages it is the
 * Part tk.<fgId>.record (pass stage: the gating FG's own stage, e.g. 's3').
 * checks: [{ name, mine(s), theirs(record, s) }],
 * compared canonically. With no checks the property is "requires that FG
 * held". s.records[fgId] = the record.
 */
export const gated = (fgId, { checks = [], stage = null } = {}) => {
  const crossStage = stage !== null && stage !== stageOf(fgId);
  const address = `tk.${fgId}.record`;
  return decorator({
    name: `gated by ${fgId}`, property: `gated:${fgId}`,
    ...(crossStage ? { reads: [address] } : { requires: [fgId] }),
    after: (env, s) => {
      const record = crossStage ? env.get(address) : env.records[fgId];
      for (const { name, mine, theirs } of checks) {
        const a = mine(s), b = theirs(record, s);
        env.check(name, canonicalJson(a ?? null) === canonicalJson(b ?? null), { [env.id]: a, [fgId]: b });
      }
      return { records: { ...(s.records ?? {}), [fgId]: record } };
    }
  });
};

// ------------------------------------------------------------- witnessed

/**
 * witnessed.provider(fn, { name, run(call, s, env) -> boolean | { ok, ...detail }, as? })
 * An independent re-execution of a registered provider Calculation; call(args)
 * invokes it. The outcome lands at s.witnesses[as ?? name] and what the
 * provider returned at s.provided[as ?? name] (one call: the value; several:
 * the list), so a later step can write the provider's own raster.
 */
const provider = (fn, { name, run, as = name }) => decorator({
  name: `witnessed by ${fn}`, property: `witnessed:${fn}`, calls: [fn],
  after: (env, s) => {
    const outputs = [];
    const call = (args) => { const out = env.call(fn, args); outputs.push(out); return out; };
    const outcome = env.witness(name, () => run(call, s, env));
    return { witnesses: { ...(s.witnesses ?? {}), [as]: outcome }, provided: { ...(s.provided ?? {}), [as]: outputs.length === 1 ? outputs[0] : outputs } };
  }
});

/**
 * witnessed.branch({ canonical(s, run, env) -> string }) after branchRun: the op
 * re-run on a second restored branch must reproduce the canonical form of
 * the first; run = s.branch for the first, the re-run for the second. Lands
 * at s.witnesses.reexecution = { canonicalSha256, exact } (the receipt shape).
 */
const branch = ({ canonical, name = 'reexecutionExact' }) => decorator({
  name: 'witnessed by a second branch', property: 'witnessed:branch', calls: [SHA],
  after: (env, s) => {
    if (!s.rerun) env.fail('witnessed:branch needs a branchRun inside it');
    const first = env.call(SHA, { bytes: canonical(s, s.branch, env) });
    const outcome = env.witness(name, () => {
      const second = env.call(SHA, { bytes: canonical(s, s.rerun(), env) });
      return second === first ? true : { ok: false, first, second };
    });
    return { witnesses: { ...(s.witnesses ?? {}), reexecution: { canonicalSha256: first, exact: outcome.ok } } };
  }
});

/**
 * witnessed.path(label, { name, run(s, env) }): an independent toolkit code
 * path. s.witnesses[as] is the runtime outcome (detail canonicalized);
 * s.witnessReturns[as] is exactly what run returned (key order kept, for
 * artifacts with a fixed byte layout).
 */
const path = (label, { name, run, as = name, reads = [], calls = [] }) => decorator({
  name: `witnessed by ${label}`, property: `witnessed:${label}`, reads, calls,
  after: (env, s) => {
    let returned = null;
    const outcome = env.witness(name, () => (returned = run(s, env)));
    return { witnesses: { ...(s.witnesses ?? {}), [as]: outcome }, witnessReturns: { ...(s.witnessReturns ?? {}), [as]: returned } };
  }
});

export const witnessed = Object.freeze({ provider, branch, path });

// ------------------------------------------------------------- conserved

const S1_MATERIALIZER = 'fn.provider.S1.materializeSubtractions';
const LAYERS = Object.freeze({
  S2: { priors: [] },
  S3: { priors: [{ name: 'S2Claimed', part: 'px.baskets', layer: 'S2', record: 'fg.s2.pxBaskets.materialize' }] }
});
const lowerFirst = (t) => t[0].toLowerCase() + t.slice(1);
/** Units of the ledger fields whose names carry none (contributed to unitful). */
export const LAYER_UNITS = Object.freeze({ claimedVisits: 'px visits (sum of per-object px counts; >= claimedPx when objects overlap)', intersections: 'px' });

/**
 * conserved.layer(S): the pixel ledger of layer S over the S1 sets and every
 * prior layer (fg/layers.mjs), on s.image { widthPx, heightPx, rgba } and
 * s.claimed / s.claimedVisits. Every prior layer's FG record (a Part, since
 * it is an earlier stage's) must have recorded leaving exactly what S finds
 * entering; the raster recount must agree or be explained by the S1 mute
 * fringe; and the S1 provider materializer must agree on the stack bottom.
 * s.layerIntegrity, s.remainingRgba, s.s1 (owned/muted sets).
 */
const layer = (S) => {
  const spec = LAYERS[S];
  if (!spec) throw new Error(`conserved.layer: no layer stack for ${S}`);
  return decorator({
    name: `conserved ${S}`, property: `conserved:${S}`,
    reads: ['px.badges', ...spec.priors.flatMap((p) => [p.part, `tk.${p.record}.record`])], calls: [S1_MATERIALIZER],
    after: (env, s) => {
      const badges = env.get('px.badges');
      if (!Array.isArray(badges) || !badges.length) env.fail(`px.badges missing on the board; cannot judge the ${S} layer against S1`);
      const priors = spec.priors.map((p) => {
        const objects = env.get(p.part);
        if (!Array.isArray(objects) || !objects.length) env.fail(`${p.part} missing on the board; cannot judge the ${S} layer against ${p.layer}`);
        return { name: p.name, set: unionOf(objects.map((o) => o.px)) };
      });
      const s1 = s1Sets(badges);
      const { widthPx: width, heightPx: height, rgba } = s.image;
      const { ledger, remainingRgba, s1Consumed } = layerLedger({ width, height, rgba, s1, priors, claimed: s.claimed, claimedVisits: s.claimedVisits });
      for (const p of spec.priors) {
        const leaving = env.get(`tk.${p.record}.record`).layerIntegrity.remainingLeavingPx;
        const key = lowerFirst(p.layer);
        ledger[`${key}RecordedRemainingLeavingPx`] = leaving;
        ledger[`stackAgreesWith${p.layer}Record`] = leaving === ledger.remainingEnteringPx;
        env.check(`stackAgreesWith${p.layer}Record`, ledger[`stackAgreesWith${p.layer}Record`], { [`${lowerFirst(S)}RemainingEnteringPx`]: ledger.remainingEnteringPx, [`${key}RecordedRemainingLeavingPx`]: leaving });
      }
      env.check('layerLedgerHolds', ledger.rasterRecountHolds || ledger.explainedByMuteOverlap, {
        rasterRecount: ledger.rasterRecount, setArithmetic: { remainingEnteringPx: ledger.remainingEnteringPx, remainingLeavingPx: ledger.setArithmeticLeavingPx ?? ledger.remainingLeavingPx },
        intersections: ledger.intersections, muteFringeOverlapPx: ledger.muteFringeOverlapPx
      });
      const s1Witness = env.call(S1_MATERIALIZER);
      ledger.s1WitnessRemainingAfterMutedPx = s1Witness.muted.remainingOpaquePx;
      ledger.s1WitnessAgrees = s1Witness.muted.remainingOpaquePx === ledger.framePx - s1Consumed.size;
      env.check('s1WitnessAgrees', ledger.s1WitnessAgrees, { s1WitnessRemainingAfterMutedPx: s1Witness.muted.remainingOpaquePx, stackFramePxMinusS1Consumed: ledger.framePx - s1Consumed.size });
      const fringe = [...s.claimed].filter((p) => s1.muted.has(p) && !s1.owned.has(p));
      return { layerIntegrity: ledger, remainingRgba, s1, muteFringe: fringe, units: { ...(s.units ?? {}), ...LAYER_UNITS } };
    }
  });
};

/**
 * conserved.raster({ name, rasters(s) -> [{ rgba, px: count, remaining?: { opaquePx, framePx } }] }):
 * every raster's zeroed-alpha count must equal the size of the set it
 * claims to have zeroed, and (when given) its remaining opaque count must
 * balance the frame. One check per use, named.
 */
const raster = ({ name, rasters, balance = null }) => decorator({
  name: `conserved raster ${name}`, property: 'conserved:raster',
  after: (env, s) => {
    const list = rasters(s);
    const counts = list.map((r) => ({ zeroed: zeroAlphaCount(r.rgba), px: r.px }));
    env.check(name, counts.every((c) => c.zeroed === c.px), { rasters: counts });
    if (balance) {
      const b = balance(s);
      env.check(b.name, b.remainingOpaquePx === b.framePx - b.px, { remainingOpaquePx: b.remainingOpaquePx, framePx: b.framePx, px: b.px });
    }
    return { rasterCounts: { ...(s.rasterCounts ?? {}), [name]: counts } };
  }
});

export const conserved = Object.freeze({ layer, raster });

// ------------------------------------------------------------- delta

/**
 * delta({ out, base, by, outPx(s) -> [[id, px]], basePx(s) -> [[id, px]], exact? })
 * The M1 base-delta (fg/delta models: one entry per Calculation, out vs the
 * Part it declares it transforms) at object granularity: per object id the
 * px the out Part added / removed relative to the base Part, and the union
 * totals. exact: a check name; the property then promises the delta is
 * empty (a reproduction). s.delta = { perObject, totals }; the record gets
 * baseDelta = { model: 'M1', out, base, by, totals, changedObjects }.
 */
export const delta = ({ out, base, by, outPx, basePx, exact = null, describe = (id, d) => `${id} differs by ${d.differingPx} px (out ${d.outPx} vs base ${d.basePx})` }) => decorator({
  name: `delta ${out} vs ${base}`, property: `delta:${base}`,
  after: (env, s) => {
    const outs = new Map(outPx(s)), bases = new Map(basePx(s));
    const ids = [...new Set([...bases.keys(), ...outs.keys()])];
    const perObject = {};
    for (const id of ids) {
      const o = outs.get(id) ?? [], b = new Set(bases.get(id) ?? []), oset = new Set(o);
      let added = 0, removed = 0;
      for (const p of oset) if (!b.has(p)) added++;
      for (const p of b) if (!oset.has(p)) removed++;
      perObject[id] = { addedPx: added, removedPx: removed, differingPx: added + removed, outPx: o.length, basePx: b.size, exact: added + removed === 0 && o.length === b.size };
    }
    const ou = unionOf([...outs.values()]), bu = unionOf([...bases.values()]);
    let addedPx = 0, removedPx = 0;
    for (const p of ou) if (!bu.has(p)) addedPx++;
    for (const p of bu) if (!ou.has(p)) removedPx++;
    const totals = { outPx: ou.size, basePx: bu.size, addedPx, removedPx };
    const changed = ids.filter((id) => !perObject[id].exact);
    if (exact) env.check(exact, changed.length === 0, { inexact: changed.map((id) => describe(id, perObject[id])) });
    return { delta: { perObject, totals }, out: { ...(s.out ?? {}), baseDelta: { model: 'M1', out, base, by, totals, changedObjectCount: changed.length } } };
  }
});

// ------------------------------------------------------------- judged

export const ACCEPTANCE_UNKNOWN = 'UNKNOWN';
/**
 * judged(against, { judge(s, env) -> { matches, ...detail }, as? }): agreement
 * with a reference the guarantee does not own (Sam's testimony, a declared
 * specimen expectation, the baseline reader). Recorded as data at
 * s.judged[as] and on the record under judged; it is never a check, so a
 * disagreement is a finding and never fails the run, and it never claims
 * acceptance (acceptance: 'UNKNOWN').
 */
export const judged = (against, { judge, as = against, reads = [] }) => decorator({
  name: `judged against ${against}`, property: `judged:${against}`, reads,
  after: (env, s) => {
    const verdict = judge(s, env);
    const summary = { against, matches: verdict.matches ?? null, acceptance: ACCEPTANCE_UNKNOWN };
    return { judged: { ...(s.judged ?? {}), [as]: verdict }, out: { ...(s.out ?? {}), judged: [...(s.out?.judged ?? []), summary] } };
  }
});

// ------------------------------------------------------------- materialized

/**
 * materialized({ artifacts(s) -> [{ id, kind, path, json | bytes | canonical, dims? }], reread? })
 *   json       written as pretty JSON in insertion order (the legacy layout)
 *   canonical  written as canonicalJson (the fg default)
 *   bytes      written as is (rasters)
 * Every artifact goes through the sink; the runtime hashes it and the sink
 * re-reads it (rehashed). Check artifactsRehashedAfterWrite; with
 * reread(s, read) -> boolean (read(id) parses a JSON artifact back) also
 * artifactsReReadAndCompared. s.entries[id] = entry; s.artifacts = the
 * receipt's legacy entries in order.
 */
export const materialized = ({ artifacts, reread = null }) => decorator({
  name: 'materialized', property: 'materialized',
  after: (env, s) => {
    const entries = {};
    const legacy = [];
    const artifactJson = {};
    for (const a of artifacts(s)) {
      if (a.json !== undefined || a.canonical !== undefined) artifactJson[a.id] = a.json ?? a.canonical;
      const data = a.json !== undefined ? prettyJsonBytes(a.json) : a.bytes !== undefined ? a.bytes : a.canonical;
      const entry = env.artifact(a.id, a.kind, data, a.dims, { path: a.path });
      entries[a.id] = entry;
      legacy.push(legacyArtifact(entry, a.dims));
    }
    env.check('artifactsRehashedAfterWrite', Object.values(entries).every((e) => e.rehashed));
    if (reread) {
      const read = (id) => JSON.parse(new TextDecoder().decode(env.sink.readArtifact(entries[id].id)));
      env.check('artifactsReReadAndCompared', reread(s, read) === true);
    }
    return { entries, artifacts: legacy, artifactJson };
  }
});

/** Same canonical form as the legacy inline blocks (key-sorted, typed arrays as objects). */
export const sameCanon = (a, b) => legacyCanon(a) === legacyCanon(b);

// ------------------------------------------------------------- framed

/** framed(build(s, env) -> [frameSpec]): emit the FG's Frames (flipbook pages). */
export const framed = (build) => decorator({
  name: 'framed', property: 'framed',
  after: (env, s) => { for (const spec of build(s, env)) if (spec) env.frame(spec); }
});

/**
 * One page for a set of objects: the union pxset (or an artifact ref), the
 * boxes, a ledger row per object, a verdict per object. The shape every
 * materialize FG drew by hand.
 */
export const objectsFrame = ({ title, calculation, address, artifact = null, image = null, objects, px = null, box, row, verdict, points = null }) => ({
  title, calculation,
  parts: [
    { address, kind: 'pxset', ...(artifact ? { artifact } : {}), ...(image && px ? { data: { width: image.widthPx, height: image.heightPx, px } } : {}) },
    { address: `${address}#bbox`, kind: 'bbox', data: { boxes: objects.filter(box).map((o) => box(o)) } },
    ...(points ? [{ address: `${address}#center`, kind: 'points', data: { points: objects.map(points) } }] : []),
    { address: `${address}#ledger`, kind: 'ledger', data: { rows: objects.map(row) } }
  ],
  verdicts: objects.map(verdict)
});

// ------------------------------------------------------------- published

/**
 * published({ stage, key, materialization, header(s), body(s), branch? })
 * The legacy receipt record { guarantee, ...header, ...body, checks,
 * artifacts }: checks is every verdict this FG recorded, in order (the
 * runtime's read:/call: presence checks excluded), artifacts the
 * materialized entries. Published at stages.<stage>.<key> and
 * materializations.<materialization>. branch: { key, benefit, falsifier,
 * body(s) } adds the lane evidence experiments.branches.<key> (after a
 * branchRun): { mode, status, lane, baseSnapshotSha256, benefit,
 * falsifier, oracle, ...body, canonicalRgbaSha256Off/On, ticks }.
 */
export const published = ({ stage, key, materialization, header, body, branch: lane = null }) => decorator({
  name: `published ${stage}.${key}`, property: `published:${stage}.${key}`,
  reads: lane ? [`tk.stage.${stage}.snapshotSha256`] : [],
  after: (env, s) => {
    const record = { guarantee: env.id, ...header(s), ...body(s), checks: Object.fromEntries(env.verdicts.map((v) => [v.name, v.ok])), artifacts: s.artifacts ?? [] };
    env.publish(`stages.${stage}.${key}`, record);
    env.publish(`materializations.${materialization}`, record);
    if (lane) {
      env.publish(`experiments.branches.${lane.key}`, {
        mode: 'ON', status: 'SPEC_DELTA_ORACLE_UNKNOWN', lane: env.fg.lane,
        baseSnapshotSha256: env.get(`tk.stage.${stage}.snapshotSha256`),
        benefit: lane.benefit, falsifier: lane.falsifier, oracle: 'UNKNOWN',
        ...lane.body(s),
        canonicalRgbaSha256Off: s.canonicalRgbaSha256, canonicalRgbaSha256On: s.branch.after,
        ticks: tickEvidence(s.op, s.branch.ticks)
      });
    }
    return { receiptRecord: record };
  }
});

// ------------------------------------------------------------- unitful

/**
 * "Numbers without units are meaningless" (Sam). A numeric value is
 * unitful when its own key, or the key of the object/array directly holding
 * it, names a unit: by suffix (UNIT_SUFFIXES, the convention the code
 * already uses: whitePx, angleRad, badgeCount, ...), by a key that IS the
 * unit's conventional name (DEFAULT_UNITS: px lists, bbox, center, index,
 * bytes, ...), by an explicit { value, unit } object, or by the FG's own
 * units map.
 */
export const UNIT_SUFFIXES = Object.freeze([
  ['PxPerM', 'px/m'], ['RgbLevel', 'RGB level'], ['Px', 'px'], ['Deg', 'deg'], ['Rad', 'rad'],
  ['Count', 'count'], ['Index', 'ordinal'], ['Frac', 'fraction'], ['Ratio', 'ratio'], ['Ms', 'ms'], ['Bytes', 'bytes']
]);
export const DEFAULT_UNITS = Object.freeze({
  px: 'px index (linear, canonical raster)', fusedPx: 'px index (linear, canonical raster)',
  bbox: 'px', innerBbox: 'px', ringBbox: 'px', center: 'px', boxes: 'px', points: 'px', canonical: 'px',
  width: 'px', height: 'px', index: 'ordinal', seq: 'ordinal', bytes: 'bytes'
});
export const unitOf = (key, units = {}) => {
  if (typeof key !== 'string' || !key) return null;
  if (Object.hasOwn(units, key)) return units[key];
  if (key.startsWith('unit:')) return key.slice(5);
  for (const [suffix, unit] of UNIT_SUFFIXES) if (key.endsWith(suffix) && key.length > suffix.length) return unit;
  return DEFAULT_UNITS[key] ?? null;
};

/** Paths (array indices as []) of numeric leaves with no unit, deduplicated, in walk order. */
export function unitlessPaths(value, units = {}) {
  const out = new Set();
  const flat = (v) => Array.prototype.every.call(v, (x) => typeof x !== 'object' || x === null || (Array.isArray(x) && x.every((y) => typeof y !== 'object')));
  const walk = (v, path, named) => {
    if (typeof v === 'number') {
      if (!unitOf(named.at(-1), units) && !unitOf(named.at(-2), units)) out.add(path.join('.') || '(root)');
      return;
    }
    if (Array.isArray(v) || ArrayBuffer.isView(v)) {
      if (unitOf(named.at(-1), units) && flat(v)) return;
      for (let i = 0; i < v.length; i++) walk(v[i], [...path, '[]'], named);
      return;
    }
    if (v && typeof v === 'object') {
      const explicit = typeof v.unit === 'string' && v.unit ? v.unit : null;
      for (const [k, x] of Object.entries(v)) walk(x, [...path, k], [...named, explicit && k === 'value' ? `unit:${explicit}` : k]);
    }
  };
  walk(value, [], []);
  return [...out];
}

/**
 * unitful({ units, params }): check 'unitful' fails, naming every path, when
 * a numeric field of the FG's record, its receipt record or its Frames has
 * no unit, or a declared parameter set (params: { name: [object, unitsMap] })
 * has a number its units map does not cover. Units come from the FG's map
 * and from what its mixins contributed (s.units: a mixin names the units of
 * the fields it adds, e.g. conserved's LAYER_UNITS). The artifact JSON (the
 * serialized Parts) is surveyed, not gated: its unitless paths are recorded
 * as unitSurvey (provider-shaped objects carry no units today: a finding).
 * guarantee() applies it, after the record is assembled, when the spec
 * names units.
 */
export const unitful = ({ units: declared = {}, params = {} } = {}) => decorator({
  name: 'unitful', property: 'unitful',
  after: (env, s) => {
    const units = { ...(s.units ?? {}), ...declared };
    const scoped = (name, value) => unitlessPaths(value, units).map((p) => `${name}.${p}`);
    const unitless = [
      ...scoped('record', s.record ?? {}),
      ...scoped('receipt', s.receiptRecord ?? {}),
      ...env.frameSpecs.flatMap((f, i) => scoped(`frame${i}`, { parts: (f.parts ?? []).map((p) => p.data ?? null) }))
    ];
    for (const [name, [object, map]] of Object.entries(params))
      for (const [k, v] of Object.entries(object)) if (typeof v === 'number' && !map[k]) unitless.push(`params.${name}.${k}`);
    const paramUnits = Object.assign({}, ...Object.values(params).map(([, map]) => map));
    const survey = Object.fromEntries(Object.entries(s.artifactJson ?? {}).map(([id, v]) => [id, unitlessPaths(v, { ...paramUnits, ...units })]));
    env.check('unitful', unitless.length === 0, { unitless: unitless.slice(0, 80), count: unitless.length });
    return { record: { ...s.record, units: { ...units }, unitSurvey: survey, ...(Object.keys(params).length ? { parameterUnits: Object.fromEntries(Object.entries(params).map(([n, [, map]]) => [n, map])) } : {}) } };
  }
});

// ------------------------------------------------------------- profiled

/**
 * profiled: the FG's own call subtree, read back from the store's instrumentation (fg/profile.mjs), onto its record as
 * DETERMINISTIC measures only: per Calculation the number of calls and the summed emits (poses, px, ...). Elapsed times
 * stay in the instrumentation sidecar (grouped by caller there): a record is hashed evidence, a timing never is.
 * Plug and play: pipe(..., profiled) on any FG whose store is instrumented; on a store that is not, it records why.
 */
export const profiled = decorator({
  name: 'profiled', property: 'profiled', calls: [INSTRUMENTATION_CALLS],
  after: (env, s) => {
    let profile;
    try { profile = profileSummary({ calculations: env.call(INSTRUMENTATION_CALLS, { caller: env.id }) }).map(({ calculation, calls, emits, threw }) => ({ calculation, calls, emits, threw })); }
    catch (e) { profile = { unavailable: `store is not instrumented: ${e.message}` }; }
    // every number it publishes carries a unit (unitful): calls and failures are counts; an emitted measure keeps the
    // meaning its Calculation gave it
    const units = { calls: 'count (Calculation calls)', threw: 'count (calls that threw)' };
    for (const row of Array.isArray(profile) ? profile : []) for (const k of Object.keys(row.emits)) units[k] ??= `as emitted by ${row.calculation} (summed over its calls)`;
    return { out: { ...(s.out ?? {}), profile }, units: { ...(s.units ?? {}), ...units } };   // the record step assembles s.out
  }
});
