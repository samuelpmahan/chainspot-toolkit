/**
 * Convention-based discovery for FGs and competing implementations
 * (node-only: directory scans and dynamic import; the browser-safe core
 * in guarantee/registry/forkjoin never imports this file).
 *
 * Conventions, so that adding a guarantee or an implementation is adding
 * one file, with no wiring edit anywhere:
 *
 *   <root>/**\/<id>.fg.mjs      default-exports defineGuarantee({ id, ... });
 *                               the filename stem must equal the id.
 *                               Directories named fixtures/ or node_modules/
 *                               below the root are skipped, so scanning fg/
 *                               never picks up test fixtures.
 *   <root>/<slot>/<name>.mjs    default-exports one implementation (a
 *                               function parts => value of the slot's Part)
 *                               of Calculation slot <slot>, e.g.
 *                               impl/fn.toy.findFamily/bySize.mjs, with
 *                               named exports `reads` (the Part addresses it
 *                               may get) and `calls` (the fn.* Calculations
 *                               it may call); loaded as { calculate, reads,
 *                               calls }.
 *   <stagesDir>/*.json          stage declarations; their "guarantees"
 *                               entries are what crossCheck compares the
 *                               discovered FGs against.
 *
 * loadRegistry ties the three together: discover, load declarations,
 * build the registry (which throws on a requires cycle or a missing
 * required id), and return the crossCheck report beside it. The report
 * never throws: declared-but-unimplemented is the expected state while
 * the inline runEarly blocks are being ported one at a time.
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isGuarantee } from './guarantee.mjs';
import { createRegistry, crossCheck } from './registry.mjs';

const SKIP = new Set(['fixtures', 'node_modules']);

function walk(dir, match, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) { if (!SKIP.has(entry.name)) walk(path, match, out); }
    else if (match(entry.name)) out.push(path);
  }
  return out;
}

export async function discoverGuarantees(root) {
  const dir = resolve(root);
  const found = [];
  for (const path of walk(dir, (name) => name.endsWith('.fg.mjs'))) {
    const mod = await import(pathToFileURL(path).href);
    const fg = mod.default;
    if (!isGuarantee(fg)) throw new Error(`fg discover: ${path} does not default-export defineGuarantee(...)`);
    const stem = basename(path, '.fg.mjs');
    if (stem !== fg.id) throw new Error(`fg discover: ${path} defines ${fg.id}; the file must be named ${fg.id}.fg.mjs`);
    found.push(fg);
  }
  return found.sort((a, b) => a.id.localeCompare(b.id));
}

export function loadDeclarations(stagesDir) {
  const dir = resolve(stagesDir);
  const out = [];
  for (const name of readdirSync(dir).filter((n) => n.endsWith('.json')).sort()) {
    const stage = JSON.parse(readFileSync(join(dir, name), 'utf8'));
    for (const g of stage.guarantees ?? [])
      if (g.kind === 'functional-guarantee') out.push({ ...g, stage: basename(name, '.json') });
  }
  return out;
}

export async function discoverImplementations(root, slot) {
  const dir = join(resolve(root), slot);
  if (!existsSync(dir)) return {};
  const impls = {};
  for (const name of readdirSync(dir).filter((n) => n.endsWith('.mjs') && !n.endsWith('.test.mjs')).sort()) {
    const mod = await import(pathToFileURL(join(dir, name)).href);
    if (typeof mod.default !== 'function') throw new Error(`fg discover: ${join(dir, name)} does not default-export an implementation function`);
    for (const key of ['reads', 'calls'])
      if (mod[key] !== undefined && !(Array.isArray(mod[key]) && mod[key].every((a) => typeof a === 'string' && a)))
        throw new Error(`fg discover: ${join(dir, name)} export ${key} must be a list of addresses`);
    impls[basename(name, '.mjs')] = Object.freeze({ calculate: mod.default, reads: Object.freeze([...(mod.reads ?? [])]), calls: Object.freeze([...(mod.calls ?? [])]) });
  }
  return impls;
}

export async function loadRegistry({ root, stagesDir }) {
  const guarantees = await discoverGuarantees(root);
  const declarations = stagesDir ? loadDeclarations(stagesDir) : [];
  return { registry: createRegistry(guarantees), declarations, report: crossCheck(guarantees, declarations) };
}
