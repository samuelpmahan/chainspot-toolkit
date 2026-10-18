// Architecture, ADVISORY (Sam, 2026-10-18: guide, don't restrict prototyping). Reports, never fails: how much code still
// reads artifact files or loops over raster pixels outside the PxC boundary, against architecture.ratchet.json (the
// last recorded baseline). Guidance with exact fixes: `node scripts/pxc.mjs doctor`. Prototype freely; graduate code
// into the boundary when it works. After paying debt: UPDATE_RATCHET=1 node --test architecture.test.mjs.
import { test } from 'node:test';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, measure } from './scripts/pxc/boundary.mjs';

test('PxC boundary report (advisory)', (t) => {
  const file = join(ROOT, 'architecture.ratchet.json'), now = measure();
  if (process.env.UPDATE_RATCHET || !existsSync(file)) writeFileSync(file, JSON.stringify({ rule: 'baseline of boundary debt (advisory; scripts/pxc.mjs doctor)', files: now }, null, 1) + '\n');
  const base = JSON.parse(readFileSync(file, 'utf8')).files;
  const sum = (m) => Object.values(m).reduce((n, c) => n + Object.values(c).reduce((a, b) => a + b, 0), 0);
  const grew = Object.entries(now).filter(([f, c]) => Object.entries(c).some(([k, n]) => n > (base[f]?.[k] ?? 0))).map(([f]) => f);
  t.diagnostic(`boundary debt: ${sum(now)} sites in ${Object.keys(now).length} files (baseline ${sum(base)})${grew.length ? `; grew in: ${grew.join(', ')} (see node scripts/pxc.mjs doctor)` : ''}`);
});
