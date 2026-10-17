/**
 * AblationForkJoin (Sam's term; browser-safe: no node:* import).
 *
 * "Do something in S3, see how it affects every other stage." Fork at one
 * addressed thing (a Part, a Calculation implementation, a parameter), run
 * every branch from the fork point through ALL downstream stages, then
 * join every downstream Part across branches under a geometric Contract
 * and report, per branch and per Part, whether it changed and by how much.
 *
 * This file is only the JOIN half (the part that is the same for every
 * specimen and every stage port). Running the branches is the runner's job
 * (ports/ablation/), because how a stage is re-entered is still stage-
 * specific; see STAGES.md "Ablation" for the seams that were needed.
 *
 *   column: { id, stage, part, contract, verdictOf?, label? }
 *     id         unique column id, e.g. 'S5:px.s5.globalAssignment'
 *     stage      'S3'..'S7'
 *     part       the Part address the members came from
 *     contract   a defineContract() value: member identity, never a key
 *     verdictOf  (member) -> string|null: what the branch SAID about a
 *                member it shares with the baseline (an S6 row's status,
 *                an S7 trace's outcome). Not identity: a matched member
 *                whose verdict differs is a FLIP, i.e. a change.
 *     label      (member) -> short string for ledgers
 *
 *   joinPart({ column, base, branch }) -> cell
 *     Geometric one-to-one join (fg/identity.mjs geometricJoin) of the
 *     baseline's members against the branch's members. The cell is
 *       { status: 'unchanged'|'changed', n: { base, branch },
 *         matched, lost, gained, flipped,      counts
 *         maxDriftScore, maxDrift,              worst matched pair, in the
 *                                               Contract's tolerance units
 *                                               (<= 1 by definition) + detail
 *         changes: [{ kind: 'lost'|'gained'|'flipped', base?, branch?,
 *                     label, nearestScore, detail, from?, to? }],
 *         ambiguous, collisions }               the join's own warnings
 *     unchanged iff nothing was lost, gained or flipped. nearestScore of a
 *     lost/gained member is its closest score to ANY member of the other
 *     side (how far its nearest counterpart is, in tolerance units; >= 1000
 *     means no counterpart shares its label): the geometric magnitude of a
 *     change, not just its count.
 *
 *   effectMatrix({ columns, rows, baseline, reference? }) -> matrix
 *     rows: [{ id, fork, parts: { [columnId]: [member] } }]. Every row is
 *     joined against the baseline row; the baseline row itself is joined
 *     against `reference` ({ id, parts }, e.g. the original Attempt's
 *     outputs) when given, so row 0 is a re-execution witness rather than
 *     an identity. A column a row does not carry is { status: 'absent' }.
 *
 *   matrixLedger(matrix) -> rows for a flipbook ledger (one string per cell)
 *   ablationFrames(matrix, { members, maxPages }) -> Frames: the ledger page,
 *     then one page per changed cell (most changes first), drawing lost
 *     (red), gained (green) and flipped (blue) members from each member's
 *     `draw` geometry: { bbox?: [x, y, w, h], points?: [[x, y]], path?:
 *     [[x, y]] }, all in ONE frame (the runner's choice; ports/ablation
 *     uses source-image pixels so the flipbook draws over the source).
 */
import { geometricJoin, isContract } from './identity.mjs';
import { createFrameEmitter } from './guarantee.mjs';
import { plain } from './canon.mjs';

const r4 = (v) => (v === null || v === undefined ? null : Math.round(v * 1e4) / 1e4);

function nearest(contract, member, others) {
  let best = null;
  for (let j = 0; j < others.length; j++) {
    const out = contract.equal(member, others[j]);
    if (!best || out.score < best.score) {
      const { ok, score, ...detail } = out;
      best = { index: j, score, detail };
    }
  }
  return best;
}

