/** Test-only fabricated rows and the unchanged native one-operation gateway. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, lstatSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
export const OP = 'assignment.ranking';
export const INPUT = 'assignment.scoredPairs';
export const OUTPUT = 'assignment.rankedByBadge';
export const ARTIFACT = 'lab14.assignment.ranking.alternatives';
export const SCHEMA = 'lab14-ranked-alternatives@1';
export const records = [];
const require = createRequire(resolve(ROOT, 'source/provider/package.json'));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
export const freeze = value => {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
};

function row(suffix, badge, score, supportMean) {
  return {
    raw: {
      pairId: `fixture-${suffix}`, badgeId: `fixture-badge-${badge}`,
      teeId: `fixture-tee-${suffix}`, basketId: `fixture-basket-${suffix}`,
      teeLeg: { endpointId: 'fixture-end', geodesic: 0, path: [], reachable: true },
      basketLeg: { endpointId: 'fixture-end', geodesic: 0, path: [], reachable: true },
      supportMean, supportMin: 0, supportedFraction: 0, worstWindowMean: 0,
      weakSpanCount: 0, weakSpanLongestPx: 0, pathLengthPx: 0, straightDistancePx: 0,
      efficiency: 1, endpointSupportTee: 0, endpointSupportBasket: 0, failureReason: null
    },
    score, rank: 0,
    factors: { alignment: 0.5, zone: 0.5, simplePath: 0.5, teeOrientation: 0.5,
      badgeFraction: 0.5, collinearity: 0.5, basketIdentity: 0.5, recoveredPrior: 0.5, zfit: 0.5 }
  };
}

/** All three fresh deeply frozen snapshots are constructed before any calls. */
export function snapshots() {
  const a = [row('a2', 'a', 0.6, 0.4), row('b1', 'b', 0.8, 0.5),
    row('a3', 'a', 0.6, 0.8), row('a1', 'a', 0.9, 0.5)];
  const b = JSON.parse(JSON.stringify(a));
  b[0].score = 0.65;
  return freeze([a, b, JSON.parse(JSON.stringify(a))]);
}

function distPaths(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = resolve(directory, entry.name);
    assert.equal(entry.isSymbolicLink(), false, 'dependency symlinks unsupported');
    return entry.isDirectory() ? distPaths(path) : [relative(ROOT, path)];
  });
}

/** Verify full frozen dependency coverage and bytes before the first provider require. */
export function verifyDependencies() {
  const path = process.env.LAB14_DEPENDENCY_MANIFEST;
  const expected = process.env.LAB14_DEPENDENCY_MANIFEST_SHA256;
  assert.ok(path && /^[a-f0-9]{64}$/.test(expected ?? ''), 'pinned dependency manifest required');
  const bytes = readFileSync(path);
  assert.equal(sha(bytes), expected, 'dependency manifest identity changed');
  const manifest = JSON.parse(bytes);
  assert.equal(manifest.schema, 'lab14-ranked-evidence-dependencies@1');
  const actual = [...distPaths(resolve(ROOT, 'source/provider/packages/alg/dist')),
    'source/provider/package.json', 'source/provider/package-lock.json',
    'source/provider/packages/alg/package.json'].sort();
  assert.deepEqual(manifest.files.map(file => file.path).sort(), actual, 'dependency coverage changed');
  for (const file of manifest.files) {
    assert.ok(actual.includes(file.path), 'manifest path outside approved closure');
    const absolute = resolve(ROOT, file.path);
    assert.equal(lstatSync(absolute).isFile(), true);
    assert.equal(sha(readFileSync(absolute)), file.sha256, `dependency changed: ${file.path}`);
  }
  return manifest;
}

export function loadNative() {
  verifyDependencies();
  const load = suffix => require(resolve(ROOT, 'source/provider/packages/alg/dist', suffix));
  const { executeCompiledPlan } = load('exec/gateway.js');
  const { OPERATION_UNIVERSE, operationImpls, operationCalculationBindings, ARTIFACT_EXTRACTORS } = load('exec/operations.js');
  const { createExecBoard } = load('exec/board.js');
  const { createMemorySink } = load('exec/sink.js');
  const { composePcr } = load('exec/pcr.js');
  const spec = OPERATION_UNIVERSE.find(operation => operation.id === OP);
  assert.ok(spec && operationImpls.has(OP), 'actual ranking operation unavailable');
  assert.deepEqual(spec.consumes, [INPUT]);
  assert.deepEqual(spec.produces, [OUTPUT]);
  assert.deepEqual(operationCalculationBindings.get(OP).map(binding => binding.address), ['fn.rankTeeBasketPairsByBadge']);
  const plan = Object.freeze({ ops: Object.freeze([spec]), bindings: Object.freeze({}),
    planFingerprint: 'lab14-four-row-fixed-synthetic-plan@1' });
  return { executeCompiledPlan, createExecBoard, createMemorySink, composePcr, plan,
    runtime: { implementations: operationImpls, calculationBindings: operationCalculationBindings,
      artifactExtractors: ARTIFACT_EXTRACTORS } };
}

