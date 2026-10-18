#!/usr/bin/env node
/**
 * The guide for working in the PxC system: it never blocks, it shows the way and writes the shape.
 *
 *   node scripts/pxc.mjs explain [topic]                  the matching docs/agents page (no topic: the index)
 *   node scripts/pxc.mjs doctor                           boundary debt across ports/ fg/ impl/, with fixes
 *   node scripts/pxc.mjs doctor <file.mjs>                the lines in one file, with the fix for each
 *   node scripts/pxc.mjs doctor --attempt <id>            that run's PxC: Parts that do not render; Calculations without emits
 *   node scripts/pxc.mjs scaffold query <family>          fg/queries/<family>.mjs + test (fn.q.<family>.*)
 *   node scripts/pxc.mjs scaffold calculation <dir> <name>   <dir>/<name>.calc.mjs + test (a Calculation with emits)
 *   node scripts/pxc.mjs scaffold mixin <name>            fg/mixins.<name>.mjs + test (an FG property)
 * Scaffolds never overwrite a file.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { deserialize } from 'node:v8';
import { ROOT, measure, measureFile, FIX } from './pxc/boundary.mjs';

const [cmd, ...rest] = process.argv.slice(2);
process.stdout.on('error', (e) => { if (e.code === 'EPIPE') process.exit(0); throw e; });   // `| head` is fine
const say = (s = '') => process.stdout.write(s + '\n');
const write = (rel, text) => {
  const p = join(ROOT, rel);
  if (existsSync(p)) { say(`  exists, left as is: ${rel}`); return false; }
  mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, text); say(`  wrote ${rel}`); return true;
};
const camel = (s) => s.replace(/[-_ ]+(\w)/g, (_, c) => c.toUpperCase());

function explain(topic) {
  const f = join(ROOT, 'docs/agents', `${topic ?? 'README'}.md`);
  if (!existsSync(f)) { say(`no page '${topic}'.`); return explain(); }
  say(readFileSync(f, 'utf8'));
}

function doctor(args) {
  const at = args.indexOf('--attempt');
  if (at >= 0) return doctorAttempt(args[at + 1]);
  if (args[0]) {
    const m = measureFile(args[0]);
    if (!Object.keys(m).length) return say(`${args[0]}: nothing outside the boundary.`);
    for (const [k, v] of Object.entries(m)) say(`${args[0]}: ${k} at lines ${v.lines.join(', ')}\n  fix: ${FIX[k]}`);
    return;
  }
  const now = measure(), base = existsSync(join(ROOT, 'architecture.ratchet.json')) ? JSON.parse(readFileSync(join(ROOT, 'architecture.ratchet.json'), 'utf8')).files : {};
  say('Boundary debt (advisory: prototype freely; graduate working code - `node scripts/pxc.mjs explain prototyping`)\n');
  for (const [f, c] of Object.entries(now)) say(`  ${f.padEnd(52)} ${Object.entries(c).map(([k, n]) => `${k} ${n}${base[f]?.[k] !== undefined && base[f][k] !== n ? ` (was ${base[f][k]})` : ''}`).join(', ')}`);
  say(`\nFixes:\n  artifactReads: ${FIX.artifactReads}\n  pixelLoops:    ${FIX.pixelLoops}\nPer file: node scripts/pxc.mjs doctor <file>`);
}

async function doctorAttempt(id) {
  const snap = join(ROOT, 'attempts/stages', id, 'fork/stage-output/early/s3.pxc.bin');
  if (!existsSync(snap)) return say(`no PxC snapshot for ${id} (${relative(ROOT, snap)})`);
  const { renderValue } = await import('../fg/render.mjs');
  const pxc = new Map(deserialize(readFileSync(snap))), img = pxc.get('px.image.cropped');
  const bad = [...pxc].map(([a, v]) => [a, renderValue(a, v, img)]).filter(([, r]) => r.kind === 'unrenderable' || !r.parts.length);
  say(`renderable: ${pxc.size - bad.length}/${pxc.size} Parts render${bad.length ? `; not: ${bad.map(([a]) => a).join(', ')} (add a case in fg/render.mjs)` : ''}`);
  for (const side of ['early/instrumentation.json']) {
    const f = join(ROOT, 'attempts/stages', id, 'fork/stage-output', side);
    if (!existsSync(f)) continue;
    const doc = JSON.parse(readFileSync(f, 'utf8')), seen = new Map();
    for (const e of doc.calculations ?? []) { const s = seen.get(e.calculation) ?? { calls: 0, emits: 0, ms: 0 }; s.calls++; s.ms += e.elapsedMs ?? 0; if (e.emits) s.emits++; seen.set(e.calculation, s); }
    const quiet = [...seen].filter(([, s]) => !s.emits).sort((a, b) => b[1].ms - a[1].ms).slice(0, 12);
    say(`profiled: ${seen.size} Calculations in ${side}; the costliest without emits (add measures to their output's emits):`);
    for (const [fn, s] of quiet) say(`  ${fn.padEnd(44)} ${s.calls}x ${Math.round(s.ms)} ms`);
  }
}

function scaffold([kind, ...a]) {
  if (kind === 'query') {
    const family = a[0]; if (!family) return say('usage: scaffold query <family>');
    const T = `${camel(family).toUpperCase()}_QUERIES`;
    write(`fg/queries/${family}.mjs`, `/**
 * fn.q.${family}.*: ${family} math, written once behind the PxC boundary (docs/agents/boundary.md). Code outside asks
 * by Part address; register with registerQueries(store, ${T}) where the store is built. Every answer is { value,
 * unit }; registerQueries caches it by its arguments and profiles each call.
 */
