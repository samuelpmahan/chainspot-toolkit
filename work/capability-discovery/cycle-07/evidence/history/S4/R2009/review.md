# R2009 / S4 — complete two-process runner source review

Decision: **AMEND before any execution**. Independently read both complete E2009 sources, FLOW and realresult. Source supports the intended one-shot original-plan route, but five bounded changes are required. Preserve E2009/E2006 originals; assign a versioned repair separately. No runner/helper/import/syntax/test/token/evidence/codec action occurred here.

## Exact checkpoint

| File under discovery-cycle07/S3/E2009 | Bytes | SHA256 |
|---|---:|---|
| capture-original-plan.mjs |11127|f98d35631f4cef1086a99cf169826c23098b6fdd43a75e7d1ffd463adcd3e79e|
| run-original-plan.mjs |3294|0f78425b56e23b520f35e8d80139efcf15cdb9fa89bdce8944f962fa77ada0de|
| FLOW.md |9243|2d6655606654c8750a3491a21781bc389fcb590a1eb4220a6042c98b8d5f5f71|
| realresult.json |10571|6b0fabf8ef5772e54a6f3fe8134f35775b97d52afb5359f125b966b4bfe8e983|

## Required minimal amendments

### A1 — fixed paths must target the NEW accepted helper revision

`PATHS.helper/core/tests` still names unfixed E2006. A final root packet cannot select a new helper directory because it supplies only bytes/hash and `PATHS` is fixed. Merely pinning new bytes would either refuse or require overwriting preserved E2006, which is not permitted. Mechanically rebind the versioned runner to the exact separately reviewed repaired helper/core/tests paths and final runner/shared-module paths before first execution. Freeze new hashes and actual flow; do not invent future pins or a GO packet. Keep fixed-root/no arbitrary dependency injection. This is a route rebind, not approval of an unseen helper repair.

### A2 — preserve admitted ambient environment; refuse mismatches, do not sanitize

Parent `spawn(...,{env:{TZ:'UTC'}})` silently drops **all** ambient environment and overrides TZ. FLOW's deliberate no-inherited-NODE_OPTIONS/NODE_PATH wording accurately describes that mutation but does not authorize it. Inherit the unchanged root-admitted ambient environment (omit env or copy it unchanged), with explicit **pre-token** identity/refusal checks for admitted set/unset/value states of Node execution-affecting variables, including NODE_OPTIONS, NODE_PATH, NODE_EXTRA_CA_CERTS and TZ as actually applicable. Root reports relevant Node variables unset; this review did not inspect or change environment values. Do not silently remove configured NODE_PATH/extra CA, clear NODE_OPTIONS, force UTC, reconstruct credentials or invent a sanitized fallback.

Record/check interpreter path/version/platform/arch and any externally admitted runtime-byte identity at the boundary claimed. Current code pins source/review files but not a Node executable hash, so it must not claim runtime-binary binding it does not perform. A matching binary/source hash remains check-time evidence, not authentication of the already running interpreter or host. Root's external launcher/admission supplies trusted expected identities; code should refuse mismatch rather than modify environment. Freeze any resulting packet schema amendment prospectively.

### A3 — review independence is target-role-specific

`reviewPin()` rejects reviewer S3 for **both** reviews, yet accepts helper author S2 as helper reviewer. That is not an independent helper review rule. Use the actually admitted authors/review targets: helper/core/tests acceptance must exclude its implementation author (currently S2); runner/wrapper acceptance must exclude their author S3. A different worker's helper review need not be rejected merely because that worker authored a different target. If repair ownership changes, bind the actual role identities explicitly rather than assuming the current names forever.

Root's independently supplied packet digest and exact target-to-pin review declaration are trusted external authority. The existing choice **not** to mine arbitrary review prose for coverage is sound; no cryptographic human identity detector or new service is required. Align code/closed capsule/docs with the role-specific independence assertion and exact final accepted source pins; this review is AMEND, not an accepted capsule for unrepaired files.

