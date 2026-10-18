// Exposed synthetic training controls only; no independent evaluation data.
import { createHash } from 'node:crypto';
export const rgbaHash = data => createHash('sha256').update(Uint8Array.from(data)).digest('hex');
export function trainingInput({ broad = false, shape = 'ribbon' } = {}) {
  const width = 160, height = 160, data = new Uint8Array(width * height * 4);
  for (let y=0;y<height;y++) for(let x=0;x<width;x++) {
    const halfWidth = broad ? 20.5 : 15;
    const capsule = x >= 25 && x <= 135 || Math.hypot(x-25,y-80) < halfWidth || Math.hypot(x-135,y-80) < halfWidth;
    const inside = Math.abs(y-80) < halfWidth && (shape !== 'organic' || capsule);
    const g = inside ? 145 : 100; data.set([g,g,g,255],(y*width+x)*4);
  }
  const frame='exposed-synthetic-160px';
  return { enabled:true, frame, image:{width,height,data,frame}, provenance:{imageId:`training-${shape}`,rgbaSha256:rgbaHash(data),geometrySource:'exposed synthetic test geometry; no course truth'},
    training:{frame,segments:[{tee:{xPx:20,yPx:80},badge:{xPx:130,yPx:80}}]},
    stations:[{id:'station-ca',frame,xPx:80,yPx:80,headingRad:0,t0Px:-20,t1Px:20}],
    localWidthBank:{frame,scope:'LOCAL',valuesPx:broad?[30,40,50]:[24,30,36]},
    occluders:{frame,boxes:[]},edgeSearch:{latLimPx:12,tolWidthPx:3} };
}
