# E4203 — one complete-board byte-array probe

Outcome: `mixed_change`. The single authorized probe process exited 0. Its assertions PASS, confirming the frozen broad-invalidation prediction; this is **not observed RED**.

## Actual observation

Both the loader-shaped board wrapped in Lab11 `enumerableBoard` and the direct Map-global control produced identical values, keys, and cache-hit flags. Each arm used its own shared cache across three fresh snapshots; caches were not shared across arms.

| Phase, each arm | Per-root values | Aggregate | Query-caller computations | Synthetic query calls | Declared unrelated control |
|---|---|---:|---:|---:|---|
| Baseline | 100, 104, 108, 112, 116, 120 | 660 | 6 | 6 | computed |
| One changed byte | 100, 104, 109, 112, 116, 120 | 661 | 6 | 6 | warm hit |
| Restore original bytes | 100, 104, 108, 112, 116, 120 | 660 | 0; all 6 warm | 0 | warm hit |

Exactly one provider root content key changed: `px.synthetic.upload.2`, whose byte index 1 changed from 22 to 23 in a newly constructed Uint8Array. Nevertheless, **all six** query-calling producer keys changed and all six recomputed, including five whose own declared input bytes were unchanged. Each producer declared only its own root in `inParts`, but also declared the synthetic query in `calls`.

The no-calls aggregate declared the six produced Parts as inputs. It recomputed on change and hit the baseline cache on restore. The no-calls root-5 control declared only `px.synthetic.upload.5`; its key remained equal and it hit the cache during both change and restore.

## Meaning and limits

The complete enumeration fixes stale cross-snapshot query-caller reuse, but does not provide per-root query-caller cache locality on a global board. In frozen `store.mjs`, the outPart-producing call key includes `rootsKey()` whenever `spec.calls.length` is nonzero, not merely for a recognized query name. Here, restoring bytes reused all six old keys and skipped all synthetic query invocations.

This establishes a synthetic counterexample to the claim that own-root `inParts` alone preserve five unaffected query-caller cache hits on one complete six-root board. It does not establish partitioned-store behavior. Inference for the recipe author: a declared/no-calls leaf strategy, or actual root isolation across stores, must be considered separately if unaffected query-caller reuse is required; the latter remains unrun here.

Each snapshot allocated six distinct 4-byte Uint8Arrays. The probe retained byte lists, SHA-256 hashes, typed-view metadata, identity IDs, and root content keys; asserted post-computation bytes unchanged; and preserved identity through the wrapper. No live board or Part mutation was performed. Immutability is a caller convention, not enforced by freezing a typed array or by the façade.

## Custody and reproducibility

- Written-flow checkpoint and prediction preceded the only probe run. `prediction.json` SHA-256: `407f1c37d3a60bd4d9611c93bb53d6935dc66b9881be526c25b4de341024e837`.
- Source commit: `620e0d51efd3c93af4cf5ef0d4768b1cefa4c265`; tree: `20f6c92a1702d8e17e5ec8f4509334d294e420e7`.
- Frozen store SHA-256: `122d624e0311e18f596db37bf292d9c31f47a364e75c8808ca6788c3449a3074`; Lab11 wrapper SHA-256: `66cc93a4e742fa8ed9b3cfcba94d0d936bf73c907007c21f1e7af59061e62ad5`.
- Entry command actually executed: `node /workspace/scratch/afc0d51965a8/lab12/S3/E4203/capture.mjs`.
- Captured child command: `/opt/codex/runtimes/codex-primary-runtime/dependencies/node/bin/node /workspace/scratch/afc0d51965a8/lab12/S3/E4203/probe.mjs`.
- Child cwd: `/workspace/scratch/afc0d51965a8/lab12/S3/E4203`; Node `v24.19.0`; UTC start `2026-10-19T08:56:00.831Z`; finish `2026-10-19T08:56:00.909Z`; elapsed 78.760238 ms. This is a single tiny synthetic run, not a performance claim.
- Child deadline 20 s; output bound 5 MiB; actual stdout 176,578 bytes; exit 0; no signal/error; stderr 0 bytes. `execution.json` records exact command, clocks, status and output hashes.
- `stdout.json` retains all 72 actual call entries (24 synthetic query invocations, 48 producer/aggregate/control entries), keys/cache flags, manifests, keyspaces, values and per-array pins. `pins.json` records source import-closure and input-file byte/hash pins.

No source or Git writes, tuning, repeated green runs, real raster bytes, original/native query invocation, CV/image execution, other-repository execution, or production/default integration occurred. The frozen public store imports its static render/query support modules; no built-in query or renderer was called, and the probe asserted every invoked Calculation belongs to its explicit synthetic allowlist.
