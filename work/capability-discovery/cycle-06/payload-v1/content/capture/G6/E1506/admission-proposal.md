# E1506 — admission proposal (canonical compact handoff)

Status: HOLD. No implementation, tests, vendor imports, CV, source freeze or Git mutation admitted by this file.

Goal: add a fixed default-OFF Lenard5 orchestration sibling without changing any of2523 old tracked files, seven station files, nine query modules, CV math, defaults, geometry or thresholds. Exact E1104 SHA256 cb4d757f36ffe6721e71541d6093a48cc11e081bd10c1684746aad8249973829 remains authority; G2 found no mandatory amendment. G1 input testimony awaits independent acceptance, not reinterpreted as G6 decoding.

## Canonical directory and ownership

experiments/capability-discovery/lenard5-station-evidence/

| Files | Proposed implementation owner |
|---|---|
| recipe.mjs, recipe.test.mjs, README.md | G6 |
| cli.mjs, cli.test.mjs | G5 only after explicit root/native handoff |
| all local Git/integration/source freeze | G6 only |

Until that handoff G6 remains sole source owner and nobody edits. No overlapping paths. CLI worker must use the exact seam below; root reconciles before any run.

## Exact proposed seam

recipe.mjs exports:
- lenard5Declarations(): detached fixed16 metadata, no reads/imports.
- planLenard5Queries(): detached fixed160 plan, no reads/imports.
- inspectLenard5Request(request): file-backed preflight returning identities/plan/error only; no vendor/store/query and no plane escape.
- runLenard5Evidence(request): asynchronous default-OFF runner returning {valueTrace,sidecar,fragments} exactly compatible with unchanged createArtifactWriter.

Request is exactly {schema:'cycle06-lenard5-request@1',enabled:true,manifestPath:STRING}. Missing/false own enabled returns DISABLED before unrelated properties/timing/reads/imports. Accessor/nonboolean enabled refuses without getter execution. Small objects require exact own enumerable data properties and ordinary prototypes; reject unknown/symbol/hidden/accessor/custom fields. No externally supplied rgba/mask/comparisons/geometry/typed arrays are accepted.

File manifest is exactly {schema:'cycle06-lenard5-files@1',enabled:true,protocolId:'lenard5-fixed16',protocolPath:STRING,inputAttestationPath:STRING}. Resolve paths relative to manifest. Pin exact protocol and reviewed G1 attestation digest9f1cb90eed3c74214c9a03029730ea1ab487c48bd86b89cbe3a701eebe923ef1. Read fixed actual PNG3943106, RGBA14427360 and binary mask3606840 bytes/digests from that authority; no PNG decode. Encoded-byte verification, raw-byte verification and decoder testimony are distinct. G1 attestation's absolute paths remain literal; later portable companion is a separate frozen identity, never silent rewriting.

Resource-safe loader: open regular file, fstat exact/max size, readSync into exact internally constructed Uint8Array with bounded loop+one-byte EOF test, close in finally. Metadata bounds manifest8192/protocol131072/attestation131072 and strings4096; protocol/attestation also exact12718/4252. No Reflect.ownKeys on full byte planes, no readFileSync growth allocation, no external typed-array acceptance, no weakened custom-property rejection. Hash/scan once per loaded canonical plane; snapshot/hash privately once per comparison sequentially; per-call/postchecks as below. Full inputs never enter codec.

CLI grammar: node experiments/capability-discovery/lenard5-station-evidence/cli.mjs run --manifest FILE.json --out NEWDIR. G5 imports runLenard5Evidence and unchanged station-evidence/cli.mjs#createArtifactWriter. Reserve NEW output BEFORE invoking runner. Pass closed request. No generic flags or extra loading/export needed. Reuse writer's legacy outer cycle05-station-artifacts@1 honestly; new inner cycle06-lenard5-trace@1 and cycle06-lenard5-sidecar@1, protocolId lenard5-fixed16. Optional required new cycle06-lenard5-cli-receipt@1 written wx binds actual emitted manifest/files/status; actual exit is outer process evidence. Writer is one-shot exclusive retained-prefix best effort, not atomic/durable/all-fragment guarantee. No retry.

