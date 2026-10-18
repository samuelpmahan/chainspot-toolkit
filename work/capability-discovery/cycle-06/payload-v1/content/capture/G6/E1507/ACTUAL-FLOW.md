# E1507 / G6 — actual code-flow checkpoint

Status: CONSTRUCTED, NOT RUN. Await root scoped NONCV validation GO. No final native result yet.

Written G6 files under experiments/capability-discovery/lenard5-station-evidence/:
- experiments/capability-discovery/lenard5-station-evidence/recipe.mjs — 29160 bytes, SHA256 4c32c70e80fada8e4454f3ed2fb45c0c396067d585070b20308d33302f0f19d6
- experiments/capability-discovery/lenard5-station-evidence/recipe.test.mjs — 9638 bytes, SHA256 0163e8d12298d32e4c825da1ea734b320b672bdef59affbea20ff42cac7fb0a2
- experiments/capability-discovery/lenard5-station-evidence/README.md — 9668 bytes, SHA256 6a40f91299961893ec7de5096b366f234be46743e7b86036a32e41dda24afaf7

G5 separately wrote cli.mjs and cli.test.mjs; G6 read their current source for interface compatibility but did not edit or run either. Exact readback records their current identities, not G5 handback/acceptance. G6 retains source integration/Git ownership but no Git action is admitted.

## What actually happened

Read-only source/docs/receipts; tests file authored first; recipe and README constructed; read-only source readback and SHA/byte/mode checks. No syntax check, source import, test, valid preflight, vendor/store/PATH/CV call, producer or renderer has executed. No observed red; this is tests-first construction, not completed TDD. The long initial apply_patch completed successfully; after transient tool delay its result and actual file were read back before subsequent edits, no duplicated patch.

All2523 baseline tracked bytes/modes still match exact E1506 inventory; HEADbe67d44a/tree87dfd9ae unchanged. Only new sibling directory is untracked. Seven/nine closures are among those unchanged original paths. No old source, Git refs or native state changed by G6.

## Entry point

Default: await runLenard5Evidence() returns disabled.
Enabled request: await runLenard5Evidence({schema:'cycle06-lenard5-request@1',enabled:true,manifestPath:'/absolute/files.json'}).
NONCV inspect: inspectLenard5Request(sameRequest), synchronous full file/hash preflight only; not producer permission and not part of the proposed initial test command's valid cases.

## Actual numbered walkthrough

1. New module statically loads Node builtins, existing tagged codec and existing synthetic recipe definitions only. Neither accepted module statically imports the product gateway. It exports exactly lenard5Declarations, planLenard5Queries, inspectLenard5Request and runLenard5Evidence.
2. Runner constructs empty DISABLED result and checks only own enabled descriptor. Missing/false returns with no intervals/file reads or unrelated getters; accessor/nonboolean refuses. Enabled request exact ordinary own enumerable shape disallows caller planes/geometry/custom fields.
3. Bounded file loader reads exact small file manifest, exact12718-byte E1104 protocol and4252-byte hash-pinned G1 attestation. It then hash-checks actual PNG3943106, RGBA14427360 and binary mask3606840 bytes. Descriptor fstat/regular-file/O_NONBLOCK/bounded preallocation/readSync+EOF/close guard precedes product imports. No large-plane own-key enumeration or PNG decode. Input planes stay private; encoded/raw identity vs reviewed decoder testimony remain separate.
4. Plan/declarations are internal fixed16 comparisons/160 requests. Group/window/width order and literal E1104 settings are frozen, no caller geometry. Allocate all160 NOT_ATTEMPTED rows. Hash canonical planes and first private snapshot before product import. Trace stores only metadata/digests.
5. Reuse existing nine-module verifier; separately hash new recipe/CLI and exact pinned existing codec/writer/recipe. Dynamically import actual PartStore/registerQueries/PATH only after success. Rehash both closures before first store. SourceBinding retains before-import result even if later runtime hash validation fails.
6. Each of16 sequential scopes owns current private raster, mask, store and cache. One canonical loaded pair is shared internally; each comparison receives a private RGBA copy; mask copy only for4 masked-primary windows, literal null for12. Fresh base:null/default cache/answers Map each comparison, all widths within that scope.
7. Register one lazy combined constant with raster then mask outParts, including null mask Part. No eager get/has/keyOf. Every query raw mask string resolves through real store to null or plane; metadata strings are not Part args.
8. Call exact table below, no direct low-level math or repeats. onCall immediately tags/detaches actual native entry in callback completion order. CaptureIndex differs from native seq;16/160/176 and seq[1,0,2..10] are predictions only. Actual counters increment only on events.
9. Raw answer is captured immediately; query completion increments before answer encoding. Encoding failure after a successful call does not become a fabricated query throw. Preserve answer/callback fragments, first error and later NOT_ATTEMPTED rows. Per-attempt private hash and read-only provenance checks never force a Part.
10. Comparison/run finally checks private inputs, canonical planes, every actual original file, small caller metadata and source/runtime closure. Post-file size/read/digest mutation is explicit POST_INPUT_MUTATION with original refusal preserved. Post-errors append without erasing first cause. Unused first snapshot is checked if import fails.
11. Return exact writer-compatible new inner trace/sidecar/fragments. Full input planes never enter codec. G5 CLI reserves NEW writer before calling this runner, reuses legacy outer envelope and appends separate receipt; no loader export/duplication. Writer output is best-effort retained-prefix, not atomic/durable.

