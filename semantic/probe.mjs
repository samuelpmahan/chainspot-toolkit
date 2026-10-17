#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { compareBytesAndGeometry } from './equality.mjs';

const [rowPath, selectorText] = process.argv.slice(2);
if (!rowPath) throw new Error('usage: node probe.mjs <rows.json> [selector-json]');
const selector = selectorText ? JSON.parse(selectorText) : { teeId: 'tee-7', badgeId: 'badge-9', basketId: 'basket-10' };
const bytes = await readFile(rowPath);
const doc = JSON.parse(bytes.toString('utf8'));
const row = doc.rows.find(r => r.teeId === selector.teeId && r.badgeId === selector.badgeId && r.basketId === selector.basketId);
if (!row) throw new Error('selected row missing');
const formatted = Buffer.from(`${JSON.stringify(doc, null, 3)}\n`);
const changed = structuredClone(doc);
const changedRow = changed.rows.find(r => r.teeId === selector.teeId && r.badgeId === selector.badgeId && r.basketId === selector.basketId);
changedRow.u = [row.u[0], row.u[1] + 0.001];
const changedBytes = Buffer.from(`${JSON.stringify(changed)}\n`);
console.log(JSON.stringify({
  schema: 'nctk-semantic-equality-probe@1', selector,
  source: compareBytesAndGeometry(bytes, formatted, selector),
  changedGeometry: compareBytesAndGeometry(bytes, changedBytes, selector),
  selectedObservation: { id: row.id, u: row.u, teeCenter: row.teeCenter, badgeCenter: row.badgeCenter,
    templateTop: row.templateTop, topAlongPx: row.topAlongPx, topSignedPerpPx: row.topSignedPerpPx,
    topProvenance: row.topProvenance },
  outputsWritten: false,
}, null, 2));
