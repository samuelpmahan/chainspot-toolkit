import assert from 'node:assert/strict';
import { instrumentedStore } from './source/fg/profile.mjs';
import { registerQueries } from './source/fg/store.mjs';

function invoke({cache, pixels, shape='addresses', constant=7, explicitInput=false}) {
  const parts=new Map([['px.image.cropped',{widthPx:1,heightPx:1,rgba:new Uint8Array(pixels)}]]);
  const adapter=Object.freeze({has:a=>parts.has(a),get:a=>parts.get(a),addresses:[...parts.keys()]});
  const base=shape==='Map'?parts:shape==='keys'?Object.freeze({...adapter,keys:()=>parts.keys()}):shape==='incompleteKeys'?Object.freeze({...adapter,keys:()=>[][Symbol.iterator]()}):adapter;
  const {store}=instrumentedStore({base,cache,codeSalt:'same-closure'});
  store.constant('fn.test.roots',{'tk.sameConstant':{constant}});
  registerQueries(store,{'fn.q.test.pixelTotal':({image})=>({value:Array.from(image.rgba).reduce((a,b)=>a+b,0),unit:'gray-level'})});
  store.register('fn.test.indirectPixels',{inParts:explicitInput?['px.image.cropped']:[],outParts:['tk.total'],calls:['fn.q.test.pixelTotal'],calculate:io=>({'tk.total':io.call('fn.q.test.pixelTotal',{image:'px.image.cropped'}).value})});
  const value=store.get('tk.total'),entry=store.calls().find(x=>x.calculation==='fn.test.indirectPixels');
  return {value,pixelKey:store.keyOf('px.image.cropped'),producerKey:entry.key,cached:Boolean(entry.cached)};
}
const cases=[];
for(const shape of ['addresses','Map','keys','incompleteKeys']){
 const cache=new Map();
 const first=invoke({cache,pixels:[1,2,3,4],shape});
 const same=invoke({cache,pixels:[1,2,3,4],shape});
 const changed=invoke({cache,pixels:[9,9,9,9],shape});
 const changedConstant=invoke({cache,pixels:[9,9,9,9],shape,constant:8});
 const expectedFailure=['addresses','incompleteKeys'].includes(shape);
 assert.equal(first.value,10);assert.equal(same.value,10);assert.equal(same.cached,true);
 assert.notEqual(first.pixelKey,changed.pixelKey);
 assert.equal(changed.value,expectedFailure?10:36);assert.equal(changed.cached,expectedFailure);
 assert.equal(changedConstant.value,36);assert.equal(changedConstant.cached,false);
 cases.push({shape,first,same,changed,changedConstant,pixelCoverageFailure:expectedFailure});
}
const explicitCache=new Map();
const explicitFirst=invoke({cache:explicitCache,pixels:[1,2,3,4],explicitInput:true});
const explicitChanged=invoke({cache:explicitCache,pixels:[9,9,9,9],explicitInput:true});
assert.equal(explicitChanged.value,36);assert.equal(explicitChanged.cached,false);
const coldFirst=invoke({pixels:[1,2,3,4]});const coldChanged=invoke({pixels:[9,9,9,9]});
assert.equal(coldChanged.value,36);assert.equal(coldChanged.cached,false);
console.log(JSON.stringify({job_id:'R104',worker:'W4',reproduction:'PASS',defectConfirmed:true,cases,controls:{explicitInput:{explicitFirst,explicitChanged},noSharedCache:{coldFirst,coldChanged}}},null,2));
