# Capability Discovery Lab: bounded readiness experiment

This opt-in experiment reads immutable policy, a fresh coordinator snapshot and source-bound evidence, then reports ready/blocked/terminal/invalid tasks. It never changes production CV behavior, sends an agent request, reserves a worker, publishes, or claims a background daemon. Predefined task alternatives are reevaluated from the entire new snapshot after every completion; an hourly coordinator wake uses the same command.

```sh
node experiments/capability-discovery/plan.mjs \
  --policy experiments/capability-discovery/examples/policy.json \
  --state experiments/capability-discovery/examples/state.json \
  --artifacts experiments/capability-discovery/examples \
  --now 2026-10-18T12:00:10Z --expect-revision 1
node --test experiments/capability-discovery/plan.test.mjs
```

The example retains actual baseline/heading native receipts plus the independently reproduced adapter cache-root failure. It makes unknown arrival → falsifier ready, source-boundary failure → repair ready, and package blocked. Its worker registry and clock are fixtures: they are not current dispatch permission. Protocol metadata is explicitly unratified. No path length or bend threshold authorizes retention.

`policy.json` supplies version/source identity, command IDs, acyclic task dependencies, fixed typed guard operations and acceptance authorities. Guards are AND; competing recipes are distinct nodes. The only operations are `claimState`, `taskOutcome`, `evidenceStatus` and `independentReview`; there is no eval or shell command execution. Task kinds are refresh/falsify/repair/validate/package. Command IDs describe coordinator work, not implemented CV commands. The planner is one bounded pass, not a retry loop. Completed task IDs are terminal; a coordinator must create a separately bounded new instance for a retry.

`state.json` supplies revision, observedAt, actual registered workers/principals/leases, task outcomes, scoped claims, bundles, review file references and human decision file references. The coordinator is the trust boundary for this snapshot and the immutable policy. Source identity is a coordinator-pinned descriptor; it is not proof that a Git checkout is complete. Exact file digests and source/recipe/request/executable identities must be included in each producer's bundle manifest. Current bundle bytes are rehashed; source mismatch, missing bytes and hash mismatches cannot authorize use. A raw JSON worker assertion of evidence validation has no authority.

Validation reviews must be actual hash-verified JSON files referenced as `{path,sha256}`. Their contents require `bundle`, exact `bundleHash` (the exported canonical hash of the bundle declaration), `source`, `protocol`, `protocolHash`, `decision:accepted`, and a registered `reviewer:{worker,principal}` distinct from **all** producers. A policy protocol entry pins id and SHA-256. Review acceptance establishes validation testimony, never human acceptance.

Packaging additionally requires a hash-verified human decision file: `issuer`, `principal`, `scope:retain`, `claim`, `source`, `bundle`, exact `bundleHash`, `decision:accepted`. The issuer/principal/scope must match an immutable policy authority, and the exact file SHA-256 must be preapproved in `trustedHumanDecisionHashes`. Root imports authenticated Sam decisions and maintains these trust anchors; a worker declaring its name as Sam cannot mint acceptance. No trusted decision is shipped in the example.

Only workers marked available whose principal has no active work or unreconciled lease on any worker record are eligible. Occupancy follows the principal across aliases; genuinely inactive historical aliases do not block a free principal. Expired leases still require coordinator reconciliation; time passing is not proof an agent stopped. Review eligibility excludes both producer worker IDs and producing principals, including aliases. Missing replay while its producer runs means wait rather than duplicate refresh.

The optional `nativeSpec` contains only ready tasks and actual free IDs, encodes explicit semantic review nodes as native `kind:extract`, sets eligible workers explicitly and disables automatic reviews. The copied native wrapper has no arbitrary dependency gate, so the planner gates first. It can recommend multiple jobs per available capacity; the native solver performs the assignment.

Native solve is a separate explicit operation:

```sh
# Save report.nativeSpec to a new file only after checking the report and real registry.
# Use new coordinator-owned state/output paths; this does not dispatch an agent.
python3.12 -m pip install -r experiments/capability-discovery/requirements.txt
python3.12 experiments/capability-discovery/native-probe.py init --spec READY_SPEC --state NEW_NATIVE_STATE
python3.12 experiments/capability-discovery/native-probe.py solve --state NEW_NATIVE_STATE --output-dir NEW_SOLVES
```

`native-provenance.json` pins the copied wrapper, unchanged SHA-256 and dependency 1.0.4. Its receipt validation is extraction bookkeeping, not scientific validation. Native score/capacity/pin checks do not prove arrival or ownership.

Before dispatch, `checkDispatch(previous,inputs,worker,task)` rehashes current evidence and compares policy, complete state and evidence hashes. `--expect-revision` also detects an outdated boundary revision. Neither is atomic reservation: root must single-write/lock state, compare-and-swap the plan digest, reserve task+worker, invoke the actual agent API, then acknowledge native start. Reconcile failure between these steps. Root alone ingests immutable receipts idempotently and calls native finish. A new revision or changed proof bytes requires a new plan.

Known limits: no signature verifier or authenticated user-channel client is included; trusted policy/snapshot ingestion belongs to root. Legacy native receipts do not persist field arrays, canonical pixel bytes or cache root keys. Hash equality does not establish geometric correctness. The root-inventory and probe packs are evidence-producing experiments, not platform fixes. Sealed corpus and PR publication remain outside this experiment.

E207 review repair: available worker aliases sharing one principal now invalidate native readiness; unavailable historical aliases remain allowed. Reviews R202/R203/R206 initially requested amendments. Current negative tests harden wrappers and schemas; they do not calibrate scientific confidence.
