/**
 * fg.s3.pxTees.assembly (stages/s3.json), the materialization guarantee of
 * the declared spec delta refine.s3.teeAssembly.interiorFirst. Lane
 * s3-tee-assembly, default OFF (dormant; the stage reproduces the pinned
 * baseline exactly). With the lane on, the toolkit interior-first tee
 * assembly Calculation (ports/early/s3TeeAssembly.mjs) runs on a branch
 * restored from the S3 snapshot; the base board is never written. The
 * delta is additive, not a reproduction: the FRAME component's M1
 * base-delta vs its px.tees object must be empty (delta:px.tees), the
 * interior must equal the ring's recorded holeArea, the overlap is zero,
 * and the frame union gates against fg.s3.pxTees.materialize's claimed
 * union; a second branch reproduces the Part, and tee 1's interior is
 * re-derived from the raster fields (witnessed:rederiveTeeInterior).
 *
 * Artifact artifacts/s3assembly/px.tees.assembly.json (bytes unchanged),
 * record stages[S3].teeAssemblyMaterialization / materializations.S3TeeAssembly,
 * lane evidence experiments.branches.S3ASM.
 */
import { branchRun, guarantee, pipe, step } from '../compose.mjs';
import { delta, framed, gated, lane, materialized, published, sameCanon, unitful, witnessed } from '../mixins.mjs';
import { computeTeeAssembly, rederiveTeeInterior, TEE_ASSEMBLY } from '../../ports/early/s3TeeAssembly.mjs';
import { legacyCanon } from '../legacy.mjs';

const ID = 'fg.s3.pxTees.assembly';
const MATERIALIZE = 'fg.s3.pxTees.materialize';
const CONSUMES = ['px.tees', 'px.tees.rings', 'px.components'];
const PART = TEE_ASSEMBLY.part;
const UNITS = { holeArea: 'px', exactTees: 'count (tees)', ofTees: 'count (tees)', anchor: 'px', frameCentroid: 'px' };
const rowsWhere = (rows, bad, say) => rows.filter(bad).map(say);
const component = (rec, name) => rec.components.find((c) => c.name === name);

const OP = {
  id: 'early.S3.teeAssembly', kind: 'measure', gate: 'shared', unit: 'early-s3-tee-assembly',
  consumes: CONSUMES,
  produces: [PART], calculations: [TEE_ASSEMBLY.assemblyCalculation], accessConformance: 'exact',
  note: 'Declared spec delta refine.s3.teeAssembly.interiorFirst: each baseline Tee Part is assembled whole from its evidence through the phase-1 assembly shape with the enclosed interior as the declared base and the frame component fused onto it, the ring center carried as the anchor, and window ownership accounted against the frame bbox. Branch from the S3 snapshot; base emissions unchanged.'
};

const subject = step('read the branch Part', (env, s) => {
  const assembly = s.branch.branch.get(PART);
  if (!assembly || !Array.isArray(assembly.tees)) env.fail('branch did not produce px.tees.assembly');
  const base = env.get('px.tees');
  if (assembly.tees.length !== base.length) env.fail(`assembly tee count ${assembly.tees.length} != baseline px.tees count ${base.length}`);
  return { assembly, base, totals: assembly.totals };
}, { reads: CONSUMES });

