import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadS7Lanes } from './run.mjs';
import { holesView } from './traceSpace.mjs';

// review R12: a tee ray rounded to 2 decimals moved the tee cap start and the bend axis (lenard 17: (0.07, 1.0), not unit)
test('S7 reads the association tee ray unrounded, from the AA pose angle, with the association sense', () => {
  const out = mkdtempSync(join(tmpdir(), 's7in-'));
  try {
    mkdirSync(join(out, 's3assoc'), { recursive: true }); mkdirSync(join(out, 'early', 'artifacts', 's2'), { recursive: true });
    writeFileSync(join(out, 'early', 'artifacts', 's2', 'px.baskets.json'), JSON.stringify({ baskets: [{ index: 0, bbox: [100, 100, 46, 72] }] }));
    const rows = [{ tee: 'Tee ca', center: [10, 20], thDeg: 86.28, pose: { cx: 10, cy: 20, thDeg: 86.2766 }, best: { badge: '17', sense: -1, z: 0, latPx: 0 }, verdict: 'ok', straight3: null }];
    writeFileSync(join(out, 's3assoc', 'px.tees.association.json'), JSON.stringify({ specimen: 'toy', attempt: 'toy', template: { L: 18, W: 12 }, rows }));
    const a = loadS7Lanes({ out, upperRowsRemoved: 0, values: {} })['tk.s7.association'];
    const u = a.holes['17'].u, th = (86.2766 * Math.PI) / 180;
    assert.ok(Math.abs(u[0] + Math.cos(th)) < 1e-12 && Math.abs(u[1] + Math.sin(th)) < 1e-12, JSON.stringify(u));
    assert.ok(Math.abs(Math.hypot(...u) - 1) < 1e-12);
  } finally { rmSync(out, { recursive: true, force: true }); }
});

test('S4 recovered tees: the ray toward the badge is unrounded and unit length', () => {
  const v = holesView({ badges: [{ label: '3', bbox: [200, 10, 20, 20] }], baskets: [], recoveredBoxes: [], association: { holes: {} },
    recovered: { source: 'toy', tees: [{ hole: '3', center: [100, 100], angleRad: -0.7123 }] } });
  const u = v.holes[0].tee.u;
  assert.ok(Math.abs(Math.hypot(...u) - 1) < 1e-12, JSON.stringify(u));
  assert.ok(Math.abs(u[0] - Math.cos(-0.7123)) < 1e-12);   // the badge lies along +u
});
