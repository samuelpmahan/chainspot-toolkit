# E2032 — minimal versioned M2 repair checkpoint, UNEXECUTED

Written only in NEW E2032. E2031 actually observed both final COMPLETE-versus-REFUSED ordering assertions after baseline/count controls passed; result67173be3f5a9b7865460cdb7b145431f35b484f99a630ed96d8496003de43d6c. Root fully read that actual RED and separately assigned this source repair. No test/syntax/import/function invocation occurs here. No old E2028/E2030/E2031 file, producer/source/schema/cap/default/threshold/API or published382 content changed.

## Exact written change

Copy old21076B core bd80084cccf71272c6bbc60cf330a150df1d90bd64c66efb5f3153ba2270e0ec into budget-contract.v2.mjs, then add only two guards:

1. In NATIVE_EXIT, after existing identity/order checks, accepting query native exit now refuses when constant native exit was observed but its hook terminal is still NOT_OBSERVED. This is conditional: absent constant observation does not require a fictional constant; a returned OR threw constant hook satisfies the terminal dependency. No new blanket status/propagation schema is introduced. Existing public-success rules still require both successful roles/hook returns. Native/capture fields are not replaced or fabricated.
2. In POSTCHECK events, require publicCall RETURNED or THREW before advancing postcheck state. No sealed-not-attempted alternative is added. Existing PUBLIC_ENTER rule already forbids reentry after either terminal, so prior checks cannot certify a later call. There is NO artifact-binding prerequisite: public throw, or public return followed by answer/callback encode/write/hash failure, can still have failure postchecks and retain the original first cause.

All other code is unchanged, including M1, budget arithmetic/UNRESOLVED proofs, error projection, no loader/callback capability, scalar diagnostic/header semantics and the entire CRASH UNKNOWN branch. FULL.diff includes the complete two-guard core diff, both import-only test diffs and optional new control.

## Tests, exact copying and legitimate failure preservation

- Inherited42-test file differs ONLY in import filename `./budget-contract.v1.mjs` -> `./budget-contract.v2.mjs`. No fixture/assertion/comment change.
- Observed-RED two-test driver differs ONLY in import `../E2028/budget-contract.v1.mjs` -> `./budget-contract.v2.mjs`. Original cbbe10e3… driver remains contemporaneous and unchanged. Its comments about E2030/E2028/UNEXECUTED are preserved historical source, qualified here; new rebinding is not a rewrite of that evidence.
- One OPTIONAL separately named preconstant-preservation.test.mjs is included because inherited42 has no preconstant-query-throw case. Tiny10-event fixture records query native-threw seq0/parentnull/depth0/capture0, query hook completion, public throw then postchecks. It requires FAILED, no observed/entered constant, no answer binding and retained first native failure. This models the source-supported prefix without importing a store or invoking a query.

Predicted authored count is **45 tests:42 inherited+2 ordering+1 optional preservation**, not44. No new pass/fail/registration/reachability is observed. Existing42 fixtures retain nested constant-hook-failure/public-throw/postchecks, postreturn encode/hash/write failure, incomplete retention and UNKNOWN paths. All are pure fabricated tests, not full branch coverage or actual producer evidence.

## Prospective ONE command — NOT RUN / NOT ADMITTED

cwd `/workspace/scratch/8528bb251845`:

```sh
node --test --test-concurrency=1 discovery-cycle07-checkpoint-admission/E2032/budget-contract.test.mjs discovery-cycle07-checkpoint-admission/E2032/m2-order-regression.test.mjs discovery-cycle07-checkpoint-admission/E2032/preconstant-preservation.test.mjs
```

Each driver imports only Node test/assert and this import-free core. No old42 test is imported incidentally; the new42 file is explicitly selected above. No new capture/run exists here. Root full code/tests/diff/FLOW/pin read precedes a separately assigned ONE fabricated GREEN attempt with exclusive prospective/raw channels; actual outcome is authoritative, stop on first run without retry/repair/cap change. Author cannot supply independent acceptance.

**HOLD.** This source repair addresses the observed temporal falsifiers only. artifactSchemas/dependencyPathSet/phaseImplementation remain UNRESOLVED, OS/RSS unsupported and no real body/codec/helper/store/PATH/CV/renderer/Git/repository adoption or scientific admission follows. S1 remains sole Lab/Git integrator. Checkpoint pauses before execution.
