# E2002 / S2 — independent retained-fit/public-PATH contract

Source-only requirements, not approval of S1 work. Outcome: **mixed_change**: unchanged public query reuse is confirmed, but root-requested targeted E2001 source-shape inspection requires a protocol wording amendment, and new caps still need review. Unchanged public `fn.q.path.stationContrast` can consume jointly retained center+width; width-only is not claimed new. No answer body was read/decoded and no eligibility was observed. Historical four no-pair/44 potentially eligible slots are prior testimony/prediction only. No CV/scientific/human/physical-edge/path acceptance.

## Exact evidence

`P` = `chainspot-discovery-lab/experiments/capability-discovery/probes/width/vendor/active/ports/s6straight/pathSpace.mjs`, 27838 B, SHA256 `d0fb2bf5076a386a5c362b8fe034ab49ba5318fda2bd21eb74d30334ed6a105e`.

`S` = `chainspot-discovery-lab/experiments/capability-discovery/probes/root-inventory/source/fg/store.mjs`, 32442 B, SHA256 `122d624e0311e18f596db37bf292d9c31f47a364e75c8808ca6788c3449a3074`.

`R` = `chainspot-discovery-lab/experiments/capability-discovery/lenard5-station-evidence/recipe.mjs`, 29160 B, SHA256 `4c32c70e80fada8e4454f3ed2fb45c0c396067d585070b20308d33302f0f19d6`.

`C` = `chainspot-discovery-lab/experiments/capability-discovery/station-evidence/codec.mjs`, 7322 B, SHA256 `3cba80fa24f1ff9ae30f5a24fbcc8c4b29944304a03447252d6172448fdd7015`.

Full E1528 proposal read: `f04146ec0cbd9b3ede22301d703bb9da26770728519fec5031ae0cc04c2330fb`; full R1528 review read: `56d728d4a7fb6a1e5b48569c0ee230cccdefef48471754e1f3f00d89d18d2fcb` (16218 B). Source freeze22 `6f3f30924749e0104a12e7d5d3d43b45b23569e55de8ffe565111620dd0355b8` was read as metadata. These are fresh hashes, not a reapproval of any past execution.

## Proposed closed admission predicate (future run only)

First freeze/verify byte length+SHA of the original input manifest `4ae5f021bc3c9be8184cdb0627abdacabae9d7c8dcff88a12b404762843bbe9f` **separately** from raw artifact manifest `f85df68d1b34ce2464dcec869c023f0bb10a0240cf9f750ca1a0b23e0151064f`. Bind accepted receipt, source22, protocol `cb4d757f36ffe6721e71541d6093a48cc11e081bd10c1684746aad8249973829`, declaration, original raw args, query state/error and exact fit/control fragment path/size/hash for every slot. Then, only in a separately admitted run, bounded pinned-C decode may inspect numeric answers. Do not use rounded descriptive scalar tokens. C:6–20,98–158; R:83–117,128–143.

Let `O(K)` mean an ordinary Object.prototype object with exactly own enumerable data fields K, no extra/symbol/accessor/undefined fields; key **set** matching is distinct from the separately frozen raw-argument insertion order. This is stricter than generic codec acceptance because pinned native constructors produce plain objects (C permits null-prototype objects too).

For `j=3*c+b`, `c=0..15,b=0..2`, bind fit index `10*c+1+3*b`, nominal control index `10*c+2+3*b` (R:120–143). Admission requires original fit query COMPLETED, error null, correct query/args/identity, and:

1. Outer `O({value,unit,emits})`; unit exactly `px (l, r, c, w: lateral offsets); score, gl, gr: lum/px`; emits exactly `O({computed})` with computed=1. Original unique first-call edgePair args do not call for cached emission (P:56–59,335–341; S:188–199).
2. Either value exactly `O({condition})`, condition exactly `no edge pair`: retain slot/control, derive NOT_EXECUTED/NO_EDGE_PAIR; or value exactly `O({lPx,rPx,cPx,wPx,score,gl,gr})`, every field a JavaScript number.
3. For numeric-shaped pair, require **all seven** fields finite and raw `wPx>0`, plus finite translated origin components. Otherwise retain raw bytes and mark numeric-unusable with specific field/reason; zero new stores/constants/queries. Number type includes NaN/Infinity/-0, so these are not silently malformed shape. No score-sign/magnitude, residual, nominal-width or center cutoff is added.

This explicitly proposed classification is not a claim that such unusable fits occurred. Do not silently add arithmetic-equality/envelope rejection rules; if desired as integrity checks, independently predeclare/review them before numeric exposure.

| Case | Classification / required action | Source contract |
|---|---|---|
| Exact no-edge-pair value + edgePair unit + computed envelope | Ordinary native condition; NOT_EXECUTED, preserve nominal control | P:108–138,340; S:198 |
| Seven numeric fields; any NaN/Infinity, nonpositive width (including ±0), or nonfinite derived origin | Proposed ordinary NUMERIC_UNUSABLE; retain raw/reason, no new call | P:135–137; explicit future admission policy, not a new scientific threshold |
| Null/string numeric field; missing/extra key; wrong prototype/envelope/unit/emits; null pair; unexpected condition | Fatal shape/source integrity stop, not no-fit | P:332–341; S:196–198 |
| `unit:'condition'`, `{schema:'nctk-s6-path@1',condition:"edgePair: no raster (pass raster: 'px.image.cropped')"}` | Fatal input/contract violation; never NO_EDGE_PAIR | P:331–335 |
| Original query THREW/error; missing fit/control; wrong comparison/bank/index/hash/args; codec/binding failure | Fatal integrity stop; preserve completed/failed/unattempted slots, no retry/fallback | R:128–143,333–335,384–412; C:98–158 |
| stationContrast finite luminance with ok=0, or NaN luminance | Ordinary raw support outcome; retain it; not zero, null, physical gap or success | P:141–158,341 |
| stationContrast luminance null, boolean flags, typed output arrays, wrong array length/unit/keys | Fatal shape mismatch for this pinned public wrapper | P:341 |

## Refined geometry and public call

P:95–103 uses `u=[cos(phi),sin(phi)]`, `n=[-sin(phi),cos(phi)]` and samples `O+t*u+(offset+lat0)*n`. Frozen lat0=0 gives the unrounded expression `originPx:[O[0]-cPx*Math.sin(phi),O[1]+cPx*Math.cos(phi)]`; native `wPx` is passed directly. No crop/display remap, rounding, clamp, second centering, bank selection or string-token parsing.

P:130–132 gates **discrete** offset width/center with tol2/latLim12; P:135–137 refines l/r afterwards and recomputes c/w. Consequently nominal±2 and |refined c|≤12 are not valid new eligibility tests. Illustrative source-only counterexample: a discrete boundary pair can refine outward, changing width beyond that literal boundary; this is not an observed fit. `score=min(gl,gr)` is a discrete gradient measure (lum/px), not confidence or refined-width accuracy.

Only public `fn.q.path.stationContrast`, raw keys in order `raster,mask,originPx,phiRad,t0Px,t1Px,stepPx,widthPx,bandPx,alongPx`; addresses remain `px.image.cropped`,`tk.s6.pathMask`, band `[1,3]`, along2, all other frozen geometry unchanged. No lat0/center/edgePair argument is consumed there. No private helper, profile/edgePair rerun, width search, loss/overlay call or new threshold (P:340–341; R:135–140).

Successful result is exactly `O({value,unit,emits})`, stationContrast unit `lum per station (inside band minus outside band), per side`, computed=1; value `O({leftLum,rightLum,okLeft,okRight,stationsCount})`. All four arrays are ordinary dense arrays with common frozen N=16 or48; stationsCount=N; luminance elements have number type without normalization; flag elements are numeric0/1. Preserve unusual numeric values losslessly and separately flag source-impossible nonfinite outcomes for review, never fabricate a clean success. Null is not a luminance substitute in this wrapper. C:74–79,111–118 preserves NaN/±Infinity/-0.