Writer shape:
valueTrace has status/error plus fixed plan/raw rows/counts/requestBinding/sourceBinding/inputIntegrity/UNKNOWN claims.
sidecar has schema/runtime/intervals/calculationLog/status/error.
fragments.answers = [{comparisonId,planIndex,bytes:exactUint8Array}].
fragments.calculationEntries = [{comparisonId,captureIndex,bytes:exactUint8Array}].
No full input buffers; output native corridor Uint8 arrays remain raw.

## Fixed actual-flow contract for later implementation review

enabled -> small request -> bounded manifest/protocol/attestation/input hashes ->160 NOT_ATTEMPTED plans -> first private snapshot/hash -> reuse nine-module verifySourceClosure -> dynamic actual PartStore/PATH import -> rehash before stores ->16 sequential fresh comparison scopes -> supplied/file/source postchecks -> result -> unchanged writer.

At most one reachable current private raster/mask/store/cache; canonical loaded pair retained once. Null for12 windows, exact strip for4, never zero substitute. Every comparison registers one lazy combined raster then mask Part constant, including null-valued mask; raw mask arg is Part reference resolving to literal null. Fresh base:null store/default cache/registerQueries map per group/window, all three widths within it. No eager get/has/keyOf, direct CV helpers, width search or cache repeats.

Order frozen: groups primary/bright-nonpath/normal-plus6/masked-primary; windows before16/core16/after16/long48; profile once then edgePair/contrast/loss for34, then42, then50. Geometry/settings literal E1104, edge tol2 and tau8 historical diagnostic, threshold/profile null. No fit feedback/recentering.

Immediate tagged raw onCall capture in actual completion order; expected seq[1,0,2..10] is prediction only. Preserve native null/nonfinite/-0/Uint8/conditions/unit/emits/key/cached and distinguish actual attempts/completions/captures. Stop first error; preserve earlier fragments and later NOT_ATTEMPTED. Completed query with later encode error remains completed. Hash private inputs per attempted call and post; original files/source postchecks do not erase first failure. Host ESM cache/hash-time identity limits explicit.

## Proof gates, not executions

1. Write tests first. Obtain actual-flow test-only checkpoint before admitted red runs where meaningful; do not invent red. All current tests NOT_RUN.
2. Implement only five new paths. Present actual code-flow checkpoint BEFORE syntax/import/test/run/render.
3. On separately scoped admission: NONCV descriptor/no-work tripwire, fixed160 plan/detachment, closed-file/actual-hash/refusal/null semantics, bounded loader, fabricated codec/cap/partial-writer tests. No positive enabled gateway/store query baseline. Source mismatch test only admitted disposable stage or NOT_RUN.
4. Different reviewer accepts source/API/resource/null/stop paths and original2523/seven9 preservation; exact new source freeze. Only then root may separately admit fixed producer/replay/render/package/Git/publication.

Source-derived only:16 stores +160PATH+16constants=176entries; aggregate corridor typed294912bytes fits typed1m arithmetically, not proof of node/file/sidecar budgets. Keep codec depth32/node500000/typed1000000/file33554432, callback/sidecar4194304 unchanged. Fabricated bounded shapes must establish encode budgets before producer; never raise/drop/retry. Canonical pair18034200bytes + one masked private pair/luminance46888920 =64923120 named reachable typed bytes before substantial overhead. Not RSS bound; GC residency and codec/store overhead remain unmeasured.

## Preservation and known limitations

base-tracked-inventory.json records exact2523 paths/modes/blob IDs/lengths/SHA256, all current blobs/modes match HEADbe67d44a/tree87dfd9ae. All392 cycle05 package and seven source bindings match. Preserve original inventory and rehash against it at each gate, only allowed additions; no root-repo metadata edits.

Historical root source-manifest path-mapping diagnostics and7 pre-existing discrepancies are preserved in separate receipts, not repaired or called new failures. No full-repository green claim. Detailed optional rationale is in architecture-proposal.md; this compact file is canonical admission scope.

Scientific/path/physical-edge/continuity/calibrated-width/geometry/human identities UNKNOWN, promoted:false/heldout:false. Shared pixels/windows are dependent; capsule collision retained. Masked/invalid is not visible failure, zero-visible/gap0 not continuity, WHITE brightness proxy not alpha.

Coordinator call requested: admit this exact five-file split and bounded implementation/checkpoint scope under existing autonomous authorization. Status: HOLD.
