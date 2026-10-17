/**
 * One toolkit op on a restored provider branch, from inside an FG
 * (browser-safe; not an FG file).
 *
 * Every spec-delta FG (S1 badge assembly, S2 basket assembly, S3 tee
 * assembly, S3 findFamily structural fix) had its own inline copy of the
 * same seven steps: restore a branch from a stage snapshot, check the op's
 * consumed addresses are on it, hash the canonical raster, build a one-op
 * compiled plan whose fingerprint is the provider's sha256 of the op,
 * execute it through the provider gateway with the toolkit Calculation
 * bound, hash the raster again, and fail if the branch mutated pixels. Here
 * it is once, reaching everything through the FG's ctx: the branch through
 * a declared fn.provider.restore.<S> call, the gateway through
 * fn.provider.executeCompiledPlan (auto-instrumented, per-op emits), the
 * fingerprint through fn.provider.sha256Text, raster hashes through
 * fn.tk.sha256. The FG must declare those four in `calls`.
 *
 *   runBranchOp(ctx, { restore, op, site, calculate, outputs, canonicalRgbaSha256 })
 *     calculate(...consumed)  the toolkit Calculation over op.consumes values
 *     outputs(result)         { [address]: value } the op writes on the branch
 *                             (default: { [op.produces[0]]: result })
 *   -> { branch, ticks, result, after }
 *
 *   tickEvidence(op, ticks)   the receipt's per-tick declared/actual view
 */
export const BRANCH_CALLS = Object.freeze(['fn.provider.executeCompiledPlan', 'fn.provider.sha256Text', 'fn.tk.sha256']);
const IMAGE = 'px.image.cropped'; // ComponentPxC.image

export function runBranchOp(ctx, { restore, op, site, calculate, outputs, canonicalRgbaSha256 }) {
  const branch = ctx.call(restore);
  for (const address of op.consumes)
    if (!branch.has(address)) ctx.fail(`branch restored by ${restore} is missing ${address}; the evidence ${op.id} consumes is not exposed on that snapshot`);
  const rasterSha = () => ctx.call('fn.tk.sha256', { bytes: branch.get(IMAGE).rgba });
  const before = rasterSha();
  let result = null;
  const bound = (...inputs) => { result = calculate(...inputs); return result; };
  const write = outputs ?? ((value) => ({ [op.produces[0]]: value }));
  const plan = { ops: [op], bindings: {}, planFingerprint: ctx.call('fn.provider.sha256Text', { text: JSON.stringify(op) }) };
  const runtime = {
    implementations: new Map([[op.id, (board) => {
      const value = bound(...op.consumes.map((address) => board.get(address)));
      for (const [address, part] of Object.entries(write(value))) board.set(address, part);
    }]]),
    calculationBindings: new Map([[op.id, op.calculations.map((address) => ({ address, calculate: bound }))]])
  };
  const ticks = ctx.call('fn.provider.executeCompiledPlan', { site, plan, board: branch, runtime });
  const after = rasterSha();
  if (before !== after || before !== canonicalRgbaSha256) ctx.fail(`${site} branch mutated canonical pixels`);
  return { branch, ticks, result, after };
}

export const tickEvidence = (op, ticks) => ticks.map((t) => ({
  id: t.opId,
  declared: { consumes: op.consumes, produces: op.produces, calculations: op.calculations },
  actual: { consumes: t.actualConsumes, produces: t.actualProduces, writes: t.writes },
  frozenCalculations: t.frozenCalculations
}));
