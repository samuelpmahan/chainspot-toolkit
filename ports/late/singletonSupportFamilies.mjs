import { createHash } from 'node:crypto';

const byId = (a, b) => String(a).localeCompare(String(b));
const point = p => Array.isArray(p) && p.length === 2 && p.every(Number.isInteger);

/**
 * Group candidate fits whose exact observed source-cell sets overlap.
 * Component labels remain provenance only: equal labels do not imply overlapping
 * physical support. Connected groups are competing hypotheses, not proof of one tee.
 */
export function groupSupportFamilies(rows) {
  if (!Array.isArray(rows)) throw new TypeError('rows must be an array');
  const candidateIds = rows.map(row => row?.candidateId ?? row?.id);
  if (candidateIds.some(id => typeof id !== 'string' || !id) || new Set(candidateIds).size !== candidateIds.length)
    throw new TypeError('each support row requires a unique non-empty candidateId or id');

  const parent = rows.map((_, index) => index);
  const find = index => {
    let root = index;
    while (parent[root] !== root) root = parent[root];
    while (parent[index] !== index) {
      const next = parent[index];
      parent[index] = root;
      index = next;
    }
    return root;
  };
  const union = (a, b) => {
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb);
  };
  const firstByCell = new Map();
  const rowCells = rows.map((row, index) => {
    const pixels = row.exactFragmentPixels ?? row.fragmentPixels ?? row.sourceCells;
    if (!Array.isArray(pixels) || !pixels.length || !pixels.every(point))
      throw new TypeError(`row ${candidateIds[index]} requires non-empty exactFragmentPixels/fragmentPixels/sourceCells of [x,y] cells`);
    const cells = [...new Set(pixels.map(([x,y])=>`${x},${y}`))].sort(byId);
    if (row.supportingComponentIds !== undefined && (!Array.isArray(row.supportingComponentIds) ||
        row.supportingComponentIds.some(id => typeof id !== 'string' || !id)))
      throw new TypeError(`row ${candidateIds[index]} has invalid supportingComponentIds`);
    return cells;
  });
  rowCells.forEach((cells,index)=>{
    for (const cell of cells) {
      const prior = firstByCell.get(cell);
      if (prior === undefined) firstByCell.set(cell,index);
      else union(index,prior);
    }
  });

  const groups = new Map();
  rows.forEach((row,index)=>{
    const root=find(index), group=groups.get(root)??{cells:new Set(),componentIds:new Set(),rows:[]};
    rowCells[index].forEach(cell=>group.cells.add(cell));
    (row.supportingComponentIds??[]).forEach(id=>group.componentIds.add(id));
    group.rows.push(row);
    groups.set(root,group);
  });
  const supportFamilies=[...groups.values()].map(group=>{
    const cells=[...group.cells].sort(byId), componentIds=[...group.componentIds].sort(byId);
    const sourceCellHash=createHash('sha256').update(JSON.stringify(cells)).digest('hex');
    const supportFamilyId=`support-family:${sourceCellHash.slice(0,20)}`;
    const candidates=group.rows.slice().sort((a,b)=>byId(a.candidateId??a.id,b.candidateId??b.id)).map(row=>{
      const pixels=row.exactFragmentPixels??row.fragmentPixels??row.sourceCells;
      const canonicalize=points=>[...new Map(points.map(([x,y])=>[`${x},${y}`,[x,y]])).entries()]
        .sort(([a],[b])=>byId(a,b)).map(([,p])=>p);
      const canonicalPixels=canonicalize(pixels);
      const candidateCellHash=createHash('sha256').update(JSON.stringify(canonicalPixels)).digest('hex');
      const normalized={...row,candidateId:row.candidateId??row.id,supportFamilyId,
        supportingComponentIds:[...(row.supportingComponentIds??[])].sort(byId),
        sourceCellHash:row.sourceCellHash??candidateCellHash,
        sourceCellCount:row.sourceCellCount??row.fragmentPixelCount??canonicalPixels.length};
      // Each pixel array is in its own declared coordinate frame. Canonicalize
      // ordering inside that field, but never replace one frame with another.
      if (row.exactFragmentPixels) normalized.exactFragmentPixels=canonicalize(row.exactFragmentPixels);
      if (row.fragmentPixels) normalized.fragmentPixels=canonicalize(row.fragmentPixels);
      if (row.sourceCells) normalized.sourceCells=canonicalize(row.sourceCells);
      return normalized;
    });
    return {supportFamilyId,componentIds,sourceCellHash,sourceCellCount:cells.length,
      memberCandidateIds:candidates.map(row=>row.candidateId),candidates};
  }).sort((a,b)=>byId(a.supportFamilyId,b.supportFamilyId));
  return {supportFamilies,
    interpretation:'OVERLAPPING_SOURCE_CELL_SUPPORT_HYPOTHESES; grouping is not proof of one physical tee. Component labels are provenance only.'};
}
