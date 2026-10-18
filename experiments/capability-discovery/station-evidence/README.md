# Registered station evidence — standalone, default OFF

This fixed synthetic8 experiment reuses the existing `createPartStore`, `registerQueries` and `PATH_QUERIES` unchanged. It is measurement orchestration, not a new detector, CV algorithm, ABFeature, threshold, or production entrypoint. Nothing enables it automatically. Lenard/original-image profiles and rendering are not implemented here.

## Module boundary

```js
import { runStationEvidence } from './recipe.mjs';
const disabled = await runStationEvidence(); // no source/pixel inspection/import/store/query
const run = await runStationEvidence(request); // enabled:true and exact fixed request required
```

An enabled request has exactly `schema:'cycle05-registered-station-request@1'`, `enabled:true`, `protocolId:'synthetic8'`, `protocolSha256:'3b7f1d2b166c759997c73f820c433ff653c84114e83c28af62c68ec003967ff5'` and `comparisons`. `syntheticDeclarations()` returns detached metadata for the exact eight comparisons; the caller adds exact Uint8Array `rgba` and supplies `mask:{data:exactUint8Array,sha256}`. `rgbaSha256` and all geometry/provenance fields are already declared in that metadata. Buffer/subclasses, sparse/accessor/custom objects, unknown fields, empty banks/windows/cases and changed settings/bytes are refused before product import. The current preset requires a non-null binary mask for all eight cases; literal null is not silently replaced by an all-zero plane. Future null-mask/Lenard support requires a separate admission.

The exact F4 protocol and inventory define RGB100/145 raw inputs, dimensions384x320, frame `cycle05-F4-synthetic384x320-integer-pixel-centers`, nominal width30, origin[192,160] except normalOffsetPlus6[192,166], heading0 and arange[-8,8) step1. Order is intact, gap2, gap6, largeBrightEllipse, organicCapsule, normalOffsetPlus6, maskedGap6, allHidden. No fixture generator, PNG decoding, image normalization, alpha muting, inferred masks, width/pose search or recentering is included.

`inspectStationRequest` checks the actual closed input domain/hashes without product imports or calls and returns only metadata/plan. `planSyntheticQueries` exposes the fixed public request plan; `verifySourceClosure` only rehashes the nine pinned physical files. Neither runs CV. API protocol/file fields are caller declaration; the CLI separately records files it actually reads. No claimed encoded-PNG verification is invented.

## Actual execution flow

1. Check only the own enabled data property. Missing/false returns DISABLED immediately; other types/accessors are invalid without evaluating other getters.
2. Validate exact request/case metadata, safe bounded dimensions/length/work, dense data descriptors and actual RGBA/mask hashes. Copy metadata; no product imports occur. Initialize every planned row NOT_ATTEMPTED.
3. Make a private first-case RGBA/mask snapshot and hash it. Verify all nine frozen modules, dynamically import the actual store and PATH table, and rehash the closure before creating any store. This follows R1110/root's corrected guard order, not the mistaken normative flow-list ordering.
4. Per comparison, keep one fresh private raster/mask, `base:null` store/default cache and registration-local answers Map. Register one lazy `fn.input.stationMeasurement` with outParts ordered `px.image.cropped`, `tk.s6.pathMask`; register the unchanged PATH table. Do not eagerly get/has either Part.
5. Call profile once, then edgePair, stationContrast and loss for literal width30. Only raster/mask reference strings enter registered query args; identity/metadata strings stay outside. Public edgePair computes another profile; loss repeats contrast and adds samples/brightness proxy/corridor. No direct low-level call or cached-repeat query is added.
6. The first profile lazily materializes the combined constant. Capture each native onCall entry immediately using the lossless codec, in callback completion order, not seq order. Source-derived successful order per fresh store is seq[1,0,2,3,4], with seq reset per comparison. Actual counters are incremented from attempts/completions/captured entries, never filled from predictions32PATH+8constant=40. Native query-entry key/cached fields remain distinct from returned emits and entry emits.
7. Detach the complete native answer before any normalization. After every attempted call, rehash private bytes, then read existing Part provenance keys without forcing production. Preserve thrown calls, prior raw outputs/logs and all later NOT_ATTEMPTED rows; stop on first error. Rehash original supplied bytes and module closure after the attempted run. No private raster, mask, store, Part value or cached-answer buffer escapes.
8. Return `{valueTrace,sidecar,fragments}`. The value trace has only hash-bound input identities (not giant input RGBA/mask arrays), ordered planned calls, raw detached native answers, actual counters, integrity results and UNKNOWN claims. Timing/native logs are separate. Fragments retain already successfully encoded answers/callback captures if full output encoding fails; they are not additional queries.

