/** Bind the independent existing smart-matcher S4 Part to this exact fresh S3 run. */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);

export function bindBasketBridge({receipt,sourcePath,sourceSha256,snapshotSha256,cropTopPx,existingBasketCount}) {
  if(!receipt)return null;
  if(receipt.schema!=='nctk-basket-recovery-bridge@1'||receipt.default!=='OFF'||receipt.mode!=='ON'||
     receipt.stage?.id!=='S4'||receipt.stage.tick!=='early.S4.smartBasketRecovery'||
     receipt.stage.calculation!=='fn.early.S4.matchBasketSpritesSmart'||receipt.stage.invocationCount!==1)
    throw Error('S4 basket bridge lacks the pinned opt-in calculation receipt');
  if(receipt.source?.sha256!==sourceSha256||resolve(receipt.source.path)!==resolve(sourcePath)||
     receipt.inputRunReceipt?.snapshotSha256!==snapshotSha256)
    throw Error('S4 basket bridge source/S3 snapshot identity mismatch');
  if(receipt.coordinateFrames?.cropUpperRowsRemoved!==cropTopPx||
     receipt.coordinateFrames?.sourceFrame!=='original input image pixel coordinates')
    throw Error('S4 basket bridge source-coordinate transformation mismatch');
  if(receipt.parts?.produces!=='px.early.s4.basketRecovery'||
     receipt.parts.existingS2BasketCount!==existingBasketCount||
     !receipt.pixelPreservation?.unchanged||!receipt.acceptedPartPreservation?.unchanged)
    throw Error('S4 basket bridge changed canonical/S2 identity or output Part');
  const artifact=receipt.parts.materialized;
  if(!artifact?.path||!artifact?.sha256)throw Error('S4 basket bridge exact Part artifact missing');
  const bytes=readFileSync(artifact.path);
  if(sha(bytes)!==artifact.sha256)throw Error('S4 basket bridge exact Part artifact hash mismatch');
  const tickPath=join(dirname(artifact.path),'basket-bridge.tick-traffic.json');
  const tickBytes=readFileSync(tickPath),tickTraffic=JSON.parse(tickBytes);
  const tick=tickTraffic.ticks?.[0];
  if(tickTraffic.ticks?.length!==1||tick.id!==receipt.stage.tick||
     !same(tick.declared.consumes,receipt.parts.consumes)||
     !same(tick.declared.produces,[receipt.parts.produces])||
     !same(tick.declared.calculations,[receipt.stage.calculation])||
     !same(tick.actual.consumes,tick.declared.consumes)||
     !same(tick.actual.produces,tick.declared.produces)||
     !same(tick.actual.writes,receipt.parts.writes)||
     !tick.frozenCalculations?.some(c=>c.address===receipt.stage.calculation&&c.implementationHash))
    throw Error('S4 basket bridge Tick declared/actual Part traffic mismatches receipt');
  const part=JSON.parse(bytes);
  const accepted=part.comparisons?.accepted;
  if(!Array.isArray(accepted)||!Array.isArray(part.comparisons?.decisions)||
     accepted.length!==receipt.parts.candidateCount||
     part.comparisons.decisions.length!==receipt.parts.decisionCount)
    throw Error('S4 basket bridge receipt/Part candidate or decision counts mismatch');
  if(!same(accepted.map(({index,semanticBbox,classification})=>({index,semanticBbox,classification})),
           receipt.accepted.map(({index,semanticBbox,classification})=>({index,semanticBbox,classification}))))
    throw Error('S4 basket bridge receipt candidate geometry differs from sealed Part');
  const proposals=accepted.filter(c=>['recovered-proposal','clean-family-proposal'].includes(c.classification))
    .map(c=>({index:c.index,classification:c.classification,tier:c.tier,confidence:c.confidence,
      source:c.source,canonicalBbox:c.semanticBbox,sourceBbox:[c.semanticBbox[0],c.semanticBbox[1]+cropTopPx,
        c.semanticBbox[2],c.semanticBbox[3]],nearestS2:c.nearestS2,
      provenance:'fresh S3 smart matcher Part proposal; basket ownership and pixels UNKNOWN'}));
  if(proposals.length!==receipt.parts.recoveredProposalCount+receipt.parts.cleanFamilyProposalCount)
    throw Error('S4 basket bridge unmatched proposal count mismatch');
  for(const p of proposals){
    const recorded=receipt.accepted[p.index]?.sourceSemanticBbox;
    if(!same(recorded,p.sourceBbox))throw Error('S4 basket proposal source-coordinate bbox mismatch');
  }
  return {partPath:artifact.path,partSha256:artifact.sha256,
    tickPath,tickSha256:sha(tickBytes),ticks:[tick],
    receiptPath:receipt.receiptPath??null,
    counts:{baselineS2:existingBasketCount,exactS2:receipt.parts.exactSemanticBboxMatches,
      nearS2:receipt.parts.nearSemanticBboxMatches,proposals:proposals.length,
      decisions:part.comparisons.decisions.length,rejected:part.comparisons.decisions.filter(d=>!d.accepted).length},
    tick:receipt.stage,partAddress:receipt.parts.produces,proposals,
    caveat:'Unowned extra smart-matcher hypotheses, not adopted S2 Basket objects or S6 top endpoints.'};
}
