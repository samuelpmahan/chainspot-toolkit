import { createHash } from 'node:crypto';
import { lstat, readFile, readdir } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';

export const BASE = '5433854c72b1dc5aa420934d91e16458c2abe09f';
export const sha = data => createHash('sha256').update(data).digest('hex');
export const canonical = value => Array.isArray(value) ? `[${value.map(canonical).join(',')}]` :
  value && typeof value === 'object' ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}` : JSON.stringify(value ?? null);
export function safePath(root, path) {
  if (typeof path !== 'string' || !path || path.startsWith('/') || path.split('/').includes('..') || path.includes('\\')) throw Error(`Unsafe path: ${path}`);
  const full = resolve(root, path);
  if (full !== resolve(root) && !full.startsWith(resolve(root) + sep)) throw Error(`Outside root: ${path}`);
  return full;
}
async function walk(root, path, files) {
  const full = safePath(root, path);
  const stat = await lstat(full).catch(() => { throw Error(`Missing dependency: ${path}`); });
  if (stat.isSymbolicLink()) throw Error(`Symlink dependency: ${path}`);
  if (stat.isDirectory()) {
    for (const child of (await readdir(full)).sort()) await walk(root, `${path}/${child}`, files);
  } else if (stat.isFile()) {
    const bytes = await readFile(full);
    files.set(path, { path, sha256: sha(bytes), size: bytes.length, mode: stat.mode & 0o777 });
  } else throw Error(`Nonregular dependency: ${path}`);
}
export async function compile(root, targetPath) {
  if (!/^targets\/[a-z0-9-]+\.json$/.test(targetPath)) throw Error(`Target must be a declaration path: ${targetPath}`);
  const seen = new Set(), active = new Set(), declarations = [], files = new Map();
  async function visit(path) {
    if (seen.has(path)) return;
    if (active.has(path)) throw Error(`Dependency cycle: ${path}`);
    active.add(path);
    const full = safePath(root, path), stat = await lstat(full).catch(() => { throw Error(`Missing dependency: ${path}`); });
    if (stat.isSymbolicLink()) throw Error(`Symlink dependency: ${path}`);
    if (path.startsWith('targets/') || path.startsWith('ticks/') || path.startsWith('overlays/')) {
      if (!stat.isFile()) throw Error(`Expected declaration file: ${path}`);
      const d = JSON.parse(await readFile(full));
      if (!['target', 'tick', 'overlay'].includes(d.kind) || !Array.isArray(d.dependencies)) throw Error(`Invalid declaration: ${path}`);
      for (const dep of d.dependencies) await visit(dep);
      declarations.push({ path, ...d });
    } else if (!path.startsWith('source/') && !['provider-adapter.mjs','toolkit.mjs','facts.mjs'].includes(path) && !path.startsWith('policies/') && !path.startsWith('dependencies/')) {
      throw Error(`Undeclared dependency domain: ${path}`);
    }
    await walk(root, path, files);
    active.delete(path); seen.add(path);
  }
  await visit(targetPath);
  let target = declarations.find(d => d.path === targetPath);
  if (target.kind !== 'target' || target.name !== targetPath.slice('targets/'.length, -'.json'.length)) throw Error(`Target path/name mismatch: ${targetPath}`);
  if (target.base || target.overlay) {
    const base=declarations.find(d=>d.path===target.base), overlay=declarations.find(d=>d.path===target.overlay);
    if (!base || base.kind!=='target' || !overlay || overlay.kind!=='overlay' ||
        !target.dependencies.includes(base.path) || !target.dependencies.includes(overlay.path)) throw Error(`Invalid Kompozition binding: ${targetPath}`);
    if (!/^overlays\/[a-z0-9-]+\.json$/.test(overlay.path) || overlay.name!==overlay.path.slice('overlays/'.length,-'.json'.length)) throw Error(`Overlay path/name mismatch: ${overlay.path}`);
    if (Object.keys(overlay.args??{}).some(k=>!(k in base.args))) throw Error('Overlay adds undeclared Run Arg');
    target={...target,providerBase:base.providerBase,args:{...base.args,...overlay.args},ticks:overlay.ticks,
      composition:{base:base.path,overlay:overlay.path,baseSha256:files.get(base.path)?.sha256,overlaySha256:files.get(overlay.path)?.sha256}};
  }
  if (target.providerBase !== BASE) throw Error(`Wrong declared base: ${target.providerBase}`);
  const provenance = JSON.parse(await readFile(join(root, 'source/provider/REPLAY-PROVENANCE.json')));
  if (provenance.sourceCommit !== target.providerBase) throw Error(`Wrong provider base: ${provenance.sourceCommit}`);
  for (const path of target.ticks ?? []) if (!declarations.some(d => d.path === path && d.kind === 'tick')) throw Error(`Missing Tick: ${path}`);
  const sortedFiles = [...files.values()].sort((a,b) => a.path.localeCompare(b.path));
  return { target, declarations: declarations.map(d => ({...d, sha256: files.get(d.path)?.sha256})), files: sortedFiles, base: BASE, graph: declarations.map(d => ({ path: d.path, dependencies: d.dependencies })) };
}
export async function inventory(root) {
  const dirs = new Set(['source','targets','ticks','overlays','policies','dependencies','semantic']);
  const paths = (await readdir(root,{withFileTypes:true})).filter(entry =>
    dirs.has(entry.name) || (entry.isFile() && /\.(mjs|md)$/.test(entry.name))).map(entry=>entry.name).sort();
  const files = new Map();
  for (const path of paths) await walk(root, path, files);
  return [...files.values()].sort((a,b) => a.path.localeCompare(b.path));
}
export async function snapshotPaths(root, paths) {
  const files = new Map();
  for (const path of paths) await walk(root,path,files);
  return [...files.values()].sort((a,b) => a.path.localeCompare(b.path));
}
export function differences(before, after) {
  const b = new Map(before.map(f => [f.path, f.sha256]));
  const a = new Map(after.map(f => [f.path, f.sha256]));
  return [...new Set([...a.keys(), ...b.keys()])].sort().filter(path => a.get(path) !== b.get(path)).map(path => ({path, before: b.get(path) ?? null, after: a.get(path) ?? null}));
}
export function digest(files, args, ticks) {
  return sha(JSON.stringify({files: files.map(({path,sha256}) => [path,sha256]), args, ticks}));
}
