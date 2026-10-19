# E2010 / S2 — PHASE1 source checkpoint, HOLD before RED

Written: new copies of `original-evidence-plan.mjs`, `plan-core.mjs`, `plan.test.mjs`; complete source delta in `PHASE1.diff`. E2006 remains exact. Phase1 performs **mechanical authority rebinding and tests-first regression authoring only**. Syntax/import/tests/codec/helper/native-body reads/CV/render execution all0. No actual RED, passing suite, fix or cap passage is claimed.

## Scope and review basis

Root admitted this exact Phase1 scope after fully reading R2006. I read the full R2006 review/realresult and accepted v2 eligibility/originalRecordJoins metadata. A1 is a mechanical rebind; A2/A3 are technically supported by source. They remain **unfixed** here so a separately admitted fabricated-only test can first show the intended failures. Checkpoint pauses at the written source, not after an unreviewed execution.

Root-accepted protocol target is `discovery-cycle07/S1/E2005/protocol.v2.json`,83022B, SHA256 `7948df5ee19e10a065f907a7dc0af1b845b5b408f32776b78813ad938bedea6e`, schema `cycle07-joint-fit-station-contrast-protocol@1.1.0`. It replaces the v1 helper input; v1 is not also read. Original v1/E2006 files and accepted v2 protocol are not edited.

## Actual written entry/core flow

1. Disabled own-data request handling remains unchanged: no enabled value or false returns before runtime evidence/source I/O; invalid token/extra fields stop before input reads. Legacy request schema/token spellings stay as API admission identifiers, **not** durable spent tokens or runtime authority.
2. The copied entry pins only accepted v2 path/83022B/hash, and `slotLedger` requires schema1.1.0. Output binding key is now `acceptedProtocolV2`. Core output authority identifies accepted v2/E2002 and explicitly says A2/A3 repair awaits observed fabricated RED.
3. All existing bounded descriptor/hash/predecode/wire/selected-codec/48-slot planning machinery is unchanged. No new external pins or body passes. Updated future one-pass total is3,644,326B/304 descriptor body reads, excluding any future external-runner audit pins. Every actual future `load` remains precharged against unchanged8MiB. Original answer/callback/aggregate/output caps are unchanged and their sufficiency remains unproved.
4. **Intentionally unresolved A2:** `control()` still accepts primitive-number ±Infinity and can allow READY. No integrity-HOLD implementation has been added yet.
5. **Intentionally unresolved A3:** `bindPlan()` still does not inspect `inputIntegrity` or emit `inputIntegrityWitness`. No snapshot/check/global witness guards have been added yet.
6. **Intentionally unresolved native record ordering:** `same()` and queryTrace rowKeys still use object insertion order. Only their future expectations are now tested; explicit rawArgs insertion-order protection remains unchanged.
7. Any valid public enabled call still targets fixed real original evidence. **No such call appears in these tests and none is authorized by this packet.** The future test command below exercises fabricated core bundles, disabled/malformed public requests and temporary descriptor fixtures only.

## Tests-first fixture and expected contract

The original16 test bodies are retained; their common fabricated positive fixture now carries the source-produced integrity structure:16 snapshots×10 checks; each snapshot has `comparisonId,snapshotId,pre,checks,post,verified,partKeys,error`; each check has exactly `planIndex,post,verified`, **no error field**. Private mask is literal null for c<12 and pinned mask hash for c>=12. Canonical suppliedPlanes always uses the pinned mask hash. Global request is `{verified:true,error:null}`, postErrors is empty. Six fabricated postFiles metadata records match source shape but are not promoted into a new required validation surface in this phase.

The added tests freeze these **future semantic contracts**, before their implementation:

