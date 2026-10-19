# R2028 / S4 — independent E2028 source-only review

Decision: **AMEND**, limited to two missing M2 partial-order guards and independently authored source regressions. No test, import, syntax check, codec, original body, query, store, helper, producer, renderer or Git operation was run. The counterexamples below are source-derived predictions, not observed RED or runtime failures. Preserve the five E2028 files and original42 tests unchanged. No producer/science/cap-sufficiency or source-adoption permission follows.

## Exact complete targets read

All targets are under `discovery-cycle07-checkpoint-admission/E2028/`.

| File | Bytes | SHA256 |
|---|---:|---|
| budget-contract.v1.mjs |21076|bd80084cccf71272c6bbc60cf330a150df1d90bd64c66efb5f3153ba2270e0ec|
| budget-contract.test.mjs |15935|2a0b6407873d98f080ff451abc89db49d324775fe4084a026d2f5ff2217f4651|
| budget.v1.json |7112|2287562437f1a0897c03663f710e3219a14fc43267d55cdf2303faddb6b0ea8c|
| FLOW.md |12976|498cf6aaafd9390222dbd2b09a6bfd9dcff388d344e5cdca024543750bbf3f8b|
| result.json |8559|0dd3902e4af5d80b0196f1a65780cb63501f0226f70c5d00b821cf0057468390|

Compared the fully read fixed independent E2029 constraints11876B SHA `1696dcd29c6574c0355061db5d1dd1b0bca8f703785e47ed93954c2b8d6e3205`, falsifiers10956B SHA `04b4972822547c00da19b56b084550a870820ba4d40ade6255969da00cdb2915`, result7612B SHA `880568acb8a805896243b4694d651d8a056330c9eaa3c751a0e0125c1a51f56e`. E2029 states it read zero E2028 files before fixing constraints; I treat that as declared independence, not an executable process attestation. Also fully read R2025 review12390B SHA `9d7638ee8e3efdca552b09896fc2038105556f8dec905a92398f4ba6fecceffb` and result13150B SHA `ee36d0cea685c8187a2417ab28b135f4cc95ac0b52e17102f0f86b07374bdaf9`.

Supporting primary source `probes/root-inventory/source/fg/store.mjs`370–450 was read as text only: synchronous exit sets native status and then calls `shared.onCall?.(entry)` before returning/unwinding to the outer call. Hash binding is the pinned `122d624e0311e18f596db37bf292d9c31f47a364e75c8808ca6788c3449a3074`. This supplies the conditional constant-hook dependency; no real store was imported or invoked.

## Required smallest amendment: M2 temporal validation

`eventFacts` validates each role's local state and native seq/capture order, but leaves two cross-phase dependencies unchecked. FLOW9 claims impossible ordering refuses, and COMPLETE currently turns those missing checks into a false complete simulated history.

### A1 — observed constant hook must terminate before outer query exit

Module154–158 checks public ENTERED, one native exit per role, seq/parent/depth and next captureIndex, and rejects constant-native-after-query-native. It does **not** check the observed constant hook's terminal state before accepting query NATIVE_EXIT. Module160–166 then accepts the constant hook whenever its native exit exists and the public call is still ENTERED.

Unexecuted smallest falsifier using the authored tiny fixture vocabulary:

```text
INTENT; PUBLIC_ENTER;
NATIVE_EXIT(constant,ok,seq1,parent0,depth1,capture0);
NATIVE_EXIT(query,ok,seq0,parentnull,depth0,capture1);
all four constant hook events; all four query hook events;
PUBLIC_RETURN; answer validation+encoding; all three write/hash bindings;
POSTCHECK_START; POSTCHECK_OK; NORMAL.
```

This differs from the authored success fixture only by moving the constant hook block after query native exit. Every current local predicate remains satisfied, no first failure is recorded, and the final COMPLETE predicate is true. **Predicted current result: COMPLETE. Required result: REFUSED as impossible ordering.** Nothing was executed.

