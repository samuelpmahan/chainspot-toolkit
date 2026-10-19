// E2032 optional single preservation control, authored UNEXECUTED; no store or original inputs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { eventFacts } from './budget-contract.v2.mjs';

const event=(type,role=null)=>({type,role,status:null,seq:null,parent:null,depth:null,captureIndex:null,
  errorCode:type==='PUBLIC_THROW'?'E_PRECONSTANT':null,errorText:type==='PUBLIC_THROW'?'preconstant failure':null});
test('source-supported preconstant query throw needs no invented constant and allows failure postchecks',()=>{
  const events=[event('INTENT'),event('PUBLIC_ENTER'),
    {...event('NATIVE_EXIT','query'),status:'threw',seq:0,parent:null,depth:0,captureIndex:0,errorCode:'E_PRECONSTANT',errorText:'preconstant failure'},
    event('HOOK_ENTER','query'),event('HOOK_ENCODE_START','query'),event('HOOK_ENCODE_OK','query'),event('HOOK_RETURN','query'),
    event('PUBLIC_THROW'),event('POSTCHECK_START'),event('POSTCHECK_OK')];
  const r=eventFacts(events,{termination:'NORMAL'});
  assert.equal(r.status,'FAILED');assert.equal(r.publicCall,'THREW');assert.equal(r.postchecks,'OK');
  assert.equal(r.hooks.constant.native,'NOT_OBSERVED');assert.equal(r.hooks.constant.entered,false);
  assert.equal(r.hooks.query.captureIndex,0);assert.equal(r.artifacts.answer.bound,false);
  assert.equal(r.firstFailure.type,'NATIVE_EXIT');assert.equal(r.firstFailure.code,'E_PRECONSTANT');
});