export const ${T} = Object.freeze({
  // arguments that are strings are Part references, resolved before the math runs (a PixelSet, a Part value, ...)
  'fn.q.${family}.example': ({ a }) => ({ value: Array.isArray(a) ? a.length : 1, unit: 'count (items)' })
});
`);
    write(`fg/queries/${family}.test.mjs`, `import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPartStore, registerQueries } from '../store.mjs';
import { renderValue } from '../render.mjs';
import { ${T} } from './${family}.mjs';

// The same structure for every query family: answers are unitful, cached, profiled, and the value renders.
test('fn.q.${family}.*: unitful, cached, profiled, renderable', () => {
  const store = createPartStore({ base: { has: (x) => x === 'px.example', get: () => [{ px: [1, 2] }, { px: [3] }] } });
  registerQueries(store, ${T});
  for (const fn of Object.keys(${T})) {
    const first = store.call(fn, { a: 'px.example' }), again = store.call(fn, { a: 'px.example' });
    assert.equal(typeof first.unit, 'string', \`\${fn} answers with a unit\`);
    assert.deepEqual(again.emits, { cached: 1 }, \`\${fn} answers the same question once\`);
    assert.notEqual(renderValue(fn, first.value).kind, 'unrenderable', \`\${fn}'s value renders\`);
  }
  assert.ok(store.calls().some((e) => e.calculation.startsWith('fn.q.${family}.')), 'every call is profiled');
});
`);
    return say(`next: replace the example with your math; register: registerQueries(store, ${T}) (import from 'fg/queries/${family}.mjs').`);
  }
  if (kind === 'calculation') {
    const [dir, name] = a; if (!dir || !name) return say('usage: scaffold calculation <dir> <name>');
    const fn = `fn.tk.${name}`, out = `tk.${name}`;
    write(join(dir, `${name}.calc.mjs`), `/**
 * ${fn} -> ${out} (docs/agents/calculations.md). Register: store.register(...${camel(name)}). Profiled by default: put
 * measures in emits (unit-bearing names). Total: record data conditions in the value, never throw on them. Pure:
 * never mutate an input Part. Lazy: declare what you read as inParts.
 */
export const ${camel(name)} = ['${fn}', {
  inParts: ['px.image.cropped'], outParts: ['${out}'],
  calculate: (io) => {
    const img = io.in('px.image.cropped');
    const value = { widthPx: img.widthPx, heightPx: img.heightPx };   // replace with the computation
    return { '${out}': { ...value, emits: { rasterPx: img.widthPx * img.heightPx } } };
  }
}];
`);
    write(join(dir, `${name}.calc.test.mjs`), `import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPartStore, RENDER_PART } from '${relative(join(ROOT, dir), join(ROOT, 'fg/store.mjs'))}';
import { ${camel(name)} } from './${name}.calc.mjs';

test('${fn}: produces ${out}, emits its measures, renders', () => {
  const img = { widthPx: 4, heightPx: 2, rgba: new Uint8Array(32) };
  const store = createPartStore({ base: { has: (x) => x === 'px.image.cropped', get: () => img } });
  store.register(...${camel(name)});
  assert.ok(store.get('${out}'));
  assert.ok(store.calls().find((e) => e.calculation === '${fn}').emits, 'emits recorded by the store');
  assert.notEqual(store.call(RENDER_PART, { a: '${out}' }).value.kind, 'unrenderable');
});
`);
    return say('next: write the computation; keep pixel math in a query (scaffold query) and call it.');
  }
  if (kind === 'mixin') {
    const name = a[0]; if (!name) return say('usage: scaffold mixin <name>');
    write(`fg/mixins.${name}.mjs`, `/**
 * ${name}: an FG property (docs/agents/fg.md). (Composition) => Composition: it runs after the inner composition and
 * adds checks / frames / record fields (via s.out, with units via s.units); it never changes a produced value.
 * Compose it with pipe(...); declare '${name}' in the FG's stages/*.json properties (the registry test checks it).
 */
import { decorator } from './compose.mjs';

export const ${camel(name)} = decorator({
  name: '${name}', property: '${name}', reads: [], calls: [],
  after: (env, s) => {
    env.check('${name}', true, {});   // replace with the property's check
    return { out: { ...(s.out ?? {}) }, units: { ...(s.units ?? {}) } };
  }
});
`);
    write(`fg/mixins.${name}.test.mjs`, `import { test } from 'node:test';
import assert from 'node:assert/strict';
import { guarantee, pipe, calc } from './compose.mjs';
import { framed } from './mixins.mjs';
import { runGuarantee } from './guarantee.mjs';
import { createMemorySink } from './sinks.mjs';
import { createPartStore } from './store.mjs';
import { ${camel(name)} } from './mixins.${name}.mjs';

test('${name} composes onto any FG and keeps the defaults', () => {
  const store = createPartStore({}); store.register('fn.t.work', { calculate: () => ({ ok: true }) });
  const fg = guarantee({ id: 'fg.test.${name}', guards: ['t'] }, pipe(calc('fn.t.work'), framed(() => [{ title: 't', parts: [{ address: 't', kind: 'scalar', data: { value: 1 } }] }]), ${camel(name)}));
  const { record } = runGuarantee(fg, { store, sink: createMemorySink() });
  assert.ok(record.properties.includes('${name}') && record.properties.includes('profiled'));
});
`);
    return say(`next: write the check; add '${name}' to the FG's properties in stages/*.json.`);
  }
  say('usage: scaffold query <family> | calculation <dir> <name> | mixin <name>');
}

if (cmd === 'explain') explain(rest[0]);
else if (cmd === 'doctor') await doctor(rest);
else if (cmd === 'scaffold') scaffold(rest);
else say(readFileSync(new URL(import.meta.url)).toString().split('*/')[0].split('\n').slice(2).map((l) => l.replace(/^ \* ?/, '')).join('\n'));
