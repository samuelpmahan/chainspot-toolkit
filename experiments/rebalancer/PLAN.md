# Rebalancer execution implementation plan

**Goal:** Execute bounded receipt-gated extraction, independent-review and repair
cycles using the existing native solver.

**Design:** [DESIGN.md](DESIGN.md). Python 3.12, `rebalancer==1.0.4`, standard-library
local workers. All changes stay in this opt-in experiment. The root coordinator
owns Git/integration; workers own disjoint files. The user has authorized execution
and the GitHub review workflow in the task request.

## 1. Dispatcher and durable state

- Owner: dispatcher worker. Files: `dispatcher.py`, `tests/test_dispatcher.py`,
  minimal compatible changes to `probe.py` only if needed.
- Write failing behavior cases for dependency/eligibility/capacity, stale
  recommendations, receipt binding, crash recovery, and reassignment.
- Reuse `probe.solve`; retain its native constraints, exact-score check and bundles.
- Expose `initialize(spec_path, run_dir, policy)` and
  `run(run_dir, max_seconds=30)`, plus matching module CLI commands.
- Persist decision snapshots, attempts, receipts, repair lineage, timings and events.
- Bound attempts/repairs/runtime and fail closed on unavailable eligible work.

## 2. Executable workload and comparison

- Owner: workload worker. Files: `worker.py`, `benchmark.py`,
  `recipes/execution.example.json`, small fixture modules, focused worker and
  benchmark tests.
- First test source binding, declaration completeness and quotation checking.
- Implement `execute(packet) -> receipt`; never mutate coordinator state.
- Use six logical workers and preserve platform/algorithm eligibility tags.
- Compare both policies over paired alternating runs and a zero-delay control.
- Retain per-run inputs, native solves, raw receipts and actual timing measurements.

## 3. Independent verification and delivery

- Owner: verifier, read-only implementation review and independent probes. Root
  reconciles findings; implementation owners repair their own files.
- Rerun original tests/adversarial cases; run new cases and the broader Node suite.
- Prove actual coordinator interruption and resume with new attempt fencing.
- Inspect final audits and allocation changes independently of worker summaries.
- Publish a scoped branch/PR with commands, results and limitations; preserve raw
  generated evidence separately from tracked source.

## Review focus

- A receipt written just before a crash must not be lost or accepted twice.
- A late receipt from an abandoned attempt must not complete its replacement.
- A failed review must preserve the failed extraction and trigger bounded repair.
- No eligible independent reviewer must produce blocked work, never self-review.
- Short jobs may be dominated by native-solver/coordinator overhead; report it.
