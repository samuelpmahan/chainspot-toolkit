// Every implementation in impl/<slot>/ loads and exports a function: a variant that does not parse would otherwise only
// fail when a runner discovers it (2026-10-20: three routeMatch rule sets shipped with a syntax error).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = import.meta.dirname, IMPL = join(ROOT, 'impl');
for (const slot of readdirSync(IMPL, { withFileTypes: true }).filter((d) => d.isDirectory())) {
  for (const f of readdirSync(join(IMPL, slot.name)).filter((n) => n.endsWith('.mjs'))) {
    test(`impl/${slot.name}/${f} loads and exports a default function`, async () => {
      const m = await import(pathToFileURL(join(IMPL, slot.name, f)).href);
      assert.equal(typeof m.default, 'function');
    });
  }
}
