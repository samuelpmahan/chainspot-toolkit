# E4610 v2 dependency-entry correction checkpoint — STOP before render

Written implementation: `render-v2.mjs` SHA256 `2e0427abed23c8a8190e75467ef10a7a33095a92b394468b39d02166eaf7df5b`. Syntax-only `node --check` exited0. No v2 render has run. E4609 original `render.mjs` remains SHA`ac6790168c92641fa420df28bc8819b427cc5acfa98e1a39a8a9b0b808ff5281`; its raw failure files remain untouched.

Exact two-line difference only:

```diff
-import sharp from '/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp/lib/index.js';
+import sharp from '/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp/dist/index.mjs';
-const OUT=BASE+'S6/E4609/rendered';
+const OUT=BASE+'S6/E4610/rendered';
```

Correction is justified by E4609 actual ERR_MODULE_NOT_FOUND plus installed package export. Existing sharp/dist/index.mjs SHA`0e8f955c68a1b0bccf0ba5343c924dbfa6a46a76a0d491ec27fe6b328311363e`; package.json SHA`ad4a2535d72eb638053a38867b1abf43c328cd1c1dbae5cf4172d498365a8b97`. No installation or dependency change.

Entry point and exact fresh one-subprocess capture command:

```sh
/opt/codex/runtimes/codex-primary-runtime/dependencies/node/bin/node -e 'const fs=require("fs"),cp=require("child_process");const d="/workspace/scratch/afc0d51965a8/lab16/S6/E4610/";const start=new Date().toISOString(),t=process.hrtime.bigint();const r=cp.spawnSync(process.execPath,[d+"render-v2.mjs"],{encoding:"utf8",timeout:30000,maxBuffer:1048576});const end=new Date().toISOString();fs.writeFileSync(d+"stdout.txt",r.stdout||"",{flag:"wx"});fs.writeFileSync(d+"stderr.txt",r.stderr||"",{flag:"wx"});const e={command:[process.execPath,d+"render-v2.mjs"],startUTC:start,endUTC:end,elapsedSeconds:Number(process.hrtime.bigint()-t)/1e9,exitCode:r.status,signal:r.signal,error:r.error?String(r.error):null,renderInvocations:1};fs.writeFileSync(d+"execution.json",JSON.stringify(e,null,2)+"\n",{flag:"wx"});process.stdout.write(r.stdout||"");process.stderr.write(r.stderr||"");console.log(JSON.stringify(e));process.exitCode=r.status===0?0:1;'
```

Actual flow is unchanged from the fully reviewed E4609 checkpoint:

1. Pin captured result321752B/SHA0ba97bcc17e85249042127907c173aef8dfcab6a3abe159756312c69cb78fe79 plus CLI SHA555e80e8aab09623737c94110a6a614016325abd239a20a903143d5e7a9eea02.
2. Copy exact12×5 row/station IDs, states, row statuses and comparison verdicts; require exact equality to all60 CLI body lines. Keep42 OBSERVED+MATCHED and18 UNKNOWN+UNKNOWN separate; no oracle/data/row/math changes.
3. Format exact same two dependent-view columns with software-consistency-only, exposed/dependent, physical UNKNOWN/HOLD, symmetric-swap blindness and already-saved8.090622377680736px counterexample qualifiers.
4. Create fresh E4610/rendered; exclusive-write same SVG and rasterize once to PNG via corrected existing dependency entry; then pin captured result+CLI again and write exact-roster/output-hash readback. Capture stdout/stderr/exit/time under E4610 only.

| Operation | Inputs | Parameters | Outputs |
| --- | --- | --- | --- |
| Custody/roster equality | Fixed captured JSON+CLI | Same frozen hashes and60 exact records | Same display records/refusal |
| Format/rasterize | Saved fields, then own SVG | Same1640×2220 layout;sharp density72 | Fresh E4610 evidence.svg/PNG |
| Identity readback | Same saved inputs+new outputs | SHA256;before/after equality | Fresh E4610 readback.json |

Shared machinery: Node fs/crypto/assert plus existing sharp only. No recipe, geometry, producer, provider, CV, source-image imports/calls, no HH/product source/Git/native writes, no measurement or score/tolerance change.

Inspection after GO: view actual E4610 PNG and report legibility of all12 panels/60records/qualifiers. Any failure/clipping is retained; no second v2 render or repair without new direction. Output paths are fresh and exclusive; no E4609 files can be overwritten by this command.

Review: awaiting root short GO for this exact one repair attempt; no E4610 extraction receipt issued before execution and actual PNG inspection.
