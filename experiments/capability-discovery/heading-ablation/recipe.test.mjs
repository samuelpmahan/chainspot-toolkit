import test from 'node:test';
import assert from 'node:assert/strict';
import { planHeadingQueries, evaluatePrediction, evaluatePublicPrediction,
  runHeadingAblation } from './recipe.mjs';

// Fabricated scalar contract tests only: no raster, codec, runner or query seam.
const SIDES = ['leftLum', 'rightLum'];
const FLAGS = ['okLeft', 'okRight'];
const N = 16;
function answer(left = 0, right = 10) {
  return {
    leftLum: Array(N).fill(left), rightLum: Array(N).fill(right),
    okLeft: Array(N).fill(1), okRight: Array(N).fill(1), stationsCount: N,
  };
}
function fixture(primaryChange = 2, brightChange = 0.5) {
  return [answer(), answer(primaryChange), answer(), answer(brightChange)];
}
const clone = value => structuredClone(value);
function unknown(answers) {
  const actual = evaluatePrediction(answers);
  assert.equal(actual.status, 'UNKNOWN');
  return actual;
}

test('four frozen calls have exact order, arguments, origins and headings', () => {
  const plans = planHeadingQueries();
  const phi = -0.20539538918976738;
  const normal = [-Math.sin(phi), Math.cos(phi)];
  assert.deepEqual(normal, [0.20395425411200102, 0.978980419737605]);
  const groups = [
    { id: 'primary', origin: [780, 906], core: -0.5947449408418812,
      before: 0.8175617257517427, after: -1.1095791960404195,
      width: 42.26372284910734, heading: -0.26554589467489287,
      joint: [779.8786992392037, 905.4177563481778] },
    { id: 'bright-nonpath', origin: [780, 740], core: 6.512793849318173,
      before: -0.03190735089543928, after: -8.174105198179092,
      width: 43.74145492884304, heading: -0.4545519493150654,
      joint: [781.3283120117229, 746.37589765627] },
  ];
  assert.equal(plans.length, 4);
  for (let g = 0; g < groups.length; g++) {
    const spec = groups[g];
    assert.equal(phi + Math.atan((spec.after - spec.before) / 32), spec.heading);
    assert.deepEqual(spec.origin.map((v, i) => v + spec.core * normal[i]), spec.joint);
    for (let a = 0; a < 2; a++) {
      const arm = a === 0 ? 'baseline' : 'candidate';
      const p = plans[2 * g + a];
      assert.equal(p.planIndex, 2 * g + a);
      assert.equal(p.id, `${spec.id}/${arm}`);
      assert.equal(p.groupId, spec.id);
      assert.equal(p.arm, arm);
      assert.equal(p.query, 'fn.q.path.stationContrast');
      assert.deepEqual(Object.keys(p.rawArgs), [
        'raster', 'mask', 'originPx', 'phiRad', 't0Px', 't1Px',
        'stepPx', 'widthPx', 'bandPx', 'alongPx',
      ]);
      assert.equal(p.rawArgs.raster, 'px.image.cropped');
      assert.equal(p.rawArgs.mask, 'tk.s6.pathMask'); // Registered Part resolves to literal null.
      assert.deepEqual(p.rawArgs.originPx, spec.joint);
      assert.equal(p.rawArgs.phiRad, a === 0 ? phi : spec.heading);
      assert.equal(p.rawArgs.t0Px, -8);
      assert.equal(p.rawArgs.t1Px, 8);
      assert.equal(p.rawArgs.stepPx, 1);
      assert.equal(p.rawArgs.widthPx, spec.width); // No cosine correction.
      assert.deepEqual(p.rawArgs.bandPx, [1, 3]);
      assert.equal(p.rawArgs.alongPx, 2);
    }
  }
});

test('supported prediction uses mean of paired station min-sides, not min of means', () => {
  const values = fixture();
  for (let i = 0; i < N; i++) {
    values[1].leftLum[i] = i % 2 === 0 ? 2 : 10;
    values[1].rightLum[i] = i % 2 === 0 ? 10 : 2;
  }
  const before = clone(values);
  const actual = evaluatePrediction(values);
  assert.equal(actual.status, 'SUPPORTED');
  assert.equal(actual.Dprimary, 2);
  assert.equal(actual.Dbright, 0.5);
  assert.deepEqual(values, before, 'evaluation must not rewrite raw fixture values');
  assert.deepEqual(actual.groups.map(g => g.groupId), ['primary', 'bright-nonpath']);
  for (const group of actual.groups) {
    assert.equal(group.status, 'VALID');
    assert.equal(group.stations.length, N);
    assert.equal(group.D, group.groupId === 'primary' ? 2 : 0.5);
    group.stations.forEach((s, i) => {
      assert.equal(s.index, i);
      assert.equal(s.tPx, i - 8);
      assert.equal(s.valid, true);
      assert.equal(s.difference, group.D);
    });
  }
});

test('signed inside-minus-outside contrasts are not clamped, absolutized or ratioed', () => {
  const values = [answer(-4, 3), answer(3, -2), answer(-4, 3), answer(-3.75, 3)];
  const actual = evaluatePrediction(values);
  assert.equal(actual.status, 'SUPPORTED');
  assert.equal(actual.Dprimary, 2);
  assert.equal(actual.Dbright, 0.25);
  assert.equal(actual.groups[0].stations[0].baseline.leftLum, -4);
  assert.equal(actual.groups[0].stations[0].candidate.rightLum, -2);
});

