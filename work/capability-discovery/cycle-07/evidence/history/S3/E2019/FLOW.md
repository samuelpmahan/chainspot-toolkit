# E2019 — minimal M1–M4 source repair; checkpoint HOLD

Written only in NEW `discovery-cycle07/S3/E2019/`. No syntax check, module import, test, codec, runner, token, packet, original evidence body, query, render, CV or Git operation was performed. Read-only source/diff/hash inspection is not runtime verification. E2014, E2016 and E2017 are preserved.

## Source and authority

Complete R2014 review/result, E2016 driver/FLOW and E2017 stdout/stderr/result were read before repair. E2017 actually ran the 22-test E2016 driver once against E2014 core: 14 pass, eight intended assertion failures, exit1. Its result SHA is `af498589c60659475cdd58208538171c635c2dea230e4e258b6ef111ef75eaee`; these are prior observed RED results, not an E2019 execution.

`fabricated.test.mjs` is byte-identical to E2014's 11 authored tests (SHA `983f003cc3baf4c97b4e74ef6cc6ee6073c0b0add96ac9cfa0e0cfe68257371d`). `artifact-identity.test.mjs` is the E2016 driver with exactly one import-line path replacement to `./capture-core.mjs`; all assertions, fixtures, comments and remaining bytes are unchanged. `run-original-plan.mjs` is byte-identical to E2014. The old 11 were never run in the supplied history; do not label all33 as observed RED.

## Actual written flow

1. M1: the fixed parent now requires accepted helper-review targets exactly `helper/core/tests`, matching the actual R2013 target scope. Codec/protocol pins and pinned R2005 `protocolReview` remain separate prior-authority reuse. The final ROOT packet must explicitly ground that reuse; no fresh five-target coverage is invented. Packet grammar, pin keys, review independence and all source/helper/protocol fixed paths are otherwise unchanged. Only the own `HERE` moves from E2014 to E2019, which moves its fixed runner/wrapper/captureCore/fabricatedTests, packet, runs and tokens paths together.
2. At future original admission, the parent would check the closed packet, future root runtime/named ambient expectations, executable and source hashes, per-role author/reviewer separation and closed enabled request before creating an exclusive consumed token and a NEW fixed run directory. No packet, final pins, accepted runner capsule, runtime expectations or authority declaration is created here. Ambient inheritance, forwarded execArgv, no-sanitize behavior and all existing caps/math/helper paths are unchanged.
3. M3: `captureSession` opens both raw streams and attaches actual child close/error handlers as before. It now installs stdout AND stderr error listeners in a first loop, before either fallible data-listener registration in a second loop. A stdout data setup exception can therefore remain first `SETUP` cause while a later stderr error is captured as a bounded later cause. TERM/KILL requests, wall120s/grace2s timers, prefix accounting, actual close wait and cleanup are unchanged. This is source reasoning; no OS process behavior was tested.
4. The fixed child would recheck admission/token/parent identity, claim its exclusive child marker, and load only fixed E2012 helper. `invokeOnce` still makes at most one helper call. READY bytes are written directly to fixed `plan.wire.json` after the existing2MiB/digest contract; no plan dump or native-body decoding is added.
5. M4: on the original `INTEGRITY_HOLD`, the existing located projection is retained and pinned pure codec loaded only through the admitted real adapter. The encoded HOLD must be nonempty and <=65536B. After its one write, the hash is obtained and a complete opaque binding constructed/validated (nonempty string hash in the capability seam) before assigning `artifact` and then `complete=true`. A write/hash failure leaves `artifact:null,complete:false`, preserves first HOLD/error.code and records bounded retention failure. Physical bytes may exist without a complete binding; no deletion, rewrite or helper retry occurs. Production hashing remains actual SHA256 via the fixed adapter; fabricated `fixturehash`/fake SHA tokens are not cryptographic evidence.
6. M2: receipt validation rejects READY plan:null, complete HOLD artifact:null/error-nonnull and incomplete HOLD with a nonnull artifact. `checkArtifacts` independently makes required role bindings mandatory: READY literal `plan.wire.json`, safe integer bytes1..2097152; complete HOLD literal `integrity-hold.wire.json`, bytes1..65536. Both require exact binding keys and matching independently observed inventory size/hash. The role cap never comes from an arbitrary supplied filename. Known inventory names remain a separate check, not proof of role. Incomplete HOLD may legitimately have unbound physical partial/full bytes; it is never promoted to complete retention.
7. The unchanged parent would enumerate known outputs, hash opaque bytes and validate the small receipt/role bindings, without decoding plan/HOLD native bodies. `exit.json` distinguishes helper attempted/returned/threw, retention/output failures and actual child close code/signal. Parent wrapper actual exit still requires separate external launcher evidence. These paths remain unexecuted and are not resource/host/OS certification.

| Invocation | Inputs actually supplied by caller | Written output/stop behavior |
|---|---|---|
| `checkArtifacts(receipt,inventory)` | Role metadata and observed opaque binding inventory | Required literal role identity/cap/equality or REFUSED |
| `captureSession(io,caps)` | Bounded stream/child/timer capabilities | First/later cause, raw prefixes and actual close observation |
| `invokeOnce(io,ids)` | One helper capability; marker, write, hash, receipt; optional HOLD codec capability | One call at most; direct READY bytes or complete/incomplete HOLD binding; receipt |
| Fixed original parent/child | Future immutable ROOT packet, accepted exact source/reviews/runtime/ambient/request | Exclusive spent token/new run; no retry; terminal failure allowed |

## Prospective ONE future fabricated GREEN command — NOT RUN / NOT ADMITTED

Working directory `/workspace/scratch/8528bb251845`:

```sh
node --test --test-concurrency=1 discovery-cycle07/S3/E2019/fabricated.test.mjs discovery-cycle07/S3/E2019/artifact-identity.test.mjs
```

Predicted registration is33 tests: 11 previously authored/unrun plus22 from the actual prior RED driver. No passing E2019 result, import success or syntax success is claimed. The new driver is original-incapable: only Node test/assert/events plus import-free core; all helpers/encoders/timers/writes are in-memory fakes. The copied old11 additionally import the fixed pure codec definitions and would encode/decode fabricated HOLD values only; neither test file imports the original parent/child/helper/evidence route or has fs/child_process capabilities. No mock ROOT_FINAL_GO packet may be minted for fabricated testing.

Root must read the full new source, diff, flow and test identity before a separate exact GREEN admission. Original route execution is a different authority requiring final root-authored packet and accepted exact helper/runner review/pins. G1–G6 producer gates stay HOLD; cap sufficiency, real-pipe/fsync/signal behavior, original compatibility and scientific acceptance remain unknown. A future admitted original run may terminally fail existing frozen caps; do not raise caps, prune inputs or retry.

Checkpoint pauses here for root review. This flow is proposed for the separately admitted fabricated command only; no execution is requested or implied by this construction receipt.
