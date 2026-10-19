# R2014 / S4 — full E2014 source-only review

Decision: **AMEND**. Independently read all four complete source/test files, FLOW and realresult against R2009 A1–A5. The versioned route addresses most earlier concerns, but review-coverage and artifact-role guards remain wrong. Two further bounded failure-state gaps are visible. These are source-inferred counterexamples, **not executed failures**. E2014 remains untouched/unrun; no original or fabricated execution is authorized by this review.

## Exact reviewed files

| File under discovery-cycle07/S3/E2014 | Bytes | SHA256 |
|---|---:|---|
| capture-original-plan.mjs |10088|5ed22adc0d54b0cfad5fd2446c66afac4f3f4d26325babad161f789e5f815b1f|
| run-original-plan.mjs |2177|3c58c5fd53ea170d28e82480642f09433be064fa3bbeeefe00a9d3e7c6275160|
| capture-core.mjs |11362|6d16296bb01932f66297fa1ea24ad47ef12e35e51f6d7da8d6033e32600ace13|
| fabricated.test.mjs |9279|983f003cc3baf4c97b4e74ef6cc6ee6073c0b0add96ac9cfa0e0cfe68257371d|

FLOW SHA256 `7c8476b660cdad045ba22ffd0e7b3d88da8cd5a2e777279727df2653a768bc46`; realresult `76ef3223ae6ad16d4afddb0e884187c5ca8f28db3ed7727c58da7f1c2f907239`. All153 physical code/test lines were read in full (many contain multiple statements). FULL.diff was not needed/read; acceptance is based on complete final sources, not a claimed diff review.

## Required bounded amendments

### M1 — do not widen the accepted helper review's scope

`loadAdmission()` and FLOW require helper review targets `[helper,core,tests,codec,protocol]`. Actual R2013 acceptance targets are **only** the three E2012 helper/core/tests source files. I re-read that exact `targets` array in `S4/R2013/realresult.json`; a codec entry in supportingSourceHashes is not fresh independent codec acceptance, nor is the helper's reuse of an already accepted protocol new protocol review coverage.

