/** Explicit synthetic engineering control; not an image decode or course. */
import { createHash } from 'node:crypto';
const sha = x => createHash('sha256').update(Uint8Array.from(x)).digest('hex');
export function fixture() {
  const width=320,height=300,data=new Uint8Array(width*height*4);
  for(let y=0;y<height;y++) for(let x=0;x<width;x++) {const at=(y*width+x)*4, value=y>=145&&y<=174?180:40;data.set([value,value+1,value+2,(x+3*y)%256],at);}
  const frame='synthetic-original';
  return {enabled:true,source:{image:{width,height,data,frame},provenance:{imageId:'explicit synthetic contract control; no PNG supplied',rgbaSha256:sha(data),sourcePngSha256:'0'.repeat(64),decoder:{name:'synthetic test fixture, not actual PNG decode',version:'1',outputMode:'RGBA'}}},roi:{xPx:60,yPx:60,widthPx:220,heightPx:200,frame:'synthetic-roi'},geometry:{frame,geometrySource:'explicit synthetic caller testimony',training:{frame,segments:[{tee:{xPx:110,yPx:160},badge:{xPx:210,yPx:160}}]},stations:[{id:'fixed',frame,xPx:160,yPx:160,headingRad:0,t0Px:-20,t1Px:20}],localWidthBank:{frame,scope:'LOCAL',valuesPx:[24,30,36]},occluders:{frame,boxes:[]},edgeSearch:{latLimPx:4,tolWidthPx:3}}};
}
