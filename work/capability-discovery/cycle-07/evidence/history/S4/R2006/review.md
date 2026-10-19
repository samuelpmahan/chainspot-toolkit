# R2006 / S4 — complete E2006 source review

Decision: **AMEND before first execution**. This is an independent full read of the exact entry/core/tests/FLOW.v2/contract.v2, not E2007 design acceptance or a self-approval. The implementation is narrowly scoped and many E2007 guards are present. Three concrete changes remain: prospective v2 authority rebinding, original contrast Infinity integrity-HOLD, and the missing source-produced input-integrity joins. Keep originals immutable and author a versioned repair under separate authority. No source was changed here and nothing was run.

## Exact reviewed checkpoint

| File under discovery-cycle07/S2/E2006 | Bytes | SHA256 |
|---|---:|---|
| original-evidence-plan.mjs |12665|6234b799ce57a1e0cab0744ff116041815a13db30839faf9b7f91843f0d856b4|
| plan-core.mjs |15679|df6e398677ba99564619ab80ac886d752aaf88ab8a275933fd2f5f3878a3d57e|
| plan.test.mjs |14080|e5f86e7cdfa703bc8cb614ba1ca0cb3c2c920b2ec8c3a1e0fba87a5b46172595|
| FLOW.v2.md |8804|4072059e2cab06b2fe1d6043cdda3c11595a0e2effece0eb8b892c81ee02915b|
| contract.v2.json |5008|ed4653d0cc56ddc60ab482601ea405c2b5efc41d799707a074b5ead2c4090544|

S2 construction result SHA256 `2f6f8d37d0a3db4af3e7dd1a7d83727400b6a9cfd58b395fa89fd8bf91871b4a`. Root-accepted protocol target: `discovery-cycle07/S1/E2005/protocol.v2.json`,83022 B, SHA256 `7948df5ee19e10a065f907a7dc0af1b845b5b408f32776b78813ad938bedea6e`, schema `cycle07-joint-fit-station-contrast-protocol@1.1.0`. Its embedded historical pending-review text is chronology, not a claim of current execution permission.

## Required bounded amendments

### A1 — mechanical authority rebind

Entry `PIN.protocol` still reads E2001/v1 (71512 B/6db61139…), and `slotLedger` accepts only `@1.0.0`. Output `v1ProtocolLedgerOnly` and `protocolBehaviorAuthority` still say v2 rebinding is future. Rebind the versioned repair to the exact v2 path/83022 B/hash/schema and truthful current behavioral-authority output, retaining v1 only as separately labeled history if desired. Do not silently overwrite v1. Request schema/token are a separate closed interface; changing their spelling is not inherently required by a protocol-schema change, but any new admission identifier must be frozen explicitly.

With only the protocol-size change, prospective single-pass body total becomes `3632816 + (83022-71512) =3644326 B`, still304 body reads, before any new pins. Actual `load` charges remain controlling. Update versioned source hashes/flow/test authority before first execution, never after a failed run. This is a mechanical rebind, not authority for an enabled real-root call.

### A2 — retain Infinity contrast and stop with integrity-HOLD

Core `control()` presently accepts every primitive number, including ±Infinity, and `bindPlan()` can return READY. This contradicts v2 `eligibility.contrastIntegrityPolicy`: source-impossible ±Infinity in original nominal contrast must retain raw value/fragment identity/original status, append an integrity-HOLD cause and stop further work; no ordinary skip, normalization or success interpretation. Keep NaN, finite-invalid, -0 and numeric0/1 flags valid under their existing native semantics. Do not change the numeric-shaped **fit** nonfinite NUMERIC_UNUSABLE policy.

Minimal repair: after strict control shape/type validation, inspect both native luminance arrays for ±Infinity, identify j/role/side/station and bound original answer identity, and throw/report a bounded integrity-HOLD cause while the exact original bytes/value/status remain retained or referenced. No writer or partial READY plan is required or authorized. A generic unlocated failure that loses the original binding is insufficient to claim the protocol's retained-HOLD contract. Authored fabricated tests must cover +Infinity and -Infinity on both sides, including a slot whose fit would otherwise skip; control HOLD must not be hidden by fit eligibility.

