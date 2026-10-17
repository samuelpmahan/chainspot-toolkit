import { compile, differences } from '../facts.mjs';
import { STAGE_SOURCES, stageState, stageRequest, stageFingerprint } from '../recipes/closure.mjs';

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

const short=id=>String(id).slice(0,12);
const specimenOf=path=>Object.entries(STAGE_SOURCES).find(([,p])=>p===path)?.[0]??'custom';
export const describeRequest=r=>`specimen ${specimenOf(r.sourcePath)} (${r.sourcePath}), lanes [${r.lanes.join(',')||'none'}], --until ${r.until}`;
function refusal(code,message,details) { const error=Error(message); error.code=code; error.details=details; return error; }

/** Which parts of a request differ from what its checkpoint was made for (empty: it matches). */
export function checkpointMismatch(checkpoint,state) {
  const request=stageRequest(state),made=checkpoint.request;
  const inPrefix=new Set(state.stages.flatMap(s=>[s.lane,...s.auxiliaryLanes]).map(l=>l.name));
  const expected=made.lanes.filter(name=>inPrefix.has(name)).sort().join(',');
  return [made.sourcePath!==request.sourcePath&&'specimen',
    expected!==[...request.lanes].sort().join(',')&&'lanes',
    Number(request.until)>Number(made.until)&&'until'].filter(Boolean);
}

/** Resolve a selected prefix/lane set against the immutable source and runtime. */
export async function kompozeStages(root,checkpoint,options={}) {
  if(checkpoint.schema!=='nctk-stage-checkpoint@1')throw Error('Expected a stage checkpoint');
  const state=await stageState(root,options);
  const mismatch=checkpointMismatch(checkpoint,state);
  if(mismatch.length)throw refusal('CHECKPOINT_MISMATCH',
    `Stage checkpoint ${short(checkpoint.id)} does not match this request (${mismatch.join(', ')} differ).\n`+
    `  checkpoint was made for: ${describeRequest(checkpoint.request)}\n`+
    `  this request asks for:   ${describeRequest(stageRequest(state))}`,{mismatch});
  const expected=new Map(checkpoint.files.map(f=>[f.path,f]));
  const added=state.files.filter(f=>!expected.has(f.path));
  const modified=differences(state.files.filter(f=>expected.has(f.path)).map(f=>expected.get(f.path)),
    state.files.filter(f=>expected.has(f.path)));
  if(added.length||modified.length) {
    const lines=[...modified.map(f=>`  modified ${f.path} (checkpoint ${f.before.slice(0,12)}, now ${f.after.slice(0,12)})`),
      ...added.map(f=>`  added    ${f.path} (not in checkpoint)`)];
    const where=checkpoint.origin?.kind==='git'?`its git tree ${checkpoint.origin.tree}`:'the working tree';
    throw refusal(modified.length?'CHECKPOINT_STALE':'CHECKPOINT_PARTIAL',
      `${modified.length?'Stage checkpoint stale':'Partial stage checkpoint'}: ${short(checkpoint.id)} no longer matches `+
      `${where} in ${lines.length} file(s) of this request's execution closure:\n${lines.join('\n')}`,
      {modified:modified.map(f=>f.path),added:added.map(f=>f.path)});
  }
  if(checkpoint.base!==state.recipe.providerBase)throw Error('Stage provider base mismatch');
  return {...state,request:stageRequest(state),fingerprint:stageFingerprint(state)};
}
