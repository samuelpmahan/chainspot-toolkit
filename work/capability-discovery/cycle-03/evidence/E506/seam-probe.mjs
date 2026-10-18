/** Fixed synthetic counterexample; measures existing source output, never tunes it. */
import { fixture } from '../../../../../experiments/capability-discovery/source-pixels/test-fixtures.mjs';
import { runSourcePixelRoi } from '../../../../../experiments/capability-discovery/source-pixels/adapter.mjs';
const a=fixture(),b=fixture();
for(const i of [a,b]) {i.geometry.training.segments=[];i.geometry.stations[0].headingRad=.31;i.geometry.stations[0].xPx=160.25;i.geometry.stations[0].yPx=160.125;}
b.roi={xPx:0,yPx:0,widthPx:320,heightPx:300,frame:'synthetic-full-control'};
const cropped=runSourcePixelRoi(a),full=runSourcePixelRoi(b);
const cp=cropped.composition.stations[0],fp=full.composition.stations[0];
console.log(JSON.stringify({schema:'source-pixel-numeric-seam@1',hypothesis:'Integer image/geometry translation preserves exact source pixels, while floating sample addition order changes profile roundoff; legacy strict score comparison can select different tied peaks.',cropHash:cropped.provenance.cropRgbaSha256,fullHash:full.provenance.cropRgbaSha256,profileMaximumAbsoluteDifference:Math.max(...cp.profile.meanLum.map((v,j)=>Math.abs(v-fp.profile.meanLum[j]))),visibleCountsEqual:JSON.stringify(cp.profile.visibleStationCounts)===JSON.stringify(fp.profile.visibleStationCounts),rows:cp.candidates.map((c,j)=>({widthArgPx:c.widthArgPx,croppedFit:c.edgeFit,fullFit:fp.candidates[j].edgeFit,sensorEqual:JSON.stringify(c.observation)===JSON.stringify(fp.candidates[j].observation)})),interpretation:'Counterexample to blanket fitted-output invariance despite complete support. Raw fits must remain visible, compared and labelled unstable; no correction, tolerance-based acceptance or CV-source change.'},null,2));
