import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const MAX_BYTES = 2 * 1024 * 1024;
const esc = value => String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[ch]));
const pair = value => Array.isArray(value) && value.length === 2 && value.every(Number.isFinite);
const samePoint = (a, b) => pair(a) && pair(b) && a[0] === b[0] && a[1] === b[1];
const fail = message => { throw new Error(message); };
const label = (value, limit = 180) => {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
};
const count = sharp => sharp === null ? 'UNKNOWN (raw null)' : label(sharp.count);

function checkTrace(trace) {
  if (!trace || trace.schema !== 'window-midpoint-audit@1') fail('Unexpected trace schema');
  if (typeof trace.runId !== 'string' || !trace.runId || trace.runId.length > 200) fail('Invalid runId');
  if (!/^[a-f0-9]{64}$/.test(trace.paramsHash)) fail('Invalid paramsHash');
  if (!Array.isArray(trace.rows) || trace.rows.length !== 12) fail('Expected exactly twelve rows');
  const rowIds = new Set();
  for (const row of trace.rows) {
    for (const key of ['id', 'branch', 'frame', 'group']) {
      if (typeof row[key] !== 'string' || !row[key] || row[key].length > 250) fail(`Invalid row ${key}`);
    }
    if (rowIds.has(row.id)) fail('Duplicate row id');
    rowIds.add(row.id);
    if (![42, 50].includes(row.widthPx)) fail('Unexpected declared width');
    if (!Array.isArray(row.rawStations) || row.rawStations.length !== 5) fail('Expected five raw stations');
    if (!row.baseline || !Array.isArray(row.baseline.points) || row.baseline.points.length !== 5 || !row.baseline.points.every(pair)) fail('Invalid retained baseline points');
    if (!row.midpoint || typeof row.midpoint.completeFive !== 'boolean' || !Array.isArray(row.midpoint.slots) || row.midpoint.slots.length !== 5 || !Array.isArray(row.midpoint.runs) || !Array.isArray(row.midpoint.isolatedIds)) fail('Invalid midpoint structure');
    const slots = row.midpoint.slots;
    const slotIds = new Set();
    for (const slot of slots) {
      if (typeof slot.id !== 'string' || !slot.id || slotIds.has(slot.id) || !pair(slot.originPx)) fail('Invalid slot identity/origin');
      slotIds.add(slot.id);
      if (!['OBSERVED', 'UNKNOWN'].includes(slot.state)) fail('Invalid slot state');
      if (slot.state === 'OBSERVED' && !['midpointPx', 'leftPx', 'rightPx'].every(key => pair(slot[key]))) fail('Observed slot lacks retained coordinates');
      if (slot.state === 'UNKNOWN' && !['midpointPx', 'leftPx', 'rightPx'].every(key => slot[key] === null)) fail('Unknown slot has fabricated coordinates');
    }
    const sharpFields = [row.baseline.sharp];
    for (const run of row.midpoint.runs) {
      if (!Array.isArray(run.stationIds) || !Array.isArray(run.points) || run.stationIds.length < 2 || run.stationIds.length !== run.points.length || !run.points.every(pair)) fail('Invalid retained run');
      let previousIndex = -1;
      for (let i = 0; i < run.stationIds.length; i++) {
        const index = slots.findIndex(slot => slot.id === run.stationIds[i]);
        if (index < 0 || slots[index].state !== 'OBSERVED' || (i > 0 && index !== previousIndex + 1) || !samePoint(run.points[i], slots[index].midpointPx)) fail('Run would bridge a missing slot or change retained points');
        previousIndex = index;
      }
      sharpFields.push(run.sharp);
    }
    for (const sharp of sharpFields) {
      if (sharp !== null && (!sharp || !Number.isSafeInteger(sharp.count) || sharp.count < 0)) fail('Missing raw sharp count');
    }
  }
}

