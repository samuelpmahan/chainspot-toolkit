// E2030: two tests FIRST, UNEXECUTED, against the exact unchanged E2028 core.
import test from 'node:test';
import assert from 'node:assert/strict';
import { eventFacts } from './budget-contract.v2.mjs';

// Explicit tiny all-success vocabulary; no old test import or original input/capability.
const event=(type,role=null,status=null)=>({type,role,status,seq:null,parent:null,depth:null,captureIndex:null,errorCode:null,errorText:null});
const native=role=>({...event('NATIVE_EXIT',role,'ok'),seq:role==='constant'?1:0,
  parent:role==='constant'?0:null,depth:role==='constant'?1:0,captureIndex:role==='constant'?0:1});
const hook=role=>[event('HOOK_ENTER',role),event('HOOK_ENCODE_START',role),event('HOOK_ENCODE_OK',role),event('HOOK_RETURN',role)];
const artifact=role=>[event('WRITE_START',role),event('WRITE_OK',role),event('HASH_START',role),event('HASH_OK',role)];
function success(){
  return [event('INTENT'),event('PUBLIC_ENTER'),native('constant'),...hook('constant'),native('query'),...hook('query'),
    event('PUBLIC_RETURN'),event('ANSWER_VALIDATE_START'),event('ANSWER_VALIDATE_OK'),event('ANSWER_ENCODE_START'),event('ANSWER_ENCODE_OK'),
    ...artifact('constant'),...artifact('query'),...artifact('answer'),event('POSTCHECK_START'),event('POSTCHECK_OK')];
}

test('A1 refuses outer query native exit before the observed constant hook terminates',()=>{
  const baseline=success();
  assert.equal(eventFacts(baseline,{termination:'NORMAL'}).status,'COMPLETE','A1 baseline control must be COMPLETE first');
  // Move only native(query) at7 ahead of the unchanged constant hook block at3..6.
  const reordered=[...baseline.slice(0,3),baseline[7],...baseline.slice(3,7),...baseline.slice(8)];
  assert.equal(reordered.length,baseline.length);
  assert.equal(eventFacts(reordered,{termination:'NORMAL'}).status,'REFUSED','A1 must refuse the missing cross-role hook dependency');
});

test('A2 refuses postchecks before a later public entry',()=>{
  const baseline=success();
  assert.equal(eventFacts(baseline,{termination:'NORMAL'}).status,'COMPLETE','A2 baseline control must be COMPLETE first');
  // Move only the final postcheck pair immediately after INTENT, before PUBLIC_ENTER.
  const reordered=[baseline[0],...baseline.slice(-2),...baseline.slice(1,-2)];
  assert.equal(reordered.length,baseline.length);
  assert.equal(eventFacts(reordered,{termination:'NORMAL'}).status,'REFUSED','A2 must refuse precall checks used as postconditions');
});
