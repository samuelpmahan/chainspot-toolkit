# R1111 — independent frozen implementation review

Decision: **accepted** for exact E1111 seven-file synthetic8 engineering implementation. No blocking defect found in the reviewed bounded scope. F4 is independent of F6's core implementation and F5's CLI authorship; neither author is accepting their own code through this review. A separate root producer packet is still required for the first actual 32 PATH + 8 constant execution.

## Exact binding

Source freeze SHA256: `0a2351f595fd72d55af79fccb4532deb1b58125a2c440e37d6276fba5d21da4b`.

E1111 result SHA256: `8312ba5eea6d7ac0269f2b0866f760d5d4085af5836d9236194ed109e71762ab`.

All seven files rehash to the freeze, including CLI `4ca8c6065698f49bf6d13766764e298f0edcfde55e720a830e1e3b78223ec04c`. All 2,062 prior inventoried files independently retain their byte lengths and SHA256; the new subtree contains exactly the seven frozen files. All six bound-evidence files rehash. Contract/addendum/R1110 clarification and actual source/README/checkpoint were read. No source or Git write occurred.

## Critical code seams

1. **Strict preflight and opt-in.** `recipe.mjs` statically imports only Node fs/crypto/performance and the pure codec. The own enabled descriptor is checked before unrelated input/source inspection; missing/false returns disabled. Accessors/nonboolean enabled reject without executing the getter. Enabled requests require the exact preset schema, dense eight cases, ordinary own enumerable data fields, fixed order/frame/geometry/settings, exact Uint8Array planes/binary masks and actual byte hashes. Metadata is copied into private fixed declarations, with no caller-controlled query surface. The synthetic-only scope correctly refuses Lenard/null-mask extensions instead of silently broadening the contract.
2. **Source guard and import order.** Actual enabled flow makes/hashes the first private snapshot, verifies the nine pinned module files, dynamically imports gateway/PATH table, then rehashes source before store creation. This implements R1110's causal clarification. Source and supplied original bytes are rechecked after the attempted run. Native host module-cache behavior remains qualified, not portrayed as source-byte execution attestation.
3. **Private store/Part lifecycle.** Each sequential case owns fresh copied RGBA/mask planes, frozen wrappers, fresh base:null store/default cache and fresh query registration. One combined constant declares raster then mask; there is no eager get/has/keyOf. Query order is profile, edgePair, stationContrast, loss at literal width30. No direct low-level CV call, width search, cached repeat, malformed-query control or instrumentation query is added. Only private resolved bytes reach the gateway. Returned native answers and callback entries are codec-detached before escape; input buffers/store/Part values/cached answers are not returned.
4. **Trace truthfulness.** Actual attempted/completed/failed counters are separate from callback counts and source predictions. onCall is immediately encoded/detached in native completion order; source predicts nested constant seq1 before profile seq0, but runtime results are not prefilled from that expectation. Query entry key/cached and registry emits remain distinct. Part keys come from materialized provenance without triggering a producer; missing values remain null. Raw ordered args, per-row state and exact resolved snapshot identities are retained.
5. **Failure/integrity boundaries.** First throw/encoding/integrity failure stops later rows/cases; future rows stay NOT_ATTEMPTED and earlier answer/log fragments remain. A returned answer whose encoding fails remains a completed invocation in counts. Each attempted call's finally block hashes private snapshots and reads provenance; supplied originals and source closure are postchecked. Native conditions are completed calls, not errors or invented zero measurements. Input/private bytes are never serialized as giant RGBA outputs.
6. **Codec.** The implementation matches the all-tagged value-tree grammar: exact finite/-0/NaN/infinity/null distinctions, collision-safe native containers, ordinary/null prototypes, own-property ordering, safe __proto__ definition and exact Uint8Array constructor/length/bytes. It rejects unsupported types/prototypes/accessors/sparse shapes/cycles/malformed nodes rather than generic JSON normalization. Hard depth/node/typed/file caps may only be lowered. Native profile null and contrast NaN remain different; selected native typed corridor arrays are supported. Native Error objects are not promised as raw codec inputs.
7. **CLI and actual file stages.** The loader requires an explicit enabled synthetic8 disk manifest, hash-verifies protocol/inventory, reads exactly five `.rgba` and three `.mask.u8` planes as non-Buffer Uint8Array, and resolves paths relative to that manifest. It does not decode PNG or regenerate pixels. CLI reserves an exclusive NEW destination before invoking the recipe. The one-shot writer uses exclusive file creation, writes already-encoded fragments first, then tagged value trace and sidecar, then an external hash manifest without a self-hash cycle. Partial artifacts/failure status survive output errors; it never retries producer execution. The CLI attaches only file identities actually read.

## What independently ran

### Existing non-CV tests

Command (repository root):

```sh
node --test --test-reporter=tap experiments/capability-discovery/station-evidence/codec.test.mjs experiments/capability-discovery/station-evidence/recipe.test.mjs experiments/capability-discovery/station-evidence/cli.test.mjs
```

Exit0; **42 tests,42 pass,0 fail,0 cancelled,0 skipped**. This comprises the existing40 core tests plus2 CLI tests. CLI syntax `node --check experiments/capability-discovery/station-evidence/cli.mjs` also exited0. These tests cover codec/rejection/caps, disabled and malformed request boundaries, source hashing, fixed plan, disabled exclusive writer and missing disk manifest. They execute no valid enabled measurement. F5's separately bound validation receipt still truthfully records its original2/2 and syntax0; it was not rewritten into this independent run.

### Loader-only actual fixed raw stage

Created scratch `loader-only-manifest.json` (SHA256 `5ce9c5e63eb15eef85684cf18e5c0821297d2d52e24f6c4d867e9835944f9679`) referencing the existing frozen F4 protocol/inventory/fixtures. A Node module-mode command imported only CLI/recipe/codec boundary modules, called `readSyntheticManifest`, then **inspectStationRequest only**. Actual result:

- READY, error null; exact8 case order and32 planned query rows.
-11 bound supplied files: manifest, protocol, inventory,5 rawRGBA and3 masks.
- Every loaded raster/mask has exact Uint8Array prototype.
- Request byte-excluding manifest SHA256 `4fe60de2dc55256f58d1f515d2ec3df3971a362d2116768455d78054ec5423d0`; declared per-case input-byte sum4,915,200.
- Positive runStationEvidence calls0; vendor imports0; PartStore creations0; PATH/CV/producer calls0.

An incidental reviewer read command initially addressed scratch receipts relative to the repository and exited2. Its exact failing diagnostic/command is separately preserved in `read-harness-failure.txt`; subsequent correct-root reads succeeded. It is not normalized into an implementation or test failure, and no source repair was made.

## Limits and next gate

This is an engineering source review plus permitted non-CV verification, not an observed positive gateway run. Actual32 queries,40 Calculation entries, native values and success/failure of full enabled execution remain unverified until a separately admitted producer. Failure branches that require vendor execution/source mutation were read, not triggered. No broad repository suite or old producer was run; no full-repository-green claim. F3/E1114 independent prefrozen-vector work is separately owned and is not assumed or self-certified here.

There is no renderer/Lenard extension, production/default-ON wiring, new CV/math/detector or scientific promotion. Unknown path/physical-edge/calibrated-width/scientific/human claims remain explicit. Root may reconcile independent engineering reviews and separately admit the exact fixed synthetic producer; acceptance here does not itself execute or admit it.