The only new runtime imports before the enabled gate are Node filesystem/crypto/performance and the pure codec; no product module is statically imported. Nine exact paths include both physical alpha-contract copies. Source hashes do not attest execution or defeat adversarial concurrent source replacement, and host ESM caching is not content-cache verification.

## Codec and artifacts

`encodeBytes(value)` emits UTF8 `JSON.stringify(E(value))+LF`; every value is a tagged array, so native tag-looking data cannot collide. Finite numbers, NaN, both infinities, negative zero, null, booleans/strings, dense arrays, plain/null-prototype objects and exact Uint8Array are supported. Typed arrays retain constructor/length/elements; `__proto__` is safely defined as data. Unsupported prototypes/constructors, undefined, accessors, symbols, sparse arrays, cycles and malformed tags are refused rather than normalized. Value-tree identity does not preserve alias/backing-buffer identity or descriptor flags.

Depth32,500000 tagged nodes,1000000 aggregate typed bytes and32MiB encoded-value cap are hard limits; individual callers can only lower codec limits. Timing sidecar is capped4MiB. Recipe caps are fixed, stricter than arbitrary finite input:8 comparisons,1 width30,16 stations, fixed raster491520 RGBA bytes and122880 mask bytes per case, bounded source-derived profile/contrast/corridor work. Modeled allocation/work is not measured process memory, sample instrumentation or speedup.

The CLI accepts only a synthetic raw-stage file manifest with literal `enabled:true` and the explicit `run` subcommand; there is no `--enable` flag. Paths resolve relative to that manifest. Before any query it reserves an exclusive NEW output directory; every file uses exclusive creation. It reads five fixed raw RGBA files and three fixed masks, not PNGs:

```sh
node experiments/capability-discovery/station-evidence/cli.mjs run --manifest FILE.json --out NEWDIR
```

```json
{"schema":"cycle05-station-files@1","enabled":true,"protocolId":"synthetic8","protocolPath":"PATH_TO_F4/protocol.json","inventoryPath":"PATH_TO_F4/inventory.json","fixturesDirectory":"PATH_TO_F4/fixtures"}
```

Only exact pinned protocol/inventory/raw-stage hashes are accepted. The output persists already-encoded fragments first, followed by tagged `value-trace.json`, tagged `timing-sidecar.json` and external `artifact-manifest.json`. Trace/sidecar exact bytes are hashed separately, without a self-hash cycle. Failed encodes/outputs retain failure artifacts and available fragments, never a producer retry. Rendering is separately owned scratch trace-only tooling; it must not import CV or reread source pixels.

Outer `query` intervals include callback codec/capture overhead. Native entry `elapsedMs`/`computedMs` remain separate actual fields; neither is presented as a matched speedup or an isolated CV cost. This CLI currently does not invent unobserved input/read/encode/output interval timings.

## Meaning and current gates

Preserve every profile/count, fit/condition, side contrast AND validity, native null/nonfinite value, full loss field and typed corridor. Public profile already converts its NaN samples to null; the codec does not recover nonexistent raw values. Contrast's along±2 smoothing and native bilinear masks are unchanged. Masked/invalid evidence is not visible failure; a masked station terminates native loss gaps. Zero longestGap with zero visible count does not prove continuity. The no-profile overlay channel is WHITE brightness PROXY, not alpha; tau8 is historical diagnostic and threshold is null.

All channels share source pixels and are dependent, not independent confidence. Capsule/brightness agreement, fitted edges and width do not establish path/same-edge identity, physical gap/continuity, accepted width, endpoint ownership, renderer/AA or scale. `promoted:false`; physical/path/calibration/scientific/human acceptance remain UNKNOWN.

E1111 is provisional source construction. Tests were written first; no import/test/producer ran before the root-reviewed actual-flow checkpoint. Root then admitted codec/recipe NON-CV tests: first actual run40/40 pass, exit0, no red observed and no repair. F5 separately reports CLI syntaxcheck exit0 and CLI tests2/2 pass, exit0, no repairs, limited to disabled writer/missing-manifest behavior. This is not a completed red-before-implementation TDD claim or a whole-repository green result. No valid enabled run, vendor/store import or CV/query has run through this module at that boundary. Independent source review and a separate root fixed-producer packet remain required. Existing2062 tracked files and accepted composition/source-pixels/group defaults remain unchanged. No Git commit/push/PR/main/deploy/default-ON is included.
