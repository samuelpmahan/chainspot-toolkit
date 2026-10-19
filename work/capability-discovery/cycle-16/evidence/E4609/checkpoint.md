# E4609 actual written-flow checkpoint — STOP before render

1. Written in `render.mjs`, SHA256 `ac6790168c92641fa420df28bc8819b427cc5acfa98e1a39a8a9b0b808ff5281`. Only `node --check` has executed, exit0. No render, image generation, product source change, Git write or publication has occurred.

2. Entry point: one subprocess invocation of the following script, captured by the exact command below:

```sh
/opt/codex/runtimes/codex-primary-runtime/dependencies/node/bin/node -e 'const fs=require("fs"),cp=require("child_process");const d="/workspace/scratch/afc0d51965a8/lab16/S6/E4609/";const start=new Date().toISOString(),t=process.hrtime.bigint();const r=cp.spawnSync(process.execPath,[d+"render.mjs"],{encoding:"utf8",timeout:30000,maxBuffer:1048576});const end=new Date().toISOString();fs.writeFileSync(d+"stdout.txt",r.stdout||"",{flag:"wx"});fs.writeFileSync(d+"stderr.txt",r.stderr||"",{flag:"wx"});const e={command:[process.execPath,d+"render.mjs"],startUTC:start,endUTC:end,elapsedSeconds:Number(process.hrtime.bigint()-t)/1e9,exitCode:r.status,signal:r.signal,error:r.error?String(r.error):null,renderInvocations:1};fs.writeFileSync(d+"execution.json",JSON.stringify(e,null,2)+"\n",{flag:"wx"});process.stdout.write(r.stdout||"");process.stderr.write(r.stderr||"");console.log(JSON.stringify(e));process.exitCode=r.status===0?0:1;'
```

3. Actual execution order:

   1. Read exact captured `S1/E4608/firstgreen/result.json` and sibling `cli.txt`; pin result 321752B/SHA0ba97bcc17e85249042127907c173aef8dfcab6a3abe159756312c69cb78fe79 and CLI SHA555e80e8aab09623737c94110a6a614016325abd239a20a903143d5e7a9eea02 before any output.
   2. Parse result; join each of twelve rows' five slots to same-index saved comparisons, requiring exact ID/state match. Build sixty display records containing exact row ID, station ID, state, stored row status and stored comparison verdict.
   3. Require these sixty records to equal all sixty CLI body lines exactly; validate CLI hash/status/projection/count header, 42 OBSERVED+MATCHED and18 UNKNOWN+UNKNOWN, saved physical HOLD and counterexample newMeasurement=false. These are custody/roster assertions, not scientific calculations.
   4. Format two columns (crop left, dependent source right), six panels each, with exact twelve row IDs and exact sixty station IDs/states/verdicts. Keep stored row verdict separate from station UNKNOWN. Copy status/counts/qualifications/counterexample/roster into SVG metadata. Title explicitly says software consistency only; visible qualifiers retain exposure, dependence, physical UNKNOWN/HOLD, swap blindness, already-saved8.090622377680736px counterexample and incomplete-original-projection warning.
   5. Create fresh own `rendered` folder (refuses preexisting folder), exclusively write `evidence.svg`, rasterize that SVG once using installed primary-runtime sharp, exclusively write `evidence.png` at1640×2220. No scientific image inputs exist.
   6. Rehash result+CLI and require exact before/after equality; write `readback.json` including exact roster, input pins and output hashes. Print one completion record. Outer command captures actual stdout/stderr/exit/start/end/elapsed.

4. Invocation table:

| Operation | Input | Arguments | Output |
| --- | --- | --- | --- |
| Custody/roster audit | Exact captured JSON + CLI | Frozen hashes;12×5 roster;42/18 states | Exact60 display records or refusal |
| SVG formatting | Stored fields only | Two dependent columns;exact IDs/statuses;qualifiers | Fresh evidence.svg |
| Display rasterizer | Newly formatted SVG buffer | sharp density72, PNG | Fresh evidence.png |
| Readback | Same captured inputs + output bytes | SHA256 and exact record equality | Fresh readback.json |

5. Shared machinery: Node fs/crypto/assert plus already-installed sharp only; no recipe, geometry, provider, producer, native, CV or source-image imports/calls. No dependency installation. Caller supplies only the one GO invocation; all file paths/hashes are fixed in this scratch-only script.

6. Inspection after authorized execution: use `view_image` on the actual generated PNG; report whether all twelve panels,60records and qualifiers are legible. No rendering has happened at checkpoint.

7. Boundaries: no rank/geometry/scientific-score recomputation or new measurement; no productsource/Git/HH/native-control mutation; full captured result remains authoritative over display. Symmetric pair swaps remain undetectable. Fresh outputs refuse replacement. No repair or second render without new direction if this invocation fails or inspection finds clipping.

8. Review: awaiting root's short GO for this exact flow and one render invocation. No native extraction receipt is issued before execution.