test('public answer envelopes are unwrapped at value, not mistaken for scalar payloads', () => {
  const raw = fixture();
  const envelopes = raw.map((value, i) => ({
    calculation: 'fn.q.path.stationContrast', status: 'ok', seq: i,
    value, leftLum: Array(N).fill(NaN), stationsCount: 0,
  }));
  const before = clone(envelopes);
  assert.deepEqual(evaluatePublicPrediction(envelopes), evaluatePrediction(raw));
  assert.equal(evaluatePublicPrediction(envelopes).status, 'SUPPORTED');
  assert.deepEqual(envelopes, before);
  const malformed = clone(envelopes);
  delete malformed[1].value;
  assert.equal(evaluatePublicPrediction(malformed).status, 'UNKNOWN');
  assert.equal(evaluatePublicPrediction(raw).status, 'UNKNOWN');
});

test('zero or negative primary change falsifies benefit, including equality', () => {
  for (const delta of [0, -1]) {
    const actual = evaluatePrediction(fixture(delta, -2));
    assert.equal(actual.status, 'FALSIFIED');
    assert.equal(actual.Dprimary, delta);
    assert.equal(actual.Dbright, -2);
  }
});

test('bright improvement equal to or greater than primary falsifies specificity', () => {
  for (const brightDelta of [2, 3]) {
    const actual = evaluatePrediction(fixture(2, brightDelta));
    assert.equal(actual.status, 'FALSIFIED');
    assert.equal(actual.Dprimary, 2);
    assert.equal(actual.Dbright, brightDelta);
  }
  assert.equal(evaluatePrediction(fixture(2, -1)).status, 'SUPPORTED');
});

test('every bilateral flag at every paired station of every arm gates the aggregate', () => {
  for (let arm = 0; arm < 4; arm++) {
    for (let i = 0; i < N; i++) {
      for (const flag of FLAGS) {
        const values = fixture();
        values[arm][flag][i] = 0; // Other side and all scalar sides remain finite.
        const actual = unknown(values);
        const group = actual.groups[Math.floor(arm / 2)];
        assert.equal(group.status, 'UNKNOWN');
        assert.equal(group.D, null);
        assert.equal(group.stations[i].valid, false);
        const armName = arm % 2 === 0 ? 'baseline' : 'candidate';
        assert.equal(group.stations[i][armName][flag], 0);
      }
    }
  }
});

test('finite-invalid flags are not coerced to 1', () => {
  for (const bad of [2, -1, 0.5, true, '1', null, undefined]) {
    const values = fixture();
    values[1].okLeft[7] = bad;
    const actual = unknown(values);
    assert.equal(actual.groups[0].stations[7].candidate.okLeft, bad ?? null);
  }
});

test('nonfinite/missing/non-numeric sides retain raw values and never drop support', () => {
  for (const bad of [NaN, Infinity, -Infinity, null, undefined, '2']) {
    for (let arm = 0; arm < 4; arm++) {
      for (const side of SIDES) {
        const values = fixture();
        values[arm][side][15] = bad;
        const actual = unknown(values);
        const s = actual.groups[Math.floor(arm / 2)].stations[15];
        const armName = arm % 2 === 0 ? 'baseline' : 'candidate';
        assert.equal(s.valid, false);
        assert.equal(s.difference, null);
        assert.equal(s[armName][side], bad ?? null);
      }
    }
  }
});

test('exactly four answers and exactly sixteen entries are required, no truncation', () => {
  unknown(fixture().slice(0, 3));
  unknown([...fixture(), answer()]);
  for (let arm = 0; arm < 4; arm++) {
    for (const key of [...SIDES, ...FLAGS]) {
      for (const count of [15, 17]) {
        const values = fixture();
        values[arm][key] = Array(count).fill(key.startsWith('ok') ? 1 : 0);
        unknown(values);
      }
    }
    const values = fixture();
    values[arm].stationsCount = 15;
    unknown(values);
  }
});

test('finite sides whose paired differences or mean overflow cannot support prediction', () => {
  unknown([answer(-1e308, -1e308), answer(1e308, 1e308), answer(), answer(0.5)]);
  unknown([answer(), answer(1e308, 1e308), answer(), answer(0.5)]);
});

test('default and explicit OFF branches report zero calls, without producer inputs', async () => {
  for (const request of [undefined, {}, { enabled: false }]) {
    const trace = await runHeadingAblation(request);
    assert.equal(trace.status, 'DISABLED');
    assert.deepEqual(trace.calls, []);
    assert.deepEqual(trace.counts, { attempted: 0, completed: 0, callbacks: 0 });
    assert.deepEqual(trace.sourceBinding, { before: null, afterImport: null, after: null });
    assert.deepEqual(trace.inputBinding, { before: [], after: [], canonical: null });
  }
});

test('closed enabled request rejects caller argument changes before any call', async () => {
  const request = {
    schema: 'heading-ablation-request@1', enabled: true, runId: 'fabricated-test',
    phiRad: 0,
  };
  const trace = await runHeadingAblation(request);
  assert.equal(trace.status, 'NOT_EXECUTED');
  assert.deepEqual(trace.calls, []);
});
