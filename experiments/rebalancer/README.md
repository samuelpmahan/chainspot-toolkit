# Rebalancer experiment

This is an additive, opt-in Python experiment for scheduling bounded extraction and review packets with the native Rebalancer solver. It does not change ChainSpot detector, CV, or provider behavior and does not implement a dispatch service. The portable command-line wrapper consumes a declarative spec, writes state and solver outputs only to paths supplied by the operator, and leaves execution to a manual dispatcher.

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

## Recorded run

The packaged live run used **6 workers**, **38 packets**, **13 solver epochs**, and finished with **12 accepted final extraction audit records after 5 repairs**. Its final extraction receipts had **92 source quotes checked with 0 mismatches**. Each repair and review remained separately recorded. The native solver produced recommendations; a manual dispatcher executed those assignments. The run did not use a solver-controlled agent API, enforce FIFO, control worker performance, or measure throughput or speedup. Solver elapsed time is not task runtime, and coordinator dispatch/complete timestamps are acknowledgment/release times.
