import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
function pathIn(root, path) {
  if (typeof path !== 'string' || path.startsWith('/') || path.split('/').includes('..') || path.includes('\\')) throw Error(`Unsafe authoring path: ${path}`);
  const full=resolve(root,path);
  if (!full.startsWith(resolve(root)+sep)) throw Error(`Outside authoring root: ${path}`);
  return full;
}
async function declaration(root,path,kind) {
  const bytes=await readFile(pathIn(root,path));
  const doc=JSON.parse(bytes);
  if(doc.kind!==kind)throw Error(`${path}: expected ${kind}`);
  return {...doc,path,sha256:sha(bytes)};
}
/** Compile one ordered authoring list. Paths are identity; hashes are content identity. */
export async function compileStageRecipe(root,recipePath='recipes/chainspot-s0-s7.json',selection={}) {
  const recipe=await declaration(root,recipePath,'ordered-stage-recipe');
  const provenance=JSON.parse(await readFile(pathIn(root,'source/provider/REPLAY-PROVENANCE.json')));
  if(provenance.sourceCommit!==recipe.providerBase)throw Error('Provider base mismatch');
  const stages=[];
  for(const [index,path] of recipe.stages.entries()) {
    if(path!==`stages/s${index}.json`)throw Error(`Stage path/order mismatch: ${path}`);
    const stage=await declaration(root,path,'stage');
    if(stage.position!==index||!Array.isArray(stage.consumes)||!Array.isArray(stage.produces))throw Error(`Invalid Stage declaration: ${path}`);
    const lane=await declaration(root,stage.lane,'stage-refinement-lane');
    if(lane.stage!==path||lane.default!=='OFF')throw Error(`Lane default/binding mismatch: ${stage.lane}`);
    const auxiliaryLanes=[];
    for(const extra of stage.auxiliaryLanes??[]) {
      const choice=await declaration(root,extra,'stage-refinement-lane');
      if(choice.stage!==path||choice.default!=='OFF')throw Error(`Auxiliary Lane default/binding mismatch: ${extra}`);
      auxiliaryLanes.push(choice);
    }
    stages.push({...stage,lane,auxiliaryLanes});
  }
  if(stages.length!==8)throw Error(`Expected eight ordered Stages, found ${stages.length}`);
  // This graph validates the declared Stage boundary Parts, not every internal
  // Calculation/Part in the pinned provider's native gateway catalog.
  const external=new Set(['px.source.selectedInput','original JPEG source']);
  const producers=new Map();
  for(const stage of stages)for(const part of stage.produces) {
    if(producers.has(part))throw Error(`Ambiguous Stage Part producer: ${part} in ${producers.get(part).path} and ${stage.path}`);
    producers.set(part,stage);
  }
  const edges=[];
  for(const stage of stages)for(const part of stage.consumes) {
    const producer=producers.get(part);
    if(!producer&&!external.has(part))throw Error(`Missing Stage Part producer: ${stage.path} consumes ${part}`);
    if(producer?.position>stage.position)throw Error(`Forward Stage Part dependency/cycle: ${stage.path} consumes ${part} from ${producer.path}`);
    edges.push({consumer:stage.path,part,producer:producer?.path??'selected original source',
      scope:producer?.position===stage.position?'native internal Tick':producer?'prior Stage':'external source'});
  }
  const only=selection.only===undefined?null:Number(selection.only);
  const until=selection.until===undefined?7:Number(selection.until);
  if(!Number.isInteger(until)||until<0||until>7||only!==null&&(!Number.isInteger(only)||only<0||only>until))throw Error('Invalid Stage selection');
  const lanes=new Set(selection.lanes??[]);
  const known=new Set(stages.flatMap(s=>[s.lane,...s.auxiliaryLanes].map(l=>l.name)));
  for(const name of lanes)if(!known.has(name))throw Error(`Unknown Lane: ${name}`);
  if([...lanes].some(name=>stages.find(s=>[s.lane,...s.auxiliaryLanes].some(l=>l.name===name)).position>until))throw Error('Selected Lane beyond prefix');
  return {recipe:{path:recipe.path,sha256:recipe.sha256,providerBase:recipe.providerBase},
    graph:{scope:'declared Stage boundary Parts only; pinned native provider Calculations and inner Ticks retain their own PCR testimony',
      edges:edges.filter(edge=>Number(edge.consumer.match(/s(\d+)\.json$/)[1])<=until)},
    stages:stages.slice(0,until+1).map(s=>({...s,
    lane:{...s.lane,enabled:lanes.has(s.lane.name)},auxiliaryLanes:s.auxiliaryLanes.map(l=>({...l,enabled:lanes.has(l.name)}))})),only,until,
    identity:sha(JSON.stringify({recipe:recipe.sha256,stages:stages.slice(0,until+1).map(s=>[s.path,s.sha256,...[s.lane,...s.auxiliaryLanes].map(l=>[l.path,l.sha256,lanes.has(l.name)])]),only,until}))};
}
