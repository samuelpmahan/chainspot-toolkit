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
 *   node scripts/pxc.mjs shot <file.html> <outdir> "<hash>"...   full-page screenshots of a render at deep links (inspector)
 *   node scripts/pxc.mjs state [--retest [all]] [--jobs N] [--freeze] [--json]   every stage on every dev course: goal, expected,
 *                                                         result, status (derived), freshness; retest re-runs only stale cells
 *   node scripts/pxc.mjs profile --attempt <id> [--top N]  each stage's latest run: wall, inside/outside the store, the
 *                                                         costliest Calculations by self time, opaque hot spots
 *   node scripts/pxc.mjs sweep --grid <spec.json> [--courses a,b] [--jobs N] [--chunk N] [--id ID] [--dry-run]
 *                                                         S7 grid search over the feature registry (ports/s7route/features.mjs):
 *                                                         every config x course (dev with testimony + validation views, S7 only),
 *                                                         resumable; results, Pareto front and shortlist under attempts/sweeps/<id>/
 *   node scripts/pxc.mjs sweep --registry                 the S7 features and knobs (unit, default, sweep values, assumption)
 *   node scripts/pxc.mjs clean [--dry-run]                delete the attempts and sweeps THIS checkout created (never another's,
 *                                                         never one an ATTEMPTS file lists or docs/evidence cites)
 *   node scripts/pxc.mjs provenance [--repin]           the bundled provider's pinned src/dist hashes: verify, or re-pin after a
 *                                                         provider change (in a conflicted merge, unions both sides' localPatches)
 *   node scripts/pxc.mjs cas --stats                     the persistent cache (attempts/cas): entries, size, age, largest
 *   node scripts/pxc.mjs cas --prune-older-than DAYS      remove entries nothing has used for DAYS days
 *   node scripts/pxc.mjs prune [--dry-run] [--root DIR] [--hours 12] [--json]   delete attempts not in the dev ATTEMPTS
 *                                                         (or modified in the last 12 h) and, inside kept ones, every run
 *                                                         but the latest, latest complete and evidence-named per stage;
 *                                                         prints the bytes freed (ports/state/prune.mjs)
 *   node scripts/pxc.mjs flipbook --inline <x.flipbook.html> [out.html]   one self-contained copy of a run's flipbook
 *                                                         (its img/ files as data: URLs) for sharing a single file
 * Scaffolds never overwrite a file.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { deserialize } from '../fg/pxcCodec.mjs';   // node:v8 with packed typed arrays
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

/** pxc profile --attempt <id>: every stage's latest profiled run (instrumentation.json), self time first. */
async function profileAttempt(id, top = 8) {
  const { profileLines } = await import('../fg/profile.mjs');
  const outRoot = join(ROOT, 'attempts/stages', id, 'fork/stage-output');
  if (!existsSync(outRoot)) return say(`no stage output for ${id} (${relative(ROOT, outRoot)})`);
  const latest = [];
  for (const n of readdirSync(outRoot, { withFileTypes: true })) {
    if (!n.isDirectory()) continue;
    const d = join(outRoot, n.name);
    if (existsSync(join(d, 'instrumentation.json'))) latest.push([n.name, join(d, 'instrumentation.json')]);
    const runs = readdirSync(d).filter((r) => r.startsWith('run-') && existsSync(join(d, r, 'instrumentation.json'))).sort();
    if (runs.length) latest.push([`${n.name}/${runs.at(-1)}${runs.length > 1 ? ` (latest of ${runs.length})` : ''}`, join(d, runs.at(-1), 'instrumentation.json')]);
  }
  if (!latest.length) return say(`no profiled runs under ${relative(ROOT, outRoot)}`);
  for (const [name, f] of latest) { for (const l of profileLines(JSON.parse(readFileSync(f, 'utf8')), { top, title: name })) say(l); say(); }
}

async function doctorAttempt(id) {
  const snap = join(ROOT, 'attempts/stages', id, 'fork/stage-output/early/s3.pxc.bin');
  if (!existsSync(snap)) return say(`no PxC snapshot for ${id} (${relative(ROOT, snap)})`);
  const { renderValue } = await import('../fg/render.mjs');
  const pxc = new Map(deserialize(readFileSync(snap))), img = pxc.get('px.image.cropped');
  const bad = [...pxc].map(([a, v]) => [a, renderValue(a, v, img)]).filter(([, r]) => r.kind === 'unrenderable' || !r.parts.length);
  say(`renderable: ${pxc.size - bad.length}/${pxc.size} Parts render${bad.length ? `; not: ${bad.map(([a]) => a).join(', ')} (add a case in fg/render.mjs)` : ''}`);
  const { opaqueHotSpots, hotSpotLines } = await import('../fg/profile.mjs');
  const outRoot = join(ROOT, 'attempts/stages', id, 'fork/stage-output');
  const sidecars = []; const walk = (d) => { for (const n of readdirSync(d, { withFileTypes: true })) { const p = join(d, n.name); if (n.isDirectory()) walk(p); else if (n.name === 'instrumentation.json') sidecars.push(p); } };
  if (existsSync(outRoot)) walk(outRoot);
  let spots = 0;
  for (const f of sidecars) { const lines = hotSpotLines(opaqueHotSpots(JSON.parse(readFileSync(f, 'utf8')))); spots += lines.length; for (const l of lines) say(`${relative(outRoot, f)}: ${l}`); }
  say(spots ? `${spots} opaque hot spot(s) in ${sidecars.length} profiled runs` : `no opaque hot spots in ${sidecars.length} profiled runs`);
  // stated assumptions a search hit (fg/assumptions.mjs): loud, with what the widening found
  const { assumptionViolations, assumptionLines } = await import('../fg/assumptions.mjs');
  let violated = 0;
  for (const f of sidecars) { const lines = assumptionLines(assumptionViolations(JSON.parse(readFileSync(f, 'utf8')))); violated += lines.length; for (const l of lines) say(`${relative(outRoot, f)}: ${l}`); }
  say(violated ? `${violated} assumption violation row(s) in ${sidecars.length} profiled runs` : `no assumption violations in ${sidecars.length} profiled runs`);
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
else if (cmd === 'cas') {
  const cas = await import('../fg/cas.mjs'), i = rest.indexOf('--prune-older-than');
  if (i >= 0) { const days = Number(rest[i + 1]); if (!(days >= 0)) say('usage: cas --prune-older-than DAYS'); else say(JSON.stringify(cas.casPrune({ days }), null, 1)); }
  else if (rest.includes('--stats')) say(JSON.stringify(cas.casStats(), null, 1));
  else say('usage: cas --stats | --prune-older-than DAYS');
}
else if (cmd === 'prune') (await import('../ports/state/prune.mjs')).pruneCommand(rest, { say });
else if (cmd === 'clean') (await import('../ports/state/prune.mjs')).cleanCommand(rest, { say });
else if (cmd === 'sweep' && rest.includes('--registry')) {
  const { registryRows } = await import('../ports/s7route/features.mjs'), fmt = (v) => (typeof v === 'number' ? +v.toFixed(4) : v === null ? 'null' : v);
  for (const r of registryRows()) say(r.knob ? `    ${r.knob.padEnd(14)} ${r.unit.padEnd(6)} default ${String(fmt(r.default)).padEnd(10)} sweep ${(r.sweep ?? []).map(fmt).join('/')}${r.assumption ? `  [assumption ${r.assumption}]` : ''}`
    : `${r.feature} (${r.kind}, ${r.required ? 'required' : r.enabled ? 'on' : 'off'}${r.needs ? `; ${r.needs}` : ''}${r.conflicts.length ? `; conflicts ${r.conflicts.join(', ')}` : ''}${r.assumptions.length ? `; assumptions ${r.assumptions.join(', ')}` : ''})`);
}
else if (cmd === 'sweep') { const r = await (await import('../ports/s7trace/gridSweep.mjs')).sweepCommand(rest); if (!r) process.exitCode = 2; }
else if (cmd === 'provenance') { const r = (await import('../dependencies/provenance.mjs')).provenance((await import('./pxc/boundary.mjs')).ROOT, { repin: rest.includes('--repin') }); say(JSON.stringify(r, null, 1)); if (!r.ok && !r.repinned) process.exitCode = 1; }
else if (cmd === 'flipbook' && rest[0] === '--inline' && rest[1]) {
  const { inlineFlipbook } = await import('../fg/node-flipbook.mjs'), src = rest[1], out = rest[2] ?? src.replace(/\.html$/, '.inline.html');
  writeFileSync(out, inlineFlipbook(readFileSync(src, 'utf8'), dirname(src))); say(`  wrote ${out}`);
}
else if (cmd === 'state') await (await import('../ports/state/matrix.mjs')).stateCommand(rest, { say });
else if (cmd === 'shot') { const [file, outDir, ...hashes] = rest; if (!file || !outDir || !hashes.length) say('usage: shot <file.html> <outdir> "<hash>" ...'); else for (const f of await (await import('./pxc/shot.mjs')).shot(file, outDir, hashes)) say(`  wrote ${f}`); }
else if (cmd === 'profile') { const i = rest.indexOf('--attempt'), t = rest.indexOf('--top'); if (i < 0 || !rest[i + 1]) say('usage: profile --attempt <id> [--top N]'); else await profileAttempt(rest[i + 1], t >= 0 ? Number(rest[t + 1]) : 8); }
else if (cmd === 'doctor') await doctor(rest);
else if (cmd === 'scaffold') scaffold(rest);
else say(readFileSync(new URL(import.meta.url)).toString().split('*/')[0].split('\n').slice(2).map((l) => l.replace(/^ \* ?/, '')).join('\n'));
