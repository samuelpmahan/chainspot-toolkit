#!/usr/bin/env node
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {runComposition,preserveNonFinite} from './recipe.mjs';
const args=process.argv.slice(2), arg=name=>{const at=args.indexOf(name);return at<0?null:args[at+1];};
const inputPath=arg('--input'),outPath=arg('--out'),inspectPath=arg('--inspect');
if(!inputPath||!outPath) {console.error('Usage: node cli.mjs --input input.json --out receipt.json [--inspect inspection.html]');process.exit(2);}
const input=JSON.parse(readFileSync(resolve(inputPath),'utf8')),result=runComposition(input);
const put=(path,text)=>{mkdirSync(dirname(resolve(path)),{recursive:true});writeFileSync(resolve(path),text);};
put(outPath,JSON.stringify(result,preserveNonFinite,2)+'\n');
if(inspectPath) {
 const escape=v=>String(v??'UNKNOWN').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const shown=v=> typeof v==='number'?(Number.isFinite(v)?v.toFixed(3):String(v)):v??'UNKNOWN';
 const cells=values=>'<tr>'+values.map(v=>`<td>${escape(shown(v))}</td>`).join('')+'</tr>';
 const rows=result.rawWidthEstimate?.scores.map(r=>cells([r.widthPx,r.meanScore,r.visibleSamples])).join('')??'';
 const stationHTML=(result.stations??[]).map(s=>{
  const p=s.profile,points=p.meanLum?.map((v,i)=>Number.isFinite(v)?`${(p.offsetsPx[i]+30)*8},${210-v*.7}`:null),paths=[];let run=[];
  for(const v of points??[]) {if(v)run.push(v);else if(run.length){paths.push(run.join(' '));run=[];}}if(run.length)paths.push(run.join(' '));
  return `<section><h2>${escape(s.id)}</h2><p>Pose ${escape(JSON.stringify(s.pose))}; longitudinal window ${escape(JSON.stringify(s.window))}; ${p.stationCount} sampled stations.</p><svg viewBox="0 0 480 230" role="img" aria-label="Raw longitudinally averaged RGB mean profile"><rect width="480" height="230" fill="#f0f3f6"/>${paths.map(d=>`<polyline points="${d}" fill="none" stroke="#075e54" stroke-width="2"/>`).join('')}<text x="4" y="224">normal offset −30 px</text><text x="350" y="224">+30 px</text></svg><table><thead><tr>${['Nominal width px','rail mode','L','inner L','inner R','R','combined','paired guard','fit width px','fit c px','center−midpoint px'].map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${s.candidates.map(c=>cells([c.widthArgPx,c.observation.railMode,c.observation.leftRail,c.observation.innerLeft,c.observation.innerRight,c.observation.rightRail,c.observation.score,c.pairedRails.status,c.edgeFit?.wPx,c.edgeFit?.cPx,c.midpoint.candidateCenterMinusFitMidpointPx])).join('')}</tbody></table><details><summary>Raw profile, visibility counts and channels</summary><pre>${escape(JSON.stringify(s,preserveNonFinite,2))}</pre></details></section>`;
 }).join('');
 put(inspectPath,`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Local ribbon measurement inspection</title><style>body{font:15px system-ui;max-width:1200px;margin:30px auto;padding:0 18px;color:#16302c}table{border-collapse:collapse;width:100%;font-variant-numeric:tabular-nums}td,th{border:1px solid #bcccca;padding:8px;text-align:left}th{background:#e7efed}section{margin-top:28px}svg{max-width:600px;width:100%;height:230px}pre{white-space:pre-wrap;max-height:500px;overflow:auto}small{color:#456}</style><h1>Local ribbon measurement inspection</h1><p><b>${escape(result.status)}</b> · ${escape(result.inputProvenance?.imageId)} · frame ${escape(result.frame)}</p><p>No calibrated width. Semantic path identity UNKNOWN. Promotion false. This is a default-OFF experiment; raw brightness can fit an organic object.</p><p>${escape(result.reason??result.samplingSeam)}</p><p><small>RGBA SHA256 ${escape(result.inputProvenance?.rgbaSha256)}</small></p><h2>Raw learner rows</h2><table><thead><tr><th>Candidate width px</th><th>Mean dimensionless score</th><th>Visible samples</th></tr></thead><tbody>${rows}</tbody></table><p>Legacy selected number: ${escape(shown(result.rawWidthEstimate?.widthPx))} px. Measured local width: UNKNOWN.</p>${stationHTML}<details><summary>Full receipt and source provenance</summary><pre>${escape(JSON.stringify(result,preserveNonFinite,2))}</pre></details></html>`);
}
console.log(JSON.stringify({status:result.status,promoted:false,receipt:resolve(outPath),inspection:inspectPath?resolve(inspectPath):null}));
