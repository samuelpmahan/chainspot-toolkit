/**
 * Event FG fixtures (browser-safe): FunctionalGuarantees wired by raises / on (fg/mixins.mjs).
 *
 * These are factories in one module, NOT *.fg.mjs files: fg/discover.mjs loads every *.fg.mjs under fg/fixtures/fgs, and
 * the discovery tests pin that set. A miswired or cyclic assembly must never be discoverable by accident.
 *
 *   pair()      the smallest raiser + subscriber that assembles and runs: the raiser announces how many blobs it
 *               saw, the subscriber hears the count and checks it against its own read of the same Part
 *   miswired()  a subscriber to an event nobody raises (a typo of the pair's event): must fail the cross-check
 *   cycle()     two FGs each subscribed to the other's event: must fail the cross-check
 */
import { guarantee, pipe, read } from '../../compose.mjs';
import { raises, framed, on } from '../../mixins.mjs';

export const BLOBS_COUNTED = 'blobs.counted';
const page = (title) => framed(() => [{ title, parts: [{ address: 'px.blobs', kind: 'scalar', data: { value: 1, unit: 'event' } }] }]);

export const announcer = () => guarantee({ id: 'fg.toy.blobs.announce', guards: ['px.blobs'] },
  pipe(read('px.blobs'),
    raises(BLOBS_COUNTED, { payload: (s) => ({ blobCount: s.parts['px.blobs'].blobs.length }) }),
    page('announced blobs.counted')));

/** Hears the event and checks the announced count against its own read of the Part. */
export const listener = (id = 'fg.toy.blobs.listen', event = BLOBS_COUNTED) => guarantee({ id, guards: ['px.blobs'], result: (s) => ({ totals: { heardCount: (s.heard[event] ?? []).length } }) },
  pipe(read('px.blobs'),
    on(event, { expect: (heard, s) => heard.every(({ payload }) => payload.blobCount === s.parts['px.blobs'].blobs.length) }),
    page(`heard ${event}`)));

export const pair = () => [announcer(), listener()];

export const miswired = () => [announcer(), listener('fg.toy.blobs.typo', 'blobs.countd')];

export const cycle = () => [
  guarantee({ id: 'fg.toy.ping', guards: ['px.blobs'] }, pipe(read('px.blobs'), on('pong.done'), raises('ping.done', { payload: () => ({ roundCount: 1 }) }), page('ping'))),
  guarantee({ id: 'fg.toy.pong', guards: ['px.blobs'] }, pipe(read('px.blobs'), on('ping.done'), raises('pong.done', { payload: () => ({ roundCount: 1 }) }), page('pong')))
];
