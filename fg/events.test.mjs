/**
 * Tests for events as FunctionalGuarantee mixins (fg/mixins.mjs raises / on; fg/registry.mjs eventReport):
 *   1. raises records the event on the record and declares it; it never changes a value the inner Composition produced
 *   2. on declares the subscription; the registry delivers the payload and runs the raiser first, whatever the listing order
 *   3. subscribers of one event run in a deterministic order (id order; gated pins an explicit one)
 *   4. before anything runs, crossCheck flags: a subscriber nobody raises for (error), an event nobody hears (warning), a cycle (error)
 *   5. the registry refuses to assemble the same wirings (a compile error); a warning does not stop the assembly
 *   6. a dormant raiser makes its subscribers dormant; a subscriber reads only events it declared
 *   7. raises / on properties are cross-checked against the stage declaration like every other property
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { guarantee, pipe, read } from './compose.mjs';
import { defineGuarantee, runGuarantee } from './guarantee.mjs';
import { createRegistry, crossCheck, DEFAULT_PROPERTIES, eventReport, orderGuarantees, runGuarantees } from './registry.mjs';
import { createMemorySink } from './sinks.mjs';
import { raises, framed, gated, lane, on } from './mixins.mjs';
import { toyBoard } from './fixtures/board.mjs';
import { announcer, BLOBS_COUNTED, cycle, listener, miswired, pair } from './fixtures/fgs/events.fixture.mjs';

const ids = (fgs) => fgs.map((fg) => fg.id);
const page = framed(() => [{ title: 't', parts: [{ address: 'px.blobs', kind: 'scalar', data: { value: 1, unit: 'event' } }] }]);

test('raises declares the event, records name + payload, and never changes what the inner Composition produced', () => {
  const inner = pipe(read('px.blobs'), page);
  const result = (s) => ({ totals: { blobCount: s.parts['px.blobs'].blobs.length } });
  const plain = guarantee({ id: 'fg.toy.plain', guards: ['px.blobs'], result }, inner);
  const raiseting = guarantee({ id: 'fg.toy.plain', guards: ['px.blobs'], result },
    pipe(inner, raises('blobs.counted', { payload: (s) => ({ blobCount: s.parts['px.blobs'].blobs.length, parts: 'tampered' }) })));
  assert.deepEqual(raiseting.raises, ['blobs.counted']);
  assert.deepEqual(plain.raises, []);
  assert.ok(raiseting.properties.includes('raises:blobs.counted'));
  const a = runGuarantee(plain, { board: toyBoard(), sink: createMemorySink() }).record;
  const b = runGuarantee(raiseting, { board: toyBoard(), sink: createMemorySink() }).record;
  assert.deepEqual(b.events, [{ event: 'blobs.counted', payload: { blobCount: 4, parts: 'tampered' } }]);
  assert.deepEqual(b.raises, ['blobs.counted']);
  assert.deepEqual(b.totals, a.totals, 'same totals with and without the raise');
  assert.deepEqual(b.frames, a.frames);
  assert.equal('events' in a || 'raises' in a, false, 'a guarantee that raises nothing keeps its record byte for byte');
});

test('raises refuses a payload that is not a function, and an event name that is not a name', () => {
  assert.throws(() => raises('blobs.counted', {}), /payload\(s\) is required/);
  assert.throws(() => raises('', { payload: () => ({}) }), /event name/);
  assert.throws(() => on('has space'), /event name/);
});

test('on declares the subscription; the FG declaration is the union of its mixins', () => {
  const l = listener();
  assert.deepEqual(l.subscribes, [BLOBS_COUNTED]);
  assert.deepEqual(l.requires, [], 'a subscription names an event, never an FG id: requires stays what it was');
  assert.ok(l.properties.includes(`on:${BLOBS_COUNTED}`));
  assert.deepEqual(announcer().subscribes, []);
});

test('the smallest pair assembles and runs: the raiser first even when listed second; the subscriber hears the payload', () => {
  const [raiser, subscriber] = pair();
  const registry = createRegistry([subscriber, raiser]);
  assert.deepEqual(registry.order(), ['fg.toy.blobs.announce', 'fg.toy.blobs.listen']);
  const { records } = registry.run({ board: toyBoard(), sink: createMemorySink() });
  const heard = records['fg.toy.blobs.listen'];
  assert.equal(heard.status, 'held');
  assert.deepEqual(heard.totals, { heardCount: 1 });
  assert.deepEqual(heard.heard, [{ event: BLOBS_COUNTED, from: ['fg.toy.blobs.announce'], count: 1 }]);
  assert.ok(heard.checks.some((c) => c.name === `heard:${BLOBS_COUNTED}` && c.ok), 'a named check per subscription');
  assert.ok(heard.checks.some((c) => c.name === `expected:${BLOBS_COUNTED}` && c.ok), 'the subscriber checked the payload against its own read');
  assert.deepEqual(eventReport([raiser, subscriber]), { errors: [], warnings: [] });
});

test('subscribers of one event run in a deterministic order: id order, or the order gated pins', () => {
  const subs = ['fg.toy.sub.c', 'fg.toy.sub.a', 'fg.toy.sub.b'].map((id) => listener(id));
  const raiser = announcer();
  const expected = ['fg.toy.blobs.announce', 'fg.toy.sub.a', 'fg.toy.sub.b', 'fg.toy.sub.c'];
  for (const listing of [[raiser, ...subs], [...subs, raiser], [subs[1], raiser, subs[2], subs[0]]])
    assert.deepEqual(ids(orderGuarantees(listing)), expected);
  // gated pins an explicit order between two subscribers: b before a
  const pinned = guarantee({ id: 'fg.toy.sub.a', guards: ['px.blobs'] }, pipe(read('px.blobs'), on(BLOBS_COUNTED), gated('fg.toy.sub.b'), page));
  assert.deepEqual(ids(orderGuarantees([raiser, pinned, subs[0], subs[2]])), ['fg.toy.blobs.announce', 'fg.toy.sub.b', 'fg.toy.sub.a', 'fg.toy.sub.c']);
  const { records } = runGuarantees({ guarantees: [...subs, raiser], board: toyBoard(), sink: createMemorySink() });
  assert.deepEqual(Object.keys(records), expected, 'the record stream follows the same order');
});

test('a subscriber whose event nobody raises is flagged before anything runs, and the registry refuses to assemble it', () => {
  const fgs = miswired();
  const report = eventReport(fgs);
  assert.deepEqual(report.errors, [{ kind: 'unraised', id: 'fg.toy.blobs.typo', event: 'blobs.countd', raisedEvents: [BLOBS_COUNTED] }]);
  assert.deepEqual(report.warnings, [{ kind: 'unheard', event: BLOBS_COUNTED, raisers: ['fg.toy.blobs.announce'] }], 'the typo also leaves the real event unheard');
  const check = crossCheck(fgs, []);
  assert.deepEqual(check.mismatches.map((m) => [m.id, m.field, m.problem]), [['fg.toy.blobs.typo', 'subscribes', 'unraised']]);
  assert.deepEqual(check.eventWarnings, report.warnings);
  assert.throws(() => createRegistry(fgs), /fg\.toy\.blobs\.typo subscribes to blobs\.countd, which no registered guarantee raises/);
  assert.throws(() => runGuarantees({ guarantees: fgs, board: toyBoard(), sink: createMemorySink() }), /subscribes to blobs\.countd/);
});

test('an raised event nobody subscribes to is a warning, not an error: the assembly still runs', () => {
  const alone = [announcer()];
  assert.deepEqual(eventReport(alone), { errors: [], warnings: [{ kind: 'unheard', event: BLOBS_COUNTED, raisers: ['fg.toy.blobs.announce'] }] });
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
  const first = guarantee({ id: 'fg.toy.first', guards: ['px.blobs'] }, pipe(read('px.blobs'), raises('first.done', { payload: () => ({}) }), gated('fg.toy.second'), page));
  const second = guarantee({ id: 'fg.toy.second', guards: ['px.blobs'] }, pipe(read('px.blobs'), on('first.done'), page));
  assert.equal(eventReport([first, second]).errors[0].kind, 'cycle');
  assert.throws(() => createRegistry([first, second]), /cycle/);
  const own = pipe(read('px.blobs'), on('self.done'), raises('self.done', { payload: () => ({}) }), page);
  assert.throws(() => guarantee({ id: 'fg.toy.self', guards: ['px.blobs'] }, own), /subscribes to its own event self\.done/);
});

test('a dormant raiser makes its subscribers dormant; a live raiser beside it still delivers', () => {
  const laned = guarantee({ id: 'fg.toy.lane.announce', guards: ['px.blobs'] },
    pipe(read('px.blobs'), lane('toy-lane'), raises(BLOBS_COUNTED, { payload: () => ({ blobCount: 0 }) }), page));
  const only = runGuarantees({ guarantees: [laned, listener()], board: toyBoard(), sink: createMemorySink() });
  assert.equal(only.records['fg.toy.blobs.listen'].status, 'dormant');
  assert.match(only.records['fg.toy.blobs.listen'].reason, /blobs\.counted.*dormant/);
  const both = runGuarantees({ guarantees: [laned, announcer(), listener()], board: toyBoard(), sink: createMemorySink() });
  assert.equal(both.records['fg.toy.blobs.listen'].status, 'held');
  assert.equal(both.records['fg.toy.blobs.listen'].heard[0].count, 1, 'only the live raiser delivered');
});

test('a subscriber hears only events it declared; running one alone fails by name', () => {
  const sneaky = defineGuarantee({ id: 'fg.toy.sneaky', guards: ['px.blobs'], run: (ctx) => ({ totals: { n: ctx.heard('blobs.counted').length } }) });
  assert.throws(() => runGuarantee(sneaky, { board: toyBoard(), sink: createMemorySink() }), /heard of undeclared event blobs\.counted \(declare it in subscribes\)/);
  // a subscriber run without the registry has nothing delivered: the check names the silence, it does not pass
  assert.throws(() => runGuarantee(listener(), { board: toyBoard(), sink: createMemorySink() }), (e) => e.name === 'GuaranteeFailure' && e.failed.includes(`heard:${BLOBS_COUNTED}`));
});

test('events are cross-checked against the stage declaration like any property', () => {
  const [raiser, subscriber] = pair();
  const declaration = (fg, properties) => ({ id: fg.id, kind: 'functional-guarantee', part: 'px.blobs', appliesTo: 'every toy run', requires: ['x'], properties });
  const declared = [declaration(raiser, [`raises:${BLOBS_COUNTED}`, 'framed']), declaration(subscriber, [`on:${BLOBS_COUNTED}`, 'framed'])];
  assert.deepEqual(crossCheck([raiser, subscriber], declared).mismatches, []);
  const forgot = crossCheck([raiser, subscriber], [declaration(raiser, ['framed']), declared[1]]).mismatches;
  assert.deepEqual(forgot.map((m) => [m.id, m.field, m.missing]), [['fg.toy.blobs.announce', 'properties', [`raises:${BLOBS_COUNTED}`]]]);
});

test('the event fixtures and mixins stay browser-safe (no node:* import)', () => {
  for (const file of ['fixtures/fgs/events.fixture.mjs', 'mixins.mjs', 'registry.mjs', 'compose.mjs', 'guarantee.mjs']) {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8');
    assert.ok(!/from\s+['"]node:|import\(\s*['"]node:/.test(source), `${file} imports node:*`);
  }
});

test('a stage declaration may carry raises and subscribes; crossCheck compares them with the FG exactly like properties', () => {
  const [raiser, subscriber] = pair();
  const declaration = (fg, extra) => ({ id: fg.id, kind: 'functional-guarantee', part: 'px.blobs', appliesTo: 'every toy run', requires: ['x'], properties: fg.properties.filter((p) => !DEFAULT_PROPERTIES.includes(p)), ...extra });
  const right = [declaration(raiser, { raises: [BLOBS_COUNTED] }), declaration(subscriber, { subscribes: [BLOBS_COUNTED] })];
  assert.deepEqual(crossCheck([raiser, subscriber], right).mismatches, []);
  // absent fields are not compared: every stage JSON written before events keeps passing
  assert.deepEqual(crossCheck([raiser, subscriber], [declaration(raiser, {}), declaration(subscriber, {})]).mismatches, []);
  // declared but not raised / raised but not declared, by event name
  const drift = crossCheck([raiser, subscriber], [declaration(raiser, { raises: ['blobs.other'] }), declaration(subscriber, { subscribes: [BLOBS_COUNTED, 'blobs.extra'] })]).mismatches;
  assert.deepEqual(drift.map((m) => [m.id, m.field, m.missing, m.undeclaredInCode]), [
    ['fg.toy.blobs.announce', 'raises', [BLOBS_COUNTED], ['blobs.other']],
    ['fg.toy.blobs.listen', 'subscribes', [], ['blobs.extra']]
  ]);
  // an explicit empty list is a declaration: this FG raises nothing, and it does
  assert.equal(crossCheck([raiser, subscriber], [declaration(raiser, { raises: [] }), right[1]]).mismatches[0].field, 'raises');
  // a set, not a sequence: the stage may list them in reading order
  const two = guarantee({ id: 'fg.toy.two', guards: ['px.blobs'] }, pipe(read('px.blobs'), raises('b.done', { payload: () => ({}) }), raises('a.done', { payload: () => ({}) }), page));
  assert.deepEqual(crossCheck([two], [declaration(two, { raises: ['a.done', 'b.done'] })]).mismatches, []);
});
