import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { canonicalJson } from '../../fg/canon.mjs';
import { FEATURES, FEATURE_BY_ID, NAMED_CONFIGS, LEGACY_ABSENT, UNITS, S7_DEFAULT_NAME, checkConfig, resolveConfig, rulesOf, stateFromRules, sparseOf, expandGrid, configHash, prng, registryRows } from './features.mjs';
import { RULE_SETS, MATCH_RULES, S7_DEFAULT, PROFILES } from './match.mjs';

const LEGACY = JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures', 'rule-sets.legacy.json'), 'utf8'));

test('every recorded rule set is a named config that resolves to exactly its old options (31f2968)', () => {
  assert.deepEqual(Object.keys(NAMED_CONFIGS), Object.keys(LEGACY.RULE_SETS));
  for (const [name, old] of Object.entries(LEGACY.RULE_SETS)) {
    const want = canonicalJson({ ...LEGACY.MATCH_RULES, ...old });
    assert.equal(canonicalJson(resolveConfig(name).rules), want, name);
    assert.equal(canonicalJson(RULE_SETS[name]), want, `RULE_SETS.${name}`);
    // and reading the old options back gives the same config (the converter is the registry's inverse)
    assert.equal(resolveConfig(sparseOf(stateFromRules(old, LEGACY.MATCH_RULES))).hash, resolveConfig(name).hash, `${name} round trip`);
  }
  assert.deepEqual(MATCH_RULES, LEGACY.MATCH_RULES);
  assert.deepEqual(PROFILES, LEGACY.PROFILES);
  assert.equal(S7_DEFAULT, LEGACY.S7_DEFAULT);
});

test('the defaults are the S7 default: resolveConfig({}) is its rule set, and its sparse config is empty', () => {
  assert.equal(S7_DEFAULT_NAME, S7_DEFAULT);
  assert.equal(resolveConfig({}).hash, resolveConfig(S7_DEFAULT).hash);
  assert.deepEqual(NAMED_CONFIGS[S7_DEFAULT], { features: {} });
  assert.deepEqual(resolveConfig({}).rules, RULE_SETS[S7_DEFAULT]);
});

test('the canonical hash: stable, independent of key order and of how a config says the default', () => {
  const a = resolveConfig({ features: { kBends: { knobs: { mode: 'seq', refineStarts: 3 } }, firstLegs: { enabled: true } } });
  const b = resolveConfig({ features: { firstLegs: { enabled: true }, kBends: { knobs: { refineStarts: 3 } } }, name: 'another name' });
  assert.equal(a.hash, b.hash);
  assert.equal(a.hash, resolveConfig('routeMatchKBendsSeq3SearchWFirstLegs').hash);
  assert.notEqual(a.hash, resolveConfig({}).hash);
  assert.match(a.hash, /^[0-9a-f]{64}$/);
  assert.equal(configHash(a.canonical), a.hash);
  // a feature that cannot change a route is not in the canonical config: the recorded rule (kBends off) ignores every seq knob
  const off = resolveConfig({ features: { kBends: { enabled: false } } });
  assert.equal(off.canonical.features.firstLegs, undefined);
  assert.equal(off.canonical.features.kBends.knobs, undefined);
  assert.equal(off.rules.kBends, undefined);
  // the follower's W knobs only exist in W mode
  assert.equal(resolveConfig({ features: { follower: { knobs: { mode: 'px' } } } }).canonical.features.follower.knobs.runW, undefined);
});

