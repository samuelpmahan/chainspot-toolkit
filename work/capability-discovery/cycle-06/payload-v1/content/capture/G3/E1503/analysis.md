# E1503: fixed Lenard5 source-derived engineering prediction

Disposition: **mixed_change**. The unchanged nine-module public gateway, math and accepted codec/writer are reusable. The accepted recipe and file adapter admit only synthetic8 and cannot execute Lenard5 as-is. A distinct, separately frozen, default-OFF orchestrator is required. This packet imported no product/vendor code and performed no query, CV, producer, benchmark, source/Git/native mutation, or empirical trial. All numbers below are arithmetic/model bounds, not measured costs or memory.

## Evidence and closure

Read cycle05 `post-review/POST-REVIEW.md`, `next-packets.json`, `source-manifest.json`; accepted station-evidence README/recipe/codec/CLI; exact current public `pathSpace.mjs`, `store.mjs`, and canonical hashing source. No applicable AGENTS.md was found on the workspace ancestor chain or within this repository. Local read-only SHA checks matched the accepted recipe, codec, CLI, PATH and store values in `prediction-freeze.json`. The frozen E1104 proposal matched SHA256 `cb4d757f36ffe6721e71541d6093a48cc11e081bd10c1684746aad8249973829`.

The physical closure remains the accepted nine paths, including both physical copies of alpha.profile@1: pathSpace, width/vendor alpha contract, root-inventory store, pxset, render, canon, png, alphaRender, and root-inventory alpha contract. New orchestration must hash each exact physical file before import, after import and after execution; the trace must separately bind its own frozen orchestrator/adapter/codec source. A source hash does not authenticate execution or bypass host ESM caching. This worker rehashed five principal sources; it does not claim a new independent nine-file byte attestation.

## Request, native callbacks and caching

Preserve protocol group order primary, bright-nonpath, normal-plus6, masked-primary, and each group's before16/core16/after16/long48 order. One fresh store per group/window means16 stores. Comparison `c=4*g+w` has global plan indices `10*c..10*c+9`:

| Local index | Public request |
|---|---|
| 0 | profile |
| 1,2,3 | edgePair34, stationContrast34, loss34 |
| 4,5,6 | edgePair42, stationContrast42, loss42 |
| 7,8,9 | edgePair50, stationContrast50, loss50 |

This is16 profile +48 pair +48 contrast +48 loss =160 public invocations. Register one combined lazy constant with ordered outParts raster then mask. The first profile is seq0/depth0; its first raster resolution invokes constant seq1/parent0/depth1. Successful callbacks complete constant before profile, followed by seq2..10. Thus callback order is `[1,0,2,3,4,5,6,7,8,9,10]`,11 per store,176 total including16 constants. CaptureIndex is completion order, not seq. Registration, source hashes, provenance reads and encoding are not Calculation invocations. With no admitted extra requests, no instrumentation query should be added merely to obtain logs.

`registerQueries` keeps its own answer Map keyed by query fn plus JSON.stringify(raw args). All10 requests in each fresh registration are distinct, so successful public answers emit computed1. A repeated identical request would emit cached1, still produce a native Calculation callback, and is not admitted by the160-query matrix. Cache map is reset per store; equality of same-image content keys across stores does not share that map. Native store `entry.cached` remains false and `entry.key` null for these no-outParts queries, distinct from answer/emitted computed/cached measures. Root constants use per-Part content root keys, not a general computed cache key. Default store cache, registration-local answer cache, raster-object WeakMap luminance cache, and ESM module cache are different mechanisms; none establishes speedup.

Public pair recomputes the same profile separately for each of3 widths; it does not call the registered profile request. Public loss similarly recomputes contrast privately and makes samples/overlay/corridor; it does not invoke registered contrast/samples requests. Therefore only160 public calls/176 native entries appear even though internal computations repeat.

## Exact fixed matrix work

Let P=1290*2796=3,606,840; N is16 or48; B=3; profile offsets M=241. Each group has sumN=16+16+16+48=96, so all comparisons sumN=384. Profile has (1+B)*N*M visits; contrast has 2*B*N*(2 sides*inside/outside*5 along*5 offsets)=2*B*N*100 visits. The factor2 accounts for explicit contrast plus loss's own contrast. These are coordinate loop counts; masks can reduce actual luminance sampling.

| Quantity | Maximum comparison | Entire matrix |
|---|---:|---:|
| Profile offset/station visits | 46,272 | 370,176 |
| Contrast sample-position visits | 28,800 | 230,400 |
| Loss RGB positions / hidden checks | 12,384 | 99,072 |
| All maskedAt invocations | 87,456 | 699,648 |

Loss's lateral reach is R=ceil(2*(W/2))=W, **not half width**, so widths34/42/50 imply rows69/85/101. The loss RGB position count is `N*sum(1+rows)=258*N`; each location samples3 channels, giving297,216 channel bilinear samples over the matrix. All declared coordinate supports are far inside the source frame; the geometric boundary guard is retained regardless. Only the masked-primary quarter has a mask plane, so at most174,912 mask bilinear samples occur; null masks do not sample a plane. These are bounds/counts from source loops, not instrumentation observations.