### A3 — validate actual snapshot/post-integrity records, not only resolvedIdentity

Core `witness()`/`bindPlan()` never selects `.inputIntegrity`. `resolvedIdentity()` checks the declared snapshot/frame/hash/Part keys but does not check the recorded private post-query hashes or post-run verification. V2 `bindingAuthority.originalRecordJoins.snapshotChecks` explicitly requires those joins. An otherwise valid fabricated fixture can omit all inputIntegrity or set a selected check `verified:false` while this code still returns READY. This is a concrete binding-capability gap, not a future producer feature.

Derive exact predicates only from the pinned original recipe (`4c32c70e…`):

- `inputIntegrity.snapshots` has16 records indexed by comparison c. Record fields are exactly `comparisonId,snapshotId,pre,checks,post,verified,partKeys,error` (recipe `integrityFor`, around314). Bind the expected comparison/snapshot, `verified:true`, own `error:null`, and Part keys equal to the naturally materialized resolved identities.
- `pre` and `post` each have exactly `rgbaSha256,maskSha256`; expect RGBA `4379abb30a5b0907aa0e1435b13e19eafe8fdd31ac57c9b8bdff4495a14fdc2a`; private mask is literal null for c<12, exact `305285b7e2bc9d44dfd572caa8d39030ed1b0c2254c15967fbb9b7bff7fae609` for c>=12. Require pre/post equality to those expected identities, not arbitrary internally consistent replacement hashes.
- `.checks` has10 entries in the completed original scope. Each is exactly `{planIndex,post,verified}` (recipe405), **no error field**. For selected fit/control index i, select local check `i-10*c`, require exact i, verified true and expected post hashes. A bounded whole10-check validation is also within this fixed source contract; choose/freeze one strategy, no whole aggregate native decode.
- Bind outer snapshot post/verified/partKeys/error (recipe417ff). At global bounded metadata paths require `inputIntegrity.postErrors` empty; `suppliedPlanes` has `{pre,post,verified}` with verified true and canonical RGBA+mask hashes (canonical mask always the exact strip body, even for null-mask private comparisons); `inputIntegrity.request` has exactly `{verified,error}` on successful original source, true/null. No invented per-check error:null. Preserve separately reported source/post errors; never normalize absent fields to null.

Add a bounded integrity witness to the detached plan so the acceptance basis remains inspectable. Keep selected decode32768 B/8192 encoded nodes/depth32 and existing aggregate counters; the source's10 checks are small metadata, not raster data. If adding any new input files/passes, charge them prospectively; this metadata already lives in the bound trace, so no original file reread or pixel access is needed.

Tests first: add literal source-shaped integrity metadata to the fabricated fixture, then cases for missing inputIntegrity/snapshot/check, wrong c/snapshotId/i, wrong RGBA/mask/null policy, `verified:false`, outer snapshot error, mismatched Part keys, nonempty global postErrors, bad suppliedPlanes/request, and illegal per-check error field. Fail without false READY or normalization. The current fixture omits inputIntegrity entirely, so a correct required witness should expose that deficiency.

## Confirmed implementation properties

- Closed default-OFF `buildOriginalEvidencePlan` checks own enabled descriptor before evidence/source I/O; malformed enabled getters are refused without invocation. No caller geometry/root/evidence/codec/cap/output injection in that operation. Exported descriptor utility is an explicit test seam, not an enabled public-plan injection route.
- Only Node builtins/new pure core are statically imported. All original authorities/source22/aggregates96answers176callbacks are prehashed before dynamic import of pure codec **from the retained verified codec bytes**. No product recipe/store/PATH/image import or call exists. Source22 bodies are data for hashes, not code execution. Token is admission identity only; helper writes no files, reserves no output and enforces no durable spent token.
- Ancestor/leaf `lstat` walk plus O_RDONLY|O_NONBLOCK|O_NOFOLLOW, descriptor dev/ino/size checks, exact bounded read/EOF/mtime/hash and finally-close are implemented. This addresses the earlier missing ancestor guard in direction. Host concurrent replacement is explicitly not defeated; no race-proof or portable-root claim. Actual on-disk mode is not compared to100644: source22 validates the admission's declared mode and body hashes only. Do not claim fresh mode preservation unless a separately required mode check is added.
- Real SmallDecode byte cap exists before lowercase decodeValue; encoded scalar/array node8192 counter and typed-tag refusal are separate from semantic codec depth32. Canonical aggregate/fragment JSON+LF checks and exact tagged subtree joins exist, no decode/reencode normalization or dynamic callback args claim.
- Planned rawArgs, separate queryTrace state/error/nativeAnswer, source witnesses, global11*c callback context and seq1-before0 constant/profile relation are source-consistent. Query callbacks check computed emits independently from cached:false/key:null. Constant emits are separately null, not fabricated computed. Original fit/control snapshot identities must match.
- All48 controls are retained, exact no-pair/numeric-unusable skips distinguish fatal malformed shape; translation/raw refined w are unrounded, no score/nominal±2/refined-center12 postfilter. No new CV/private math/width search/query/producer/render introduced.

