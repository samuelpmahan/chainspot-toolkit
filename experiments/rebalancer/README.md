# Rebalancer experiment

This is an additive, opt-in Python experiment for scheduling bounded extraction and review packets with the native Rebalancer solver. It does not change ChainSpot detector, CV, or provider behavior. The original portable `probe.py` wrapper supports manual dispatch; the executable local emulator described below adds bounded receipt-gated execution.

The checked-in recipe `recipes/spec.example.json` describes the 12 original extraction commits from the live experiment. `init` creates pending extraction and independent-review packets from it. Repairs can be added as extraction packets with `repair_of`; their review packets are generated from the same spec rule.

## Install and run

Use Python 3.12 and install the pinned native dependency; its wheel is not vendored:

```sh
python3.12 -m venv /tmp/rebalancer-env
/tmp/rebalancer-env/bin/pip install -r experiments/rebalancer/requirements.txt
/tmp/rebalancer-env/bin/python experiments/rebalancer/probe.py init \
  --spec experiments/rebalancer/recipes/spec.example.json \
  --state /tmp/rebalancer-run/state.json
/tmp/rebalancer-env/bin/python experiments/rebalancer/probe.py solve \
  --state /tmp/rebalancer-run/state.json \
  --output-dir /tmp/rebalancer-run/solves
/tmp/rebalancer-env/bin/python experiments/rebalancer/probe.py packet R01 \
  --state /tmp/rebalancer-run/state.json \
  --receipts-dir /tmp/rebalancer-run/receipts
```

For each solver recommendation, an operator starts the assigned work explicitly, writes the completed packet's JSON receipt under the specified receipts directory, and then releases the worker:

```sh
/tmp/rebalancer-env/bin/python experiments/rebalancer/probe.py start --state /tmp/rebalancer-run/state.json W1 E09 reviewer-or-worker-label
/tmp/rebalancer-env/bin/python experiments/rebalancer/probe.py finish --state /tmp/rebalancer-run/state.json --receipts-dir /tmp/rebalancer-run/receipts W1
```

The `start` example is illustrative only: always use the worker/job pair in the latest `solve` receipt. Native assignment choices can vary across runs.

`solve` writes one JSON assignment receipt and native bundle per epoch. Before it writes state, it independently checks capacity, eligibility, pinned workers, the native broken-constraint result, and the exact maximum-weight matching score. `start` accepts only the latest recommendation and prevents self-review. `finish` requires a matching job/worker receipt and a valid extraction outcome or review decision. `packet` prints review context and, when available, the extraction receipt. All state and output locations are explicit; no scratch path is embedded in the CLI.

Run the portable tests and synthetic adversarial recipes:

```sh
/tmp/rebalancer-env/bin/python -m unittest discover -s experiments/rebalancer/tests -v
/tmp/rebalancer-env/bin/python experiments/rebalancer/adversarial/probe_a03.py --output /tmp/rebalancer-run/adversarial.json
```

The adversarial recipe exercises all-pinned work, no-ready work, an ineligible sole reviewer, cross-assigned reviews, and infeasible pin/capacity handling. These are synthetic cases, not workload performance measurements. Use `--output` only when you want to save generated results; generated results, receipts, bundles, logs, screenshots, and environments are not checked-in artifacts.

## Receipt-gated local execution

`dispatcher.py` adds an opt-in **executable emulator**, using the existing native
solver. It runs local Python worker functions, not agents or a remote worker
service. The manual CLI above remains available. The execution design and task
boundaries are recorded in [DESIGN.md](DESIGN.md) and [PLAN.md](PLAN.md).

From the repository root, with the pinned dependency installed:

```sh
python -m experiments.rebalancer.dispatcher init \
  --spec experiments/rebalancer/recipes/execution.example.json \
  --run-dir /tmp/rebalancer-execution --policy dynamic
python -m experiments.rebalancer.dispatcher run \
  --run-dir /tmp/rebalancer-execution --max-seconds 30
```

Repeat the `run` command to resume the same run. Each run directory contains an
atomic `state.json`, an inspectable `events.jsonl` projection, assignment decisions,
native solver receipts/bundles, and attempt-specific packets and receipts.
Successful completion also writes `completion.json` once, binding the full state,
events, recipe, packets and accepted receipts. `read_committed_state(run_dir)`
validates that record for inspection. Resume restores older or missing mutable
projections from it without redispatching accepted work, and records any mismatch
under `completion-observations/`. Corrupt completion evidence fails closed.
Completion records bind the original absolute run directory and source paths;
inspect archived JSON directly, or start a fresh run to reproduce execution.
Decision records distinguish the coordinator's observation time from the worker's
reported start and end. Input/attempt identities fence stale or late work.
Relative source paths are resolved only against `source_root`, itself relative
to the recipe directory; there is no current-directory fallback. The example
sets `source_root` to `..`. Absolute source paths are also supported.

The example has six logical workers and eight read-only extraction tasks over
one SHA-256-pinned Python module. A deliberately omitted declaration must be found
by another worker's review, repaired, then reviewed again. These are independently
executed worker rereads using a shared parser, not independent LLM judgments or
independent algorithm implementations. Artificial service delays are explicit;
source parsing and quote checks execute on real bytes.

Run the paired comparison, including a zero-delay control and a tuned static
allocation, with all raw evidence retained outside the checkout:

```sh
python -m experiments.rebalancer.benchmark \
  --recipe experiments/rebalancer/recipes/execution.example.json \
  --output /tmp/rebalancer-comparison --repetitions 5 --max-seconds 30
```

Dynamic and fixed allocation use the same native solver, job priorities, source,
lane eligibility and repair rule. Fixed allocation permanently restricts worker
roles. The additional tuned static control uses one extractor and two reviewers
within each lane. Run order is recorded. `comparison.json` and `report.md` separate
wall time, native solving, dispatch, worker computation and simulated delay.
The workload measures this local scheduling experiment, not agent throughput.

Platform and algorithm ownership remain separate: this change stays under
`experiments/rebalancer/` and does not merge the complementary branches or modify
their production files. See the [lane rules at the inspected revision](https://github.com/samuelpmahan/chainspot-toolkit/blob/e3e11fab5de1e4562487472585259435694d88bc/docs/agents/lanes.md).
The emulator uses POSIX `fcntl` locking; this implementation targets Linux/macOS.
Its time budget cancels cooperative emulator delays and joins workers before
releasing the coordinator lock. Native solver calls and filesystem operations
are not hard real-time operations.

Executed verification and measured comparisons are recorded in [RESULTS.md](RESULTS.md).

## Recorded manual run (preserved)

The packaged live run used **6 workers**, **38 packets**, **13 solver epochs**, and finished with **12 accepted final extraction audit records after 5 repairs**. Its final extraction receipts had **92 source quotes checked with 0 mismatches**. Each repair and review remained separately recorded. The native solver produced recommendations; a manual dispatcher executed those assignments. The run did not use a solver-controlled agent API, enforce FIFO, control worker performance, or measure throughput or speedup. Solver elapsed time is not task runtime, and coordinator dispatch/complete timestamps are acknowledgment/release times.
