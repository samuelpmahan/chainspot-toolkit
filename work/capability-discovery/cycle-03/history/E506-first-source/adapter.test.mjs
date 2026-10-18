import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { prepareSourcePixelRoi, runSourcePixelRoi, SourcePixelIntegrityError } from './adapter.mjs';
const sha = x => createHash('sha256').update(Uint8Array.from(x)).digest('hex');
function fixture() {
  const width=320,height=300,data=new Uint8Array(width*height*4);
  for(let y=0;y<height;y++) for(let x=0;x<width;x++) {const at=(y*width+x)*4, value=y>=145&&y<=174?180:40;data.set([value,value+1,value+2,(x+3*y)%256],at);}
  const frame='synthetic-original';
  return {enabled:true,source:{image:{width,height,data,frame},provenance:{imageId:'explicit synthetic contract control; no PNG supplied',rgbaSha256:sha(data),sourcePngSha256:'0'.repeat(64),decoder:{name:'synthetic test fixture, not actual PNG decode',version:'1',outputMode:'RGBA'}}},roi:{xPx:60,yPx:60,widthPx:220,heightPx:200,frame:'synthetic-roi'},geometry:{frame,geometrySource:'explicit synthetic caller testimony',training:{frame,segments:[{tee:{xPx:110,yPx:160},badge:{xPx:210,yPx:160}}]},stations:[{id:'fixed',frame,xPx:160,yPx:160,headingRad:0,t0Px:-20,t1Px:20}],localWidthBank:{frame,scope:'LOCAL',valuesPx:[24,30,36]},occluders:{frame,boxes:[]},edgeSearch:{latLimPx:4,tolWidthPx:3}}};
}
function close(a,b,path='root') {
  if(typeof a==='number'&&typeof b==='number') { assert.ok(Object.is(a,b)||Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<=1e-9,`${path}: ${a} vs ${b}`); return; }
  if(a&&b&&typeof a==='object'&&typeof b==='object') {assert.deepEqual(Object.keys(a),Object.keys(b),path);for(const k of Object.keys(a))close(a[k],b[k],`${path}.${k}`);return;}
  assert.deepEqual(a,b,path);
}
test('standalone default OFF performs no recipe calls',()=>{for(const input of [{},null,{enabled:false}]) {const r=runSourcePixelRoi(input);assert.equal(r.status,'DISABLED');assert.deepEqual(r.operationsExecuted,[]);}});
test('crop is exact original RGBA row spans including nonopaque alpha, all supplied geometry translates',()=>{
  const i=fixture();i.geometry.occluders.boxes=[{bboxX:150.5,bboxY:148.25,bboxW:5,bboxH:7,kind:'caller known box'}];
  const r=prepareSourcePixelRoi(i);assert.equal(r.status,'PREPARED');
  for(let y=0;y<i.roi.heightPx;y++) assert.deepEqual(r.input.image.data.slice(y*880,(y+1)*880),Array.from(i.source.image.data.slice(((y+60)*320+60)*4,((y+60)*320+280)*4)));
  assert.equal(r.provenance.fullRgbaSha256,i.source.provenance.rgbaSha256);assert.equal(r.provenance.cropRgbaSha256,sha(r.input.image.data));
  assert.deepEqual(r.input.training.segments,[{tee:{xPx:50,yPx:100},badge:{xPx:150,yPx:100}}]);
  assert.deepEqual(r.input.stations[0],{id:'fixed',frame:'synthetic-roi',xPx:100,yPx:100,headingRad:0,t0Px:-20,t1Px:20});
  assert.deepEqual(r.input.occluders.boxes,[{bboxX:90.5,bboxY:88.25,bboxW:5,bboxH:7,kind:'caller known box'}]);
  assert.deepEqual(r.input.localWidthBank.valuesPx,[24,30,36]);assert.deepEqual(r.input.edgeSearch,i.geometry.edgeSearch);
  assert.deepEqual(r.provenance.transform.originalToCrop,{xPx:-60,yPx:-60});assert.match(r.provenance.sourcePngVerification,/testimony/);
});
test('preparation snapshots are recursively immutable and isolate caller mutation',()=>{
  const i=fixture(),r=prepareSourcePixelRoi(i),pixel=r.input.image.data[0];i.source.image.data.fill(0);i.geometry.training.segments[0].tee.xPx=999;i.geometry.edgeSearch.latLimPx=999;i.source.provenance.decoder.version='changed';
  assert.equal(r.input.image.data[0],pixel);assert.equal(r.input.training.segments[0].tee.xPx,50);assert.equal(r.input.edgeSearch.latLimPx,4);assert.equal(r.provenance.decoder.version,'1');
  assert.throws(()=>{r.input.image.data[0]=999;},TypeError);assert.throws(()=>{r.input.stations[0].xPx=999;},TypeError);
});
test('missing, malformed, unsupported geometry and noninteger/out-of-bounds ROI are UNKNOWN before operations',()=>{
  const changes=[i=>delete i.source,i=>delete i.source.provenance.sourcePngSha256,i=>delete i.source.provenance.decoder.version,i=>i.geometry.extraPolyline=[[1,2]],i=>i.geometry.stations[0].width=30,i=>i.geometry.training.segments[0].tee.frame='other',i=>i.geometry.occluders.frame='other',i=>i.roi.xPx=-1,i=>i.roi.xPx=.5,i=>i.roi.widthPx=1000,i=>i.source.image.data=[1],i=>i.geometry.localWidthBank.valuesPx=[NaN],i=>i.geometry.stations[0].headingRad=Infinity];
  for(const change of changes){const i=fixture();change(i);const r=runSourcePixelRoi(i);assert.equal(r.status,'UNKNOWN');assert.deepEqual(r.operationsExecuted,[]);}
});
test('well-formed false full RGBA hash is hard integrity failure',()=>{const i=fixture();i.source.image.data[0]^=1;assert.throws(()=>runSourcePixelRoi(i),SourcePixelIntegrityError);});
test('finite partial-sample crops abstain before recipe, including training support',()=>{
  const i=fixture();i.roi={xPx:100,yPx:135,widthPx:150,heightPx:60,frame:'too-tight'};const r=runSourcePixelRoi(i);assert.equal(r.status,'UNKNOWN');assert.deepEqual(r.operationsExecuted,[]);assert.ok(r.support.failures.length>0);
  const j=fixture();j.geometry.training.segments[0].tee.xPx=61;assert.equal(runSourcePixelRoi(j).status,'UNKNOWN');
});
test('full and cropped same-operation raw controls agree; no acceptance is invented',()=>{
  const cropInput=fixture(),fullInput=fixture();fullInput.roi={xPx:0,yPx:0,widthPx:320,heightPx:300,frame:'synthetic-full-control'};
  for(const i of [cropInput,fullInput])i.geometry.occluders.boxes=[{bboxX:152,bboxY:143,bboxW:3,bboxH:8}];
  const c=runSourcePixelRoi(cropInput),f=runSourcePixelRoi(fullInput);assert.equal(c.recipe.verifiedFiles,14);assert.deepEqual(c.operationsExecuted,f.operationsExecuted);
  close(c.composition.rawWidthEstimate,f.composition.rawWidthEstimate);close(c.composition.stations[0].profile,f.composition.stations[0].profile);close(c.composition.stations[0].candidates,f.composition.stations[0].candidates);
  assert.equal(c.localWidth.status,'UNKNOWN');assert.equal(c.semanticIdentity.status,'UNKNOWN');assert.equal(c.promoted,false);assert.ok(c.operationsExecuted.length>0);
});
test('rotated profile and sensor control uses translated same original samples within declared numeric tolerance',()=>{
  const a=fixture(),b=fixture();for(const i of [a,b]){i.geometry.training.segments=[];i.geometry.stations[0].headingRad=.31;i.geometry.stations[0].xPx=160.25;i.geometry.stations[0].yPx=160.125;}
  b.roi={xPx:0,yPx:0,widthPx:320,heightPx:300,frame:'synthetic-full-control'};
  const c=runSourcePixelRoi(a),f=runSourcePixelRoi(b);close(c.composition.stations[0].profile,f.composition.stations[0].profile);close(c.composition.stations[0].candidates,f.composition.stations[0].candidates);
});
