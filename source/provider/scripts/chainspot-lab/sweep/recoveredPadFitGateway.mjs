/** Execute the candidate's public ABFeature descriptor through the real PxC gateway. */
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFileSync,writeFileSync,readdirSync } from 'node:fs';
import { resolve,join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { constrainedSupportSet, FEATURE_ID } from '../../../exp/recovered-pad-fit/constrainedSupportFeature.mjs';
const root=resolve(fileURLToPath(new URL('../../../',import.meta.url)));
const require=createRequire(import.meta.url),dist=name=>require(resolve(root,'packages/alg/dist',name));
const {compileABFeatureSet,createExecBoard,executeABFeatureSet}=dist('exec');
const {nullFeatureContext}=dist('detectors/threeFactor/features/types');
const sha=b=>createHash('sha256').update(b).digest('hex');
const folder=resolve(root,'artifacts/recovered-pad-fit-20260927');
function treeIdentity(dir,suffixes){
  const files=[];function walk(d){for(const e of readdirSync(d,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){
    const p=join(d,e.name);if(e.isDirectory())walk(p);else if(suffixes.test(e.name))files.push([p.slice(dir.length),sha(readFileSync(p))]);
  }}walk(dir);return sha(JSON.stringify(files));
}
const providerIdentity={sourceAlgSha256:treeIdentity(resolve(root,'packages/alg/src'),/\.(ts|json|yaml)$/),
  compiledAlgSha256:treeIdentity(resolve(root,'packages/alg/dist'),/\.(js|json)$/),
  featureModuleSha256:sha(readFileSync(resolve(root,'exp/recovered-pad-fit/constrainedSupportFeature.mjs')))};
for(const name of ['AlexClark-original','IMG_5641']){
  const inputBytes=readFileSync(resolve(folder,`${name}-poses.json`));
  const measuredBytes=readFileSync(resolve(folder,`${name}-comparison.json`));
  const input=JSON.parse(inputBytes),measured=JSON.parse(measuredBytes);
  if(measured.poseInputSha256!==sha(inputBytes)||measured.frozenCaptureSha256!==input.frozenCaptureSha256||
    measured.source.sha256!==input.source.sha256||measured.paramsHash!==input.paramsHash)
    throw Error('Pose/comparison byte identity or frame/config mismatch');
  const baselineBytes=JSON.stringify(measured.rows.map(r=>({teeId:r.teeId,corners:r.baselineCorners}))) ;
  const runs={};
  for(const enabled of [false,true]){
    const board=createExecBoard();board.set('recoveredPadFit.input',input);
    const boardInputBefore=sha(JSON.stringify(board.get('recoveredPadFit.input')));
    const compiled=compileABFeatureSet(constrainedSupportSet,enabled?{[FEATURE_ID]:{enabled:true}}:{});
    const manifest=await executeABFeatureSet(compiled,board,nullFeatureContext,
      {runId:`${name}-${enabled?'ON':'OFF'}`,invocation:'recoveredPadFitGateway.mjs'});
    const candidate=board.has('recoveredPadFit.candidate')?board.get('recoveredPadFit.candidate'):null;
    const boardInputAfter=sha(JSON.stringify(board.get('recoveredPadFit.input')));
    if(boardInputBefore!==boardInputAfter)throw Error('Gateway mutated seeded input Part');
    if(!enabled && (candidate!==null||manifest.operations.length!==0))throw Error('Default OFF performed an operation');
    if(enabled){
      if(manifest.operations.length!==1||!candidate||candidate.entries.length!==input.matches.length||
          candidate.noFit.length!==input.negativeControl.length)throw Error('Gateway candidate inventory mismatch');
      for(const [i,row] of candidate.entries.entries()){
        const ref=measured.rows[i];if(row.teeId!==ref.teeId||row.resultRef!==ref.resultRef||
          Math.max(...row.corners.flatMap((p,j)=>p.map((n,k)=>Math.abs(n-ref.constrainedSupportCorners[j][k]))))>1e-9)
          throw Error(`Gateway candidate geometry mismatch ${row.teeId}`);
      }
      const receipt=manifest.operations[0];
      if(JSON.stringify(receipt.actualConsumes)!==JSON.stringify(['recoveredPadFit.input'])||
        JSON.stringify(receipt.actualProduces)!==JSON.stringify(['recoveredPadFit.candidate'])||
        !receipt.artifacts.some(a=>a.kind==='measurementTable'))throw Error('Gateway custody/artifact mismatch');
    }
    if(JSON.stringify(measured.rows.map(r=>({teeId:r.teeId,corners:r.baselineCorners})))!==baselineBytes)
      throw Error('Frozen baseline mutated');
    runs[enabled?'ON':'OFF']={manifest,candidate,baselineGeometrySha256:sha(baselineBytes),
      boardInputBeforeSha256:boardInputBefore,boardInputAfterSha256:boardInputAfter};
  }
  const output={schema:'recovered-pad-fit-gateway@1',name,featureId:FEATURE_ID,
    providerIdentity,
    sourceSha256:input.source.sha256,frame:input.source.frame,
    paramsHash:input.paramsHash,poseInputSha256:sha(inputBytes),
    comparisonSha256:sha(measuredBytes),runs};
  writeFileSync(resolve(folder,`${name}-gateway.json`),JSON.stringify(output,null,2));
  const lines=[`Recovered pad fit candidate | ${name} | original-image px`,
    `runId=${runs.ON.manifest.runId} imageId=${input.source.sha256} paramsHash=${input.paramsHash}`,
    `featureId=${FEATURE_ID} manifestHash=${runs.ON.manifest.manifestHash} sourceSha256=${input.source.sha256}`,
    `actual provider sourceSha256=${providerIdentity.sourceAlgSha256} distSha256=${providerIdentity.compiledAlgSha256} featureModuleSha256=${providerIdentity.featureModuleSha256}`,
    `frame=${input.source.frame.name}, canonicalToSource=${JSON.stringify(input.source.frame.canonicalToSource)}; G4 accept fit is badge-constrained, not independent badge proof.`,
    `OFF: ${runs.OFF.manifest.operations.length} operations, frozen baseline corners sha256=${runs.OFF.baselineGeometrySha256}`,
    `ON: ${runs.ON.manifest.operations.length} operation, candidate Part ${runs.ON.candidate.entries.length} geometry rows and ${runs.ON.candidate.noFit.length} explicit no-fit rows, frozen baseline corners sha256=${runs.ON.baselineGeometrySha256}`,
    `Seeded input Part before/after OFF=${runs.OFF.boardInputBeforeSha256}/${runs.OFF.boardInputAfterSha256}, ON=${runs.ON.boardInputBeforeSha256}/${runs.ON.boardInputAfterSha256}`,
    `Feature set planFingerprint OFF=${runs.OFF.manifest.planFingerprint}, ON=${runs.ON.manifest.planFingerprint}; input pose sha256=${sha(inputBytes)}, comparison sha256=${sha(measuredBytes)}`,
    `Tick ${runs.ON.manifest.operations[0].opId}: actual consumes ${runs.ON.manifest.operations[0].actualConsumes.join(',')}; actual produces ${runs.ON.manifest.operations[0].actualProduces.join(',')}; duration ${runs.ON.manifest.operations[0].durationMs.toFixed(3)} ms; artifact ${runs.ON.manifest.operations[0].artifacts[0].sha256}`,
    `Hollow band = original G4 course-measured stroke thickness plus 1.25 px raster tolerance. Finite perimeter <=1.25 px = diagnostic, not full edge or AA completeness.`,
    'teeId | fragment | source | baseline hollow/selected -> support hollow/selected | baseline finite outer -> support finite outer | angle baseline -> support | verdict'];
  for(const row of measured.rows){
    const cand=runs.ON.candidate.entries.find(c=>c.teeId===row.teeId);
    if(!cand||cand.resultRef!==row.resultRef)throw Error('Candidate/CLI row mismatch');
    lines.push(`${row.teeId} | ${row.resultRef} (${row.pixelCount}px) | ${row.source} | ${row.baseline.bandExplained}/${row.pixelCount} -> ${row.constrainedSupport.bandExplained}/${row.pixelCount} | ${row.baseline.finitePerimeterWithin1_25} -> ${row.constrainedSupport.finitePerimeterWithin1_25} | ${row.baseline.angleDegModulo180.toFixed(2)}deg -> ${row.constrainedSupport.angleDegModulo180.toFixed(2)}deg | candidate constrained support`);
  }
  for(const row of runs.ON.candidate.noFit)lines.push(`${row.teeId} | no observed fragment (0px) | ${row.reason} | no-fit; corners=null`);
  lines.push('Visible full/zoom comparison: focus-H11-H12.png plus AlexClark-original-comparison.png and IMG_5641-comparison.png; cyan candidate corners are verified against this gateway Part.');
  writeFileSync(resolve(folder,`${name}-CLI.txt`),lines.join('\n')+'\n');
  console.log(name,'OFF ops=',runs.OFF.manifest.operations.length,'ON ops=',runs.ON.manifest.operations.length,
    'candidate rows=',runs.ON.candidate.entries.length,'noFit=',runs.ON.candidate.noFit.length,
    'baseline parity=',runs.ON.baselineGeometrySha256===runs.OFF.baselineGeometrySha256);
}
