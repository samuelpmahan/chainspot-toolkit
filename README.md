# NCTK ChainSpot source packet

Start with [REVIEW.md](REVIEW.md). From a fresh verified extraction, `node replay.mjs` runs the existing S7 baseline and composed S5-heading probes and prints receipt-derived metrics plus the three state views. `node toolkit.mjs neat --files targets/s7-baseline.json,targets/s7-heading.json` creates an immutable source checkpoint; `node toolkit.mjs package --out NEW_DIRECTORY` stages its exact closure for the existing `root_sync.py` ZIP / `localci_test.py` fresh-extraction sequence. The full pinned provider bundle is the dependency granularity; this is not a per-CV-function fetch.

The existing ZIP transport scripts are a separately saved dependency, not bundled here: [root_sync/LocalCI command and agent queue guide](https://drive.google.com/file/d/1J_UHymYzkV5aeBAUWlGLLoC0oJUoELz9/view) and [tool source ZIP](https://drive.google.com/file/d/1VWuAEZkB4XLtZnpTnKAPFsakvPMmCUqk/view), SHA-256 `d32a8a7a3c36e763bfc650ced2fd1beb621100c2565b0811053f966ebeef97f0`. `node replay.mjs` requires neither transport script when the source packet is already available.

The additive, opt-in [semantic equality probe](semantic/REVIEW.md) compares the selected sealed S6 row under named versioned equality Contracts. `node --test semantic/equality.test.mjs` and `node semantic/probe.mjs source/chainspot-teams/s7/input/IMG_5641-rows.json` run from this extraction root. The strict hash policy remains the default; the native comparison records why equal parsed geometry does not make row-byte-bound receipts equal.

The additive, opt-in [native Rebalancer experiment](experiments/rebalancer/README.md) schedules extraction and review packets with explicit external state/output paths and a manual dispatcher; it does not alter provider or CV behavior.