## Invocation table — source plan, NOT observed calls

| Calculation per comparison | Actual raw args beyond raster/mask refs | Input Parts | Output |
|---|---|---|---|
| fn.input.lenard5StationMeasurement, lazy once | no caller query args | none | px.image.cropped then tk.s6.pathMask, literal null or exact strip |
| fn.q.path.profile once | fixed origin/phi/window/step1,lat0Px0 | raster + mask | complete native value/unit/emits |
| fn.q.path.edgePair for34,42,50 | same support,lat0Px0,width literal,tol2,latLim12,minOk8/.2 | same | complete native pair or condition |
| fn.q.path.stationContrast for each width | same support,width literal,band[1,3],along2 | same | all raw left/right contrasts + flags |
| fn.q.path.loss for each width | same support,width literal,profile:null,threshold:null,tau8 | same | complete native loss + typed corridor |

Within each width, edgePair then contrast then loss. Groups primary/bright-nonpath/normal-plus6/masked-primary, windows before16/core16/after16/long48. No recenter, fit feedback, crop-based query, width selection or masking substitution.

## Shared machinery, inspection and boundaries

Existing codec/writer/query/store math unchanged. New runtime functions duplicate only orchestration/guards necessary to preserve frozen bytes. No source freeze/acceptance or positive execution claimed. Hash checks attest file identity at check time, not source authentication, hostile replacement or cached ESM execution. Private reachable-set memory model is not peak RSS; GC can retain unreachable allocations.

Returned raw answers and sidecar are inspectable via accepted codec; G5 persistence holds exact fragments plus tagged trace/sidecar, new receipt and legacy manifest. No renderer is implemented/invoked by G6.

Caps unchanged: codec depth32/nodes500000/typed1000000/encoded33554432, callback and sidecar4194304. Inputs are external. Aggregate corridor294912typed bytes is source arithmetic, not whole-wrapper cap proof. Initial tests cover only listed NONCV negatives/plan; full valid inspect, altered source stage, runtime stop injection and whole-wrapper cap vectors remain separate review obligations before producer. Scientific/path/physical-edge/continuity/calibrated-width/human acceptance UNKNOWN, promoted:false,heldout:false.

## Exact prospective commands — DO NOT RUN without root GO

Cwd: /workspace/scratch/8528bb251845/chainspot-discovery-lab

1. node --check experiments/capability-discovery/lenard5-station-evidence/recipe.mjs
2. node --check experiments/capability-discovery/lenard5-station-evidence/recipe.test.mjs
3. NODE_OPTIONS='--import=/workspace/scratch/8528bb251845/discovery-cycle06/G6/E1507/no-product-tripwire.mjs' node --test --test-reporter=tap experiments/capability-discovery/lenard5-station-evidence/recipe.test.mjs

The prospective preload uses node:module.registerHooks to refuse all /probes/ or /source/provider/ imports and prints blockedImports on process exit. It is written but NOT RUN; root must inspect/approve it. This is an import blocker only, not a claim of independently instrumented zero source reads/store calls. Test shape/disabled no-read obligations are source-reviewed and getter-observed; G4 may provide stronger independent instrumentation later.

Test file calls no valid enabled runner and no valid full-input inspect. Temporary malformed manifest/protocol fixtures are bounded; cleanup only its mkdtemp directories. Test-only module loader traps product imports before evaluation, does not replace any gateway/CV implementation.

Stop on the first failure, retain stdout/stderr/exit/exact source; no repair or rerun under construction authority. Root may approve only this G6 command set; G5 CLI commands remain its separately owned packet. No broad suite, fixed producer or past synthetic replay is proposed.

## Review call

Root: review written flow/source/hashes and prospective commands. Admit the bounded NONCV command set only if it matches the requested flow. All producer/render/Git/native actions stay separately gated.
