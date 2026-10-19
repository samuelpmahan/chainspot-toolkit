/**
 * What a runner needs to take the persistent cache by default (node-only): the CAS under <root>/attempts/cas and a
 * code salt from the runner's module closure (fg/closure.mjs), both handed to instrumentedStore. `--no-cas` (cas:
 * false) opts out and leaves the store exactly as it was: the in-process Map, the source-only code key.
 */
import { join, relative, resolve } from 'node:path';
import { createCas, CAS_DIR } from './cas.mjs';
import { closureSha } from './closure.mjs';

const TOOLKIT = resolve(import.meta.dirname, '..');

/** @param entry the runner's file (import.meta.filename); its static import closure is the salt */
export function runnerCache({ root = TOOLKIT, entry, cas = true } = {}) {
  if (!cas) return { cache: undefined, codeSalt: null };
  return { cache: createCas({ root: join(root, CAS_DIR) }), codeSalt: closureSha([relative(TOOLKIT, entry)], { root: TOOLKIT }) };
}

/** `--no-cas` anywhere on the command line. */
export const casFlag = (argv = process.argv.slice(2)) => !argv.includes('--no-cas');
