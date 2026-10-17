import { cp, mkdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { sha } from '../facts.mjs';

/** Materialize only resolved closure into a fresh per-Attempt fork, verifying every byte. */
export async function materializeFork(root, resolved, forkRoot) {
  await mkdir(forkRoot,{recursive:true});
  for (const file of resolved.files) {
    const bytes = await readFile(join(root,file.path));
    if (sha(bytes)!==file.sha256 || bytes.length!==file.size) throw Error(`Input changed before LocalCI: ${file.path}`);
    const output=join(forkRoot,file.path);
    await mkdir(dirname(output),{recursive:true});
    await cp(join(root,file.path),output,{errorOnExist:true});
    if (sha(await readFile(output))!==file.sha256) throw Error(`Fork materialization mismatch: ${file.path}`);
  }
  return {files:resolved.files.length,verified:true};
}