const reproduction = step('reproduction ledger', (env, s) => {
  const rows = s.assembly.tees.map((rec, i) => {
    const d = s.delta.perObject[`#${i}`];
    return {
      index: i, label: rec.label,
      framePxCount: rec.components[1].pxCount, baselinePxCount: d.basePx,
      interiorPxCount: rec.components[0].pxCount, holeArea: rec.ring.holeArea,
      fusedPxCount: rec.fusedPxCount,
      componentOverlapPx: rec.componentOverlapPx,
      residuePx: rec.residuePx,
      anchor: rec.anchor.value, frameCentroid: rec.anchor.frameCentroid,
      anchorDistancePx: rec.anchor.distanceToFrameCentroidPx,
      frameDifferingPx: d.differingPx, interiorDifferingPx: Math.abs(rec.components[0].pxCount - rec.ring.holeArea),
      exact: d.differingPx === 0 && rec.components[1].pxCount === d.basePx && rec.components[0].pxCount === rec.ring.holeArea
    };
  });
  env.check('interiorsMatchHoleArea', rows.every((r) => r.interiorDifferingPx === 0),
    { inexact: rowsWhere(rows, (r) => r.interiorDifferingPx !== 0, (r) => `tee ${r.label} interior differs by ${r.interiorDifferingPx} px (derived ${r.interiorPxCount} vs ring holeArea ${r.holeArea})`) });
  env.check('componentOverlapZero', rows.every((r) => r.componentOverlapPx === 0),
    { overlapping: rowsWhere(rows, (r) => r.componentOverlapPx !== 0, (r) => `tee ${r.label} overlaps by ${r.componentOverlapPx} px`) });
  env.check('ownedOutsideWindowZero', s.assembly.tees.every((r) => r.ownership.ownedOutsideWindowPx === 0),
    { outside: rowsWhere(s.assembly.tees, (r) => r.ownership.ownedOutsideWindowPx !== 0, (r) => `tee ${r.label} owns ${r.ownership.ownedOutsideWindowPx} px outside`) });
  return { reproduction: rows, exactTees: rows.filter((r) => r.exact).length };
});

// Tee 1's interior: the not-bright component containing the tee center, never the findPx refs or the ring record.
const rederived = witnessed.path('rederiveTeeInterior', {
  name: 'rederivationExact', as: 'rederivation', reads: ['px.components'],
  run: (s, env) => {
    const w = rederiveTeeInterior({ tee: s.base[0], fields: env.get('px.components') });
    const rec = s.assembly.tees[0];
    const summary = { teeLabel: rec.label, teeIndex: 0, interiorPx: w.interior.px.length, holeArea: rec.ring.holeArea };
    const same = sameCanon([...w.interior.px].sort((a, b) => a - b), [...component(rec, 'interior').px].sort((a, b) => a - b));
    return same ? { ok: true, summary } : { ok: false, disagrees: 'interior', summary };
  }
});

const assemble = step('assemble the assembly artifact', (env, s) => {
  const r = s.witnessReturns.rederivation;
  const witnesses = { reexecution: s.witnesses.reexecution, rederivation: r?.summary ? { ...r.summary, exact: s.witnesses.rederivation.ok } : null };
  return {
    receiptWitnesses: witnesses,
    artifact: {
      schema: 'nctk-s3-tee-assembly-artifact@1', part: PART, producedBy: TEE_ASSEMBLY.assemblyCalculation,
      guarantee: ID, specDelta: TEE_ASSEMBLY.specDelta, calculation: TEE_ASSEMBLY.calculation,
      image: s.assembly.image, totals: s.totals, emits: s.assembly.emits,
      reproduction: s.reproduction, witnesses,
      tees: s.assembly.tees
    }
  };
});

const frames = framed((s) => {
  const { widthPx: width, heightPx: height } = s.assembly.image;
  const tees = s.assembly.tees;
  return [{
    title: `px.tees.assembly: ${s.exactTees}/${s.reproduction.length} tees assembled interior-first (+${s.totals.interiorUnionPx} interior px)`, calculation: TEE_ASSEMBLY.assemblyCalculation, tick: OP.id,
    parts: [
      { address: `${PART}#interior`, kind: 'pxset', data: { width, height, px: tees.flatMap((r) => component(r, 'interior').px) } },
      { address: `${PART}#frame`, kind: 'pxset', data: { width, height, px: tees.flatMap((r) => component(r, 'frame').px) } },
      { address: `${PART}#anchor`, kind: 'points', data: { points: tees.map((r) => [...r.anchor.value, r.label]) } },
      { address: PART, kind: 'ledger', artifact: s.entries[PART], data: { rows: s.reproduction.map((r) => ({ ...r, anchor: r.anchor.map((v) => v.toFixed(2)).join(','), frameCentroid: Array.isArray(r.frameCentroid) ? r.frameCentroid.map((v) => v.toFixed(2)).join(',') : r.frameCentroid })) } }
    ],
    verdicts: s.reproduction.map((r) => ({ name: `tee ${r.label}: frame ${r.framePxCount}/${r.baselinePxCount}, interior ${r.interiorPxCount}/${r.holeArea}`, ok: r.exact && r.componentOverlapPx === 0 }))
  }];
});

