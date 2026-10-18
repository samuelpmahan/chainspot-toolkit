#!/usr/bin/env node
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {describePath} from './path-geometry.mjs';
const files=process.argv.slice(2);
if(!files.length)throw new Error('Usage: node analyze-native.mjs receipt.json [receipt2.json]');
const analyses=files.map(file=>{
 const path=resolve(file),bytes=readFileSync(path),d=JSON.parse(bytes);
 if(d.schema!=='s7-width-bank-probe@1')throw new Error('Unsupported native receipt schema');
 return {input:{path,sha256:createHash('sha256').update(bytes).digest('hex'),source:d.source,paramsHash:d.paramsHash,
   compiledRibbonSha256:d.compiledRibbonSha256,compiledTracerSha256:d.compiledTracerSha256,headingSource:d.headingSource},
   outcomes:d.outcomes.map(o=>{
    if(!Array.isArray(o.traced?.points))throw new Error('Missing native traced points');
    if(!Array.isArray(o.points)||o.points.length!==o.traced.points.length||o.points.some((s,i)=>s.point[0]!==o.traced.points[i][0]||s.point[1]!==o.traced.points[i][1]))throw new Error('Support sample/trace vertex mismatch');
    return {variant:o.name,variantIdentitySha256:o.variantIdentitySha256,nativeOutcome:o.traced.outcome,nativeReason:o.traced.reason??null,
      nativeReportedLengthPx:o.traced.lengthPx,nativeReportedTurningPhases:o.traced.bendCount,
      geometry:describePath({points:o.traced.points,frame:`${d.stem} canonical raster px; canonicalToSource=${JSON.stringify(d.source.frame.canonicalToSource)}`,
        width:{fullWidthPx:d.parameters.corridorWidthPx,provenance:'native receipt configured corridorWidthPx; not demonstrated per-image learned width'},
        support:{values:o.points.map(s=>s.support),threshold:d.parameters.supportTau,provenance:'native receipt field support sampled at exact trace vertices; includes own-badge patch/waiver region'}})};
   }),
   caveats:['No paired edges published in this receipt, so centerline offset is UNKNOWN.','Configured width37px is only a denominator, not a local-width calibration result.','Native turning phases and posthoc vertex turns have different definitions.','Support fraction includes own-badge samples and is not calibrated confidence.','Unknown native outcome remains unknown; greater length cannot establish endpoint ownership.']};
});
console.log(JSON.stringify({schema:'native-trace-geometry-analysis@1',analyses},null,2));
