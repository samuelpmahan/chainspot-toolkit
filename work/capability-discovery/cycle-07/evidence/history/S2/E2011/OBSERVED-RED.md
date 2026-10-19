# E2011 — one actual fabricated RED, then STOP

The single admitted command ran once from `/workspace/scratch/8528bb251845`:

```sh
node --test --test-concurrency=1 discovery-cycle07/S2/E2010/plan.test.mjs
```

Actual shell exit **1**. UTC start `2026-10-18T23:43:00.571995676Z`, end `2026-10-18T23:43:03.156380367Z`. Node reported duration2510.986993ms. Original stdout58802B and stderr0B remain separate exact files, including the empty stderr. The prospective command/pins/absolute raw capture paths were saved before launch. No source edits, second command, filtered rerun, syntax precheck or repair followed.

## Actual result, not prediction

All73 individually registered tests reached: **22 passed,51 failed,0 cancelled/skipped/todo**. The first16 existing tests all passed. This matches the predicted category counts, but the raw result is the authority.

| Actual failure group | Count | Observed failure / interpretation |
|---|---:|---|
| Original contrast ±Infinity HOLD |12|`AssertionError: Missing expected exception`; the fabricated core returned without the required HOLD for each sign/side and eligible/no-pair/numeric-unusable fit context. |
| Invalid input-integrity witness |36|`AssertionError: Missing expected exception`; each missing/invalid snapshot/check/global metadata case failed to stop binding. |
| Inspectable success witness |1|`AssertionError: new bounded witness is inspectable`; `inputIntegrityWitness` was absent. |
| Native record key-set semantics |2|Unexpected `INTEGRITY_STOP: queryTrace shape` and `INTEGRITY_STOP: planned query/raw args`; native record reordering was rejected. |

There were **no observed syntax/import/fixture/harness failures**. The two unexpected INTEGRITY_STOP errors are the intended native-record-order regression tests, not harness faults. Passed distinctions include preserved NaN/-0, nonfinite-fit skip, native answer key reorder, rawArgs-order refusal, ancestor-link refusal and explicit exactBytes>maxBytes refusal. Passing fabricated core cases do not prove fixed-real-root prehash behavior or original/producer cap sufficiency.

Every actual failure name and disposition, plus every pass name/duration, is in `failure-inventory.json`; every detailed stack/error remains in `stdout.raw`.

## Reachability precision

All73 top-level test bodies reached; none was cancelled/skipped/unregistered. Separate generated tests mean one failed case did not suppress later cases. Within the12 Infinity failures, the error-payload validator was **not invoked** because bindPlan did not throw; location/raw-value/status retention assertions therefore remain unreached/unproved. In the success-witness test, deep equality checks after the first missing-witness assertion were not reached. Invalid-witness test validators also were not invoked because no exception occurred. Native-record reorder equality assertions were interrupted by the old core's thrown integrity errors. No claim of complete inner-assertion coverage or successful future repair follows.

## Scope preserved

This command imported the reviewed test/helper/core/pure codec definitions and executed fabricated in-memory values plus admitted temporary text/symlink fixtures. Public helper calls were disabled/malformed only (four call sites in tests), with no valid fixed-real-root enabled call. No original native answer/aggregate/image/pixel/mask body was read, no store/PATH/CV/render operation ran. Source hashes after the run still match the admitted entry/core/tests/codec pins. No repository/native/Git/HH/PageRouter writes. Temporary test fixtures were created under the system temp directory by the admitted tests and were not removed or rewritten here.

Status: **actual intended RED observed, STOP**. Root must read these results before any separately assigned minimal repair. No semantic fix/test change/cap raise/rerun is authorized or performed by this report.
