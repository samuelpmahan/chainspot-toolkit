import { createHash } from 'node:crypto';
import { access, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { geometryObservationEquals, parsedPartEquals } from './equality.mjs';

const root = process.cwd();
const variants = ['heading-baseline', 'heading-formatting', 'heading-axis'];
const records = {};
for (const name of variants) {
  const fork = path.join(root, 'nctk-checkpoints/semantic/native-runs', name, 'fork');
  const rowPath = path.join(fork, 'source/chainspot-teams/s7/input/IMG_5641-rows.json');
  const receiptPath = path.join(fork, 'source/chainspot-teams/s7/width-probe/IMG_5641-badge-9-s5-axis/width-probe.json');
  const rowBytes = await readFile(rowPath), receiptBytes = await readFile(receiptPath);
  const rowDocument = JSON.parse(rowBytes), receipt = JSON.parse(receiptBytes);
  const outcome = receipt.outcomes[0];
  records[name] = {
    rowSha256: createHash('sha256').update(rowBytes).digest('hex'),
    receiptSha256: createHash('sha256').update(receiptBytes).digest('hex'),
    receiptBytes: receiptBytes.length,
    rowFileSha256InReceipt: receipt.s5AxisEvidence.rowFileSha256,
    selectedRowId: receipt.s5AxisEvidence.rowId,
    headingDeg: receipt.s5AxisEvidence.headingDeg,
    trace: { outcome: outcome.traced.outcome, reason: outcome.traced.reason,
      lengthPx: outcome.traced.lengthPx, bendCount: outcome.traced.bendCount,
      nextStraightProbe: outcome.nextStraightProbe },
    document: rowDocument,
  };
}
const selector = { teeId: 'tee-7', badgeId: 'badge-9', basketId: 'basket-10' };
const base = records['heading-baseline'];
const report = {
  schema: 'nctk-semantic-native-comparison@1',
  providerInvocation: { mode: 'heading', stem: 'IMG_5641', badgeId: 'badge-9', teeId: 'tee-7' },
  selector,
  variants: Object.fromEntries(variants.map(name => [name, (({ document, ...record }) => record)(records[name])])),
  comparisons: Object.fromEntries(['heading-formatting', 'heading-axis'].map(name => [name, {
    parsedPartEqual: parsedPartEquals(base.document, records[name].document, selector),
    geometryObservationEqual: geometryObservationEquals(base.document, records[name].document, selector),
    wholeReceiptEqual: base.receiptSha256 === records[name].receiptSha256,
    traceEqual: JSON.stringify(base.trace) === JSON.stringify(records[name].trace),
  }])),
  interpretation: 'Native S7 receipts bind row bytes. Semantic equality of a selected Part or geometry observation does not confer whole-receipt identity or reuse; receipt re-attestation is required.',
};
const output = path.join(root, 'nctk-checkpoints/semantic/native-comparison.json');
try { await access(output); throw new Error(`refusing to overwrite ${output}`); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
console.log(output);
