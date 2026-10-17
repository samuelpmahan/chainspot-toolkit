import { compile, differences } from '../facts.mjs';
import { stageState, stageRequest, stageFingerprint } from '../recipes/closure.mjs';

/** Resolve a literal declaration path into its validated dependency graph and Ticks. */
export async function kompoze(root, checkpoint, targetPath, argsOverride = {}) {
  const compiled = await compile(root, targetPath);
  if (checkpoint.base !== compiled.base) throw Error(`Checkpoint base mismatch: ${checkpoint.base}`);
  const old = new Map(checkpoint.files.map(f => [f.path, f]));
  const missing = compiled.files.filter(f => !old.has(f.path));
  if (missing.length) throw Error(`Partial checkpoint, missing ${missing.map(f => f.path).join(', ')}`);
  const changed = differences(compiled.files.map(f => old.get(f.path)), compiled.files);
  if (changed.length) throw Error(`Checkpoint is stale: ${changed.map(c => c.path).join(', ')}`);
  const args = {...compiled.target.args, ...argsOverride};
  if (Object.keys(argsOverride).some(k => !(k in compiled.target.args))) throw Error('Undeclared Run Arg');
  return { ...compiled, args, tickPaths:compiled.target.ticks };
}

/** Resolve a selected prefix/lane set against the immutable source and runtime. */
export async function kompozeStages(root,checkpoint,options={}) {
  if(checkpoint.schema!=='nctk-stage-checkpoint@1')throw Error('Expected a stage checkpoint');
  const state=await stageState(root,options);
  const expected=new Map(checkpoint.files.map(f=>[f.path,f]));
  const missing=state.files.filter(f=>!expected.has(f.path));
  if(missing.length)throw Error(`Partial stage checkpoint: ${missing.map(f=>f.path).join(', ')}`);
  const changed=differences(state.files.map(f=>expected.get(f.path)),state.files);
  if(changed.length)throw Error(`Stage checkpoint stale: ${changed.map(f=>f.path).join(', ')}`);
  if(checkpoint.base!==state.recipe.providerBase)throw Error('Stage provider base mismatch');
  if(checkpoint.request.sourcePath!==state.source.path)throw Error('Source outside checkpoint');
  return {...state,request:stageRequest(state),fingerprint:stageFingerprint(state)};
}
