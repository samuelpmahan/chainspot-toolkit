/**
 * Tests for events as FunctionalGuarantee mixins (fg/mixins.mjs emits / on; fg/registry.mjs eventReport):
 *   1. emits records the event on the record and declares it; it never changes a value the inner Composition produced
 *   2. on declares the subscription; the registry delivers the payload and runs the emitter first, whatever the listing order
 *   3. subscribers of one event run in a deterministic order (id order; gated pins an explicit one)
 *   4. before anything runs, crossCheck flags: a subscriber nobody emits for (error), an event nobody hears (warning), a cycle (error)
 *   5. the registry refuses to assemble the same wirings (a compile error); a warning does not stop the assembly
 *   6. a dormant emitter makes its subscribers dormant; a subscriber reads only events it declared
 *   7. emits / on properties are cross-checked against the stage declaration like every other property
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { guarantee, pipe, read } from './compose.mjs';
import { defineGuarantee, runGuarantee } from './guarantee.mjs';
import { createRegistry, crossCheck, eventReport, orderGuarantees, runGuarantees } from './registry.mjs';
import { createMemorySink } from './sinks.mjs';
import { emits, framed, gated, lane, on } from './mixins.mjs';
import { toyBoard } from './fixtures/board.mjs';
import { announcer, BLOBS_COUNTED, cycle, listener, miswired, pair } from './fixtures/fgs/events.fixture.mjs';

const ids = (fgs) => fgs.map((fg) => fg.id);
const page = framed(() => [{ title: 't', parts: [{ address: 'px.blobs', kind: 'scalar', data: { value: 1, unit: 'event' } }] }]);

test('emits declares the event, records name + payload, and never changes what the inner Composition produced', () => {
  const inner = pipe(read('px.blobs'), page);
  const result = (s) => ({ totals: { blobCount: s.parts['px.blobs'].blobs.length } });
  const plain = guarantee({ id: 'fg.toy.plain', guards: ['px.blobs'], result }, inner);
  const emitting = guarantee({ id: 'fg.toy.plain', guards: ['px.blobs'], result },
    pipe(inner, emits('blobs.counted', { payload: (s) => ({ blobCount: s.parts['px.blobs'].blobs.length, parts: 'tampered' }) })));
  assert.deepEqual(emitting.emits, ['blobs.counted']);
  assert.deepEqual(plain.emits, []);
  assert.ok(emitting.properties.includes('emits:blobs.counted'));
  const a = runGuarantee(plain, { board: toyBoard(), sink: createMemorySink() }).record;
  const b = runGuarantee(emitting, { board: toyBoard(), sink: createMemorySink() }).record;
  assert.deepEqual(b.events, [{ event: 'blobs.counted', payload: { blobCount: 4, parts: 'tampered' } }]);
  assert.deepEqual(b.emits, ['blobs.counted']);
  assert.deepEqual(b.totals, a.totals, 'same totals with and without the emit');
  assert.deepEqual(b.frames, a.frames);
  assert.equal('events' in a || 'emits' in a, false, 'a guarantee that emits nothing keeps its record byte for byte');
});

test('emits refuses a payload that is not a function, and an event name that is not a name', () => {
  assert.throws(() => emits('blobs.counted', {}), /payload\(s\) is required/);
  assert.throws(() => emits('', { payload: () => ({}) }), /event name/);
  assert.throws(() => on('has space'), /event name/);
});

test('on declares the subscription; the FG declaration is the union of its mixins', () => {
  const l = listener();
  assert.deepEqual(l.subscribes, [BLOBS_COUNTED]);
  assert.deepEqual(l.requires, [], 'a subscription names an event, never an FG id: requires stays what it was');
  assert.ok(l.properties.includes(`on:${BLOBS_COUNTED}`));
  assert.deepEqual(announcer().subscribes, []);
});

test('the smallest pair assembles and runs: the emitter first even when listed second; the subscriber hears the payload', () => {
  const [emitter, subscriber] = pair();
  const registry = createRegistry([subscriber, emitter]);
  assert.deepEqual(registry.order(), ['fg.toy.blobs.announce', 'fg.toy.blobs.listen']);
  const { records } = registry.run({ board: toyBoard(), sink: createMemorySink() });
  const heard = records['fg.toy.blobs.listen'];
  assert.equal(heard.status, 'held');
  assert.deepEqual(heard.totals, { heardCount: 1 });
  assert.deepEqual(heard.heard, [{ event: BLOBS_COUNTED, from: ['fg.toy.blobs.announce'], count: 1 }]);
  assert.ok(heard.checks.some((c) => c.name === `heard:${BLOBS_COUNTED}` && c.ok), 'a named check per subscription');
  assert.ok(heard.checks.some((c) => c.name === `expected:${BLOBS_COUNTED}` && c.ok), 'the subscriber checked the payload against its own read');
  assert.deepEqual(eventReport([emitter, subscriber]), { errors: [], warnings: [] });
});

test('subscribers of one event run in a deterministic order: id order, or the order gated pins', () => {
  const subs = ['fg.toy.sub.c', 'fg.toy.sub.a', 'fg.toy.sub.b'].map((id) => listener(id));
  const emitter = announcer();
  const expected = ['fg.toy.blobs.announce', 'fg.toy.sub.a', 'fg.toy.sub.b', 'fg.toy.sub.c'];
  for (const listing of [[emitter, ...subs], [...subs, emitter], [subs[1], emitter, subs[2], subs[0]]])
    assert.deepEqual(ids(orderGuarantees(listing)), expected);
  // gated pins an explicit order between two subscribers: b before a
  const pinned = guarantee({ id: 'fg.toy.sub.a', guards: ['px.blobs'] }, pipe(read('px.blobs'), on(BLOBS_COUNTED), gated('fg.toy.sub.b'), page));
  assert.deepEqual(ids(orderGuarantees([emitter, pinned, subs[0], subs[2]])), ['fg.toy.blobs.announce', 'fg.toy.sub.b', 'fg.toy.sub.a', 'fg.toy.sub.c']);
  const { records } = runGuarantees({ guarantees: [...subs, emitter], board: toyBoard(), sink: createMemorySink() });
  assert.deepEqual(Object.keys(records), expected, 'the record stream follows the same order');
});

test('a subscriber whose event nobody emits is flagged before anything runs, and the registry refuses to assemble it', () => {
  const fgs = miswired();
  const report = eventReport(fgs);
  assert.deepEqual(report.errors, [{ kind: 'unemitted', id: 'fg.toy.blobs.typo', event: 'blobs.countd', emittedEvents: [BLOBS_COUNTED] }]);
  assert.deepEqual(report.warnings, [{ kind: 'unheard', event: BLOBS_COUNTED, emitters: ['fg.toy.blobs.announce'] }], 'the typo also leaves the real event unheard');
  const check = crossCheck(fgs, []);
  assert.deepEqual(check.mismatches.map((m) => [m.id, m.field, m.problem]), [['fg.toy.blobs.typo', 'subscribes', 'unemitted']]);
  assert.deepEqual(check.eventWarnings, report.warnings);
  assert.throws(() => createRegistry(fgs), /fg\.toy\.blobs\.typo subscribes to blobs\.countd, which no registered guarantee emits/);
  assert.throws(() => runGuarantees({ guarantees: fgs, board: toyBoard(), sink: createMemorySink() }), /subscribes to blobs\.countd/);
});

test('an emitted event nobody subscribes to is a warning, not an error: the assembly still runs', () => {
  const alone = [announcer()];
  assert.deepEqual(eventReport(alone), { errors: [], warnings: [{ kind: 'unheard', event: BLOBS_COUNTED, emitters: ['fg.toy.blobs.announce'] }] });
  const check = crossCheck(alone, []);
  assert.deepEqual(check.mismatches, []);
  assert.equal(check.eventWarnings.length, 1);
  const { records } = createRegistry(alone).run({ board: toyBoard(), sink: createMemorySink() });
  assert.equal(records['fg.toy.blobs.announce'].status, 'held');
});

test('a subscription cycle is flagged before anything runs and refused at assembly, with the events on the path', () => {
  const fgs = cycle();
  const { errors } = eventReport(fgs);
  assert.deepEqual(errors, [{ kind: 'cycle', path: ['fg.toy.ping', 'fg.toy.pong', 'fg.toy.ping'], events: ['pong.done', 'ping.done'] }]);
  assert.deepEqual(crossCheck(fgs, []).mismatches.map((m) => [m.id, m.field, m.problem]), [['fg.toy.ping', 'subscribes', 'cycle']]);
  assert.throws(() => createRegistry(fgs), /subscription cycle fg\.toy\.ping -\[pong\.done\]-> fg\.toy\.pong -\[ping\.done\]-> fg\.toy\.ping/);
});

test('a cycle through requires and an event is a cycle too; a self-subscription is refused at definition', () => {
  const first = guarantee({ id: 'fg.toy.first', guards: ['px.blobs'] }, pipe(read('px.blobs'), emits('first.done', { payload: () => ({}) }), gated('fg.toy.second'), page));
  const second = guarantee({ id: 'fg.toy.second', guards: ['px.blobs'] }, pipe(read('px.blobs'), on('first.done'), page));
  assert.equal(eventReport([first, second]).errors[0].kind, 'cycle');
  assert.throws(() => createRegistry([first, second]), /cycle/);
  const own = pipe(read('px.blobs'), on('self.done'), emits('self.done', { payload: () => ({}) }), page);
  assert.throws(() => guarantee({ id: 'fg.toy.self', guards: ['px.blobs'] }, own), /subscribes to its own event self\.done/);
});

test('a dormant emitter makes its subscribers dormant; a live emitter beside it still delivers', () => {
  const laned = guarantee({ id: 'fg.toy.lane.announce', guards: ['px.blobs'] },
    pipe(read('px.blobs'), lane('toy-lane'), emits(BLOBS_COUNTED, { payload: () => ({ blobCount: 0 }) }), page));
  const only = runGuarantees({ guarantees: [laned, listener()], board: toyBoard(), sink: createMemorySink() });
  assert.equal(only.records['fg.toy.blobs.listen'].status, 'dormant');
  assert.match(only.records['fg.toy.blobs.listen'].reason, /blobs\.counted.*dormant/);
  const both = runGuarantees({ guarantees: [laned, announcer(), listener()], board: toyBoard(), sink: createMemorySink() });
  assert.equal(both.records['fg.toy.blobs.listen'].status, 'held');
  assert.equal(both.records['fg.toy.blobs.listen'].heard[0].count, 1, 'only the live emitter delivered');
});

test('a subscriber hears only events it declared; running one alone fails by name', () => {
  const sneaky = defineGuarantee({ id: 'fg.toy.sneaky', guards: ['px.blobs'], run: (ctx) => ({ totals: { n: ctx.heard('blobs.counted').length } }) });
  assert.throws(() => runGuarantee(sneaky, { board: toyBoard(), sink: createMemorySink() }), /heard of undeclared event blobs\.counted \(declare it in subscribes\)/);
  // a subscriber run without the registry has nothing delivered: the check names the silence, it does not pass
  assert.throws(() => runGuarantee(listener(), { board: toyBoard(), sink: createMemorySink() }), (e) => e.name === 'GuaranteeFailure' && e.failed.includes(`heard:${BLOBS_COUNTED}`));
});

test('events are cross-checked against the stage declaration like any property', () => {
  const [emitter, subscriber] = pair();
  const declaration = (fg, properties) => ({ id: fg.id, kind: 'functional-guarantee', part: 'px.blobs', appliesTo: 'every toy run', requires: ['x'], properties });
  const declared = [declaration(emitter, [`emits:${BLOBS_COUNTED}`, 'framed']), declaration(subscriber, [`on:${BLOBS_COUNTED}`, 'framed'])];
  assert.deepEqual(crossCheck([emitter, subscriber], declared).mismatches, []);
  const forgot = crossCheck([emitter, subscriber], [declaration(emitter, ['framed']), declared[1]]).mismatches;
  assert.deepEqual(forgot.map((m) => [m.id, m.field, m.missing]), [['fg.toy.blobs.announce', 'properties', [`emits:${BLOBS_COUNTED}`]]]);
});

test('the event fixtures and mixins stay browser-safe (no node:* import)', () => {
  for (const file of ['fixtures/fgs/events.fixture.mjs', 'mixins.mjs', 'registry.mjs', 'compose.mjs', 'guarantee.mjs']) {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8');
    assert.ok(!/from\s+['"]node:|import\(\s*['"]node:/.test(source), `${file} imports node:*`);
  }
});
