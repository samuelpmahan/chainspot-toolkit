# Cycle11 — enumerable-board candidate, precommit

One bounded, default-OFF consumer adapter is written and independently accepted:
`experiments/capability-discovery/enumerable-board/{board.mjs,board.test.mjs,README.md}`.
This is a precommit package prepared under E4106. Its eventual ordinary Git commit
and actual native E4106 completion will postdate these frozen files and remain
external root proof; this package does not assert that either has happened.

Current scalar failure was independently confirmed against the unchanged Lab
public store, SHA256 `122d624e0311e18f596db37bf292d9c31f47a364e75c8808ca6788c3449a3074`.
Fresh loader-shaped `{has,get,addresses}` boards sharing a cache return stale1
after input1→9, despite different root keys. A Map control recomputes9. This is
not a missing-declared-input workaround: declared query calls use the store's
documented broad roots fallback, but that fallback sees provider roots only
through `keys()`. Actual native loaders/CV/raster behavior were not executed.

The thin façade snapshots only a trusted complete address enumeration, forwards
has/get with the original receiver and exact Part identities, and exposes fresh
`keys()` iterators. It rejects invalid/missing/duplicate/empty-string/missing-Part
enumeration visibly; a complete empty board is valid. No store, existing loader,
platform branch, default pointer or production integration was changed.

The desired original-loader regression genuinely failed `1 !== 9` before adapter
implementation; its source is inert `baseline.test.mjs.txt`. Baseline execution
JSON retains actual stdout/stderr strings, timing and exit1. Standalone baseline
text logs were reconstructed and had a known stderr transcription newline; they
are deliberately omitted here. After root flow review, ONE adapted run passed
6/6, exit0, direct stderr0B; ONE independent R4105 run also passed6/6, exit0,
direct stderr0B. Both preserve Map and wrapped-loader1→9→1, changed recomputation,
restored warm hit/query0 and unrelated explicitly declared-input work's warm
reuse. Four additional contracts are first-GREEN coverage, not manufactured RED.
Execution/source pins and direct output captures retain each run's own times.

R4105's original reviewer `result.json` used `outcome:accepted`; it is preserved.
The first finish helper rejected that envelope before copying a receipt or
making a native call. Separate `native-result.json` uses `decision:accepted` for
the same review; no test/review repetition is implied. Seven completed native
receipts, current spec and selected solves00–04 record allocation/outcomes.
No state/bundle/admin archives or other-owner large measurement arrays are copied.

The compact unselected-discovery bundle preserves exact findings/results/source
pins from E4101–E4103, including other-owner attribution. They do not authorize
reciprocal-rank adoption or another Lab10 measurement. Original pixels/queries
remain HOLD: separate frame-bound geometry/control/support authority is pending.

Applicability requires fresh stores per immutable board/Part snapshot, a shared
cache, and a trusted complete enumeration. Completeness is a caller precondition,
not proved here. No live mutation, hostile-provider sandbox, disk-CAS, raster,
CV, causal/support-equivalence, production-integration or performance claim.
Broad all-provider-root invalidation remains broad. Next guard is an owner/platform
consumer-integration proposal with independent review/handoff, not mutation of
another branch. Geometric-control work is separate and pending.

One self-excluding manifest pins selected paths, source custody, bytes and modes.
All pre-existing tracked files and the three ignored auxiliary files remain
outside this additive checkpoint and must stay byte/mode-identical.
