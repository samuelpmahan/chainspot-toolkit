/**
 * fg.s2.pxBaskets.assembly (stages/s2.json), the materialization guarantee
 * of the declared spec delta refine.s2.basketAssembly.bodyFirst. Lane
 * s2-basket-assembly, default OFF (dormant; the stage reproduces the pinned
 * baseline exactly). With the lane on, the toolkit body-first basket
 * assembly Calculation (ports/early/s2BasketAssembly.mjs) runs on a branch
 * restored from the S2 snapshot over the pinned component evidence, never
 * over the finished px.baskets set; the base board is never written.
 *
 * Exact reproduction, not a recorded delta: the M1 base-delta of every
 * fused basket vs its px.baskets object must be empty (delta:px.baskets),
 * the fused union must equal fg.s2.pxBaskets.materialize's claimed union
 * (gated), a second branch must reproduce the Part (witnessed:branch) and
 * basket 1's body and shell are re-derived from the raster fields by a code
 * path that never reads the findPx refs (witnessed:rederiveBasketDecomposition).
 *
 * Artifact artifacts/s2assembly/px.baskets.assembly.json (bytes unchanged),
 * record stages[S2].basketAssemblyMaterialization /
 * materializations.S2BasketAssembly, lane evidence experiments.branches.S2ASM.
 */
import { branchRun, guarantee, pipe, step } from '../compose.mjs';
import { delta, framed, gated, lane, materialized, published, sameCanon, unitful, witnessed } from '../mixins.mjs';
import { computeBasketAssembly, rederiveBasketDecomposition, BASKET_ASSEMBLY } from '../../ports/early/s2BasketAssembly.mjs';
import { legacyCanon } from '../legacy.mjs';

const ID = 'fg.s2.pxBaskets.assembly';
const MATERIALIZE = 'fg.s2.pxBaskets.materialize';
const CONSUMES = ['px.baskets', 'px.baskets.shellFamily', 'px.components'];
const PART = BASKET_ASSEMBLY.part;
const UNITS = { exactBaskets: 'count (baskets)', ofBaskets: 'count (baskets)' };
const rowsWhere = (rows, bad, say) => rows.filter(bad).map(say);
const component = (rec, name) => rec.components.find((c) => c.name === name);

const OP = {
  id: 'early.S2.basketAssembly', kind: 'measure', gate: 'shared', unit: 'early-s2-basket-assembly',
  consumes: CONSUMES,
  produces: [PART], calculations: [BASKET_ASSEMBLY.assemblyCalculation], accessConformance: 'exact',
  note: 'Declared spec delta refine.s2.basketAssembly.bodyFirst: each Basket Part is re-assembled from its component evidence through the phase-1 assembly shape with the bright body as the declared base and the shell fused onto it, the tip carried as the anchor, and window ownership accounted against the semantic bbox. Branch from the S2 snapshot; base emissions unchanged.'
};

const subject = step('read the branch Part', (env, s) => {
  const assembly = s.branch.branch.get(PART);
  if (!assembly || !Array.isArray(assembly.baskets)) env.fail('branch did not produce px.baskets.assembly');
  const base = env.get('px.baskets');
  if (assembly.baskets.length !== base.length) env.fail(`assembly basket count ${assembly.baskets.length} != baseline px.baskets count ${base.length}`);
  return { assembly, base, totals: assembly.totals };
}, { reads: CONSUMES });

const reproduction = step('reproduction ledger', (env, s) => {
  const rows = s.assembly.baskets.map((rec, i) => {
    const d = s.delta.perObject[`#${i}`];
    return {
      index: i, label: rec.label,
      bodyPxCount: rec.components[0].pxCount, shellPxCount: rec.components[1].pxCount,
      fusedPxCount: rec.fusedPxCount, baselinePxCount: d.basePx,
      componentOverlapPx: rec.componentOverlapPx,
      residuePx: rec.residuePx,
      differingPx: d.differingPx, exact: d.differingPx === 0 && rec.fusedPxCount === d.basePx
    };
  });
  const t = s.totals;
  const [lo, hi] = BASKET_ASSEMBLY.expectedResidueBandPx;
  const bodyPx = s.base.reduce((n, b) => n + b.whitePx, 0), shellPx = s.base.reduce((n, b) => n + b.blackPx, 0);
  env.check('bodyShellTotalsMatchBaseline', t.bodyPx === bodyPx && t.shellPx === shellPx, { assembly: [t.bodyPx, t.shellPx], baselineWhiteBlack: [bodyPx, shellPx] });
  env.check('componentOverlapZero', rows.every((r) => r.componentOverlapPx === 0),
    { overlapping: rowsWhere(rows, (r) => r.componentOverlapPx !== 0, (r) => `basket ${r.label} overlaps by ${r.componentOverlapPx} px`) });
  env.check('residueWithinPhase1Band', rows.every((r) => r.residuePx >= lo && r.residuePx <= hi),
    { band: [lo, hi], outOfBand: rowsWhere(rows, (r) => r.residuePx < lo || r.residuePx > hi, (r) => `basket ${r.label} residue ${r.residuePx} px`) });
  env.check('ownedOutsideWindowZero', s.assembly.baskets.every((r) => r.ownership.ownedOutsideWindowPx === 0),
    { outside: rowsWhere(s.assembly.baskets, (r) => r.ownership.ownedOutsideWindowPx !== 0, (r) => `basket ${r.label} owns ${r.ownership.ownedOutsideWindowPx} px outside`) });
  return { reproduction: rows, exactBaskets: rows.filter((r) => r.exact).length };
});

