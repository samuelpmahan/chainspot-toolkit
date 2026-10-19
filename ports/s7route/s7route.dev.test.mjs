// The graduation proof over real inputs (ports/s7route/prove.mjs): on every dev course whose attempt is on this machine
// and whose prototype fixture exists, fn.q.route.sensor equals match2.py's sensor() on 20 random routes to 1e-9. The
// full matrix proof (minutes per course) runs with S7ROUTE_PROVE_MATRIX=1. A course without its attempt is skipped.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { prove, fixtureFile } from './prove.mjs';

const ROOT = join(import.meta.dirname, '..', '..');
const ATTEMPTS = readFileSync(join(ROOT, 'docs/evidence/dev-s1s4/ATTEMPTS'), 'utf8').trim().split('\n').map((l) => l.split(' '));
const matrix = process.env.S7ROUTE_PROVE_MATRIX === '1';
for (const [course, attempt] of ATTEMPTS) {
  const snap = join(ROOT, 'attempts/stages', attempt, 'fork/stage-output/early/s3.pxc.bin');
  const skip = !existsSync(fixtureFile(course)) ? `no match2.py fixture for ${course}` : !existsSync(snap) ? `attempt ${attempt} is not on this machine` : false;
  test(`${course}: the hallway sensor equals match2.py's sensor()${matrix ? ' and the route matrix equals its matrix' : ''}`, { skip }, () => {
    const r = prove({ specimen: course, attempt, matrix });
    assert.ok(r.basketPointsMaxDiffPx <= 1e-9, `BasketPoints differ by ${r.basketPointsMaxDiffPx} px`);
    assert.ok(r.sensor.stationsEqual && r.sensor.maxDiff <= 1e-9, JSON.stringify(r.sensor.rows.filter((x) => x.diff > 1e-9 || x.pyStations !== x.jsStations)));
    if (matrix) assert.ok(r.ok, JSON.stringify({ widthPx: r.widthPx, startsMaxDiff: r.startsMaxDiff, matrix: r.matrix }));
  });
}
