# E1111 — actual-flow checkpoint and bounded engineering handoff

Written implementation: `experiments/capability-discovery/station-evidence/{recipe.mjs,codec.mjs,cli.mjs}`, three focused test files and README. Exact seven-file SHA256 identities are in source-freeze.json. F6 owns integration; F5 authored only cli.mjs and explicitly handed it back unchanged at SHA256 `4ca8c6065698f49bf6d13766764e298f0edcfde55e720a830e1e3b78223ec04c`.

## What actually ran

Before root's combined code-written flow checkpoint: source writing/read-only hashing only; no new module/test/vendor import, query, CV, image decode or renderer. Root then expressly admitted bounded NON-CV validation only.

- First F6 command: `node --test --test-reporter=tap experiments/capability-discovery/station-evidence/codec.test.mjs experiments/capability-discovery/station-evidence/recipe.test.mjs`:40/40 pass,0fail, exit0. Exact combined output retained in first-noncv.stdout.log, SHA256 `746fcf1abe9e76e3cade48c7c9cbad900b01a09087223e7978944500975b6b23`. No red or post-run repair.
- F5's separately retained validation receipt reports first CLI syntax check exit0 and first cli.test.mjs2/2 pass,0fail, exit0; only disabled writer and missing-manifest refusal, no repairs. This is attributed F5 evidence, not a fresh F6 rerun.
- Tests were written before implementation, with initial hashes retained. Because root prohibited any import/test before the written checkpoint, first execution occurred after implementation and was green. No red-before-implementation TDD claim is made.
- No valid enabled request, frozen vendor/store import, createPartStore execution, public PATH/CV query, source-pixel producer, image decode or render has run. No old suite/grid/producer rerun occurred; no whole-repository-green claim.
- All2062 old tracked file hashes rechecked unchanged. HEAD036d3e14416c40266917c51a0fe8d03785b050f3/treee21271ef77a501d4f41d1c9456ce1d23a87c5add unchanged. Git reports only the new untracked subtree; no add/commit/switch/fetch/reset/push or coordinator-state write.

## Entry points (not executed as a producer)

`await runStationEvidence()` is disabled. `await runStationEvidence(exactRequest)` requires enabled:true and the exact closed synthetic8 request. `inspectStationRequest` is a non-CV preflight boundary, not a producer.

The CLI explicitly selects the enabled fixed protocol through a closed file manifest:

```sh
node experiments/capability-discovery/station-evidence/cli.mjs run --manifest FILE.json --out NEWDIR
```

```json
{"schema":"cycle05-station-files@1","enabled":true,"protocolId":"synthetic8","protocolPath":"PATH_TO_F4/protocol.json","inventoryPath":"PATH_TO_F4/inventory.json","fixturesDirectory":"PATH_TO_F4/fixtures"}
```

Paths resolve from that manifest. There is no --enable flag and no default-enabled CLI path. Both explicit run and manifest enabled:true are required. This command still requires separate root native producer admission; do not run it from this checkpoint.

## Numbered actual code walkthrough

1. recipe's entry checks only the own enabled descriptor. Missing/false returns a disabled trace/sidecar with zero planned/attempted/captured calls and no source/pixel inspection. Other enabled types/accessors reject without running unrelated getters.
2. Enabled input must have exactly the five request fields and eight dense exact comparison objects. Descriptor checks refuse accessors/extra keys/prototypes/holes/undefined. Metadata, frame/dimensions, order, literal width30,16 stations, fixed origins/settings and provenance must match the F4 preset. Exact Uint8Array RGBA/mask lengths, binary mask values, safe work/allocation caps, and actual supplied hashes are checked before any product import. Caller metadata is copied into fixed declarations; retained original buffer references remain private to validation/execution.
3. The complete32-row public plan and all NOT_ATTEMPTED trace rows are created from copied declarations. Request binding contains hashes/metadata/settings and a hash of the byte-excluding tagged manifest, never input RGBA/mask data. API protocol-file verification is null: it is pinned caller declaration, not invented filesystem verification.
4. Copy/hash the first case's private RGBA/mask before import. Read and hash all nine physical frozen gateway/math modules. Only after that successful check dynamically import createPartStore/registerQueries and PATH_QUERIES, then rehash all nine before making any store. R1110's corrected causal ordering is implemented; no store precedes import.
5. Sequentially own one private comparison scope: copied raster/mask with frozen wrappers, fresh base:null store/default cache, one combined lazy constant with raster then mask outParts, and fresh unchanged PATH registration/answers Map. Do not get/has/keyOf an input eagerly. The same store serves the one literal width; no cached repeat or extra instrumentation query.
6. Call profile once, then edgePair/contrast/loss. On the first profile, registry resolution of raster lazily invokes the combined constant; mask is already materialized by that same invocation. onCall immediately encodes/detaches native entries in callback completion order. Per-store source expectation is seq1(constant) before seq0(profile), followed2/3/4; captureIndex is preserved, not sorted. Actual counts increment only from attempted/returned/thrown calls and captured callbacks.
7. Encode/detach each complete native answer `{value,unit,emits}` before generic JSON/display. Retain every native field and typed corridor; no width/branch/score selection. Private byte hashes are rechecked after every attempted call. After materialization, read existing provenance keys only; unavailable keys stay null and no producer is forced. Query native-entry key/cached, answer emits and entry emits remain separate.
8. On first thrown call/encoding/integrity failure stop remaining calls/cases, retain actual partial answers/log fragments/errors and leave future rows NOT_ATTEMPTED. Postcheck private snapshots, supplied original bytes and source closure. Unavailable observed hashes remain null with errors, never filled from expectations. No fallback/retry/retune.
9. Return `{valueTrace,sidecar,fragments}`. Native answers/logs are detached value trees, not private input/Part/store/cached-answer references. Sidecar retains actual monotonic query/validation/snapshot/import/source-check intervals and complete native entries. Outer query interval includes onCall encoding/capture overhead; native elapsedMs/computedMs remain separate. Unmeasured read/encode/output/CPU/memory/process intervals are not fabricated.
10. F5 CLI verifies exact protocol/inventory file bytes, reads only five frozen .rgba and three .mask.u8 stages, records actual file bindings and populates fixed declaration metadata with exact Uint8Array buffers. No PNG loading/decoding or regeneration occurs. Reserve a NEW output directory before any query. After recipe returns, attach only the file identities actually read, including actual protocol file verification.
11. The one-shot writer exclusively creates fragment files first, then tagged value trace and timing sidecar, then an external artifact manifest with each exact file's byte count/SHA256. Existing destinations/files and second use reject. On encoding/output error retain earlier files/fragments and a distinct failure manifest where possible; no producer retry. An inability to write even failure metadata stays an actual output failure, not claimed delivery.

