/** Explicit opt-in only. Writes a fresh caller-selected directory, never the archive. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { parseArgs } from 'node:util';
import { inspect, toTsv } from './inspector.mjs';

try {
  const { values } = parseArgs({ options: Object.fromEntries(
    ['runtime', 'artifacts', 'label', 'format', 'out'].map(name => [name, { type: 'string' }])) });
  for (const name of ['runtime', 'artifacts', 'label', 'format', 'out'])
    if (!values[name]) throw new Error(`--${name} is required`);
  if (!['json', 'tsv'].includes(values.format)) throw new Error('--format must be json or tsv');
  if (!isAbsolute(values.out)) throw new Error('--out must be a new absolute directory');
  const report = inspect({ runtimePath: values.runtime, artifactDir: values.artifacts, recordLabel: values.label });
  mkdirSync(values.out); // EEXIST is intentional: no overwrite/merge of prior output.
  const body = values.format === 'json' ? JSON.stringify(report, null, 2) + '\n' : toTsv(report);
  const output = join(values.out, `report.${values.format}`);
  writeFileSync(output, body, { flag: 'wx' });
  console.log(JSON.stringify({ status: report.status, output }));
  if (!report.status.startsWith('admitted-')) process.exitCode = 1;
} catch (error) {
  console.error(`Ranked inspector: ${error.message}`);
  process.exitCode = 1;
}
