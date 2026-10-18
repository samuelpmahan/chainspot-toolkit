// renderable over real inputs: EVERY Part of every dev course's S3 PxC renders (same test, any input; a course whose
// attempt is not on this machine is skipped, never failed).
import { test } from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import { deserialize } from 'node:v8';
import { join } from 'node:path';
import { assertRenders } from './render.test.mjs';

const ROOT = join(import.meta.dirname, '..');
const ATTEMPTS = existsSync(join(ROOT, 'docs/evidence/dev-s1s4/ATTEMPTS'))
  ? readFileSync(join(ROOT, 'docs/evidence/dev-s1s4/ATTEMPTS'), 'utf8').trim().split('\n').map((l) => l.split(' ')) : [];
for (const [course, attempt] of ATTEMPTS) {
  const snap = join(ROOT, 'attempts/stages', attempt, 'fork/stage-output/early/s3.pxc.bin');
  test(`every Part of ${course}'s S3 PxC renders`, { skip: existsSync(snap) ? false : `attempt ${attempt} is not on this machine` }, () => {
    const pxc = new Map(deserialize(readFileSync(snap))), img = pxc.get('px.image.cropped');
    for (const [address, value] of pxc) assertRenders(address, value, img);
  });
}