For each pair, edge candidate interpolation has M<=241 and candidate search L*R<=239²=57,121 conservative checks;48 pairs imply at most2,741,808 candidate pair checks before width/center rejection. Smooth loop5*M and linear scans remain unchanged. For each loss station, median background vectors have at mostW observations per RGB channel (34/42/50), and native median uses Float64Array.sort. Do not invent a comparator-count or wall-clock bound from that implementation detail. No ring/sprite/path-mask producer or width-search request belongs to this matrix.

Luminance WeakMap is keyed by raster object identity.16 independent snapshot wrappers can allocate16 luminance arrays cumulatively and calculate16*P=57,709,440 luminance positions (173,128,320 RGB channel reads), even though source RGBA content is identical. Old wrappers become collectible after scope exit; GC is not guaranteed at those points.

## Typed bytes, nodes and encoded limits

Only native loss answers carry typed data in this public matrix: corridor RGB `3*N*(2W+1)` and hiddenCenter `N`. Contrast arrays and profile arrays are ordinary arrays at the public gateway. The maximum width50/long48 answer carries14,544+48=14,592 typed bytes. Across3 widths, one long48 comparison carries36,864; over all groups/windows, `384*(3*(69+85+101)+3)=294,912` typed bytes. The earlier quick note294144 was corrected to294912 before freeze/outcomes; no CV result drove that correction.

The accepted codec budgets aggregate typed bytes **per encode/decode root**, not per array and not across separate files.294,912 remains below1,000,000 even for all native answers under one root. Native Calculation entries contain no answer or input raster bytes, so176 entries do not multiply corridor size. Keep the caps unchanged: depth32/nodes500000/typed1e6/value32MiB/sidecar4MiB. Do not encode the full14,427,360-byte source RGBA or3,606,840-byte mask in a value trace; either individually exceeds typed budget. Already-encoded fragment bytes are also typed data if recursively encoded again. The existing writer writes those bytes directly and does not encode the fragments envelope; retain that behavior.

For the success answer shapes, counting each ordinary scalar/container/typed array once gives profile494 nodes; finite pair12 (no-pair6); contrast10+4N; loss63+3N+4G, where G<=8 retained edge gaps. Thresholdnull means overlay gap list empty and agreementCountsnull. Thus max loss239 atN48, and the160-answer array is at most21,585 nodes including its root. Depth is at most6. Codec node accounting treats a Uint8Array as one node, but its wire payload still contains all bytes. A conservative wire bound reserves64 bytes per node for tag/syntax/finite numeric representation,4 bytes per Uint8 element,4KiB per loss answer for its fixed keys/string contents and1KiB per other answer. The fixed current literals fit those allowances; `64*21585 +4*294912 +4096*48 +1024*112 =2,872,384`, below3,000,000 bytes including generous syntax slack. This does not certify a future wrapper's size: its final schema must be statically counted independently, and actual serialization must still fail closed at the unchanged caps.

Native onCall capture has one wrapper and native entry only, not native answers. Per-capture node counts are at most22 for constants and21 for PATH; the176-capture array has at most3,713 nodes, excluding future sidecar metadata. Bound names/identifiers/diagnostic strings and count final interval/error metadata before promising a full sidecar bound. A large future prose/testimony addition is not covered by native answer math.

## Allocation/resource guard proposal

P=3,606,840 remains below4,000,000; RGBA14,427,360 below16,000,000; N48 meets48; profile46,272 and contrast28,800 meet accepted model ceilings. Use actual bank maxWidth50 when modeling corridor RGB: N*(2*ceil(maxWidth)+1)*3 <=14,544. The old recipe's literal30 in that expression is not a valid width50 bound. Add hiddenCenter explicitly: native returned typed <=14,592 per answer and <=294,912 over the fixed plan.

Full-source luminance is28,854,720 bytes. One private snapshot+luminance set is43,282,080 with null mask,46,888,920 with the synthetic plane. Both satisfy the accepted52,000,000 modeled full-raster bound. Do not imply52MiB is a process/RSS cap. Unique caller raw planes can occupy18,034,200 bytes; one masked private set plus those planes is64,923,120 before other allocations. Worst declared comparison input sum (count references, not unique identities) is16*RGBA+4*mask=245,265,120 bytes, below300,000,000. If the adapter aliases one full RGBA and one mask safely, physical supplied bytes are much smaller than declared sum; the integrity model must not confuse them.

