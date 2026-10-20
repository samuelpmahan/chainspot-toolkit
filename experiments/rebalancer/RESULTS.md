# Executed verification — October 20, 2026

The bounded local execution emulator completed extraction, independent-worker
review, amendment, repair and final review using the existing native solver.
This is reviewable experimental code, not a live-agent controller or a production
integration. The historical 38-packet manual experiment remains separate and was
not independently rerun here.

Base: `1736f5f8101bef7c4296d318ff440c9493615a78`, branch
`codex/rebalancer-integration-20261017`. All implementation changes are under
`experiments/rebalancer/`; platform/algorithm production files are untouched.
Python 3.12.14, native `rebalancer==1.0.4`, Linux; standard-library local workers.

## Completed comparison

The final evidence directory is `comparison-with-recovery/`. Thirty runs completed:
five repetitions of dynamic, balanced fixed, and tuned fixed allocation, each with
the declared delays and with zero delays. Dynamic/fixed order alternated AB/BA;
the tuned static position rotated. Six logical workers remain restricted to their
declared platform or algorithm lane. Each run repeats eight reads of the same
SHA-256-pinned module, with one deliberate omission.

An independent persisted-data audit, without invoking dispatcher validation,
checked all 30 completion records, 540 accepted receipts, 210 native solver
receipts and 1,050 exact source quotations: zero mismatches. Every run ended with
eight accepted final roots, nine extraction receipts, nine review receipts, one
amended review and one repair. Final reviews used a different logical worker from
the extraction author. The ten dynamic runs recorded 78 extract/review role
changes; the fixed controls recorded zero.

| Scenario | Allocation | Wall median, s | Observed min–max, s | Verified solver median, s | Dispatch median, s |
|---|---|---:|---:|---:|---:|
| Declared delays | Dynamic | 1.5438 | 1.4058–1.7581 | 0.0456 | 0.4216 |
| Declared delays | Fixed 3 extract / 3 review | 1.6995 | 1.6861–1.7585 | 0.0510 | 0.4131 |
| Declared delays | Fixed 2 extract / 4 review | 1.6300 | 1.5752–2.3166 | 0.0503 | 0.4265 |
| Zero delay | Dynamic | 1.1662 | 1.0677–1.4162 | 0.0324 | 0.4451 |
| Zero delay | Fixed 3 extract / 3 review | 1.1050 | 1.0869–1.3295 | 0.0315 | 0.3815 |
| Zero delay | Fixed 2 extract / 4 review | 1.2224 | 1.0876–1.3914 | 0.0393 | 0.4300 |

Dynamic had 9.2% lower median wall time than balanced fixed with the declared
delays, and 5.5% higher median wall time in the zero-delay control. These are
observations from a small shared-container experiment, not an agent-throughput
claim. Artificial waits total 2.43 worker-seconds per delayed run; concurrent
worker totals are not a decomposition of wall time. Parsing and source checks
execute against actual bytes. Accepted worker computation medians span
0.0880–0.1133 seconds across the six groups.

Wall time covers initialization through durable completion, including any failed
native-score sessions, worker draining and recovery. Verified solver time sums
only successful solve receipts. Dispatch time sums canonical batch dispatch
events once. Worker computation and wait totals use accepted receipts; abandoned
partial work would be excluded from those totals. No native-score retry occurred
in this final 30-run sample. Retry behavior is covered by focused regressions.

## Decision observability and recovery

Before each solve, a decision file records ready/blocked jobs, dependencies,
accepted prior receipt hashes, available/pinned workers, lane/role restrictions,
capacities, input digests and priorities. Native receipts and bundles preserve
the resulting assignment and exact-score check. The coordinator knows configured
emulator delays from the recipe; the solver uses readiness and priorities, not
future results or actual durations. Dispatch, worker-reported start/end,
coordinator receipt arrival, acceptance and role-change events remain distinct.

For example, `delayed/rep-01-dynamic` decision `D0003` moved W4 from extraction
to review R02 after its dependency became accepted and review work became
eligible. Review priority is 200, extraction priority 100, repair priority 300.
The amended R01 receipt created E01.fix1 and R01.fix1; the original extraction and
failed review remain inspectable.

Actual SIGKILL probes covered interruption after durable dispatch, after receipt
write before acceptance, and after final acceptance persistence. Resume abandoned
and reassigned unfinished work, consumed an already durable receipt without
reexecution, and preserved completed review state, respectively. Cooperative time
budget cancellation joins worker threads before unlocking. A separate backfill
probe started new work while a slow worker remained pinned.

Workspace synchronization was observed replacing mutable `state.json` and
`events.jsonl` with older projections. A write-once, checksum-verified
`completion.json` now binds full state/events, recipe/run identity, packets and
accepted receipts. The post-comparison audit found six older mutable projections;
all 30 completion records validated. Executed resumes restored those six while
worker execution was forbidden, and left completion bytes unchanged. Before
images and recovery observations are retained. Active runs still rely on their
atomic mutable state; the completion guard is not a general storage service.

## Tests and retained failures

The final candidate passed **54 Python tests** (8.619 seconds), including the nine
original probe tests, dependency/eligibility/capacity checks, stale decisions,
invalid/duplicate/late receipts, bounded repair, SIGKILL recovery, completion
corruption, projection rollback and bounded native-score retry cases. The five
original native adversarial cases also passed.

Earlier runs twice exposed the unchanged native probe's
`nonoptimal_native_score` rejection. Both were rejected before dispatch; their
failure logs are retained. A sequential full-suite rerun and the final 54-test
run passed. The native implementation and its exact-score guard are unchanged.
The benchmark retries only that exact rejection, at most three total coordinator
sessions, records every failed session once, and charges its elapsed time to wall
time. Other errors propagate. Each session has its own 30-second budget.

The broader `node --test` result was **39 passed, 6 failed**. The same six failures
occurred on the untouched base because source-packet fixture paths are absent.
They are not presented as passing checks. Independent source comparisons verified
that `probe.py`, the original recipe, pinned requirements, adversarial probe and
historical manual-run paragraph were preserved.

Two earlier comparisons remain diagnostic: `comparison-final/` predates the
completion guard and contains reverted mutable projections; `comparison-verified/`
completed 12 runs before stopping during a solver phase, with its failure message
unavailable from the mutable log. Neither supplies the measurements above.

## Reproduction and evidence

From the repository root with the pinned environment installed:

```sh
python -m unittest discover -s experiments/rebalancer/tests -v
python experiments/rebalancer/adversarial/probe_a03.py --output /tmp/adversarial.json
python -m experiments.rebalancer.benchmark \
  --recipe experiments/rebalancer/recipes/execution.example.json \
  --output /tmp/rebalancer-comparison-new --repetitions 5 --max-seconds 30
```

Use a new output directory. Native heuristic choices and timings can vary.
`Rebalancer-Execution-Evidence-20261020.zip` accompanies the review checkpoint:
raw runs, completion records, events, decision snapshots, native bundles,
receipts, metrics, independent audit scripts, crash captures, test logs, source
hashes, diagnostic runs and publication manifest. Archived absolute paths document
the original execution; reproduce with a fresh run rather than moving a committed
run directory. Extraction and review share a parser, so distinct logical-worker
rereads do not establish independent algorithmic or LLM judgment quality.