| Group | Authored cases | Required future behavior; current expected RED reason |
|---|---:|---|
| Infinity control HOLD |12|±Infinity×left/right×eligible/no-pair/numeric-unusable fit. Throw a located retained HOLD; current core returns READY instead. |
| Input-integrity negative witness |36|Missing/wrong snapshot/check/hash/null-mask/verified/outer error/keys/global planes/request/postErrors and illegal checks[].error. Current core ignores them and returns READY. |
| Inspectable successful witness |1|Successful plan contains bounded `inputIntegrityWitness` with strategy `fixed16x10`, all16 snapshots/10 checks and canonical planes/request/postErrors; currently absent. |
| Native record key SET |2|queryTrace and whole planned-query record key reorder accepted while rawArgs order remains exact; current order-sensitive comparison rejects them. |
| Positive/negative distinctions |6|Literal fixture shape; ordinary NaN/finite-invalid/-0 plus fit-Infinity skip; reordered fit/outer native record; rawArgs reorder refusal; ancestor symlink refusal; explicit exactBytes>maxBytes prepath refusal. These should retain existing behavior, not weaken guards. |

Total authored test declarations after loop expansion: **73**, comprising original16+new57. From source reasoning only: expected51 semantic RED cases and22 retained/added positive-negative checks. These counts are **predictions**, not observed results; syntax, fixture or unrelated runtime errors must be reported distinctly if the later admitted command reveals them. Do not relabel such errors as successful RED.

### Located retained-HOLD interface to review before implementation

The Infinity tests require an Error with `code:'INTEGRITY_HOLD'` and matching message. `error.integrityHold` carries `code:'CONTRAST_INFINITY'`, j/c/b, role `control`, side `leftLum`/`rightLum`, stationIndex, original planIndex, exact rawValue, exact original answerBinding, full small rawAnswer, originalState `COMPLETED` and originalCallbackStatus `ok`. The raw binding references the exact fabricated lossless bytes. No partial READY plan is returned or attached. The tests do not dictate a writer or durable output. No change to numeric-shaped **fit** Infinity/NaN NUMERIC_UNUSABLE policy.

### Successful integrity witness interface to review

`plan.inputIntegrityWitness = {strategy:'fixed16x10',snapshots,suppliedPlanes,request,postErrors}`. Whole10-check metadata validation is the chosen bounded strategy, including unselected profile/loss check metadata but not their native answer values. Exact source shape/key sets and frozen source-pixel hashes apply; absent error must not be normalized to null. Existing32768B/8192selected/depth32 bounds remain controlling; any witness serialization/cap sufficiency still needs review before execution and no postfailure cap raise is allowed.

## Shared machinery and invocation boundary

| Invocation | Inputs | Outputs / side effects |
|---|---|---|
| Future public disabled/malformed | own-data request or malformed token/fields | no original evidence I/O |
| Future fabricated `bindPlan` | fresh in-memory source-shaped tagged fixtures + pinned pure codec | either READY or regression assertion/expected HOLD/STOP; no store/PATH/pixels |
| Future descriptor tests | newly created temp text files, leaf/ancestor symlinks, explicit cap3>2 | generic bounded-read refusal; no original root |
| **Not admitted** public enabled | exact fixed original root and v2 pins | original numeric evidence decode; outside this Phase1 and future fabricated RED scope |

Tests statically import only Node, the copied entry/core and pinned **pure codec definitions**. They do not import recipe/store/PATH. Existing enabled public test calls have wrong token or extra geometry fields and reject before I/O. No cap parameter/root/geometry injection is added to the valid public operation. No private guard seam is newly exposed.

## ONE proposed fabricated-only RED command — NOT RUN

Working directory `/workspace/scratch/8528bb251845`:

```sh
node --test --test-concurrency=1 discovery-cycle07/S2/E2010/plan.test.mjs
```

Expected from source: nonzero exit due to missing retained Infinity-HOLD, missing integrity validation/witness and two native-record ordering regressions, while old behaviors remain. The command must be hash-bound and reviewed by root first, with separate explicit RED GO. No syntax precheck, extra imports, exploratory retry, filtered rerun, real-root valid enabled call, original evidence decode or CV is part of this proposal.

## The pass / HOLD

`PHASE1.diff` proves all copied entry/core differences are mechanical authority changes only. New tests are the sole new semantic expectations. E2006 source hashes still match the reviewed checkpoint. Root reviews exact tests/full diff/this FLOW, then may separately admit **one** fabricated RED command. Only after actual intended RED is retained may a later source packet implement A2/A3/order fixes. No semantic core fix has been made here. **Status: HOLD; awaiting root exact test review and separate RED GO.**