export function run(native, rows, runtime, label) {
  const board = native.createExecBoard(), sink = native.createMemorySink();
  if (rows !== undefined) board.set(INPUT, rows);
  const before = rows === undefined ? null : JSON.stringify(rows);
  let spans = 0, stops = 0;
  const forbidden = () => { throw new Error('unexpected non-ranking context operation'); };
  const context = Object.freeze({ span(unit) {
    assert.equal(unit, 'assignment'); spans++;
    return () => { stops++; };
  }, resolve: forbidden, measure: forbidden, overlay: forbidden, heatmap: forbidden });
  const record = { label, input: before, receipts: sink.receipts, artifacts: [], error: null };
  records.push(record);
  try {
    const testimony = native.executeCompiledPlan(native.plan, board, context, sink, runtime);
    assert.equal(spans, 1); assert.equal(stops, 1);
    assert.equal(JSON.stringify(rows), before, 'input rows mutated');
    const ranked = board.get(OUTPUT);
    assert.ok(ranked instanceof Map);
    const pcr = native.composePcr({ id: 'lab14.ranked-evidence', title: 'Fabricated ranked alternatives', tickIds: [OP] }, native.plan, testimony);
    const artifacts = sink.artifacts.map(ref => {
      const bytes = sink.blobs.get(ref.id);
      assert.equal(sha(bytes), ref.sha256, 'memory sink digest mismatch');
      return { ref, bytesBase64: Buffer.from(bytes).toString('base64'), json: JSON.parse(new TextDecoder().decode(bytes)) };
    });
    Object.assign(record, { ranked: [...ranked].map(([badgeId, rankedRows]) => ({ badgeId, rows: rankedRows })),
      pcr, artifacts, spans, stops });
    return record;
  } catch (error) {
    record.error = { name: error.name, message: error.message };
    throw error;
  }
}

export function series(native, runtime, label) {
  const inputs = snapshots();
  assert.notEqual(inputs[0], inputs[2]);
  assert.notEqual(inputs[0][0].raw, inputs[2][0].raw);
  return inputs.map((rows, index) => run(native, rows, runtime, `${label}-${['A', 'B', 'A2'][index]}`));
}

/** Shared visible oracle: the same losing-alternative change must reach real hashes/PCR. */
export function assertAlternativeChange(results) {
  for (const result of results) {
    assert.equal(result.artifacts.length, 1, 'desired full ranking materialization is absent');
    const { ref } = result.artifacts[0];
    assert.equal(ref.id, ARTIFACT); assert.equal(ref.kind, 'candidateSet');
    assert.match(ref.sha256, /^[a-f0-9]{64}$/);
    assert.equal('dims' in ref, false);
    assert.equal(result.receipts[0].artifacts[0].sha256, ref.sha256);
  }
  assert.notEqual(results[0].artifacts[0].ref.sha256, results[1].artifacts[0].ref.sha256,
    'losing alternatives must change artifact identity');
  assert.equal(results[0].artifacts[0].ref.sha256, results[2].artifacts[0].ref.sha256);
  assert.notEqual(results[0].pcr.runResultId, results[1].pcr.runResultId);
  assert.equal(results[0].pcr.runResultId, results[2].pcr.runResultId);
}

export function writeRuntimeReport() {
  const target = process.env.LAB14_RUNTIME_REPORT;
  if (!target) return;
  const manifest = verifyDependencies();
  const pins = new Map(manifest.files.map(file => [file.path, file.sha256]));
  const requiredModules = Object.keys(require.cache).map(path => ({ path: relative(ROOT, path), sha256: sha(readFileSync(path)) }));
  for (const module of requiredModules) assert.equal(module.sha256, pins.get(module.path), `required module outside frozen pins: ${module.path}`);
  writeFileSync(target, JSON.stringify({ schema: 'lab14-ranking-runtime@1', arm: process.env.LAB14_RANKED_ARM ?? 'baseline',
    syntheticPlanParams: 'fixed fixture fingerprint; plan.paramsHash omitted; not native image identity',
    requiredModules, records }, null, 2) + '\n', { flag: 'wx' });
}
