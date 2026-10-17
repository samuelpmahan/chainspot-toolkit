import { compile, snapshotPaths, sha, canonical, BASE } from '../facts.mjs';
import { stageState, stageRequest } from '../recipes/closure.mjs';

/** Close a named source state with every dependency and executable policy file present. */
export async function neat(root, selected) {
  const closed = new Set(selected.files);
  for (const path of selected.files) if (path.startsWith('targets/')) {
    const target = await compile(root,path);
    for (const file of target.files) closed.add(file.path);
  }
  for (const path of ['README.md','REVIEW.md','replay.mjs','facts.mjs','toolkit.mjs','models.mjs','models.test.mjs','inventory.test.mjs','provider-adapter.test.mjs','semantic','policies/neat.mjs','policies/kompoze.mjs','policies/crisp.mjs','policies/tidy.mjs','dependencies/smartsync.mjs','dependencies/localci.mjs']) closed.add(path);
  const files = await snapshotPaths(root,[...closed]);
  const checkpoint = {schema:'nctk-checkpoint@1',base:BASE,selectedPaths:selected.files,closedPaths:[...closed].sort(),files};
  checkpoint.id = sha(canonical(checkpoint));
  return checkpoint;
}

/** Immutable state of the ordered recipe, chosen source and executable closure. */
export async function neatStages(root, options={}) {
  const state=await stageState(root,options);
  const checkpoint={schema:'nctk-stage-checkpoint@1',base:BASE,
    selectedPaths:[state.recipe.path,...state.stages.flatMap(s=>[s.path,s.lane.path]),state.source.path],
    request:stageRequest(state),closedPaths:state.files.map(f=>f.path),files:state.files};
  // A git-tree checkpoint records where its bytes live; working-tree checkpoints keep their historical identity.
  if(options.origin)checkpoint.origin=options.origin;
  checkpoint.id=sha(canonical(checkpoint));
  return checkpoint;
}
