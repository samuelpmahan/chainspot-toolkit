import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { canonical, sha, snapshotPaths } from '../facts.mjs';
import { compileStageRecipe } from './compile.mjs';

export const STAGE_RUNTIME = [
  'source/provider', 'ports/run-stages.mjs', 'ports/early', 'fg', 'recipes',
  'policies', 'dependencies', 'toolkit.mjs', 'facts.mjs',
  'provider-adapter.mjs', 'models.mjs',
  // ComparableForkJoin inputs: competing implementations by slot, equality
  // Contracts for the geometric join, and Sam's annotation testimony.
  'impl', 'contracts', 'testimony', 'specimens'
];
export const STAGE_SOURCES = {
  golden: 'source/provider/artifacts/replay/source/IMG_5641.jpg',
  alex: 'source/provider/artifacts/replay/source/AlexClark-original.jpg',
  // Dev courses from chainspot-corpus dev/ (Sam's annotated set; sealed/ and
  // validation/ stay out). Testimony lives under testimony/<specimen>/.
  lenard: 'specimens/dev/Lenard-full.png',
  townelake: 'specimens/dev/TowneLake-full.png',
  heritage: 'specimens/dev/HeritagePark-full.png',
  // Unannotated dev images (no testimony): NorthPark, and Lenard's five partial captures.
  northpark: 'specimens/dev/NorthPark-full.png',
  lenard1: 'specimens/dev/Lenard-1.png', lenard2: 'specimens/dev/Lenard-2.png', lenard3: 'specimens/dev/Lenard-3.png',
  lenard4: 'specimens/dev/Lenard-4.png', lenard5: 'specimens/dev/Lenard-5.png',
  // E27 (local, not committed): single-raster captures outside the dev set, from chainspot-corpus demo/ and chainspot resources/
  therec: 'specimens/wide/therec.jpg', therecThrown: 'specimens/wide/therecThrown.png', dashs5612: 'specimens/wide/dashs5612.png',
  dashs5613: 'specimens/wide/dashs5613.png', unknown5693: 'specimens/wide/unknown5693.png', lenardChrome: 'specimens/wide/lenardChrome.png'
};

/** One literal authoring path list closes an execution; no second registration table. */
export async function stageState(root, options={}) {
  const sourcePath=options.sourcePath??STAGE_SOURCES.golden;
  if (!Object.values(STAGE_SOURCES).includes(sourcePath)) throw Error(`Unpinned stage source: ${sourcePath}`);
  const compiled=await compileStageRecipe(root,options.recipePath,options.selection);
  const runtime=[...STAGE_RUNTIME,...compiled.stages.flatMap(s=>[s.path,s.lane.path,...s.auxiliaryLanes.map(l=>l.path)]),
    ...(compiled.until>=4?['ports/late']:[]),
    ...(compiled.until>=7?['ports/s7.mjs','source/chainspot-teams/s7/replay.mjs',
      'source/chainspot-teams/s7/width-probe.mjs','source/chainspot-teams/s7/input/IMG_5641-rows.json']:[])];
  const files=await snapshotPaths(root,runtime);
  const source=files.find(f=>f.path===sourcePath);
  if(!source)throw Error(`Stage source missing from execution closure: ${sourcePath}`);
  return {...compiled,source:{...source},files};
}

export function stageRequest(state) {
  return {recipe:state.recipe.path,until:state.until,only:state.only,
    lanes:state.stages.flatMap(s=>[s.lane,...s.auxiliaryLanes]).filter(l=>l.enabled).map(l=>l.name),
    sourcePath:state.source.path,sourceSha256:state.source.sha256};
}

export function stageFingerprint(state) {
  return sha(canonical({request:stageRequest(state),files:state.files.map(f=>[f.path,f.sha256])}));
}

export async function verifiedEvidence(root,evidence) {
  if(!Array.isArray(evidence)||!evidence.length)return false;
  for(const entry of evidence) {
    const bytes=await readFile(join(root,entry.path)).catch(()=>null);
    if(!bytes||bytes.length!==entry.size||sha(bytes)!==entry.sha256)return false;
  }
  return true;
}
