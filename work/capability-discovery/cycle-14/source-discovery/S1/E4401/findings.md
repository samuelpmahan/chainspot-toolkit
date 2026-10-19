# E4401 — source-only actual FG consumer seam

Decision: HOLD actual `loadAttemptParts` integration. A bounded, reachable FG
provider-to-renderer seam exists, but it is not a runnable frozen native loader.
Root has selected S3's ranked-evidence bridge for prospective protocol/review;
this RENDER_PART alternative is UNSELECTED. Nothing here authorizes its source
construction or execution. I have not inspected or adopted the selected bridge.
No import, test, producer, rendering, pixel/CV/original query, dependency install,
network, repository/Git write, native state, or canonical receipt write occurred.

## Actual source and ownership

The delivered `isolated-batch/recipe.mjs:4-5,31` imports the frozen store plus
`enumerableBoard`; it does not import a native loader. `enumerable-board/board.mjs`
is an opt-in adapter over caller-owned trusted complete immutable boards. It
forwards has/get with receiver identity and supplies keys from a validated
snapshot of enumeration (lines 2-28). It cannot establish trust/completeness.

The actual FG consumer is already registered by every frozen `createPartStore`:
`source/fg/store.mjs:120-121,222-230`, `fn.q.part.render` (`RENDER_PART`). It obtains
the provider value through `store.get(args.a)` and calls the actual `renderValue`.
It has an address-local cache owned by each fresh store, not the shared cache.
`render.mjs:28-30,36-53,80-96` renders an ordinary scalar-field object to an object
containing a ledger of `{field,value}` rows. Absent image dimensions are explicitly
supported by store.mjs:177-179,227. This branch does not call pixel-set math,
image/CV/PATH math, PNG encoders, or alpha rendering, although those modules are
part of the static import closure.

The archived native consumer confirms this is a real FG default capability:
`source-evidence/s4-run.mjs:30,177-179` imports RENDER_PART and uses it to create
per-Part pages. Its loader at lines 50-59 makes a Map from deserialized S3 entries,
then exposes `{has,get,addresses}`; runner lines 145-152 pass that board to FG.
However the snapshot's imports at lines 28-40 resolve to missing sibling FG/port
modules in this frozen Lab. It is evidence, not a runnable loader package.
Neither this archived source nor active other-owner native code is to be changed
or adopted. The top-level native provider board is separately a TS PxC; it lacks
enumeration and is not an FG loader. `ports/late/s4.mjs` restores S3 entries into
compiled native PxC and immediately executes S4; it is not a safe small FG seam.

## Prospective exact probe (requires another scoped GO)

Use only the unchanged complete local frozen store closure and adapter below.
One new default-OFF test-only consumer Calculation is required, not a new query
or generic proof framework:

`inParts:[]`, `outParts:['tk.lab14.metadata.frame']`,
`calls:[RENDER_PART]`, calculation returns the exact `.value` from
`io.call(RENDER_PART,{a:'tk.lab14.metadata'})` at that output address.

This is explicitly a fabricated provider fixture, not producer output: each fresh
board owns one fresh frozen value `{schema:'lab14-metadata@1', label:'alpha'}`;
changed snapshot uses `label:'beta'`; restored snapshot has a fresh alpha object.
No raster/rgba/mask/px/coordinate field, buffers, file decode, original query,
production human-authority label, or native Attempt is needed. Each arm has its
own empty shared Map; all three phases within an arm share that Map and fixed
consumer source/codeSalt. Use a closure-derived salt including the test consumer
and eight-module store+adapter closure; do not change Lab12 salt or recipe.

Arms: (1) direct Map prior-working board contract control; (2) actual archived
loader shape `{has,get,addresses}` wrapped in enumerableBoard; (3) same raw
addresses-only shape as a negative control. Do not import the archived loader.
Do not claim this fabricated shape is loader execution. Before wrapper execution
in each fresh phase, optionally directly call actual RENDER_PART once to prove
that store's provider yields the expected alpha/beta ledger; account for this
extra invocation separately, or omit it and use an isolated no-shared-cache
renderer control. Never equate output-wrapper cache counts with render-local
memoization.