P:142–155: each side compares inner and outer bands, each mean dropping masked samples; min(inside/outside support fractions)>0.5 yields ok=1 (strictly greater). Finite means/contrast can coexist with ok=0, while no contributing sample makes NaN. P:87 masks out-of-bounds even with null mask; null means no explicit mask, not unrestricted image support. Explicit mask uses bilinear >0.01; it is caller visibility, not a detected physical occlusion. Band5 × along5 × inside/outside2 × sides2 =100 visits/station, at most4800/call: source-derived work, not RSS/timing or observed calls.

## Fresh store, identity, caches and callback contract

Per eligible slot create one fresh uniquely named `base:null` root store, with default fresh cache, one newly registered lazy named constant supplying this slot's new private raster object/buffer and literal null or exact copied mask, then register unchanged PATH_QUERIES. Same address strings are **semantic addresses**, not historic Part instances/provenance. Constants register without materializing (S:217–219,236–254,337–367); the query resolver's first raster get naturally produces both Parts (S:188–198,285–332). Null mask is a real produced Part (R:369–383). Zero stores/constants/queries for skips; one live slot snapshot/store at a time; no store/raster/cache reference escapes (R:361–363).

Record new slot/store/producer/caller identity, actual resulting Part keys and provenance, not copied historical IDs. Constant keys are per content/address and ignore locator attempt/run, so identical content may legitimately yield identical keys without shared execution (S:168–172,361–367,425). `provenance` returns null before production and does not force it (S:494–501); `has`, `get`, `keyOf` **can** force lazy production (S:270–280,314–332). Keep keys null until natural materialization; no diagnostic force read.

Fresh-store first query is entry seq0; nested lazy constant seq1/parent0/depth1 exits first and its onCall capture precedes seq0. Capture index/order is not sequence number/order. Constant caller is `lazy:px.image.cropped`; query caller is new protocol identity. Record actual timing/status/error/emits, including partial failure, not copied sequence identity (S:293,373–447). onCall/encoding failures may interrupt before all captures; max96 callbacks is an all-eligible success upper bound, not a guaranteed failure-path count.

There are distinct caches: each `registerQueries` call owns answers Map keyed by fn+JSON.stringify(raw args), adding computed or cached **emits** (S:188–199); store shared calculation cache only keys non-root calculations with outParts (S:415–435); constants have rootKey and PATH queries have no outParts. Thus PATH entry.cached=false/key=null does **not** prove absence of query-answer caching: inspect emits too. Require fresh first-call computed=1/no cached emission and no shared/persistent cache injection. P:68–77 separately caches luminance by raster object WeakMap identity; fresh private raster object prevents deliberate cross-slot object reuse without modifying that source.

## Reviewer gates and limits

Freeze all48 slot bindings/states and source-derived sequential resource/output/decode caps; reserve exclusive one-shot output/token before future calls; stop on integrity/query/codec/input/output failure, retaining partial/unattempted slots. Max48 new PATH and48 lazy constants, zero observed. Old16-store/fixed160 totals are not this sibling's resource plan. Retain exposed bright controls, fit switching, masked NaN/finite-invalid denominators; joint center+width cannot isolate causality or establish same physical pair. Standalone default-OFF lab protocol, not production ABFeature.

README/REVIEW/CURRENT were read. CURRENT contains historical prepublication wording; this report does not rewrite it or infer live Git state. Repo/native/Git writes=0; only this E2002 scratch directory is written. Source22/new5/all3375 preservation is maintained by zero edits; no whole-index/all3375 fresh verification is claimed. HH/PageRouter untouched. S1 protocol was subsequently inspected only for root's targeted guard/callback/cap question below; no whole S1 proposal/implementation approval. All new queries, imports, codec/store calls, tests, numeric raw-answer reads/decodes, CV and rendering=0.