// Basket 1's body and shell from the raster fields, never the findPx body ref or findShellFamily blackPx.
const rederived = witnessed.path('rederiveBasketDecomposition', {
  name: 'rederivationExact', as: 'rederivation', reads: ['px.baskets.shellFamily', 'px.components'],
  run: (s, env) => {
    const w = rederiveBasketDecomposition({ basket: s.base[0], shellFamily: env.get('px.baskets.shellFamily'), fields: env.get('px.components') });
    const rec = s.assembly.baskets[0];
    const summary = { basketLabel: rec.label, basketIndex: 0, bodyPx: w.body.px.length, shellPx: w.shell.px.length };
    if (!sameCanon([...w.body.px].sort((a, b) => a - b), [...component(rec, 'body').px].sort((a, b) => a - b))) return { ok: false, disagrees: 'body', summary };
    if (!sameCanon([...w.shell.px].sort((a, b) => a - b), [...component(rec, 'shell').px].sort((a, b) => a - b))) return { ok: false, disagrees: 'shell', summary };
    return { ok: true, summary };
  }
});

const assemble = step('assemble the assembly artifact', (env, s) => {
  const r = s.witnessReturns.rederivation;
  const witnesses = { reexecution: s.witnesses.reexecution, rederivation: r?.summary ? { ...r.summary, exact: s.witnesses.rederivation.ok } : null };
  return {
    receiptWitnesses: witnesses,
    artifact: {
      schema: 'nctk-s2-basket-assembly-artifact@1', part: PART, producedBy: BASKET_ASSEMBLY.assemblyCalculation,
      guarantee: ID, specDelta: BASKET_ASSEMBLY.specDelta, calculation: BASKET_ASSEMBLY.calculation,
      image: s.assembly.image, totals: s.totals, emits: s.assembly.emits,
      reproduction: s.reproduction, witnesses,
      baskets: s.assembly.baskets
    }
  };
});

const frames = framed((s) => {
  const { widthPx: width, heightPx: height } = s.assembly.image;
  const baskets = s.assembly.baskets;
  return [{
    title: `px.baskets.assembly: ${s.exactBaskets}/${s.reproduction.length} baskets reproduced body-first`, calculation: BASKET_ASSEMBLY.assemblyCalculation, tick: OP.id,
    parts: [
      { address: `${PART}#body`, kind: 'pxset', data: { width, height, px: baskets.flatMap((r) => component(r, 'body').px) } },
      { address: `${PART}#shell`, kind: 'pxset', data: { width, height, px: baskets.flatMap((r) => component(r, 'shell').px) } },
      { address: `${PART}#anchor`, kind: 'points', data: { points: baskets.filter((r) => Array.isArray(r.anchor?.value)).map((r) => [...r.anchor.value, r.label]) } },
      { address: PART, kind: 'ledger', artifact: s.entries[PART], data: { rows: s.reproduction } }
    ],
    verdicts: s.reproduction.map((r) => ({ name: `basket ${r.label}: fused ${r.fusedPxCount} vs baseline ${r.baselinePxCount}, residue ${r.residuePx}`, ok: r.exact && r.componentOverlapPx === 0 }))
  }];
});

export default guarantee({
  id: ID, guards: [PART], audit: [unitful({ units: UNITS })],
  result: (s) => ({ totals: s.totals, basketCount: s.totals.basketCount, specDelta: BASKET_ASSEMBLY.specDelta, exactBaskets: s.exactBaskets })
}, pipe(
  branchRun({ restore: 'fn.provider.restore.S2', op: OP, site: 's2.basketAssembly', calculate: (baskets, shellFamily, fields) => computeBasketAssembly({ baskets, shellFamily, fields }) }),
  lane('s2-basket-assembly'),
  subject,
  delta({ out: PART, base: 'px.baskets', by: BASKET_ASSEMBLY.assemblyCalculation, exact: 'allBasketsReproducedExactly',
    outPx: (s) => s.assembly.baskets.map((r, i) => [`#${i}`, r.fusedPx]), basePx: (s) => s.base.map((b, i) => [`#${i}`, b.px]) }),
  gated(MATERIALIZE, { checks: [{ name: 'fusedUnionMatchesBaseline', mine: (s) => s.totals.fusedUnionPx, theirs: (r) => r.totals.claimedPx }] }),
  reproduction,
  witnessed.branch({ canonical: (s, run) => legacyCanon(run.result) }),
  rederived,
  assemble,
  materialized({
    artifacts: (s) => [{ id: PART, kind: 'basket-assembly-json', path: 's2assembly/px.baskets.assembly.json', json: s.artifact }],
    reread: (s, read) => { const back = read(PART); return sameCanon(back.baskets, s.assembly.baskets) && sameCanon(back.totals, s.totals); }
  }),
  frames,
  published({
    stage: 'S2', key: 'basketAssemblyMaterialization', materialization: 'S2BasketAssembly',
    header: () => ({ specDelta: BASKET_ASSEMBLY.specDelta, part: PART, producedBy: BASKET_ASSEMBLY.assemblyCalculation }),
    body: (s) => ({ basketCount: s.totals.basketCount, totals: s.totals, reproduction: { exactBaskets: s.exactBaskets, ofBaskets: s.reproduction.length, baskets: s.reproduction }, witnesses: s.receiptWitnesses }),
    branch: {
      key: 'S2ASM',
      benefit: 'Every Basket Part is re-derived body-first from its component evidence, so the assembly structure (body base, fused shell, tip anchor, window residue) crosses the toolkit seam as named Parts instead of a flat px array with two counts.',
      falsifier: 'A basket fused set differs from the accepted px.baskets set, the fused union differs from 36,362, a basket component overlap is nonzero, or a basket window residue falls outside the phase-1 band of 1,172 to 1,177 px.',
      body: (s) => ({ partAddress: PART, totals: s.totals, reproduction: { exactBaskets: s.exactBaskets, ofBaskets: s.reproduction.length } })
    }
  })));