function panel(row, index) {
  const x = 20 + (index % 2) * 690;
  const y = 190 + Math.floor(index / 2) * 260;
  const slots = row.midpoint.slots;
  const points = [...row.baseline.points];
  for (const slot of slots) {
    points.push(slot.originPx);
    for (const key of ['midpointPx', 'leftPx', 'rightPx']) if (slot[key] !== null) points.push(slot[key]);
  }
  const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  // Display transform only: one uniform scale; trace coordinates remain untouched.
  const scale = Math.min(610 / Math.max(1, maxX - minX), 110 / Math.max(1, maxY - minY));
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  const project = p => [335 + (p[0] - cx) * scale, 175 + (p[1] - cy) * scale];
  const xy = p => project(p).map(v => v.toFixed(3)).join(',');
  const line = (pts, color, dash = '') => `<polyline points="${pts.map(xy).join(' ')}" fill="none" stroke="${color}" stroke-width="2"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`;
  const circle = (p, color, radius = 3, fill = color) => { const [a,b] = project(p); return `<circle cx="${a}" cy="${b}" r="${radius}" fill="${fill}" stroke="${color}"/>`; };
  const cross = (p, color, radius = 5) => { const [a,b] = project(p); return `<path d="M${a-radius},${b-radius}l${radius*2},${radius*2}M${a-radius},${b+radius}l${radius*2},-${radius*2}" stroke="${color}" stroke-width="2" fill="none"/>`; };
  const text = (top, body, cls = 'small') => `<text x="14" y="${top}" class="${cls}">${esc(body)}</text>`;
  let svg = `<g transform="translate(${x},${y})"><rect width="670" height="250" rx="7" fill="#fff" stroke="#bcc8d5"/>`;
  svg += `<title>${esc(row.id)}</title><desc>${esc(JSON.stringify({frame: row.frame, widthPx: row.widthPx, completeFive: row.midpoint.completeFive, baselineSharp: row.baseline.sharp, runs: row.midpoint.runs.map(run => ({stationIds: run.stationIds, sharp: run.sharp})), missing: slots.filter(slot => slot.state === 'UNKNOWN').map(slot => ({id:slot.id, reason:slot.reason})), error:row.midpoint.error}))}</desc>`;
  svg += text(22, row.id, 'title') + text(42, `frame: ${row.frame}`);
  svg += text(61, `widthPx=${row.widthPx}   completeFive=${row.midpoint.completeFive}   baseline sharp=${count(row.baseline.sharp)}`);
  svg += text(80, `raw run sharp counts: ${row.midpoint.runs.map((run, i) => `run${i + 1}=${count(run.sharp)}`).join('; ') || 'no runs'}`);
  const missing = slots.filter(slot => slot.state === 'UNKNOWN');
  svg += text(98, label(missing.length ? `UNKNOWN: ${missing.map(slot => `${slot.id} (${slot.reason})`).join('; ')}` : 'All five slot coordinates observed', 110));
  svg += line(row.baseline.points, '#64748b', '5 4');
  for (const point of row.baseline.points) svg += circle(point, '#64748b', 3, '#fff');
  for (const run of row.midpoint.runs) svg += line(run.points, '#0067b1');
  for (const slot of slots) {
    if (slot.state === 'UNKNOWN') { svg += cross(slot.originPx, '#c62828', 6); continue; }
    svg += circle(slot.leftPx, '#d97706', 3) + circle(slot.rightPx, '#9333aa', 3) + circle(slot.midpointPx, '#0067b1', 4);
  }
  if (row.midpoint.error) svg += text(241, label(`retained error: ${row.midpoint.error}`, 105), 'error');
  else svg += text(241, `isolated IDs: ${row.midpoint.isolatedIds.join(', ') || 'none'}; lines use retained contiguous runs only`);
  return svg + '</g>';
}

export function renderTrace(trace, traceHash) {
  checkTrace(trace);
  if (!/^[a-f0-9]{64}$/.test(traceHash)) fail('Invalid traceHash');
  const metadata = { schema:'window-midpoint-audit-svg@1', runId:trace.runId, paramsHash:trace.paramsHash, traceHash };
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="1800" viewBox="0 0 1400 1800" role="img" aria-labelledby="heading description">
<title id="heading">Window-fit midpoint audit — retained trace</title><desc id="description">Twelve panels show retained baseline origins, edge marks and contiguous midpoint runs. Missing slots have red crosses. Display only; no geometry or scientific verdict is computed.</desc>
<metadata>${esc(JSON.stringify(metadata))}</metadata>
<style>text{font-family:Arial,sans-serif;fill:#172638}.small{font-size:12px}.title{font-size:15px;font-weight:bold}.error{font-size:11px;fill:#a32020}</style>
<rect width="1400" height="1800" fill="#eef3f7"/>
<text x="24" y="33" font-size="24" font-weight="bold">Window-fit midpoint audit · recorded coordinates</text>
<text x="24" y="58" font-size="14">runId: ${esc(trace.runId)}</text>
<text x="24" y="80" font-size="13">paramsHash: ${esc(trace.paramsHash)}</text>
<text x="24" y="102" font-size="13">traceHash (exact input bytes): ${esc(traceHash)}</text>
<text x="24" y="128" font-size="13">Grey dashed/open: baseline origins · blue: retained midpoint runs/points · orange: left · purple: right · red ×: UNKNOWN at origin</text>
<text x="24" y="151" font-size="13">Each panel has its own uniform display scale; image coordinates have y down. Missing slots are never connected. Sharp counts are raw trace fields.</text>
<text x="24" y="174" font-size="13">Exposed diagnostic geometry; semantic path identity, physical centerline and accepted bends remain UNKNOWN. Full raw values remain in the hash-bound JSON.</text>
${trace.rows.map(panel).join('\n')}
<text x="24" y="1780" font-size="12">Renderer reads measurement JSON only. No pixels, geometry operations, scores, turns or verdicts are recomputed.</text>
</svg>\n`;
}

export function main(args = process.argv.slice(2)) {
  const options = {};
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i], value = args[i + 1];
    if (!['--input', '--sha256', '--out'].includes(key) || !value || Object.hasOwn(options, key)) fail('Usage: node render.mjs --input measurement.json --sha256 EXPECTED_SHA256 --out FRESH.svg');
    options[key] = value;
  }
  if (Object.keys(options).length !== 3 || !/^[a-f0-9]{64}$/.test(options['--sha256'])) fail('Input, exact expected SHA256 and fresh SVG output are required');
  if (!options['--out'].endsWith('.svg')) fail('Output must have .svg extension');
  const stat = statSync(options['--input']);
  if (!stat.isFile() || stat.size > MAX_BYTES) fail('Measurement must be a regular file of at most 2MiB');
  const bytes = readFileSync(options['--input']);
  if (bytes.length > MAX_BYTES) fail('Measurement exceeds 2MiB');
  const traceHash = createHash('sha256').update(bytes).digest('hex');
  if (traceHash !== options['--sha256']) fail('Measurement SHA256 mismatch');
  const trace = JSON.parse(bytes.toString('utf8'));
  const svg = renderTrace(trace, traceHash);
  writeFileSync(options['--out'], svg, {encoding:'utf8', flag:'wx'});
  process.stdout.write(JSON.stringify({runId:trace.runId, paramsHash:trace.paramsHash, traceHash, rows:trace.rows.length, output:options['--out']}) + '\n');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try { main(); } catch (error) { process.stderr.write(`render: ${error.message}\n`); process.exitCode = 1; }
}
