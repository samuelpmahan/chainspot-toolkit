E509 runs the accepted unchanged source-pixel adapter once for each frozen course. Each supported invocation performs exactly two composition calls, ordered crop then original source. Both raw results and strict numerical comparison are in `*.receipt.json`; `*.run-sidecar.json` records actual arguments, full supported request/staged data/output hashes, code closure before/after and observed elapsed/resources. Full PNGs and staged RGBA arrays are external scratch inputs and are not part of the compact publication payload.

Recover original PNGs from platform ref `49255331791b1245cf0f9cd699816175f94e70f2` and paths `specimens/dev/NorthPark-full.png` / `specimens/dev/TowneLake-full.png`; use exact source descriptors for PNG, RGBA and Git blob identities. Supply the unchanged source repository and frozen D4 protocol SHA256 `56fdd556f4ed53599de93cadb35c85d453df4edde26f0d00a087d4d4282c65f2`.

For NorthPark, execute the frozen stager with these arguments, substituting only local filesystem paths:

```sh
python SOURCE_REPO/experiments/capability-discovery/source-pixels/stage-png.py --source NORTHPARK_PNG --expected-sha256 7da949829ce487eba4cb0060f80589c652716239973b395c8f7fc3ceb56617f6 --image-id NorthPark-full --frame NorthPark-full:original-1290x2796 --out NEW_SCRATCH/NorthPark-full.staged-source.json
node E509/run-trial.mjs --repo SOURCE_REPO --protocol FROZEN_D4_PROTOCOL --source NEW_SCRATCH/NorthPark-full.staged-source.json --descriptor E509/NorthPark-full.request-descriptor.json --out NEW_SCRATCH/NorthPark-full.receipt.json --meta NEW_SCRATCH/NorthPark-full.run-sidecar.json
```

For TowneLake:

```sh
python SOURCE_REPO/experiments/capability-discovery/source-pixels/stage-png.py --source TOWNELAKE_PNG --expected-sha256 da2a0ccca4e017cfa9a31d59882903c51905e57b7b21d55b513d788dcf7c18ed --image-id TowneLake-full --frame TowneLake-full:original-1290x2796 --out NEW_SCRATCH/TowneLake-full.staged-source.json
node E509/run-trial.mjs --repo SOURCE_REPO --protocol FROZEN_D4_PROTOCOL --source NEW_SCRATCH/TowneLake-full.staged-source.json --descriptor E509/TowneLake-full.request-descriptor.json --out NEW_SCRATCH/TowneLake-full.receipt.json --meta NEW_SCRATCH/TowneLake-full.run-sidecar.json
```

Output creation is exclusive. Do not overwrite retained receipts or change descriptors, coordinates, banks, settings, crop sizes, masks or source pixels. The CLI uses `JSON.stringify(receipt,preserveNonFinite,2)`; no nonfinite channel becomes silent null. Receipts preserve every learner row, raw profile, visible count, candidate lane/rail/interior/combined field, fit/null, midpoint/UNKNOWN and source/crop difference.

`analysis.json` extracts the original-source raw rows and arithmetic comparisons from exact receipts. `analyze-render.py` plots stored profiles/rows and frozen source crops; it performs no CV scoring or fitting. Figures use display scaling only. The rendering script currently expects the retained protocol and raw integer crops one directory above E509. Use their exact original hashes from the E504 manifest if regenerating figures; do not use an annotated figure as computational input.

The historical NorthPark premeasurement figure footer incorrectly named TowneLake; `display-erratum.json` retains the exact old figure hash and correction. Old figure/protocol/manifest bytes remain unchanged. New actual figures carry per-course caveats. Resource sidecars measure the actual Node process; adapter elapsed excludes staging and JSON parse/write. No allocator speedup, accuracy, path identity, physical width or calibrated policy follows.