### A4 — async stream errors and exceptional cleanup must keep actual-close semantics

Concrete code gaps:

- Child stdout/stderr have `data` listeners but no `error` listeners. A Readable error is not caught by the synchronous outer try/catch, so it can terminate the wrapper without controlled stop/close accounting. Add bounded source-defined stream-error handling, preserve the first cause, stop child, and continue toward actual close/prefix inventory when possible.
- Raw stream files are opened before the try/finally. If stdout opens but stderr open fails, the first descriptor is not locally closed. Wrap setup in the cleanup boundary, close every successfully opened descriptor, retain any partial files and spent token, and never spawn/helper-call after setup failure. Missing final metadata under filesystem failure remains honestly missing.
- If an exception occurs **after** spawn but before the awaited close settles, catch calls `stop`, then finally immediately clears the SIGKILL grace timer. The wall timer is block-scoped inside try and not cleared on that exception path. This can cancel escalation before the live child closes and leave a wall callback running after the apparent finalization. Keep timers in outer scope; unify settlement so a created child is stopped and awaited to real close before normal finalization, or explicitly preserve unknown close when an unavoidable outer failure prevents observation. Clear timers only at the appropriate terminal boundary, not merely upon entering catch/finally. Do not synthesize exit0/closeObserved from helper events or kill requests.

Keep bounded first-cause plus later cleanup errors, TERM then KILL2s, capped raw prefixes, actual event counts and no retry. No process-tree management, OS kill-latency proof or broader producer security is requested; the reviewed helper is not allowed to spawn descendants. Stream chunks can still be discarded after a cap/error while the child is stopping; received/written/prefix flags must remain honest. Fsync failure is durability uncertainty/error, not a reason to rerun.

### A5 — preserve the new helper's located Infinity HOLD losslessly

Root reports the proposed versioned helper uses `error.code='INTEGRITY_HOLD'` and `error.integrityHold` containing exact j/c/b/role/side/stationIndex/planIndex/rawValue(±Infinity)/answerBinding/rawAnswer/originalState/callbackStatus. This structure was **not** read from unseen repair code here. The current child catches it with `smallError`, retaining only name/message/truncation; the structured located HOLD is lost. Simply adding it to `JSON.stringify(receipt)` would turn ±Infinity/NaN into null and -0 into0, contrary to the retained native-value contract.

Minimal compatible repair: after a bound helper failure, project only the reviewed bounded error payload and use the already pinned pure codec to encode a separate small lossless error artifact (for example <=65536 B). Add its exact allowed filename/cap to parent inventory and byte/hash binding to the small receipt/exit metadata. Parent hashes opaque bytes and does not native-decode them. Preserve error.code, located source references and original status; do not print the full error/native plan to console or dump the entire Error wrapper. Use pure codec only after existing admission/token checks; no image/store/PATH import, new query, plan regeneration or helper repeat.

If encoding/writing the HOLD artifact or its receipt fails, keep the original HOLD cause plus later failure separately, retain the available prefix, return non-success, and explicitly mark payload retention incomplete/unknown. Do not claim the protocol's failure payload was preserved when only a truncated message survived. The immutable original fragment remains the authority; this artifact preserves the bounded located lossless error witness. This is failure-contract compatibility, not a new CV feature. Exact field grammar/source/caps/import order must be reviewed with the repaired helper before execution.

## Sound boundaries confirmed in the current source

