# Isolated batch (default OFF)

Explicit synthetic consumer recipe: `isolatedBatch(sixUint8Arrays, { cache })`.
No existing store, loader, production pointer or active platform branch is changed.

Each call creates six independent fresh single-root stores, not branches. All use
fixed local root/Calculation/output addresses and the existing unitful query-table
mechanism. A seventh fresh store consumes six fixed-order bridge Parts through
declared inputs and `calls:[]`. Bridges contain exactly `{value,unit,sourceKey,
producerKey}`: this is an explicit lineage-bearing bridge, not transplantation of
the leaf stores' provenance graphs. Output is ordered byte-value sums plus total
and upload count; it is not an image stitch or geometry result.

Use one shared cache across immutable snapshots. Actual recipe and complete local
import-closure source bytes determine `codeSalt`, identical across snapshots and
independent of input data. Query math/helpers and bridge/aggregate logic are inside
that closure. `closureParts` exposes source pins; returned records expose effective
code keys, source/producer keys and ordinary Calculation call logs. Source files
must remain unchanged after module load; this is Node-only, not a browser bundle.

Caller contract: exactly six trusted ordinary Uint8Array values; no mutation of
their bytes, backing buffers, cached answers or bridge values, including transfers
or detach. The facade freezes enumeration, not typed-array bytes. Recipe summaries
and bridges are frozen; cache/returned instrumentation are trusted in-process data,
not a hostile-provider sandbox, disk-CAS or live mutation protocol. Equal byte
uploads may share a leaf computation but retain all six ordered slots.

The frozen test fixture is bytes1–18: totals171 →234 after slot3 `[7,8,9]` becomes
`[70,8,9]` →171 restored. Selective reuse expects leaf computations/query calls
6→1→0 and aggregate miss/miss/hit. Same-fixture complete whole-board Map and wrapped
loader controls correctly remain broad, 6→6→0. Any nonempty declared `calls`, not
only query names, triggers that unchanged all-provider-roots fallback. Isolation
narrows its root set; this does not add fine-grained query dependency tracking.

Bounded allowlist (never a root glob):

```sh
node --test experiments/capability-discovery/isolated-batch/recipe.test.mjs experiments/capability-discovery/enumerable-board/board.test.mjs
```

The locality assertion first failed against the original global-board composition
(`6 !== 1`), before this recipe existed. Its original source/raw execution are
preserved separately in E4205. Other tests are FIRST-GREEN contracts/controls, not
manufactured RED evidence. This fixture differs from E4203's earlier 24-byte probe;
E4203 predicted broad behavior and passed, so it is not the RED regression.
No native queries, images/raster/CV, production integration, performance, real
stitching, code-change/view/equal-answer experiments or pipeline/default claims.
