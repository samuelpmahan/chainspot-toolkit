# Ranked evidence (default OFF)

This opt-in consumer experiment uses the frozen CommonJS `assignment.ranking`
operation through its actual `executeCompiledPlan`, actual calculation binding,
fresh ExecBoards, and actual hashing memory sinks. No comparator/ranker is copied.
The one-operation plan has a fixed explicitly synthetic fingerprint; paramsHash
is omitted. It does not identify real image input. No selection, geometry,
scoring, routing, image/pixel/CV query, decode, installation or rebuild is needed.

Observed: ONE baseline capture passed3/4 and failed exactly on missing ranking
materialization, not a missing import. Only then was the29-line adapter added.
ONE author bridge capture and ONE independent capture each passed4/4; ONE explicit
four-file regression passed14/14, retaining the old10 Lab11/12/13 cases. All runs
used the reviewed code and448 frozen dependency pins; each loaded67 CommonJS
modules matching the independent static closure. Direct stderr was empty.
This fills a missing consumer-evidence capability, not a ranking/core defect.
Exact raw captures, source pins, review, commands and limits are retained in
`work/capability-discovery/cycle-14/`; no prior raw was relabeled or overwritten.

`withRankedEvidence(runtime)` and explicit `enabled:false` return the original
runtime. Only `enabled:true` copies the runtime/extractor table and materializes
the already-produced Map. The validated runtime is this pinned native operation
runtime. ON replaces any existing `assignment.ranking` extractor in the copy;
arbitrary custom runtimes or composition with an existing ranking extractor were
not validated. Original provider/registry/defaults remain unchanged.

## Exact fixture and visible result

S6's four complete finite JSON-safe ScoredPairEvidence rows, in input order:

| Row | Group | A score | B score | supportMean |
| --- | --- | --- | --- | --- |
| fixture-a2 | fixture-badge-a | 0.6 | 0.65 | 0.4 |
| fixture-b1 | fixture-badge-b | 0.8 | 0.8 | 0.5 |
| fixture-a3 | fixture-badge-a | 0.6 | 0.6 | 0.8 |
| fixture-a1 | fixture-badge-a | 0.9 | 0.9 | 0.5 |

Every other raw/factor field is explicit and fixed in `fixture.mjs`; input rank0,
two empty legs, all unused measurements0, efficiency1, nine factors0.5. These are
fabricated records, not native producer evidence or physical endpoint truth.
All three independent deeply frozen A/B/A2 snapshots exist before execution.
Group order is a,b. A/A2 rank a1,a3,a2; B ranks a1,a2,a3; b1 stays alone. Winners
remain a1,b1. Complete nested expected rows are independently stated in the test.

ON capability: one gateway-emitted `candidateSet`, ID
`lab14.assignment.ranking.alternatives`, JSON
`{schema:'lab14-ranked-alternatives@1',groups:[{badgeId,rows:[FULL rows]}]}`.
Preserve Map iteration, every row/raw/factors/score/rank, with no re-ranking or
Map write. Preconditions are these complete finite JSON-safe rows, not arbitrary
Maps, typed arrays, undefined/NaN/Infinity values, or hostile inputs.

The shared oracle observed nonempty real sink hashes: A != B, A == A2, for both
artifact SHA and PCR runResultId. Full JSON must equal the hand-derived complete
rows. Existing OFF has no artifact/Map probe and equal PCR IDs by its disclosed
opaque-output limitation. A test-only winner-row projection is sent through the
same real gateway/sink/PCR and must fail the same alternative-change hash oracle.
Empty/single/lexical-tie/missing-input checks are FIRST-GREEN characterizations;
the four-row fixture also protects support tie-breaking. They are not new REDs.

## Dependency gate and replay

Before any provider require, the helper verifies a separately frozen manifest of
all445 existing alg/dist files plus provider package/lock and the alg CommonJS
package boundary. No missing module may be installed or substituted. It records
actual CommonJS required modules with hashes after execution and rejects anything
outside the manifest. Module loading is not permission to execute imported CV.

From the Lab root, using the packaged frozen manifest and a new output directory:

```sh
node experiments/capability-discovery/ranked-evidence/capture.mjs --arm bridge --out NEW_ABSOLUTE_DIRECTORY --manifest work/capability-discovery/cycle-14/dependencies.json --manifest-sha256 b0094d7dae7171370cc1aa4c8b62f7034472d1e5cfdeaa20f56a58e7441fc324
```

The capture launches exactly `node --test` with this single absolute
`integration.test.mjs` path, timeout20s, max5MiB per stream, and explicit arm/env.
It refuses existing output directories/files, preserves direct stdout/stderr,
actual command/status/times, before/after source pins, runtime testimony/PCR,
exact artifact bytes, and required-module hashes. Later `--arm bridge` explicitly
loads the adapter; `--arm baseline` reproduces the intentional missing-capability
failure using the unchanged runtime and never imports it. Unavailable dependencies or source
mismatch are HOLD, not the desired missing-capability failure.

No current loader, provider, core, registry/default, Lab11/12/13 predecessor,
other-owner source, native state or canonical receipt is changed. The observed
runtime evidence is limited to these fabricated finite JSON-safe rows and this
one operation. No native-loader integration, selected endpoint/ownership truth,
performance, original-query, scientific acceptance or deployment claim follows.
Original pixel/44-query HOLD remains unchanged. README finalization is docs-only;
the executed adapter/fixture/test/capture bytes remain unchanged.
