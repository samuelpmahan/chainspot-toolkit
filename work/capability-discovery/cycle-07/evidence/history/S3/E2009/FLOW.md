# E2009 — written one-shot ORIGINAL-PLAN capture, UNEXECUTED

Written in `capture-original-plan.mjs` (parent/shared guards) and `run-original-plan.mjs` (child). Only source/text authoring, source readback and SHA/size inspection occurred. No syntax check, import, test, subprocess, helper, codec, evidence-body read, CV/store/PATH or render ran. No observed RED/GREEN is claimed; the explicit source-only assignment overrides executing the ordinary TDD loop. No test file was authored in this two-source-file construction.

Checkpoint is active: root and a different worker must fully review these exact files and the final repaired helper/core/tests before ANY run GO. Construction READY is not execution READY.

## Future entry — not a command run here

`node /workspace/scratch/8528bb251845/discovery-cycle07/S3/E2009/capture-original-plan.mjs --packet-sha ROOT_FINAL_ADMISSION_SHA256`

Replace the final argument only with root's independently supplied actual 64-hex SHA. Fixed packet path:

`/workspace/scratch/8528bb251845/discovery-cycle07/S3/E2009/ROOT-ADMISSION.json`

No packet/draft/null-pin file has been created. Until root supplies it, source refuses before token/run-directory/helper work. The child entry is not a standalone authorized route.

## Exact pending packet grammar

Top own data fields are `schema,status,mode,runId,pins,reviews,request` only. Values must be schema `cycle07-original-plan-admission@1`, status `ROOT_FINAL_GO`, mode `ORIGINAL_PLAN_ONCE`, a bounded safe runId, final pins/reviews, and exact own-data helper request `schema,enabled,token` (enabled true). No geometry, evidence root, dependency/cap/output injection exists.

`pins` has exactly `helper,core,tests,codec,protocol,protocolReview,runner,wrapper`; each is `{bytes,sha256}` with positive safe bytes <=1MiB and final non-placeholder SHA. Source paths are fixed in PATHS, not packet-selectable. Helper/core/tests are fixed E2006 files; protocol is E2005/protocol.v2.json; protocolReview is R2005/realresult.json. Root must pin the final repaired/accepted versions, not the historical unaccepted helper guards.

`reviews` has `helper` and `runner`; each exact record is `path,bytes,sha256,reviewer,decision,targets`. Path must be an absolute canonical descendant of the fixed cycle07 workspace. Decision is `accepted`; reviewer is a bounded identity other than S3. Targets are exactly `[helper,core,tests,codec,protocol]` and `[runner,wrapper]`, respectively (sets, order irrelevant). Their file bytes/hashes are read and verified. Root's packet asserts which accepted review covers which final pins; the wrapper does NOT infer review coverage by mining arbitrary review prose. Root authorship/authority is a trusted externally supplied packet digest, not a cryptographic human-identity detector. No future review SHA is invented here.

## Actual prospective order

