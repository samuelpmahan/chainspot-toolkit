import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve, relative, dirname } from 'node:path';
import { STAGE_RUNTIME } from '../recipes/closure.mjs';

// A stage fork holds only STAGE_RUNTIME (recipes/closure.mjs). fg/render.mjs runs inside every fork, so everything it imports,
// transitively, must live inside that closure: the E17 render case once imported ports/s7trace/traceView.mjs and every new
// `toolkit.mjs run` died with ERR_MODULE_NOT_FOUND.
const ROOT = resolve(import.meta.dirname, '..');
const inClosure = (rel) => STAGE_RUNTIME.some((p) => rel === p || rel.startsWith(`${p}/`));
test('fg/render.mjs imports only files inside the stage runtime closure', () => {
  const seen = new Set(), todo = [join(ROOT, 'fg/render.mjs')], outside = [];
  while (todo.length) {
    const f = todo.pop(); if (seen.has(f)) continue; seen.add(f);
    const rel = relative(ROOT, f);
    if (!inClosure(rel)) { outside.push(rel); continue; }
    for (const m of readFileSync(f, 'utf8').matchAll(/(?:^|\n)\s*(?:import|export)\s[^'"\n]*?from\s+'(\.[^']+)'|import\('(\.[^']+)'\)/g)) {
      const t = resolve(dirname(f), m[1] ?? m[2]); if (existsSync(t) && t.endsWith('.mjs')) todo.push(t);
    }
  }
  assert.deepEqual(outside, [], `outside the closure: ${outside.join(', ')}`);
});
