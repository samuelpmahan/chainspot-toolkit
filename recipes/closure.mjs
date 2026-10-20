import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { canonical, sha, snapshotPaths } from '../facts.mjs';
import { compileStageRecipe } from './compile.mjs';

export const STAGE_RUNTIME = [
  'source/provider', 'ports/run-stages.mjs', 'ports/early', 'ports/capture', 'ports/identity/identitySpace.mjs', 'fg', 'recipes',
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
  // E27: single-raster captures outside the dev set, from chainspot-corpus demo/ and chainspot resources/
  therec: 'specimens/wide/therec.jpg', therecThrown: 'specimens/wide/therecThrown.png', dashs5612: 'specimens/wide/dashs5612.png',
  dashs5613: 'specimens/wide/dashs5613.png', unknown5693: 'specimens/wide/unknown5693.png', lenardChrome: 'specimens/wide/lenardChrome.png',
  // Dash's Track (McKinney / Frisco, TX): ChainSpot v1's public demo captures (static/resources/demo/dashs-track/), the course
  // Sam says golden is. One mid-round overview and four overlapping map tiles (partial views), phone chrome included.
  dashsOverview: 'specimens/demo/dashs-udisc-round-overview.png',
  dashs1: 'specimens/demo/dashs-udisc-capture-1.png', dashs2: 'specimens/demo/dashs-udisc-capture-2.png',
  dashs3: 'specimens/demo/dashs-udisc-capture-3.png', dashs4: 'specimens/demo/dashs-udisc-capture-4.png',
  // The REC (McKinney, TX; 9 holes) as one raster, and captures: 2..N tiles of ONE course that S0 stitches into one course
  // raster (ports/capture/capture.mjs; Sam, 2026-10-19: "a stitched course is one raster").
  therec: 'specimens/wide/therec.jpg',
  therecCapture: 'specimens/captures/therec.capture.json', dashsCapture: 'specimens/captures/dashs.capture.json',
  lenardCapture: 'specimens/captures/lenard.capture.json',
  // chainspot-corpus validation/ (no testimony; checked by eye). Per course: <name>Capture (the -1..N tiles, one course),
  // <name>Full (zoomed so the course fills the screen) and <name>Lazy (the app's default overview, course small in frame).
  // Seatac has no -lazy screenshot. Images live in specimens/validation/<Course>/ (copied from the corpus, not committed).
  beaverranchCapture: 'specimens/captures/beaverranch.capture.json',
  beaverranchFull: 'specimens/validation/BeaverRanch-Gold/BeaverRanch-Gold-full.png',
  beaverranchLazy: 'specimens/validation/BeaverRanch-Gold/BeaverRanch-Gold-lazy.png',
  coletocreekCapture: 'specimens/captures/coletocreek.capture.json',
  coletocreekFull: 'specimens/validation/ColetoCreek/ColetoCreek-full.png',
  coletocreekLazy: 'specimens/validation/ColetoCreek/ColetoCreek-lazy.png',
  fountainhillsCapture: 'specimens/captures/fountainhills.capture.json',
  fountainhillsFull: 'specimens/validation/FountainHills/FountainHills-full.png',
  fountainhillsLazy: 'specimens/validation/FountainHills/FountainHills-lazy.png',
  seatacCapture: 'specimens/captures/seatac.capture.json',
  seatacFull: 'specimens/validation/Seatac/Seatac-full.png'
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
    let bytes=null; try { bytes=readFileSync(join(root,entry.path)); } catch {}
    if(!bytes||bytes.length!==entry.size||sha(bytes)!==entry.sha256)return false;
  }
  return true;
}
