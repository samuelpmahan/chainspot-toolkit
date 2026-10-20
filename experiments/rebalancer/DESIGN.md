# Receipt-gated execution experiment

The October 20, 2026 request authorizes a bounded executable dispatcher emulator,
regression cases, measured fixed/dynamic comparisons, and a reviewable GitHub
workflow. The base is `1736f5f8101bef7c4296d318ff440c9493615a78` on
`codex/rebalancer-integration-20261017`. Its original manual-run evidence and
recipe remain intact. The newer platform and algorithm branches are parallel
workstreams; this experiment does not merge or modify either lane.

## Intended result

Reuse `probe.solve` and its native Rebalancer checks. Add a single coordinator
that repeatedly observes completed receipts, releases dependent work, asks the
solver for assignments, and dispatches concurrent local worker functions. These
functions extract declarations from hash-bound Python sources and independently
check declaration completeness and exact source quotations. Deliberately omitted
declarations require a separately recorded repair and another worker's review.

Logical workers and artificial service delays emulate agents. Extraction and
source checks execute against real bytes. This is neither an LLM judgment
experiment nor an automatic live-agent controller.

## Durability and decision evidence

Only the coordinator mutates scheduling state. Atomic snapshots describe active
work; JSONL is an inspectable event projection. A completed run also has a
write-once completion receipt containing the full state and events, recipe
identity, and checksums for its accepted evidence. Completed-run inspection and
recovery validate that receipt before trusting mutable projections.
Every assignment decision records its
observable inputs before solving: current job state, dependencies, accepted prior
receipts, eligible/free workers, capacities and priorities. The recipe declares
artificial service delays in advance, so those configured values are known to the
coordinator; the solver objective uses readiness and packet priorities, not those
delays. Future worker results and actual durations are unavailable at the decision.
Native assignment receipts and bundles are retained.

Each dispatch binds an attempt token, source/input digest, worker, packet, and
decision. Acceptance checks these bindings and the receipt's content before
releasing work. Stale recommendations, invalid receipts, late attempts and duplicate
completions cannot release dependencies. Recovery consumes valid durable receipts
first, then abandons unfinished attempts and makes a new assignment. A process
lock prevents two coordinators from simultaneously owning a run. Worker threads
live in the coordinator process, so process termination leaves no worker service.

## Comparison and acceptance

Dynamic and fixed policies use the same jobs, eligible lanes, solver, worker
implementation, source bytes, failure injection and repair rules. Fixed policy
adds permanent extract/review roles; dynamic policy permits qualified workers to
change roles. Alternate run order over paired repetitions and include a zero-delay
control. Record actual wall time, solver and dispatch costs, worker start/end,
receipt arrival and final audit results. Report variability and adverse results.
No emulator measurement establishes an agent productivity improvement.

Acceptance requires executed cases for dependency release, eligibility, capacity,
stale recommendations, invalid/late receipts, interruption recovery and
reassignment; completed extraction/review/repair runs; preserved historical
evidence; an independent review; and an exact reviewable Git checkpoint. Existing
Node failures caused by absent source-packet artifacts remain visible as baseline
limitations. CV behavior is outside this change's scope.