1. Parent validates exact CLI and fixed packet bytes/hash <=64KiB. It checks exact packet grammar, final pin shape and all fixed source/protocol/review file sizes/hashes using bounded no-symlink component + O_NONBLOCK/O_NOFOLLOW descriptor reads. This is source/authority I/O only, no raw scientific evidence. Hash-at-check-time does not authenticate the host or defeat concurrent replacement.
2. Parent ensures only fixed `tokens/` and `runs/` parent directories exist. It exclusively creates `tokens/<runId>.spent.json`, binding packet/request hashes, all pins/reviews, runId, wrapper PID and consumed time. It fsyncs token and token directory before proceeding. Any failure leaves any created bytes/token consumed; no overwrite/delete/replacement/retry.
3. Parent exclusively mkdirs NEW `runs/<runId>/` and syncs its parent. Collision means no child/helper call. If token creation succeeded but output reservation failed, token remains spent. Fixed source does not accept alternate output roots.
4. Parent opens write-once `stdout.raw` and `stderr.raw`, then spawns `process.execPath` directly with child path and packet SHA, no shell or inherited NODE_OPTIONS/NODE_PATH; child env is only TZ=UTC. No heavy shell construction. Parent attaches capture and real close/error listeners.
5. Child independently revalidates packet/pins/review hashes, verifies token packet/request/run/pins/reviews and parent PID, checks run path, and exclusively creates/fsyncs `child-started.json` plus run directory. This second once marker prevents a second child helper call with the spent token. PID checking is route linkage, not adversarial process authentication.
6. Only then does child dynamically import the pinned helper filesystem path and call `buildOriginalEvidencePlan(packet.request)` at most once. It records attempted immediately before call, returned only after await resolves, and threw only if the call rejects. Import failure is not a helper attempted call. No retry path exists.
7. READY requires the exact result envelope, actualNewPATH0, exact Uint8Array bytes of1..2097152 and independently recomputed digest matching returned sha256. It writes returned encodedBytes directly with wx+fsync to `plan.wire.json`. No codec/JSON conversion of plan wire, no console plan or typed-byte wrapper dump. It emits only a small <=64KiB helper receipt; helper return versus later output/receipt failure stays distinct. Receipt-write failure projects both first cause/events and receipt error to bounded stderr where possible.
8. Parent stores at most65536 raw bytes per stream. It preserves exact received prefix, counts received/written separately and flags prefixOnly if cap/write failure. First cap/failure requests SIGTERM; SIGKILL is attempted after2000ms. A wall timer120000ms from spawn requests the same stop. These are operational bounds, not peak-memory/CPU/RSS or guaranteed OS kill-latency certification. There is no child-process tree management; reviewed helper must not spawn descendants.
9. Parent awaits actual child `close` and records code/signal/closeObserved, spawn error, timeout/interruption and capture errors. SIGINT/SIGTERM to wrapper requests child stop then captures its close. SIGKILL/host crash/disk failure may prevent final metadata; consumed token and whatever prefix exists remain, not a fabricated exit record.
10. After close, parent syncs/closes raw captures and inventories only the fixed output names with exact bytes/hash. Empty raw streams are valid. It reads only small helper-receipt metadata and opaque plan bytes, rechecking plan size/hash independently, never native-decoding it. Unexpected files or disagreement fail output verification. Partial files remain physically present even if inventory verification stops.
11. Parent writes exclusive `exit.json` <=64KiB with actual child exit, helper receipt, raw capture completeness/prefix flags, available-file inventory and intended wrapper exit. Inventory necessarily excludes self-referential exit.json, which the external launcher/reviewer hashes separately. Wrapper intends0 only for observed child0/no signal/no capture errors/READY/verified plan. Actual wrapper exit/signal must be independently captured by root's launcher; the wrapper cannot testify its own later death.

| Invocation | Inputs | Output / authority |
|---|---|---|
| Parent capture wrapper | root packet digest + fixed packet/source/review bytes | consumed token, NEW directory, raw streams, actual child exit metadata |
| Child runner | revalidated same packet/token/new once marker | at most one helper import/call, raw plan wire and small helper receipt |
| Existing helper | exact closed original request from root packet | returned lossless plan or terminal error, no new PATH/store/CV |
| External root launcher/reviewer | exact source/packet and admitted command | observed wrapper exit/signal and final output hashes; NOT supplied by wrapper intended exit |

## Limits and remaining boundaries

64KiB each packet/metadata/raw-stream cap;2MiB raw plan cap; fixed source/review pins <=1MiB each. Metadata caps are terminal refusal, not proof every filesystem failure can produce a receipt. Files are wx; available prefixes are best effort, no transaction/all-files/crash guarantee. Token file+parent fsync is the durable reservation mechanism on the host filesystem; fsync failures stop before helper import, and no universal storage/host guarantee is claimed.

External source/pin rechecks and output hashing are outside E2006's own8MiB evidence-read accounting and outside any future producer16MiB budget. Original tree/output caps may legitimately reject the one original plan-run; retain it as useful engineering negative, no raise/rerun. Root must decide future changed packets explicitly.

No fabricated test packet is implemented by this original-only runner. Later synthetic runner/token/capture tests require a separate reviewed safe seam/fixture, not a fake final root packet that enables original evidence. Current construction leaves helper bugs/caps/NONCV acceptance to the separate reviewers. All G1-G6 producer holds remain. No main/defaultON/deploy/scientific/physical acceptance follows.

Review question: is this exact two-process flow the one root wants independently reviewed for a later separately admitted ORIGINAL-PLAN run? Pause remains in force; do not execute from this handoff.