Minimal repair: when a constant native exit has been observed, require its hook entry/terminal dependency before accepting the outer query native exit; do not merely check constant-versus-query native order. Preserve actual raw metadata instead of manufacturing the missing hook facts or replacing the observed status. A constant-hook throw must remain distinct from an ordinary returned hook and any observed outer consequence must be source-consistent.

Do **not** impose a blanket “constant callback always required before any query throw.” A legitimate preconstant query-throw prefix may exist when the source throws before lazy constant resolution; support it only under the appropriate source contract, with actual next capture index and no invented constant event. COMPLETE still requires the two successful native/hook observations. CRASH prefixes retain UNKNOWN rather than completing missing dependency facts.

### A2 — postchecks cannot precede and certify a later public call

Module187 advances the postcheck state without checking public-call phase. Module153 permits PUBLIC_ENTER after those checks, and module200 accepts earlier postchecks=='OK' as part of COMPLETE.

Unexecuted smallest falsifier: take the authored success event list and move its final POSTCHECK_START/POSTCHECK_OK pair to immediately after INTENT, before PUBLIC_ENTER. Leave every other event and field unchanged. **Predicted current result: COMPLETE. Required result: REFUSED**, because those are precall checks, not postconditions on the later operation. Source walkthrough only; no constructed events were passed to the module.

Minimal repair: a postcheck phase must not certify work that starts later. Require the modeled public operation to be terminal before its postchecks, or explicitly seal a terminal not-attempted phase so no subsequent PUBLIC_ENTER can occur. An in-progress ENTERED call cannot already be postchecked.

Preserve valid failure cleanup: PUBLIC_THROW followed by postchecks must stay representable as FAILED, including a bounded later postcheck failure with the original first failure unchanged. PUBLIC_RETURN followed by answer encode/write/hash failure and then postchecks also remains valid. **Do not require successful answer/callback artifact binding before failure postchecks**; incomplete retention is precisely why the failure facts exist. No broader phase/schema/producer implementation is requested by these two guards.

## Test reachability and next source packet

The authored count42 is consistent by source enumeration:12 budget/reserve,11 M1,15 M2,2 pairing,2 identity. It is not observed registration, reachability or success. The query-hook failure fixture correctly removes the query-hook RETURN/public RETURN suffix before inserting THROW. Existing tests cover nested constant hook encode failure, outer native throw/public throw, postreturn answer failure, callback/answer write/hash failure, first-cause retention, crash gaps, wrong capture index, and explicit false public success.

Neither required temporal counterexample appears in the existing42 fixtures: all ordinary `returned()` helpers serialize the constant hook before query exit, and all successful postcheck pairs remain after public return. A future42-test GREEN would therefore not falsify these gaps. Some callbacks test several assertions/variants; any earlier assertion failure suppresses its suffix. Do not describe them as full branch coverage or manufacture an observed RED now.

Smallest next work: independently author **two focused source regression cases first** against unchanged E2028, expected REFUSED for A1/A2. Root must read their actual source before any distinct ONE focused fabricated RED admission. Only afterward separately author a minimal versioned repair, preserving E2028 and its42 tests, and obtain independent review. Keep valid nested-hook/public-throw/postcheck/UNKNOWN paths and legitimate source-supported preconstant throws. This review runs neither the original command nor those proposed drivers and grants no execution permission.

## What is sound, conditional, or still unsupported

