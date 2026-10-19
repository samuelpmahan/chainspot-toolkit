# Saved ranked inspector — explicit opt-in

Inspects existing saved Lab14 `candidateSet` bytes and their captured refs,
receipt and PCR testimony using Node builtins only. No provider import, ranking,
PCR recomputation, image access, CV, selection or geometry claim. Nothing invokes
this by default; the archived E4413 audit and all producers remain untouched.

```sh
node experiments/capability-discovery/ranked-inspector/cli.mjs --runtime /ABS/green/runtime.json --artifacts /ABS/green --label desired-bridge-A --format json --out /ABS/NEW_DIRECTORY
```

All five flags are required. `--format` is `json` or `tsv`; output directory must
be new, absolute, and have an existing parent. Existing output is never merged
or overwritten. JSON retains the complete admitted payload plus a separate
explicit display subset. TSV is only that labelled subset and recorded provenance.

`inspect({runtimePath, artifactDir, recordLabel})` selects exactly one captured
record. Its standalone artifact filename follows the existing capture convention
`artifact-RECORDINDEX-0.json`. It does not dereference the captured `memory://`
URI. It requires the specific ranking ID/kind, exact ref association to the
receipt, matching PCR Tick testimony and output address, exact saved bytes equal
to captured base64 and SHA-256, and parsed content equal to captured JSON/schema.
Complete payload comes from those bytes, never `record.ranked` or a fallback.
No reordering, reconstruction, rank computation or full schema framework occurs.
Here, admission means saved-byte/ref/capture consistency, not independently
authenticated capture, upstream alternatives completeness, fixture role, full
row-schema validation, or scientific acceptance. Winner-only controls use the
same schema/ID; a consistent capture is not thereby a complete alternatives set.

Results distinguish `admitted-nonempty`, `admitted-empty`, `unavailable` (including
no materialization or unavailable saved bytes), and `incompatible` associations.
Declined results expose no admitted payload/rows. CLI writes the status report
and exits1 for declined evidence; admitted evidence exits0. Recorded PCR identity
is carried as provenance, not recomputed or independently authenticated. Inputs
remain trusted captured finite JSON-safe rows, not hostile-provider proof.

The test was written first. One actual archived E4413 invocation with supplied
paths failed the desired exit0 assertion because it opened its obsolete fixed
BASE instead (ENOENT). This is missing portable inspection capability, not a
ranker/core/security defect. One author focused run passed4/4, and an independent
reviewer accepted the same executable bytes after one overlapping focused4/4
run. These are four cases checked twice, not eight distinct cases. Direct test
stderr was empty. Further boundary tests are FIRST-GREEN characterization, not additional REDs.
The empty fixture is explicitly fabricated consumer-shape bytes/refs/testimony;
it is never native-produced evidence or a newly executed empty producer receipt.
The author suite made three CLI calls (A JSON, same-output refusal, A TSV);
two supplemental B JSON/A2 TSV calls and one independent A JSON call also
completed. No Lab14 producer or geometry/CV test was rerun. See
`work/capability-discovery/cycle-15/` for exact commands, raw evidence, scope and
retention qualifications. This final README update is documentation-only;
captures preserve the earlier README hash and the unchanged executable hashes.

Bounded test command (after checkpoint authorization):

```sh
node --test experiments/capability-discovery/ranked-inspector/inspector.test.mjs
```

Original pixels/CV/44-query HOLD, consumed E2021/old160grid prohibition, and all
production/default/other-owner/HH boundaries remain unchanged.