Primary oracle is exact full renderer value (kind/object, one ledger Part, rows
schema and label), not a numeric sum or hand-written renderer. Both valid arms
should give alpha -> beta -> alpha; wrapper keys A/B/A; cache false/false/true;
wrapper-triggered actual render calls 1/1/0. Raw addresses-only should give stale
alpha -> alpha -> alpha, keys A/A/A, false/true/true, render calls 1/0/0. A direct
fresh no-shared-cache renderer check on beta should produce beta, showing the
negative is outer reuse, not broken render dispatch.

Exact falsifier: if the raw addresses-only wrapper produces beta or changes its
key in phase 2 with no additional roots/constants/inputs/code/args, the predicted
root omission is false; stop and inspect. If Map fails to produce beta, HOLD the
experiment rather than accepting the adapter. If the adapter differs from Map
or does not restore the original key, HOLD reuse. A fabricated negative control
is not new production RED evidence. Direct render capability calls alone have no
shared output-cache key (`outParts:[]`), so testing them without the declared
output consumer would not exercise the reported root-inventory seam.

## Why the source predicts this

store.mjs:259-266 enumerates provider roots only through `keys()`, ignoring
`addresses`. Lines 270-276 content-key provider metadata. Lines 405-415 enforce
declared nested capability calls and include roots when calls are declared;
432-435 skip the consumer body on shared output-cache hits. Thus the unchanged
metadata root affects a complete Map/adapter key, but cannot affect the raw
addresses-only root digest. The renderer remains real and unmodified.

Prior working control evidence: CURRENT cycle13 records the old nine tests plus
new same-answer test passing 10/10; enumerable-board/board.test.mjs:29-46 already
contains the Map and adapted immutable 1->9->1 control, exact restore and warm
hit. This is prior scalar runtime evidence, not evidence this renderer probe ran.
The prospective renderer Map control remains unexecuted.

## Exact SHA256 pins

All relative source paths below are under
`experiments/capability-discovery/probes/root-inventory/source/` unless noted.

- fg/store.mjs: 122d624e0311e18f596db37bf292d9c31f47a364e75c8808ca6788c3449a3074
- fg/canon.mjs: 3cc0319f4678eaf8679adcbfaa9db054841417a966c079019b0f72e24ba24406
- fg/pxset.mjs: 01e68e82741d4af56901b3306a304ca540e8ab0d73a12ba20a0afbe0e788f5d5
- fg/render.mjs: 39a24a645c222430464592546eb6bdc1a8b190902ed5708ecd951b0bb639315a
- fg/png.mjs: 7668bab9de6a19a2cc6f44e5ac47d6e89373da130764365cf32011187a980241
- fg/alpha/alphaRender.mjs: 4d17e1da77b1e5ceb6a4a2609d26c010caa6c43df8392e9599544299d9e1c549
- contracts/alpha.profile@1.mjs: 9d1f316af6af2887e0c59bd7a2b0bc13d3305a817cfb6efffb42c8f3b238396f
- experiments/capability-discovery/enumerable-board/board.mjs: 66cc93a4e742fa8ed9b3cfcba94d0d936bf73c907007c21f1e7af59061e62ad5
- experiments/capability-discovery/enumerable-board/board.test.mjs: 86ea244841fb47feee1fcdfe6d0b1be8b1b194dbf5f7ab11a3e8afde854cd1ef
- experiments/capability-discovery/isolated-batch/recipe.mjs: 05182d53c3b03cce77b7601e0b14d8ff534462b63838651850c72316066b572f
- experiments/capability-discovery/probes/root-inventory/source-evidence/s4-run.mjs: d75b516f1a414adf050e4fd4c740110160d6331d3b6e9092bcfb9e2c90295166

The actual consumer closure is seven store-transitive local modules plus adapter
(eight), no profile.mjs. Existing recipe closure additionally includes recipe.mjs.
All are frozen Lab-owned snapshots. No external packages are required by this
prospective source consumer; canon uses browser JS rather than node crypto.

## Scope boundary

No runnable native FG loader with its complete consumers was found in the named
frozen source set. This is not a global absence claim. If Lab14 requires executing
the real native loader rather than invoking an actual frozen FG default consumer
over its documented board shape, explicit HOLD: obtain a separately approved,
source-pinned complete loader closure first. Do not silently reconstruct it,
reach into active other-owner work, or relabel a fabricated wrapper as native
integration. The proposed image-free renderer arm needs human/coordinator choice
before source construction or execution.
