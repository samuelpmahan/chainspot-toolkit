// The graduation proof over real inputs (ports/s7route/prove.mjs), on the dev courses of docs/evidence/dev-s1s4/ATTEMPTS:
//   sensor   fn.q.route.sensor equals match2.py's sensor() on 20 random routes to 1e-9, BasketPoints to 1e-9 px, against
//            fixtures/sensor-<course>.fixture.json, written by match2.py's own code on the attempt it names
//            (fixture_sensor.py); a fixture made on another attempt than ATTEMPTS names is skipped and says so
//   matrix   (S7ROUTE_PROVE_MATRIX=1; minutes per course) both route matrices against fixtures/match2- and match18-<course>,
//            on the attempt those fixtures name
// Attempts are read from <repo>/attempts/stages, or CHAINSPOT_ATTEMPTS_ROOT/attempts/stages (a worktree reading the main
// checkout's attempts, read only). A course whose attempt is not on this machine is skipped, never failed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { prove, fixtureFile, sensorFixtureFile } from './prove.mjs';

const ROOT = join(import.meta.dirname, '..', '..');
const ATTEMPTS_ROOT = process.env.CHAINSPOT_ATTEMPTS_ROOT ?? ROOT;
const ATTEMPTS = readFileSync(join(ROOT, 'docs/evidence/dev-s1s4/ATTEMPTS'), 'utf8').trim().split('\n').map((l) => l.split(' '));
const onMachine = (attempt) => existsSync(join(ATTEMPTS_ROOT, 'attempts/stages', attempt, 'fork/stage-output/early/s3.pxc.bin'));
const fixtureAttempt = (f) => (existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')).attempt ?? null : null);

for (const [course, attempt] of ATTEMPTS) {
  const f = sensorFixtureFile(course), made = fixtureAttempt(f);
  const skip = !made ? `no sensor fixture for ${course}` : made !== attempt ? `sensor fixture made on ${made}, ATTEMPTS names ${attempt} (rerun fixture_sensor.py)`
    : !onMachine(attempt) ? `attempt ${attempt} is not on this machine (set CHAINSPOT_ATTEMPTS_ROOT)` : false;
  test(`${course}: the hallway sensor equals match2.py's sensor() on ${attempt}`, { skip }, () => {
    const r = prove({ specimen: course, attempt, attemptsRoot: ATTEMPTS_ROOT, matrix: false, fixturePath: f });
    assert.ok(r.basketPointsMaxDiffPx <= 1e-9, `BasketPoints differ by ${r.basketPointsMaxDiffPx} px`);
    assert.ok(r.sensor.stationsEqual && r.sensor.maxDiff <= 1e-9, JSON.stringify(r.sensor.rows.filter((x) => x.diff > 1e-9 || x.pyStations !== x.jsStations)));
  });
}

if (process.env.S7ROUTE_PROVE_MATRIX === '1') for (const [course] of ATTEMPTS) {
  const made = fixtureAttempt(fixtureFile(course));
  test(`${course}: the route matrices equal match2.py's and match18.py's`, { skip: !made ? `no matrix fixture for ${course}` : !onMachine(made) ? `matrix fixture attempt ${made} is not on this machine` : false }, () => {
    const r = prove({ specimen: course, attempt: made, attemptsRoot: ATTEMPTS_ROOT, matrix: true });
    assert.ok(r.ok, JSON.stringify({ widthPx: r.widthPx, startsMaxDiff: r.startsMaxDiff, sensorMatrix: r.sensorMatrix, contrastMatrix: r.contrastMatrix, recorded: r.recorded }));
  });
}
