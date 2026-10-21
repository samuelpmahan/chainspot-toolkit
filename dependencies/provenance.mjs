/**
 * The bundled provider's identity (source/provider/REPLAY-PROVENANCE.json): sourceAlgSha256 and compiledAlgSha256 are hashes
 * of the sorted relative paths and SHA-256 contents of packages/alg/src (.ts/.json/.yaml) and packages/alg/dist (.js/.json).
 * The early runner verifies them (ports/early/runEarly.mjs); every change to the vendored provider re-pins them, and a merge
 * of two lanes that both patched it unions their localPatches and re-pins on the merged tree. One implementation for all.
 *
 *   node scripts/pxc.mjs provenance            verify (exit 1 on a mismatch)
 *   node scripts/pxc.mjs provenance --repin    recompute both hashes on the working tree; inside a conflicted merge, first
 *                                              union both sides' localPatches (the conflict is always just these fields)
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

export const PROVENANCE = 'source/provider/REPLAY-PROVENANCE.json';
const hash = (value) => createHash('sha256').update(value).digest('hex');

/** sha256 of the sorted [relative path, sha256] list of the files under dir whose names match suffixes. */
export function treeIdentity(dir, suffixes) {
  const files = [];
  const walk = (folder) => {
    for (const entry of readdirSync(folder, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const path = join(folder, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (suffixes.test(entry.name)) files.push([path.slice(dir.length), hash(readFileSync(path))]);
    }
  };
  walk(dir);
  return hash(JSON.stringify(files));
}

/** The two hashes of a provider checkout (the directory holding packages/alg). */
export const algIdentity = (provider) => ({
  sourceAlgSha256: treeIdentity(resolve(provider, 'packages/alg/src'), /\.(ts|json|yaml)$/),
  compiledAlgSha256: treeIdentity(resolve(provider, 'packages/alg/dist'), /\.(js|json)$/)
});

/** Verify, or (repin) recompute and write; in a conflicted merge, union both sides' localPatches first. */
export function provenance(root, { repin = false } = {}) {
  const file = join(root, PROVENANCE), now = algIdentity(join(root, 'source/provider'));
  const stage = (n) => { try { return JSON.parse(execFileSync('git', ['-C', root, 'show', `:${n}:${PROVENANCE}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })); } catch { return null; } };
  const ours = stage(2), theirs = stage(3), conflicted = Boolean(ours && theirs);
  const base = conflicted ? { ...ours, localPatches: [...(ours.localPatches ?? []), ...(theirs.localPatches ?? []).filter((p) => !(ours.localPatches ?? []).includes(p))] } : JSON.parse(readFileSync(file, 'utf8'));
  const ok = base.sourceAlgSha256 === now.sourceAlgSha256 && base.compiledAlgSha256 === now.compiledAlgSha256;
  if (repin) writeFileSync(file, JSON.stringify({ ...base, ...now }, null, 2) + '\n');
  return { ok, conflicted, repinned: repin, pinned: { sourceAlgSha256: base.sourceAlgSha256, compiledAlgSha256: base.compiledAlgSha256 }, tree: now, localPatches: (base.localPatches ?? []).length };
}
