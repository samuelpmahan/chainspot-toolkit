# R2035 / S4 — independent E2032 review

Decision: **accepted**, limited to the pure finite fabricated contract and the two R2028 M2 ordering repairs. No producer closure, repository adoption, original-data, resource-sufficiency or scientific approval.

## Source findings

Fully read old E2028 core/42 tests/ledger, R2028 review, E2030 focused driver, E2031 actual RED receipt/prospective/six raws, E2032 complete core/three drivers/FULL.diff/FLOW/prospective/result, and E2035 actual GREEN receipt/prospective/six raws. Fresh hashes matched their declared bindings. A builtin byte comparison independently removes exactly the two new guards to recover the entire old core byte-for-byte. Both copied drivers recover their originals by replacing only the import path; no assertion, fixture, cap, threshold, export, M1, budget or UNKNOWN-branch change.

| E2032 target | Bytes | SHA256 |
|---|---:|---|
| budget-contract.v2.mjs |21304|6adc5eea6b2b947e6a6c7282511cad9e07ee3c6d8ca63ef9d51c9e488d635a4f|
| budget-contract.test.mjs |15935|0327343f6fa5a88faffa9e5dbb967fe9b035906b155def5ce0859cb97392c7e4|
| m2-order-regression.test.mjs |2468|de13e4bafd772053a8150c527f38c809670552c822eeb240be5aec6b0eab6933|
| preconstant-preservation.test.mjs |1421|5a66379219ac8f906384925f653d7111547de9cd9cd4b55d9d88ae0a92093e18|

- A1 conditionally refuses query native exit while an observed constant hook is unterminated. RETURNED or THREW constant-hook terminals satisfy this dependency. An absent constant event is not manufactured: query-threw/capture0, completed query hook, public throw and failure postchecks remains FAILED. Complete public success still requires both successful native/hook roles.
- A2 requires public RETURNED or THREW before postchecks. Public reentry remains forbidden, so earlier checks cannot certify a later call. This is not an all-artifacts-bound requirement: ordinary public failure and postreturn encode/write/hash failure can retain postchecks and their original first failure. The inherited nested-hook and query-hook failure tests, answer encoding/hash failures and separate preconstant control exercised relevant paths. Some write-failure fixtures omit a postcheck suffix; preservation of that particular combination is source-derived, not an extra executed case.
- CRASH retains UNKNOWN windows; absent observations are not evidence of no call/write. M1 continues lossless raw primitive retention and separately labels old grammar versus added original-consistency HOLD. Empty paired support remains null/UNKNOWN, and trace header identity does not hash bodies.
- The module is import-free; its three drivers import only Node test/assert and that core. No loader/codec/store/query/producer capability was added. Ordinary bounded literals are the intended input domain, not a hostile-object sandbox.

No additional must-AMEND defect was established in this bounded change. This is not exhaustive event grammar, branch coverage or an implementation of a real producer.

## Actual evidence, separated by run

E2031 result SHA `67173be3f5a9b7865460cdb7b145431f35b484f99a630ed96d8496003de43d6c` and stdout SHA `6194679490edffbcf5b1e143428def521a6970c3c61229ff9e52760e685e0fff` show 2 tests/0 pass/2 fail, exit1, at the two final COMPLETE-versus-REFUSED assertions. The unchanged synchronous driver establishes that each preceding baseline COMPLETE and equal-count assertion was reached and passed. The inherited42 and new preservation1 were not demonstrated RED.

E2035 author result SHA `f9e6f9b99268e4b6830e538a70c089b171198e9d0651ca3981673851488e34d6` and stdout `aa47f03dc8a2be582d0c0b6b5d9b04cf0af43aced82ba0be76b7a80a7cb805ca` show first author45 GREEN, not independent acceptance. Its original worker_id receipt is preserved, not rewritten into a native worker schema or called a rejection.

R2035 independently ran exactly the same cwd/argv once, after source review and saved prospective, with unchanged inherited environment/PATH. All six raw descriptors were opened exclusively before launch; direct child stdout/stderr were not filtered. Actual child close supplied exit0/signalnull, UTC03:05:49.252Z–03:05:49.578Z, 45 tests/45 pass/0 fail/0 skipped, 259.197979ms reported; stderr0B. The whole source runtime was imported only by this admitted test command; no preliminary import/syntax checks. All four source pre/post pins and runtime SHA `bc17c508ffeed0ec622934f9b7fa72f8e78da65350e63c3eceb56fa688aa5e12` remained identical. No retry, repair, assertion/cap change or harness failure. Details and all raw hashes are in execution.json/result.json.

## Remaining holds

Actual candidate artifactSchemas/dependencyPathSet/phaseImplementation remain UNRESOLVED. Test FABRICATED_ASSUMPTION is not real authority; producerAdmitted remains false. Candidate aggregate arithmetic, native/encoded counters, grouped paths and serialization placeholders are not proven schemas, actual pass counts, peak RSS, wall/stream enforcement, durable atomic output, host/race safety or original-input sufficiency. Decline to judge a nonexistent real producer, OS/RSS sufficiency, physical quality, causal center/width effects or science.

No original plan/body/report/pixel read/decode, codec, helper/store/PATH/query/CV/renderer/producer, Git/native/repository/source mutation or subagent action. Only own R2035 review/capture artifacts were written; published382 and historical source were untouched. Historical E2007 incidental tagged-report text exposure remains disclosed as prior TOOLTESTIMONY, excluded from this decision; no reread or blind-review claim. Materialize kept actual RED, author GREEN, independent GREEN and unclosed claims separate. **HOLD; no further execution or adoption authorized.**
