/** Posthoc polyline measurements only. No detector, route, ranking or ownership.
 * Input vertices define runs; no smoothing, merging or bend threshold is inferred.
 * Coordinates and full ribbon widths must share the caller's pixel frame.
 */
const unknown = reason => ({ status: 'UNKNOWN', reason });
function finite(v, name) {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new TypeError(`${name} must be finite`);
  return v;
}
function positive(v, name) {
  finite(v, name); if (v <= 0) throw new RangeError(`${name} must be positive`); return v;
}
function point(p, name) {
  if (!Array.isArray(p) || p.length !== 2) throw new TypeError(`${name} must be [x,y]`);
  return [finite(p[0], `${name}.x`), finite(p[1], `${name}.y`)];
}
function referent(v, name) {
  if (typeof v !== 'string' || !v.trim()) throw new TypeError(`${name} must name its referent`);
  return v;
}
function measured(v, name) { if (!Number.isFinite(v)) throw new RangeError(`${name} overflowed`); return v; }

export function describePath({ points, frame, width, support, pairedEdges } = {}) {
  referent(frame, 'frame');
  if (!Array.isArray(points) || points.length < 2) throw new RangeError('points requires at least two vertices');
  const p = points.map((v, i) => point(v, `points[${i}]`));
  let widths;
  if (width !== undefined) {
    referent(width.provenance, 'width.provenance');
    widths = Array.isArray(width.fullWidthPx) ? width.fullWidthPx : Array(p.length - 1).fill(width.fullWidthPx);
    if (widths.length !== p.length - 1) throw new RangeError('width.fullWidthPx array requires one full width per segment');
    widths.forEach((v, i) => positive(v, `width.fullWidthPx[${i}]`));
  }
  const segments = [], cumulative = [0];
  for (let i = 1; i < p.length; i++) {
    const dx = measured(p[i][0] - p[i-1][0], 'dx'), dy = measured(p[i][1] - p[i-1][1], 'dy');
    const lengthPx = positive(Math.hypot(dx, dy), `segment[${i-1}] length (duplicate consecutive vertices)`);
    const cumulativeLengthPx = measured(cumulative.at(-1) + lengthPx, 'cumulative length');
    cumulative.push(cumulativeLengthPx);
    segments.push({ fromVertex: i-1, toVertex: i, lengthPx, unitTangent: [dx / lengthPx, dy / lengthPx],
      lengthInFullRibbonWidths: widths ? measured(lengthPx / widths[i-1], 'normalized run length') : null });
  }
  const turns = [];
  for (let i = 1; i < p.length - 1; i++) {
    const a = segments[i-1].unitTangent, b = segments[i].unitTangent;
    const signedRadians = Math.atan2(a[0]*b[1] - a[1]*b[0], a[0]*b[0] + a[1]*b[1]);
    turns.push({ vertex: i, pointPx: [...p[i]], distanceAlongPx: cumulative[i], signedRadians, absoluteRadians: Math.abs(signedRadians) });
  }
  let supportEvidence = unknown('No support samples supplied');
  if (support !== undefined) {
    referent(support.provenance, 'support.provenance');
    finite(support.threshold, 'support.threshold');
    if (support.threshold < 0 || support.threshold > 1) throw new RangeError('support.threshold must be in [0,1]');
    if (!Array.isArray(support.values) || support.values.length !== p.length) throw new RangeError('support.values requires one sample per vertex, with null for UNKNOWN');
    let observed = 0, supported = 0;
    support.values.forEach((v,i) => {
      if (v === null) return;
      finite(v, `support.values[${i}]`); if(v<0||v>1) throw new RangeError('support samples must be in [0,1]');
      observed++; supported += v >= support.threshold;
    });
    supportEvidence = { status: observed ? 'observed' : 'UNKNOWN', supportedSamples: supported, observedSamples: observed,
      totalVertices: p.length, unknownSamples: p.length-observed, observedFraction: observed/p.length,
      supportedFractionOfObserved: observed ? supported/observed : null, threshold: support.threshold,
      provenance: support.provenance, confidence: 'uncalibrated sample fraction; not probability of path identity',
      weighting: 'one vote per supplied vertex; not arc-length weighted; no interpolation' };
  }
  let centerline = unknown('No paired edges supplied; support and heading cannot establish midpoint offset');
  if (pairedEdges !== undefined) {
    referent(pairedEdges.provenance, 'pairedEdges.provenance');
    if (!Array.isArray(pairedEdges.values) || pairedEdges.values.length !== p.length) throw new RangeError('pairedEdges.values requires one pair or null per vertex');
    let observed = 0;
    const samples = pairedEdges.values.map((edges,i) => {
      if (edges === null) return { vertex:i, ...unknown('No bilateral edge pair') };
      const l=point(edges.left,`pairedEdges[${i}].left`), r=point(edges.right,`pairedEdges[${i}].right`);
      const dx=measured(r[0]-l[0],'edge dx'),dy=measured(r[1]-l[1],'edge dy'),fullWidthPx=positive(Math.hypot(dx,dy),'edge pair full width');
      const midpointPx=[l[0]/2+r[0]/2,l[1]/2+r[1]/2],offsetVectorPx=[measured(p[i][0]-midpointPx[0],'offset x'),measured(p[i][1]-midpointPx[1],'offset y')];
      const distanceFromMidpointPx=measured(Math.hypot(...offsetVectorPx),'midpoint distance'); observed++;
      return { vertex:i,status:'observed',midpointPx,fullWidthPx,offsetVectorPx,distanceFromMidpointPx,
        distanceInFullWidths:measured(distanceFromMidpointPx/fullWidthPx,'normalized offset'),
        signedCrossSectionOffsetInFullWidths:measured((offsetVectorPx[0]*(dx/fullWidthPx)+offsetVectorPx[1]*(dy/fullWidthPx))/fullWidthPx,'signed normalized offset') };
    });
    centerline={status:observed?'observed':'UNKNOWN',observedPairs:observed,totalVertices:p.length,provenance:pairedEdges.provenance,
      definition:'offset from supplied edge-pair midpoint; pair association/orientation is caller testimony',samples};
  }
  return { schema:'path-geometry@1',frame,units:{length:'px in named frame',angle:'radians; sign follows supplied x/y axes',normalized:'same-image full ribbon widths'},
    vertexCount:p.length,lengthPx:cumulative.at(-1),runDefinition:'each consecutive supplied segment; no automatic physical-bend segmentation',segments,turns,
    normalizedLength:widths?{status:'observed',value:measured(segments.reduce((s,v)=>s+v.lengthInFullRibbonWidths,0),'summed normalized length'),provenance:width.provenance}:unknown('No local full ribbon widths supplied'),
    supportEvidence,centerline,interpretation:'posthoc measurements only; no endpoint ownership, ranking score or human acceptance' };
}

/** A sharp count is opt-in and must carry the caller's explicit definition. */
export function countTurns(descriptor, { definition, predicate } = {}) {
  referent(definition,'turn definition');
  if (typeof predicate !== 'function') throw new TypeError('turn predicate must be supplied explicitly');
  const vertices=[];
  for (const turn of descriptor.turns) {
    const yes=predicate(turn);
    if(typeof yes!=='boolean') throw new TypeError('turn predicate must return boolean');
    if(yes) vertices.push(turn.vertex);
  }
  return { definition,count:vertices.length,vertices,interpretation:'caller-defined count; no exponential penalty or learned cutoff' };
}
