// The basket frame shape asked of fn.q.sprite.overlap (fg/s2/shellShape.mjs, what toolkit runs use) is the pinned provider's
// own Basket.learnShellShape, on every dev course's board: same source, margins and frame px (a course whose attempt is not
// on this machine is skipped, never failed).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { deserialize } from '../pxcCodec.mjs';   // node:v8 with packed typed arrays
import { join } from 'node:path';
import { createPartStore, registerQueries } from '../store.mjs';
import { registerSpriteQueries } from '../queries/sprite.mjs';
import { SHELL_QUERY, shellOverlapArgs, shellShapeOf } from './shellShape.mjs';

const ROOT = join(import.meta.dirname, '../..');
const require = createRequire(import.meta.url);
const ALG = join(ROOT, 'source/provider/packages/alg/dist');
const { registerBasket, BasketFn } = require(join(ALG, 'stages/S2/clean/Basket.js'));
const { extractComponents } = require(join(ALG, 'detectors/threeFactor/components.js'));
const prior = require(join(ALG, 'detectors/threeFactor/assets/basket-shell.json'));
const calcs = new Map(); registerBasket({ register: (fn, calculate) => calcs.set(fn.address, calculate) });
const ATTEMPTS = existsSync(join(ROOT, 'docs/evidence/dev-s1s4/ATTEMPTS'))
  ? readFileSync(join(ROOT, 'docs/evidence/dev-s1s4/ATTEMPTS'), 'utf8').trim().split('\n').map((l) => l.split(' ')) : [];
for (const [course, attempt] of ATTEMPTS) {
  const snap = join(ROOT, 'attempts/stages', attempt, 'fork/stage-output/early/s3.pxc.bin');
  test(`${course}: the queried basket frame shape is the provider's`, { skip: existsSync(snap) ? false : `attempt ${attempt} is not on this machine` }, () => {
    const board = new Map(deserialize(readFileSync(snap)));
    const store = createPartStore({ base: { has: (a) => board.has(a), get: (a) => board.get(a) }, name: course });
    registerSpriteQueries(store, registerQueries);
    const family = board.get('px.baskets.family'), fields = board.get('px.components');
    const queried = shellShapeOf(family, store.call(SHELL_QUERY, shellOverlapArgs(family)).value, prior, extractComponents);
    const pinned = calcs.get(BasketFn.learnShellShape.address)({ family, fields });
    assert.equal(queried.source, pinned.source);
    assert.deepEqual([...queried.margins], [...pinned.margins]);
    assert.deepEqual([...queried.shellOffsets], [...pinned.shellOffsets]);
    assert.deepEqual([...queried.overlap.agree], [...pinned.overlap.agree]);
    assert.deepEqual(queried.comparison, pinned.comparison);
  });
}