- Parent loads the exact fixed packet digest and closed pin/review/request records before token/run work; child revalidates them before helper import. Hash/source checks use ancestor/leaf no-symlink descriptor checks, regular/exact sizes, EOF/mtime/hash and finally-close. No host or ESM race-proofing is claimed.
- Parent consumes a write-exclusive token and syncs file/directory before NEW run-dir/spawn. Output reservation failure does not unspend it. Child's separate wx child-start marker precedes helper import and blocks second use. No cleanup/replacement/retry path is implemented. PID checks are route linkage, not adversarial process authentication.
- Child imports helper late and attempts at most one awaited call. Import failure is not a helper attempt; returned=true remains true if later envelope/digest/output validation fails; threw=true denotes helper rejection only. Existing code preserves that distinction correctly.
- READY bytes are exact Uint8Array1..2MiB; digest is independently recomputed; bytes are written raw without native decode or console return-wrapper dump. Parent independently hashes opaque plan output and waits child close rather than substituting intended exit.
- Raw write loops account successful partial writes and bounded prefixes; received/written are separate, cap/write failure marks prefixOnly. Known file inventory refuses extra paths; incomplete inventory is explicitly false and partial files are retained. Empty streams are valid. `exit.json` excludes self hash and actual later wrapper exit needs external launcher evidence.
- Source/runtime/input hashes are check-time observations, not execution authentication. wx/fsync improve host reservation/persistence but do not promise atomic all-files output, universal storage durability or metadata after SIGKILL/host/disk failure.

Parent's small helper-receipt JSON is currently trusted by its source/packet path and only partially rechecked (`status/plan`), not fully schema/run/packet/request/event validated. Add a small exact identity check if claiming independent receipt identity rather than merely opaque plan-hash verification; do not infer review coverage from prose. This is a bounded consistency improvement, not a new security subsystem. Metadata64KiB guards may legitimately refuse; no proof every maximal receipt+exit wrapper fits or every failure can be recorded is claimed. Cap-success/RSS remains UNKNOWN and is not a prerequisite proof demanded by this source review.

## Separately scoped safe NONCV needed before original-plan GO

No tests were authored in E2009; none were run here. Create a separately reviewed **fabricated-only** harness/seam, not a fake ROOT_FINAL_GO original packet. It must be incapable of importing the real helper or opening original evidence. Proposed focused cases:

1. Ambient identity mismatch refuses before token/mock spawn; unchanged admitted TZ/NODE_PATH/extra-CA handling is asserted, with no sanitizer/fallback.
2. Helper-author review rejected; runner-author self-review rejected; correct independent target-role assertions accepted with fabricated capsules.
3. Second stream open failure closes first descriptor/no child; stdout/stderr async error, partial write, cap crossing, fsync/close failure preserve first cause and prefix counts.
4. Spawn error then close; exceptional setup after spawn; timeout/TERM/KILL; actual close code/signal observed only from an emitted/real fixture event, with no leaked wall/grace timer. No descendant process test required.
5. Exclusive token/output/child marker collisions cause zero or at-most-one fixture call, with consumed token retained. Use dedicated fabricated namespaces, never the actual original packet path.
6. Helper throws versus returns then wire-write/receipt failure keeps attempted/returned/threw distinct and never retries.
7. Fabricated ±Infinity HOLD rawValue/rawAnswer with NaN/-0 round-trips through the permitted lossless artifact; small JSON carries only code/references/artifact binding. Artifact encode/write/receipt failure reports retention incomplete and preserves first HOLD cause.
8. Parent opaque output hash/receipt identity/known file caps refuse disagreement while preserving prefix. Actual wrapper exit remains outer-launcher testimony.

Those are proposed counterexamples, not passes, not commands to execute and not original numeric evidence. Exact runtime/env/test-source pins and actual command need separate authority. All producer G1–G6 holds remain separate; no original evidence decode/CV query permission follows from a future fabricated capture test.

## Actual review and preserved qualification

Read only the explicitly named E2009 sources/docs and their sizes/hashes. Initial `result.json` lookup failed because the document is `realresult.json`; this is a read-path correction, not a native/runner failure. No token/admission/run/evidence file was opened or created, no environment changed, no source modified. Only S4/R2009 review artifacts were written.

Prior E2007 incidental tagged-report text exposure remains disclosed and excluded from evidence/predicate/eligibility/cap tuning. No tagged report was reread; no blind-review claim or invented/backdated raw capture. `materialize` separates actual complete-source inspection, proposed repairs/counterexamples, and zero execution. This AMEND does not authorize implementation or testing by itself.