For a single largest loss, selected simultaneously live explicit typed allocations total `N*(41+16*rows)` =79,536: ts8N, contrast18N, samples13N*(1+rows), loss edge flags2N and corridor3N*rows. This excludes sorting temporaries, ordinary arrays, old cached answers, snapshots/luminance, returned detachment, logs, encoded fragment byte storage, JSON/string trees, hashing temporaries and VM/allocator/GC behavior. Maximum3-loss native cache per comparison retains36,864 corridor typed bytes. A receipt can hold both native caches and detached values/fragments transiently. No exact peak RSS or elapsed work/cost claim follows.

Validation currently reflects every byte's keys (`Reflect.ownKeys`) and compares decimal index strings in both byte-plane validation and codec typed validation. On full RGBA this can allocate millions of JS keys even though byte/work guards pass. This is a real source-visible scalability risk, not a measured OOM. Proposed bounded implementation can reuse accepted descriptor semantics but must explicitly account for key-enumeration cost or propose a separately reviewed semantically equivalent validation seam. No change to accepted files or codec ceilings is authorized here. Preflight should reject bad lengths/dimensions/metadata and all impossible work bounds before expensive enumeration, copying, product import, or query.

## Null mask / Part producer contract

Null is not an all-zero mask or an empty byte plane. For unmasked groups, retain literal null in caller metadata, snapshot, constant Part, integrity identity and hash testimony. Use no mask-byte SHA for null; encode kindnull and sha256null explicitly rather than hashing empty bytes. For masked-primary, preserve the exact full-frame binary synthetic predicate and sampler threshold0.01. Never infer sprite/ring mask or call a mask producer.

Recommended boundary: keep both raster and mask declared on the same lazy input constant, assign mask Part value null for unmasked comparisons, and pass the mask Part reference through the unchanged public query resolver. Store own-Part records exist even when their value is null: `get` returns null successfully; `ctxOf` uses `mask?.mask ?? null`. The first raster get materializes both Parts. Later provenance reads inspect existing records, never force get/has/keyOf. Null-mask provenance still has a content key for the actual null-valued Part; it is not an unresolved/missing Part. Constant outParts must not omit mask, and raw string'none' must not be used as if it were literal null (it would resolve as a missing Part address). An absent producer is an explicit refusal/error, not permission to treat a failed mask read as null.

Native mask null means no caller-mask sample is hidden, but out-of-bounds guard remains. Masked/invalid stations end loss gap runs; all-hidden zero-visible/zero-gap cannot prove continuity. Public profile has already replaced NaN bins by null; do not invent pre-normalization NaNs. Public contrast retains actual NaN values and validity flags; the accepted lossless codec preserves them. Native loss nulls, proxy alpha metadata and thresholdnull must remain intact.

## Falsifiers / negative cases before producer admission

1. Disabled/missing enabled: no unrelated getters, source reads, copies, product import or producer calls. Unsupported protocol, tol3, moved origin/changed windows/bank/order or altered raw source must refuse before import. Old synthetic8 success/defaults remain unchanged on its distinct path.
2. Refuse wrong dimensions/length/hash/decoder/frame; Buffer/subclass/accessors/sparse arrays/custom typed properties; nonbinary or wrong-frame mask; null replaced by zeros; source-hash mismatch; original image substituted by crop. No corrective data rewrite.
3. N49, bank width51, support beyond reviewed fixed windows, bank expansion, arbitrary comparison17, malformed t0/t1/step and unsafe integer products are refused even if numerically below generic codec limits. Exact fixed preset validation is stronger than only maximum bounds.
4. Constants must remain lazy. Eager raster/mask inspection before profile changes callback parent/order; repeated or missing constant changes16/176 predictions. provenance on unmaterialized Parts must remain null without forcing them.
5. Each raw loss corridor long48/width50 must be48x101, RGB length14,544, hiddenCenter48. Preserve partial fragments if encoding/output fails. Existing output directory must refuse before calls; no overwrite/retry/producer repeat.
6. Independent codec-only boundary tests may show1,000,001 aggregate typed bytes refuses, no raised limit is accepted, nested encoded fragments cannot bypass budgets, and tags preserve NaN/Infinity/-0/native-null distinctions. These are proposed tests, not tests run in E1503.
7. Interrupted/throwing callback must not fabricate completed counts or later rows. Unexpected async answer is refused. Keep attempt/completion/failed/captured counters actual and separate; incomplete run never reported160/176 merely because plan predicts it.
8. E1104's scientific falsifiers remain unchanged: keep any no-fit result, bright-control collision, same-edge offset residual failure, mask ambiguity and shared-pixel dependence. Do not tune geometry, add CV outputs, widen support, or choose width after results. Scientific/path/physical-edge/calibration/human acceptance stays UNKNOWN.

## Next bounded gate

G6 may use this source-only proposal when constructing the separately admitted distinct preset. Source freeze must include exact plan and schema-bound allocation/node/byte guards. Independently review NONCV tests and actual-flow checkpoint before any separately admitted fixed160-call original-image run. Root alone owns native dispatch. No cap increase, scientific acceptance, new producer, Git publication or native state change is granted by E1503.