## Invocation table (per one fixed comparison, execution still blocked)

All query rawArgs insert keys `raster,mask,originPx,phiRad,t0Px,t1Px,stepPx` in that order. raster='px.image.cropped', mask='tk.s6.pathMask'; origin=[192,160] except normalOffsetPlus6=[192,166], phi=0, t0=-8,t1=8,step=1. No case/frame/metadata strings enter registry args.

| Calculation | Invocation / additional exact args | Declared input Parts | Output Parts / return |
| --- | --- | --- | --- |
| fn.input.stationMeasurement | Lazy nested on first raster resolution; no explicit plan call | [] | Ordered px.image.cropped then tk.s6.pathMask; private copied values |
| fn.q.path.profile | First plan row; append lat0Px:0 | Native registration [] (top-level Part strings resolved inside registry) | No outParts; full native value/unit/emits |
| fn.q.path.edgePair | Append lat0Px:0,widthPx:30,tolPx:3,latLimPx:12,minOk:{count:8,ofStations:0.2} | Same raster/mask references | Full fitted pair or native condition; source recomputes profile |
| fn.q.path.stationContrast | Append widthPx:30,bandPx:[1,3],alongPx:2 | Same raster/mask references | All left/right raw values/validity/count/unit/emits |
| fn.q.path.loss | Append widthPx:30,profile:null,threshold:null,tauLum:8 | Same raster/mask references | Entire native loss/stations/brightness-proxy/corridor; source repeats contrast and samples |

Eight fixed stores/cases predict32 public PATH calls+8 lazy constants=40 Calculation entries. Those remain predictions; all observed producer counts are0 at this handoff.

## Shared machinery, visibility and boundaries

Existing store/registerQueries handles lazy Parts, content keys, native completion instrumentation and registration-local argument cache. The caller supplies exact frozen source pixels/masks/metadata; the new recipe supplies only narrow closed orchestration and truthful trace/integrity boundaries. Codec wraps every data value, preserving typed Uint8Array, NaN/infinities/-0/null and native tag-looking objects without collisions; unsupported shapes fail instead of coercion.

No renderer or user UI exists here. A separate trace-only figure worker may decode hash-verified outputs after a separately admitted producer; it must not import CV/read images/rerun. Complete outputs preserve241 profile/count values, every fit/condition, bilateral values AND flags, full native loss and corridor data. Nothing promotes path/physical-edge identity, width calibration, continuity, alpha/renderer/AA, scale or scientific/human acceptance. tau8 remains historical and no-profile overlay remains WHITE brightness PROXY.

No Lenard/original-image preset, null-mask extension, generic resource framework, production ABFeature or default-ON wiring is added. Some future contract breadth is intentionally unimplemented: only the exact synthetic8 initial scope was admitted. Resource caps and native/source file identity are engineering safeguards, not measured speed/memory or execution attestation.

## Review handoff

Root already explained this actual written flow to Sam and then admitted only the40 core plus separately owned2 CLI NON-CV tests. The next gate is a distinct independent implementation/source review of the exact seven-file freeze. F6 and F5 cannot accept their own implementation. No further tests/imports/producer run, Git integration/publication or rendering is authorized by this checkpoint; root issues the next native packet.
