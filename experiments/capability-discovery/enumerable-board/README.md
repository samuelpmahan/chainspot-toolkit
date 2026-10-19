# Enumerable board (default OFF)

Explicit opt-in only: `createPartStore({base: enumerableBoard(board), cache})`.
No existing loader, store, production pointer or active branch is changed.

`enumerableBoard(board)` is a thin façade over existing `has` and `get` methods,
called with their original receiver. Returned Part values keep their identities;
no values are copied. It snapshots the address list only, supplies a fresh `keys()`
iterator per call, and freezes the façade/list. Existing iterable `keys()` (Map)
is supported; otherwise the loader must supply an `addresses` array.
Missing methods/enumeration, invalid/empty-string addresses, duplicate entries,
or enumerated addresses absent from `has` throw visibly. An empty board is valid.

Precondition: the caller supplies a **trusted complete enumeration and immutable
board/Part values**, with a fresh store for each board snapshot and a shared
cache across snapshots. The façade cannot prove completeness or immutability;
freezing it does not freeze the original board. This is not live mutation
support, a hostile-provider sandbox, a cache/store patch, or raster/CV proof.
Query-calling Calculations without declared query `inParts` still use the store's
broad all-provider-roots fallback; fine-grained query dependency work is separate.

Run bounded scalar tests: `node --test experiments/capability-discovery/enumerable-board/board.test.mjs`.
The tests import the unchanged frozen public store in `probes/root-inventory/source/fg/store.mjs`.
The original loader-shaped baseline and its actual stale `1 !== 9` failure are
preserved separately in E4105 evidence. Adapted tests retain the same regression
assertions, Map `1 -> 9 -> 1` control, restored warm hit, and unchanged explicitly
declared-input work's warm reuse. Additional contract tests are first-GREEN
coverage, not manufactured missing-module RED evidence.