## Root followup: exact original object paths, before any decode

Targeted E2001 protocol identity: `discovery-cycle07/S1/E2001/protocol.json`, 71512 B, SHA256 `6db61139f62965ee1f67433b22cd6c525400e69dfb3cbf657fbde774af74d5b6`. Its line193 `eligibility.originalExecutionGuard` says fit/control **plan rows** COMPLETED/error:null and callbacks with correct raw args. **AMEND the paths now**; do not compensate for missing fields by normalization. This is source consistency, not an observed raw-artifact pass.

| Decoded native artifact path | Actual source-produced shape | Literal guard allowed |
|---|---|---|
| `value-trace.json` root `.plannedQueries[planIndex]` | `{planIndex,comparisonId,groupId,windowId,widthPx,query,rawArgs}` (R:130–133,332) | Bind original declaration/query/rawArgs here. No state or error field exists. |
| Same root `.queryTrace[planIndex]` | `{planIndex,comparisonId,state,resolvedIdentity,nativeAnswer,error}` (R:333–335) | Require state COMPLETED/error exactly null/nativeAnswer present for fit AND control, after exact identity binding. R:393 sets COMPLETED; R:401 assigns error only on failure. No `status` field. |
| Same root `.inputIntegrity.snapshots[].checks[]` | `{planIndex,post,verified}` (R:404–405) | Require verified and bound hashes. There is **no error field**; do not repeat the prior per-check error:null mistake. |
| `fragments/calculation-K.json` decoded root | `{comparisonId,captureIndex,nativeEntry}` (R:371) | Bind comparison/captureIndex and exact manifest entry; no root status/error/rawArgs. |
| Same root `.nativeEntry` | seq,parent,depth,calculation,store,caller,site,inParts,outParts,elapsedMs,status,error,emits,key,cached,computedMs (S:376–379) | status exactly ok/error exactly null are valid at **this nested path**. There is **no args or rawArgs field**. |

Required wording: “At original decoded value-trace root, bind `.plannedQueries[fitIndex/controlIndex]` query/rawArgs/declaration identities and `.queryTrace[...]` state COMPLETED/error:null/nativeAnswer. Join each to exact callback manifest fragment and decoded `{comparisonId,captureIndex,nativeEntry}` using verified comparison, calculation, actual capture/seq/parent/depth relationships and source-derived per-store order. Validate callback `.nativeEntry.status==='ok'` and `.nativeEntry.error===null`, plus computed emission. The callback does not independently carry raw arguments; do not claim or require it does.” This join is source-derived attribution under pinned original producer, not independent dynamic argument capture. A source change to add capture would not repair old evidence.

Writer source `station-evidence/cli.mjs` (9436 B, SHA256 `4ca8c6065698f49bf6d13766764e298f0edcfde55e720a830e1e3b78223ec04c`) lines100–109 binds callback files by global array index, metadata comparisonId+captureIndex. Filename K is not a local seq. Lines113–117 encode the trace **root itself**, not `{valueTrace:...}`. Lenard CLI source (7213 B, SHA256 `a711ab50bc50bd3f69e61656f12002d41d901e19d7db4e8a9b3b5eb188457ffa`) is the receipt wrapper, not a trace normalizer.

E2001 `resource.newPacketCaps` answer65536/callback65536/valueTrace4194304/total16777216 are **new proposed lowered/enclosing budgets**, not already justified by unchanged codec or native-array size. C hard ceilings alone do not prove encoded metadata/aggregate/output fit; writer lines99–117 encode value/sidecar only after already-written fragments and currently have no16MiB aggregate guard. Require source-derived worst-case object/string/number/wire/file-count arithmetic and separately admitted fabricated NONCV cap/failure-path checks before enabling. This review runs neither. Failure must retain prefix/cause and never raise caps/retry. These budgets are neither observed necessary nor observed sufficient here.
