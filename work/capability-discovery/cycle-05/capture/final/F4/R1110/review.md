# R1110 — independent E1110 registered-gateway addendum review

Decision: **accepted**, limited to engineering coherence of the composite source-only proposal and its appended root scope clarification. This resolves R1105 A1–A4 for a separately admitted small implementation; it is not acceptance of nonexistent implementation, tests, runtime observations, scientific claims, publication or promotion.

## Exact reviewed packet

| E1110 artifact | SHA256 |
| --- | --- |
| addendum.md | 0fe0681961202780332387ac4c340dc5eb0a2dfc08c6db1d2ce5f93f6fa9ab8a |
| executable-contract.json | 645cd963d2815d49fbb543ffa4916acd70c545ca345f3b1cf8013b84c337dbb4 |
| result.json | 4b80584b5498055f6e2de0aafb6882dc5889e1f7cfe89400b7b4976b1acb0d16 |

R1105's original AMEND review and all three F3/E1105 history hashes reverified unchanged. The new contract is an addendum, not a rewrite or retroactive claim that the direct-export proposal used the gateway.

## A1 — route and source/Part identity: closed

Rehashed all nine physical module paths and checked their actual relative imports stay inside the listed closure. They represent eight byte identities: both alpha copies remain independently bound by path. This is actual `createPartStore` / `registerQueries(store,PATH_QUERIES)` / `store.call`, with unchanged source and `base:null`, fresh default cache, registration answers Map, private raster/mask copies and store per comparison/pose/window. Literal widths share that one comparison store, as expressly selected by root; no per-width store is required by this accepted addendum.

Exactly one combined lazy constant has raster then mask outParts. Null and all-zero masks are distinct. Wrapper freezing is compatible with the source and does not pretend typed-array elements were frozen. Privacy and observed pre/post hashes—not a content-addressed query cache—provide the bounded no-mutation invariant. Source/module-cache identity remains qualified, with no concurrent-filesystem attestation claim.

The appended Part-key instruction is source-coherent: `store.provenance(address)` returns null without lazy production when the Part does not exist, and returns its actual key after the combined constant materializes. `keyOf` can trigger lazy production when called too soon, so implementation must not use unguarded pre-materialization keyOf/has/get as introspection. Capture actual available keys after materialization; otherwise null. Never serialize RGBA or private buffers into output.

One lifecycle-list wording deserves explicit implementation discipline: JSON `flow` mentions the per-comparison store lifecycle before the following import-verification line. Its explicit “before dynamic import” guard and addendum A4 correctly establish the causal order: enabled preflight/caps and identity checks → source verification/import/post-import verification → store creation/constant/registration → queries. The list must not be implemented as an attempt to create a store before loading its factory. This is a clarification of existing guards, not a requested new feature or framework.

## A2 — counts, order and cache semantics: closed

F4's exact protocol/inventory and five raster/three mask hashes match; all eight comparisons and the fixed +6 origin match E1102. First implementation/producer scope is only these cases. The old five-case sketch is not used. Lenard remains a separately gated extension, not 160 extra initial calls.

For synthetic8, one profile then edgePair/stationContrast/loss at width30 gives source-derived prediction **32 PATH + 8 constants = 40 Calculation entries**. These are predictions, not populated observed counters. Actual source confirms first profile seq0 lazily invokes constant seq1, parent0/depth1/caller `lazy:px.image.cropped`, producing successful callback completion order `[1,0,2,3,4]`. Captures retain actual order, store-local seq and native fields. No instrumentation query is needed; store.calls is an uninstrumented read. Public invocation states/counts remain separate from Calculation logs and internal mathematical work.

Source `registerQueries` keys by function plus JSON.stringify(rawArgs), resolves top-level strings and returns computed/cached emits. Query registrations have no outParts; general store `entry.key:null` / `entry.cached:false` remain distinct from registry emits. Exact argument insertion order and case metadata outside raw args avoid invented Part-reference resolution. Fresh comparison stores and private immutable snapshots bound this run; they do not fix general cache freshness. First throw stops later plan rows, preserving real partial logs/results; native conditions are completed calls.