export function joinPart({ column, base, branch }) {
  if (!column || !isContract(column.contract)) throw new Error(`joinPart ${column?.id}: column.contract must be a defineContract() value`);
  if (!Array.isArray(base) || !Array.isArray(branch)) throw new Error(`joinPart ${column.id}: base and branch must be member lists`);
  const contract = column.contract;
  const label = column.label ?? (() => null);
  const verdictOf = column.verdictOf ?? null;
  const join = geometricJoin({ sets: { a: base, b: branch }, contract });
  const changes = [];
  let matched = 0, flipped = 0, maxDriftScore = 0, maxDrift = null;
  for (const identity of join.identities) {
    const i = identity.members.a, j = identity.members.b;
    if (i !== null && j !== null) {
      matched++;
      const pair = identity.pairs[0];
      if (pair && pair.score >= maxDriftScore) { maxDriftScore = pair.score; maxDrift = { base: i, branch: j, label: label(base[i]), ...pair.detail }; }
      if (verdictOf) {
        const from = verdictOf(base[i]), to = verdictOf(branch[j]);
        if (from !== to) { flipped++; changes.push({ kind: 'flipped', base: i, branch: j, label: label(base[i]), from, to, nearestScore: r4(pair?.score ?? 0), detail: pair?.detail ?? null }); }
      }
    } else if (i !== null) {
      const near = nearest(contract, base[i], branch);
      changes.push({ kind: 'lost', base: i, label: label(base[i]), verdict: verdictOf ? verdictOf(base[i]) : null, nearestScore: near ? r4(near.score) : null, nearestBranch: near?.index ?? null, detail: near?.detail ?? null });
    } else {
      const near = nearest(contract, branch[j], base);
      changes.push({ kind: 'gained', branch: j, label: label(branch[j]), verdict: verdictOf ? verdictOf(branch[j]) : null, nearestScore: near ? r4(near.score) : null, nearestBase: near?.index ?? null, detail: near?.detail ?? null });
    }
  }
  const lost = changes.filter((c) => c.kind === 'lost').length;
  const gained = changes.filter((c) => c.kind === 'gained').length;
  return plain({
    column: column.id, contract: contract.address,
    status: lost || gained || flipped ? 'changed' : 'unchanged',
    n: { base: base.length, branch: branch.length },
    matched, lost, gained, flipped,
    maxDriftScore: r4(maxDriftScore), maxDrift,
    changes,
    ambiguous: join.ambiguous, collisions: join.collisions
  });
}

export function effectMatrix({ columns, rows, baseline, reference = null }) {
  if (!Array.isArray(columns) || !columns.length) throw new Error('effectMatrix: columns required');
  if (!Array.isArray(rows) || !rows.length) throw new Error('effectMatrix: rows required');
  const ids = new Set();
  for (const c of columns) { if (ids.has(c.id)) throw new Error(`effectMatrix: duplicate column ${c.id}`); ids.add(c.id); }
  const base = rows.find((r) => r.id === baseline);
  if (!base) throw new Error(`effectMatrix: baseline row ${baseline} not among rows`);
  const cellFor = (column, against, row) => {
    const a = against?.parts?.[column.id], b = row.parts?.[column.id];
    if (!Array.isArray(a) || !Array.isArray(b)) return { column: column.id, status: 'absent', reason: !Array.isArray(b) ? `row ${row.id} has no ${column.part}` : `${against?.id} has no ${column.part}` };
    return joinPart({ column, base: a, branch: b });
  };
  return {
    schema: 'nctk-ablation-effect-matrix@1',
    baseline,
    reference: reference ? reference.id : null,
    columns: columns.map((c) => ({ id: c.id, stage: c.stage, part: c.part, contract: c.contract.address, tolerances: { ...c.contract.tolerances }, verdict: Boolean(c.verdictOf) })),
    rows: rows.map((row) => {
      const against = row.id === baseline ? (reference ?? row) : base;
      return { id: row.id, fork: row.fork ?? null, against: against.id, cells: Object.fromEntries(columns.map((c) => [c.id, cellFor(c, against, row)])) };
    })
  };
}

/** One compact string per cell: '=18' unchanged, '-3 +0 ~1 /18' changed. */
export function cellText(cell) {
  if (!cell || cell.status === 'absent') return 'n/a';
  const drift = cell.maxDriftScore ? ` d${cell.maxDriftScore}` : '';
  if (cell.status === 'unchanged') return `=${cell.matched}${drift}`;
  return `-${cell.lost} +${cell.gained}${cell.flipped ? ` ~${cell.flipped}` : ''} /${cell.n.base}->${cell.n.branch}`;
}

export function matrixLedger(matrix) {
  return matrix.rows.map((row) => ({
    row: row.id, fork: row.fork?.describe ?? row.fork?.id ?? '', vs: row.against,
    ...Object.fromEntries(matrix.columns.map((c) => [c.id, cellText(row.cells[c.id])]))
  }));
}

const sample = (path, stepPx = 2) => {
  const out = [];
  for (let i = 1; i < path.length; i++) {
    const [ax, ay] = path[i - 1], [bx, by] = path[i];
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / stepPx));
    for (let k = 0; k < n; k++) out.push([ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n]);
  }
  if (path.length) out.push(path.at(-1));
  return out;
};