## Cap guards versus unobserved sufficiency

The single-pass precharge8MiB load guard, fragment8192/2048 caps, explicit selected32768 B/8192-node guard, aggregate500000 JSON-node/depth40 iteration and codec2MiB output guard are actual code. Source22/opaque body hashes are ordered before any selected native decode. Hash-bound JSON.parse/JSON.stringify allocate before aggregate counters; input byte bounds limit parser input, but this is not a proved JS peak-memory or preparse depth bound. SmallDecode serializes before its iterative node count; a serialization error stops, not a guarantee of preallocation refusal.

Manifest metadata supports selected fragment maxima6218/705. It does not prove whole aggregate encoded-node/depth or repaired plan output sufficiency. Source/result docs correctly keep those unproved. Enforce guards and retain first failure; no raised caps/pruned output/retry after failure. Adding bounded integrity witness changes output/node budget prospectively, so include it in the reviewed fixture envelope before first admitted execution. No future16MiB producer/writer/token/output implementation is required in this helper review.

## Tests and nonblocking precision

All153 lines were read. Tests import only Node, helper/core and pinned pure codec; their valid binding cases are fabricated core bundles. Public calls are disabled/malformed only; there is **no valid enabled real-root public call**. This is the safe proposed NONCV boundary. The core assumes already-bound bundles; public entry—not core fixture tests—provides actual byte hashes/size/root authority. Do not call a fabricated core test proof that the real fixed-root prehash pipeline passed.

Current16 authored tests have no observed RED/GREEN. Descriptor test covers leaf symlink, size/hash refusal but not ancestor symlink or explicit exactBytes>maxBytes boundary. Small/aggregate/output cap-boundary tests are sparse. Add focused fabricated tests for required amendments and ancestor symlink; broaden cap-negative cases before claiming those paths verified. Do not require original evidence read or CV to test them.

`queryTrace` compares rowKeys in insertion order, while native grammar is key-set matching and only rawArgs has an explicit insertion-order contract. Whole planned/declaration equality is also order-sensitive through `same`. Since exact original hashes/source construction already pin ordering, this is not evidence of a real original failure. Repair or explicitly separate exact source-layout assertions from native record grammar; add reordered-native-key acceptance versus rawArgs-order-refusal tests if claiming v2 grammar compliance. Do not alter rawArgs order requirements.

## Review boundary and incident qualification

Current R2006 actions: explicit named code/test/protocol/recipe/codec source reads, source/metadata hashes and scratch review writes only. Tests, syntax checks, imports, codec/helper execution, original native-body/fragment reads, native decode, stores/PATH/CV/image/pixels/render/native/Git/repository writes all0. No incidental report was reread in R2006.

Prior E2007 incidental TAGGED-REPORT TEXT EXPOSURE remains recorded: an overbroad locator rg emitted part of a tagged comparison report. No blind-review claim; prior text is excluded from accepted evidence, predicates, eligibility and cap tuning. Existing conversation TOOLTESTIMONY remains the only record; no separate capture is invented. This qualification is preserved, not reset by the new review.

This AMEND permits neither repairs nor tests by itself. Root may separately assign tests-first versioned source-only repair, review exact added tests, then separately admit a bounded fabricated tests-only packet expected to expose RED. No real-root enabled request, original evidence decode or CV follows from that plan. After repair, independently review exact new hashes and actual flow again.