- **Pure seam:** the module is import-free and has no loader/path/output/callback/query capability. Tests import only Node test/assert and this pure module; no original plan, codec, filesystem, process or store capability. Closed ordinary literals are the declared input domain, not a hostile Proxy sandbox. Public-looking strings are modeled facts, not operations.
- **Critical proof gates:** artifactSchemas,dependencyPathSet,phaseImplementation remain exactly UNRESOLVED in the actual candidate. FABRICATED_ASSUMPTION is explicitly a fixture assumption and can only produce ADMISSIBLE_FOR_FABRICATED with producerAdmitted:false. It is not a verified schema/path/implementation state or real GO. Invalid finite structure may REFUSE before proof inspection; no actual assessor call occurred here.
- **M1:** scalar type/location bounds and raw primitive identity are preserved. Derived flag−0,NaN-valid,Infinity HOLD; finite-invalid including luminance−0 and NaN/+0 remain retained. Original old equality grammar remains a separate true fact for original flag−0/NaN+1, with added review policy explicitly labeled. No original anomaly is claimed observed and no fit/range clamp appears. First-code precedence is declared; its policy label describes that chosen cause, not an exhaustive list of simultaneous raw anomalies or authority to ignore an underlying Infinity.
- **Support/identity:** empty paired M returns null/UNKNOWN, with separate original/derived bilateral denominators and outside-M counts. The existing empty-M fixture has zero original support, not two positive disjoint supports; that narrower authored coverage is not a source bug in the general loop. Header matcher checks all48 IDs/run/image/frame/trial/params/trace equality and explicitly returns bodyHashVerified:false. It does not validate render body/diagnostic correspondence; those schemas remain unresolved.
- **Independent arithmetic check:**33×16+11×48=1056 stations/side;100 selected visits/station,4224 returned array elements and88 full-success native callback observations are coherent conditional counts, not actual producer work or persisted files. E2029's exact answer visits4N+10/depth3 and raw tagged visits16N+53/depth9 describe different counters; its array/object/string/number wire recurrences and conditional answer bound `276+46N+2NQ+J(unit)` are internally consistent when `Q=max(20+T,30)` and a justified finite-token T exists. T and final schemas remain unresolved. In particular4×native answer nodes is **not** a generic raw-tree theorem: N16 gives74 native visits but309 raw nodes, not296. E2028 explicitly treats its4×/3×+4 columns as placeholders under artifactSchemas; they cannot become accepted producer bounds by choosing caps.
- **Arithmetic qualification:** E2029 I02 requests pre-operation overflow guards. E2028 validates nonnegative safe integer operands then validates each computed sum/product. This is not the requested pre-operation form; however, for these nonnegative integer operations no source counterexample was established that rounds an out-of-range integer back into an accepted safe integer (the first excluded integer2^53 is exactly representable). Do not invent an actual unsafe admission or execute overflow probes. Pre-operation guards would directly satisfy the independent proposed policy if adopted later; this is not an additional must-AMEND finding here.
- **Reserve/resource limits:** modeled output8944569B = success8747961+failure196608,read61539551B/246 passes,private-copy674479080B,hash work2129989760B and selected typed payload64924448B are candidate arithmetic, not proven concrete producer bounds. Whole trace/sidecar, repeated aliases, retained/roundtrip copies, prefixes/finalization, strings/escaping/number tokens and exact path passes still require artifactSchemas/dependencyPathSet/phaseImplementation proof. reserveCall proves only an inequality and has no call entry/disk reservation. Native versus encoded counters and bytes remain distinct; codec post-allocation byte checks, GC/RSS/OS wall/stream enforcement, crash/host/race properties are not solved. No cap raising or body-derived tuning is requested.

## Actual evidence and limits

Only complete source/plain-metadata reads and builtin hash/JSON parsing, plus own R2028 review artifacts. An initial combined tool response was truncated; the affected E2029 falsifier/R2025 review and E2029 result were read again in full before this decision. This is an output-display limit, not an implementation/test failure. No target function invocation, test/syntax/import, codec/native/raw-plan/report/pixel read/decode, query/store/PATH, producer/Git/native/repository/source mutation or subagent. All five target hashes were checked; source-derived predictions are never called executed results.

Prior E2007 incidental tagged-report text exposure remains disclosed/excluded as existing TOOLTESTIMONY, not an invented separate raw capture or blind-review claim. No such report was reread here. Published Lab7 and all prior immutable source/candidate material are untouched; S1 remains eventual sole Lab/Git writer. `materialize` keeps source AMEND, independent proposed constraints and unexecuted fixtures separate. **HOLD after result** for root's next separately scoped source/test packet. No producer, science, causal, main/defaultON/release/publication acceptance.