// Exactly ONE drawn part per change kind, always emitted (possibly empty),
// so the flipbook's per-part-index palette gives lost red, gained green and
// flipped blue on every page. Members with a bbox draw it; a member with
// only points/path draws those as dots (a path densely sampled).
function drawPart(address, members) {
  const boxes = [], points = [];
  for (const { member, tag } of members) {
    const d = member?.draw;
    if (!d) continue;
    if (d.bbox) boxes.push([...d.bbox, tag]);
    for (const p of d.points ?? []) points.push([p[0], p[1], tag]);
    if (d.path) for (const p of sample(d.path)) points.push([p[0], p[1], tag]);
  }
  if (boxes.length) {
    for (const [x, y, tag] of points) boxes.push([x - 2, y - 2, 5, 5, tag]);
    return { address, kind: 'bbox', data: { boxes } };
  }
  return { address, kind: 'points', data: { points } };
}

/**
 * members: { [rowId]: { [columnId]: [member] } } (the same lists the matrix
 * was built from), so a page can draw the actual geometry.
 */
export function ablationFrames(matrix, { members, maxPages = 16, fg = 'ablation.forkjoin' } = {}) {
  const emitter = createFrameEmitter({ fg });
  emitter.emit({
    title: `Effect matrix: ${matrix.rows.length} rows x ${matrix.columns.length} Parts (each row vs ${matrix.baseline}; ${matrix.baseline} vs ${matrix.reference ?? 'itself'})`,
    parts: [
      { address: 'ablation.effectMatrix', kind: 'ledger', data: { rows: matrixLedger(matrix) } },
      { address: 'ablation.columns', kind: 'ledger', data: { rows: matrix.columns.map((c) => ({ column: c.id, contract: c.contract, tolerances: c.tolerances, verdictFlipsCount: c.verdict })) } },
      { address: 'ablation.forks', kind: 'ledger', data: { rows: matrix.rows.map((r) => ({ row: r.id, at: r.fork?.at ?? null, describe: r.fork?.describe ?? null })) } }
    ],
    receipt: { schema: matrix.schema, baseline: matrix.baseline, reference: matrix.reference }
  });
  const changed = [];
  for (const row of matrix.rows) for (const column of matrix.columns) {
    const cell = row.cells[column.id];
    if (cell?.status === 'changed') changed.push({ row, column, cell, weight: cell.lost + cell.gained + cell.flipped });
  }
  changed.sort((a, b) => (b.weight - a.weight) || a.row.id.localeCompare(b.row.id) || a.column.id.localeCompare(b.column.id));
  for (const { row, column, cell } of changed.slice(0, maxPages)) {
    const baseList = members?.[row.against]?.[column.id] ?? [];
    const branchList = members?.[row.id]?.[column.id] ?? [];
    const pick = (kind) => cell.changes.filter((c) => c.kind === kind);
    const lost = pick('lost').map((c) => ({ member: baseList[c.base], tag: `lost ${c.label ?? c.base}` }));
    const gained = pick('gained').map((c) => ({ member: branchList[c.branch], tag: `gained ${c.label ?? c.branch}` }));
    const flipped = pick('flipped').map((c) => ({ member: branchList[c.branch], tag: `${c.label ?? c.branch}: ${c.from} -> ${c.to}` }));
    emitter.emit({
      title: `${row.id} vs ${row.against}: ${column.id} ${cellText(cell)}`,
      tick: column.stage, calculation: column.contract,
      parts: [
        drawPart(`${column.part} lost (in ${row.against} only)`, lost),
        drawPart(`${column.part} gained (in ${row.id} only)`, gained),
        drawPart(`${column.part} flipped (verdict in ${row.id})`, flipped),
        { address: `${column.part}.changes`, kind: 'ledger', data: { rows: cell.changes.map((c) => ({ kind: c.kind, label: c.label, from: c.from ?? c.verdict ?? null, to: c.to ?? null, nearestScore: c.nearestScore, detail: c.detail })) } }
      ],
      verdicts: [{ name: `${cell.matched} matched under ${column.contract}`, ok: true }, { name: `${cell.lost} lost, ${cell.gained} gained, ${cell.flipped} flipped`, ok: false }],
      receipt: { row: row.id, against: row.against, column: column.id, n: cell.n, maxDriftScore: cell.maxDriftScore }
    });
  }
  return emitter.frames;
}
