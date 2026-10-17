import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { renderAssignment } from './assignmentRender.mjs';

test('assignment render embeds verified source and keeps one addressable mark and row per candidate', () => {
  const dir=mkdtempSync(join(tmpdir(),'s5-assignment-'));
  try {
    const sourcePath=join(dir,'source.jpg'), bytes=Buffer.from([0xff,0xd8,0xff,0xd9]);
    writeFileSync(sourcePath,bytes);
    const sourceSha256=createHash('sha256').update(bytes).digest('hex');
    const hit={id:'ray:t1:plus:b1',teeId:'t1',badgeId:'b1',teeCenter:[4,6],badgeCenter:[20,6],u:[1,0],enterPx:13,exitPx:17};
    const result=renderAssignment({sourcePath,sourceSha256,width:32,height:24,candidateHits:[hit],
      assignment:{status:'PARTIAL',physicalStatus:'UNKNOWN',selected:[{id:hit.id,hit}],candidateRows:[
        {id:hit.id,teeId:'t1',badgeId:'b1',hit,selected:true,disposition:'SELECTED',reason:'unique global optimum',
          distanceDiagonalFraction:.04,winnerHitId:hit.id,conflictingSelectedHitId:'ray:t2:plus:b1'},
        {id:'ray:t1:minus:b2',teeId:'t1',badgeId:'b2',hit:{...hit,id:'ray:t1:minus:b2',u:[-1,0]},selected:false,disposition:'ALTERNATIVE',reason:'lower cardinality'}
      ],unknownAxes:[{id:'t2',center:[27,18],reason:'unfitted tee axis'}],unmatchedBadgeIds:['b3']},
      teeAxes:{visible:[{detId:'t1',corners:[[2,4],[6,4],[6,8],[2,8]]}],recovered:[],unknown:[]},
      badgePlates:[{detId:'b1',holeRead:1},{detId:'b3',holeRead:3,center:[25,18]}],
      outDir:dir,runId:'test-run',paramsHash:'test-params'});
    const svg=readFileSync(result.svg.path,'utf8'), cli=readFileSync(result.cli.path,'utf8');
    assert.match(svg,/xmlns:xlink="http:\/\/www\.w3\.org\/1999\/xlink"/);
    assert.match(svg,/xlink:href="data:image\/jpeg;base64,/);
    assert.match(svg,/data-candidate="ray:t1:plus:b1"/);
    assert.match(svg,/data-candidate="ray:t1:minus:b2"/);
    assert.match(svg,/data-unknown="t2"/);
    const selected=svg.match(/<g id="candidate-ray:t1:plus:b1"[^>]*>([\s\S]*?)<\/g>/)?.[0] ?? '';
    assert.ok(selected && !selected.includes('display:none'));
    assert.match(selected,/d="M4\.00,6\.00 L21\.00,6\.00"/);
    const loser=svg.match(/<g id="candidate-ray:t1:minus:b2"[^>]*>/)?.[0] ?? '';
    assert.match(loser,/style="display:none"/);
    assert.match(cli,/candidate:ray:t1:plus:b1/);
    assert.match(cli,/hole=H1/);
    assert.match(cli,/distanceDiagonalFraction=0\.04/);
    assert.match(cli,/winnerHitId=ray:t1:plus:b1/);
    assert.match(cli,/conflictingSelectedHitId=ray:t2:plus:b1/);
    assert.match(svg,/data-tee-axis="t1"/);
    assert.match(svg,/font-size="20"/);
    assert.match(svg,/data-unmatched-badge="b3"/);
    assert.match(svg,/UNMATCHED H3/);
    assert.equal((svg.match(/data-candidate="/g)??[]).length,2);
    assert.equal(cli.split('\n').filter(line=>line.startsWith('candidate:')).length,2);
    assert.match(cli,/ownership=UNKNOWN|physical=UNKNOWN/);
    assert.equal(result.candidateCount,2);
    assert.equal(result.selectedCount,1);
    for(const artifact of [result.svg,result.cli]) assert.equal(artifact.sha256,createHash('sha256').update(readFileSync(artifact.path)).digest('hex'));
  } finally { rmSync(dir,{recursive:true,force:true}); }
});
