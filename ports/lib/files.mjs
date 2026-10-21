// Small file helpers the port runners each re-declared (readJson in 11 files, readOpt in 3, latestRun in 2, findKey in 3).
import { readFileSync, readdirSync, existsSync } from 'node:fs';

export const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
/** readJson, or `absent` when the file is not there (an optional upstream lane that did not run). */
export const readOpt = (p, absent) => (existsSync(p) ? readJson(p) : absent);
/** The newest `run-*` directory name under dir, or null. */
export const latestRun = (dir) => (existsSync(dir) ? readdirSync(dir).filter((d) => d.startsWith('run-')).sort().at(-1) ?? null : null);

/** First value stored under `key`, searching objects depth-first; undefined when absent. */
export function findKey(obj, key) {
  if (!obj || typeof obj !== 'object') return undefined;
  if (key in obj) return obj[key];
  for (const v of Object.values(obj)) { const r = findKey(v, key); if (r !== undefined) return r; }
  return undefined;
}