Minimal versioned change: require the three actual helper-review targets. Keep codec/protocol pins and prior authorities separately labeled as reuse (existing fixed codec/protocol/protocolReview pins and root's explicit authority declaration can support that; no new review prose mining or security framework is needed). Do not rewrite R2013 or inflate its capsule to five fresh targets. Role-specific self-review exclusion itself is now correct: S2 cannot approve its own helper, S3 cannot approve its own runner, and S3 may independently review a different author's helper.

### M2 — artifact bindings are mandatory and role-specific

`checkArtifacts()` looks up `FILE_CAPS[b.path]` for either role and skips `if(!b)continue`. It therefore accepts a matching **known but wrong** filename and can apply another role's larger cap. It also ignores null READY-plan or complete-HOLD artifact bindings. `validateReceipt()` does not close those null-binding gaps.

Unexecuted minimal counterexamples:

- Otherwise valid READY receipt has plan `{path:'stdout.raw',bytes:2,sha256:H}` and inventory has that matching stdout record; no plan.wire.json is present. Current generic check returns true.
- Complete HOLD artifact uses `path:'plan.wire.json'`, bytes65537 and matching opaque inventory; it can pass the2MiB plan cap instead of the64KiB HOLD cap.
- READY `plan:null`, or requested/complete HOLD with `artifact:null`, is skipped rather than refused.

Require literal `plan.wire.json` for a READY plan, literal `integrity-hold.wire.json` for complete HOLD, non-null exact binding records when required, safe integer bytes>=1 and the **role's** cap (2097152 /65536), and matching independently observed inventory size/hash. Existing non-null code already checks safe-integer bytes: preserve that guard; the defect is not a total absence of integer validation. Align receipt state checks with those mandatory artifacts and incomplete-retention semantics. Keep known-file inventory checking separate from role checking—being an allowed output filename does not establish its role.

Root reports S2 E2016 is constructing original-incapable filename tests only. That is coordination testimony, not a file/test review or a passing result here. Tests should expose the wrong aliases, null mandatory bindings, per-role cap crossing and legitimate boundary cases without original imports/packets. No real-data or runner execution is needed to demonstrate these pure-validator conditions under a later explicit admission.

### M3 — register BOTH pipe-error handlers before fallible data setup

The new capture primitive fixes ordinary async pipe handling and waits actual close after setup errors. However, one loop installs stdout error **then stdout data**, and only later stderr error. The authored `afterSpawn` fixture throws during stdout data registration; after that SETUP stop, no stderr error listener was installed. A subsequent fabricated stderr error would throw as an unhandled EventEmitter error instead of becoming a bounded later cause while awaiting close.

Minimal change: establish both stream error handlers before the fallible data-listener phase, preserving first SETUP cause and recording any later pipe error without losing TERM/KILL/actual-close settlement. Extend the existing original-incapable afterSpawn fixture to emit the other pipe's error before close. This is a missing exceptional path in the promised A4 semantics, not a request for process-tree management or a new security subsystem. No actual OS/fixture event was emitted in this packet.

### M4 — complete HOLD retention only after its hash binding exists

In `invokeOnce`, after writing the HOLD bytes the code sets `holdRetention.complete=true` **before** constructing `artifact.sha256=io.hash(b)`. If that hash operation throws, catch records a retention error but leaves `complete:true,artifact:null`. This contradicts complete retained/bound evidence and currently combines with M2's null skip.

Compute/validate the opaque artifact binding and assign it before marking complete. A write/hash failure must leave complete false (physical partial/full bytes may still exist), preserve the original INTEGRITY_HOLD as first error, and append bounded retention failure. Add one safe hash-failure capability case; no helper repeat or artifact rewrite is allowed. Existing write/codec/encoder/receipt-failure tests do not cover this ordering point.

## R2009 repairs confirmed in source, with limits

- **A1:** all production helper/core/tests paths now name NEW E2012, own runner/shared/tests name NEW E2014. Old E2006/E2009 are not overwritten. Fixed roots and no packet-selectable helper injection remain. Final accepted pins/admission are still absent, not invented.
- **A2:** spawn has no env option and forwards current execArgv. Before token, named ambient set/unset/value states, runtime identity and streamed executable size/hash are checked against future root expectations; no current environment probe/sanitizer/TZ force occurs. Hashes identify a file at check-time, not the already running interpreter or host.13 named variables are checked, not a full-environment equivalence claim.
- **A3:** role-specific author exclusion is present; M1 corrects coverage, not authorship logic. Trusted root packet digest/coverage declaration remains external authority, not arbitrary review-prose interpretation or cryptographic human identification.
- **A4:** stream opens moved inside cleanup scope; second-open failure closes first/no spawn. Normal stdout/stderr errors trigger stop, created child gets close listener before setup, catch awaits wait, timers remain until close, successful partial write counts and first/later cleanup errors are separate. M3 closes one cross-stream setup gap. Actual close is never manufactured from kill request/helper result. Real OS pipe/signal/fsync behavior remains untested.
- **A5:** source-defined HOLD projection matches E2012's actual fields including originalCallbackStatus; pure codec is loaded only after admission/token/marker and helper HOLD. Raw Infinity/NaN/-0 are kept out of ordinary receipt JSON and preserved in a bounded opaque artifact; parent hashes without native decode. Projection still relies on the admitted helper for full original comparison/path/window provenance; it is not a new independent scientific validator. M2/M4 repair complete-artifact semantics.

The import-free capture-core plus Node test/assert/events and pure codec tests form a genuinely original-incapable test seam: no fs/child_process/original adapter/helper import or dynamic discovery exists in the test file. Capability fixtures are in-memory. That property is source-inspected, not a runtime tripwire pass. The original route is still fixed and cannot be invoked by an arbitrary test helper/root in a packet. Never mint a mock ROOT_FINAL_GO original packet to test these primitives.

## Fixture coverage and unchanged authority

The11 authored tests cover useful ordinary/exceptional seams, but do not prove either original-run compatibility or all branch guards. They exercise only stdout error (not the cross-stream setup sequence), existing wrong-hash/unknown-name refusal (not wrong-known-role alias/null bindings), and codec/write/receipt failures (not HOLD postwrite hash failure). Add the bounded falsifiers above in a new version, leaving E2014 evidence untouched. Test calls to hash returning `fixturehash` are explicit capability stubs, not actual production SHA verification evidence.

No requirement for proved RSS, whole metadata-cap success, OS kill latency or future producer G1–G6 completion is added. Existing limits may legitimately stop a later admitted one-shot run; no cap raising/pruning/retry follows. A later test-only RED/repair/GREEN process requires independent exact-source review and explicit bounded admission, separate from ORIGINAL_PLAN authority.

## Actual actions and exposure qualification

Source/docs/hash inspection and own S4/R2014 review writes only. No syntax/import/test/codec/process/helper/native-value/evidence/packet/token/runtime-binary/environment/Git/repository operation. Prior R2013 result was read only to verify its exact accepted target list, not rerun or broaden it. E2016/new repair files were not opened. Prior E2007 incidental tagged-report text exposure remains disclosed/excluded; no report reread, blind-review claim, invented/backdated raw capture. `materialize` preserves this distinction between source findings and nonexistent runtime counterexamples.