## A3 — raw-value codec: closed as a proposed grammar

The all-tagged value-tree grammar is collision-safe: native tag-looking arrays/objects are encoded as containers rather than mistaken for wire nodes. Finite IEEE754 values, explicit -0, NaN, both infinities, null, dense arrays, ordered own data properties and ordinary/null prototypes are distinguishable. Exact Uint8Array constructor/length/ordered bytes cover both native loss-corridor arrays. Other types, undefined, sparse/accessor/custom shapes, cycles, malformed tags/lengths/constructors and duplicate property names are explicitly rejected. Safe define-own-data-property decoding handles `__proto__`. Backing-buffer identity and shared aliasing are explicitly outside the value-tree promise.

Raw native profile null stays null; raw stationContrast NaN remains numeric-tagged, finite invalid contrasts remain finite with flag0. Encoding precedes JSON/generic canon/display normalization. File hashes bind exact original encoded bytes. Complete native answer and instrumentation sidecar are separate; source-rounded corridor RGB is not represented as recovered unrounded RGB. Separately admitted non-CV roundtrip/rejection tests are required before producer admission, and none are claimed to exist or pass here.

The final replay clarification excludes only native entry elapsedMs/computedMs and named interval timing/timestamp fields while preserving original timing-bearing bytes/hashes. All other metadata, Part keys, identities, raw values and trace transitions stay compared. No entire metadata or sidecar object may be dropped from deterministic comparison.

## A4 — closed inputs, finite work, errors and trace-only figure: closed

The selected preset domain is explicit, dense and exact, with initial synthetic8 only, no arbitrary geometry/band/along/step/width surface, no cached repeats or extra malformed/short-window CV probes. Empty lists/banks/windows refuse preflight with zero API calls. Disabled absent/false enabled avoids source/pixel imports/reads/store creation; enabled inspection must use own data descriptors without invoking getters. Invalid enabled types reject.

Caps are practical and arithmetic is consistent with actual source: maximum `(1+B)*N*241 = 46,272` profile positions; `2*B*N*100 = 28,800` contrast positions; `N*(2*ceil(W)+1)*3 = 14,544` corridor RGB bytes per loss and 43,632 over three widths; 13*pixelCount models RGBA+mask+luminance only, not measured process memory. Safe-product, exact-length, representability, total-input and codec byte/node/depth checks precede relevant allocations/imports/calls. Resource failure stops without truncation, skipped widths or retry.

Error projections and phases distinguish preflight/source/import/input/query/post-integrity/encoding/output/render failures. Already obtained native evidence survives partial failure; unsupported Error objects are projected, not falsely losslessly serialized. Counts are actual transitions/logs rather than expected totals. Figure/inspection reads only hash-verified encoded trace+sidecar through the admitted codec, imports no CV/store code, reads no image/RGBA/mask file and accepts no new geometry. Every comparison/profile/count/fit/bilateral value and flag/native loss field remains accessible; invalid values are not connected or zero-filled. Bad render inputs fail without rerun and corrections remain separate.

## Verification and boundary

Source-only read/hash/JSON parsing and arithmetic checks succeeded. Nine source paths/eight identities, static closure, R1105/F3 historical hashes, F4 protocol/inventory hashes, raster/mask identities, eight-case order/pose and source-derived count/work arithmetic passed. No product import, query/API/CV/producer, test, image decode, renderer, Git operation, source edit or native-state write occurred. Only requested scratch review artifacts were written.

No blocking amendment remains in A1–A4. Root may separately admit F6's smallest default-OFF synthetic operation and its checkpoint/non-CV tests. This review itself grants no implementation execution or producer permission. Keep raw R1105 AMEND history, unknown path/physical-edge/calibrated-width/scientific/human claims and promoted=false.