test('validate: unknown features and knobs, bad values, required features, needs, conflicts and knobs without effect are errors', () => {
  const errs = (c) => checkConfig(c).errors.join(' | ');
  assert.match(errs({ features: { kBend: {} } }), /unknown feature 'kBend'/);
  assert.match(errs({ features: { kBends: { knobs: { refineStart: 3 } } } }), /unknown knob 'refineStart'/);
  assert.match(errs({ features: { kBends: { knobs: { refineStarts: 0 } } } }), /refineStarts.*integer in 1\.\.8/);
  assert.match(errs({ features: { bendGate: { knobs: { gainFrac: -0.1 } } } }), /gainFrac.*number in/);
  assert.match(errs({ features: { routeTable: { enabled: false } } }), /required/);
  assert.match(errs({ features: { kBends: { enabled: false }, firstLegs: { enabled: true } } }), /firstLegs' needs kBends enabled with mode 'seq'/);
  assert.match(errs({ features: { kBends: { knobs: { mode: 'bottleneck' } }, neighbourhood: { knobs: { ranks: 5 } } } }), /neighbourhood' needs kBends/);
  assert.match(errs({ features: { regionScore: { enabled: true }, evidenceRank: { enabled: true } } }), /conflicts/);
  assert.match(errs({ features: { follower: { knobs: { mode: 'px', runW: 2.4 } } } }), /runW' = 2\.4 has no effect/);
  assert.match(errs({ feature: {} }), /unknown key 'feature'/);
  assert.match(errs({ schema: 'threeFactor-config@1' }), /schema/);
  assert.equal(checkConfig({ features: { turnPrice: { enabled: false } } }).ok, true);
  assert.throws(() => resolveConfig({ features: { kBend: {} } }), /unknown feature/);
  assert.throws(() => resolveConfig('noSuchRuleSet'), /no named config/);
  assert.throws(() => stateFromRules({ evidenceWeights: {} }, MATCH_RULES), /not a feature or knob/);
});

test('the registry: every knob has a unit, a note, a valid default and valid sweep values; every recorded option is covered', () => {
  for (const f of FEATURES) {
    assert.ok(['baseline', 'deviation'].includes(f.kind), f.id);
    if (f.kind === 'deviation') assert.equal(f.defaultEnabled, false, f.id);
    for (const [k, s] of Object.entries(f.knobs)) {
      assert.ok(UNITS[s.unit], `${f.id}.${k} unit`);
      assert.equal(s.validate(s.default), null, `${f.id}.${k}`);
      for (const v of s.sweep ?? []) assert.equal(s.validate(v), null, `${f.id}.${k} sweep ${v}`);
    }
  }
  const used = new Set(Object.values(LEGACY.RULE_SETS).flatMap((r) => Object.keys(r)));
  for (const k of used) assert.ok(k in LEGACY_ABSENT, k);
  assert.ok(FEATURE_BY_ID.get('neighbourhood').knobs.ranks.assumption, 'the neighbourhood bound is a stated assumption');
  assert.ok(registryRows().some((r) => r.knob === 'gainFrac' && r.unit === 'frac'));
});

test('expandGrid: the cartesian product, invalid combinations recorded, duplicates merged by hash, named configs recognised', () => {
  const g = expandGrid({ axes: [{ feature: 'firstLegs' }, { knob: 'kBends.refineStarts', values: [1, 3] }, { name: 'table', options: { seq: {}, off: { kBends: { enabled: false } } } }] });
  assert.equal(g.product, 8);
  // kBends off with firstLegs on is invalid (2 combinations); kBends off with firstLegs off is the same config for both refineStarts
  // (the knob cannot act there: a warning in a grid, an error in a config file)
  assert.equal(g.skipped.length, 2);
  assert.equal(checkConfig({ features: { kBends: { enabled: false, knobs: { refineStarts: 1 } } } }).ok, false);
  assert.equal(checkConfig({ features: { kBends: { enabled: false, knobs: { refineStarts: 1 } } } }, { lenient: true }).ok, true);
  assert.match(g.skipped[0].errors.join(' '), /firstLegs' needs kBends/);
  assert.equal(g.configs.length, 5);   // base (= firstLegs off, refineStarts 3, seq), 3 more seq, 1 kBends off
  const base = g.configs.find((c) => c.hash === resolveConfig({}).hash);
  assert.ok(base.names.includes(S7_DEFAULT));
  assert.ok(g.configs.find((c) => c.names.includes('routeMatchKBendsSeq3SearchWFirstLegs')));
  assert.ok(g.configs.find((c) => c.names.includes('routeMatchBadgeMidTeeAxisPrior')));
  assert.ok(g.duplicates >= 1);
  for (const c of g.configs) assert.deepEqual(resolveConfig(c.sparse).rules, c.rules);
});

test('expandGrid: a seeded subsample is reproducible and keeps the base and the included named configs', () => {
  const spec = (seed) => ({ include: ['routeMatchKBendsSeq3SearchWFirstLegs'], sample: { n: 5, seed }, axes: [{ knob: 'kBends.refineStarts', values: [1, 3, 5] }, { knob: 'bendGate.gainFrac', values: [0.03, 0.05, 0.08] }, { knob: 'turnPrice.kappaLum', values: [5, 10, 20] }] });
  const a = expandGrid(spec(7)), b = expandGrid(spec(7)), c = expandGrid(spec(8));
  assert.equal(a.product, 27); assert.equal(a.sampled, 5);
  assert.deepEqual(a.configs.map((x) => x.hash), b.configs.map((x) => x.hash));
  assert.notDeepEqual(a.configs.map((x) => x.hash), c.configs.map((x) => x.hash));
  assert.equal(a.configs[0].hash, resolveConfig({}).hash);
  assert.ok(a.configs.some((x) => x.names.includes('routeMatchKBendsSeq3SearchWFirstLegs')));
  const r = prng(3); assert.equal(r(), prng(3)());
});

test('rulesOf: the new knobs reach routeMatch only when they leave their default', () => {
  assert.equal(resolveConfig({}).rules.bendGateGain, undefined);
  assert.equal(resolveConfig({ features: { bendGate: { knobs: { gainFrac: 0.08 } } } }).rules.bendGateGain, 0.08);
  assert.deepEqual(resolveConfig({ features: { follower: { knobs: { runW: 2.4 } } } }).rules.followRes, { runW: 2.4 });
  assert.equal(resolveConfig({ features: { turnPrice: { enabled: false } } }).rules.seqTurnKappa, undefined);
  assert.equal(resolveConfig({ features: { evidenceRank: { enabled: true } } }).rules.seqScore, 'evidence');
  assert.deepEqual(rulesOf(resolveConfig({}).canonical), RULE_SETS[S7_DEFAULT]);
});