export default guarantee({
  id: ID, guards: [PART], audit: [unitful({ units: UNITS })],
  result: (s) => ({ totals: s.totals, teeCount: s.totals.teeCount, specDelta: TEE_ASSEMBLY.specDelta, exactTees: s.exactTees })
}, pipe(
  branchRun({ restore: 'fn.provider.restore.S3', op: OP, site: 's3.teeAssembly', calculate: (tees, rings, fields) => computeTeeAssembly({ tees, rings, fields }) }),
  lane('s3-tee-assembly'),
  subject,
  delta({ out: `${PART}#frame`, base: 'px.tees', by: TEE_ASSEMBLY.assemblyCalculation, exact: 'allFramesReproducedExactly',
    outPx: (s) => s.assembly.tees.map((r, i) => [`#${i}`, r.components[1].px]), basePx: (s) => s.base.map((t, i) => [`#${i}`, t.px]) }),
  gated(MATERIALIZE, { checks: [{ name: 'fusedUnionArithmetic',
    mine: (s) => [s.totals.frameUnionPx, s.totals.fusedUnionPx], theirs: (r, s) => [r.totals.claimedPx, s.totals.frameUnionPx + s.totals.interiorUnionPx] }] }),
  reproduction,
  witnessed.branch({ canonical: (s, run) => legacyCanon(run.result) }),
  rederived,
  assemble,
  materialized({
    artifacts: (s) => [{ id: PART, kind: 'tee-assembly-json', path: 's3assembly/px.tees.assembly.json', json: s.artifact }],
    reread: (s, read) => { const back = read(PART); return sameCanon(back.tees, s.assembly.tees) && sameCanon(back.totals, s.totals); }
  }),
  frames,
  published({
    stage: 'S3', key: 'teeAssemblyMaterialization', materialization: 'S3TeeAssembly',
    header: () => ({ specDelta: TEE_ASSEMBLY.specDelta, part: PART, producedBy: TEE_ASSEMBLY.assemblyCalculation }),
    body: (s) => ({ teeCount: s.totals.teeCount, totals: s.totals, reproduction: { exactTees: s.exactTees, ofTees: s.reproduction.length, tees: s.reproduction }, witnesses: s.receiptWitnesses }),
    branch: {
      key: 'S3ASM',
      benefit: 'Every baseline Tee Part is assembled whole from its evidence (enclosed interior base, frame fused on, ring-center anchor, window-residue accounting), so the interior pixels the baseline Part never claimed are owned by the Part instead of living only as ring geometry on px.tees.rings, and the assembly structure crosses the toolkit seam as named Parts instead of a frame-only px array.',
      falsifier: 'A tee frame set differs from the accepted px.tees set, the frame union differs from 4,884, a tee interior size differs from its ring\'s recorded holeArea, or a tee component overlap is nonzero.',
      body: (s) => ({ partAddress: PART, totals: s.totals,
        delta: { frameOnlyBaselinePx: s.records[MATERIALIZE].totals.claimedPx, interiorAddedPx: s.totals.interiorUnionPx, fusedUnionPx: s.totals.fusedUnionPx },
        reproduction: { exactTees: s.exactTees, ofTees: s.reproduction.length } })
    }
  })));
