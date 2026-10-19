# E4707 written-flow checkpoint — pause before GREEN/render

Written in existing `experiments/capability-discovery/heading-ablation/{render.mjs,cli.mjs,README.md}` and new `projection.test.mjs`. No recipe edit. Actual executed so far: one focused baseline RED command, exit1/stderr0, five missing-claims assertion failures and one existing-guard pass. All failures concern intended omitted qualifiers, not harness/import/module failures. Raw streams/pins/exit/times and actual baseline-generated consumer outputs remain under `red/`; frozen test copy is `frozen-projection.test.mjs`. Product correction has not been tested or rendered yet. No Git write/publication.

## Entry point and actual order

1. `renderTrace(trace,traceHash)` keeps existing full structural trace/4-row/64-station guards and hex hash guard. It assigns the whole supplied `trace.claims` value, using null only for null/undefined. No field whitelist, derived claim/default, prediction re-evaluation or geometry occurs.
2. It adds that value to existing `heading-ablation-svg@1` binding metadata. Existing JSON serialization and XML escaping preserve nested/extra supplied fields and special characters.
3. Its existing visible header gains one wrapped line `claims=<serialized supplied value>`, or `claims=unavailable/null`. Existing dynamic header height places panels after the new lines; row/station render logic and numerical display transforms are unchanged.
4. Existing `main` continues argument/regular-file/2MiB/exact-byte SHA/JSON validation, calls renderTrace once, and writes SVG exclusively. Its existing stdout summary adds the same complete claims value/null, not an independently computed result.
5. Existing `persistHeadingTrace(trace,outDir)` still writes full supplied trace first, then constructs its projection receipt. That existing receipt now adds `claims:trace.claims??null`. It is returned and written, so the existing CLI stdout route naturally retains it without invoking the producer in this task. Exclusive writes,2MiB per-file/5MiB total caps and retained-prefix failure behavior are unchanged.

| Invocation in frozen tests | Inputs | Actual outputs | Prohibited work |
|---|---|---|---|
| `renderTrace` | exact parsed saved E4009 or labeled test-only clone; bound hash | SVG header/metadata and original panels | no query/recipe call, no physical re-evaluation |
| `main` | same saved byte path/hash or clone path/hash; fresh SVG path | SVG and captured actual stdout JSON | no pixels/provider/producer |
| `persistHeadingTrace` | same parsed trace; test-created exclusive fresh directory | trace.json, receipt.json/returned receipt, failure-prefix records on guard cases | never `runHeadingCLI` or `runHeadingAblation` |

The six frozen tests compare actual consumer outputs, not copied implementations or source text. They cover real saved claims/visible text/metadata, actual main stdout, actual returned/written receipt, unchanged complete prediction/rows/full trace and all64 station IDs, legacy missing/null, partial/extended/XML-special qualifiers and retained schema/row/hash/input-size/exclusive-write/persistence-cap guards. Test-only clones are consumer fixtures, never observations. All outputs are retained in per-command fresh directories via `LAB17_EVIDENCE_ROOT`. Capture script checks frozen test bytes before GREEN.

## Boundaries and requested decision

Trusted finite JSON-safe saved input only, not general hostile-object validation/security/authentication. No recipe/sourceBinding/parameters/raw answers/math/default changes; old E4009/E4013 sealed records untouched. New claims are never inferred from SUPPORTED. Physical identity, calibrated width, AA, confidence, independent validation and original pixels/real44 stay HOLD. No standalone display/rasterization is admitted by this checkpoint.

Please admit exactly `node /workspace/scratch/86659bbafcce/lab17/S1/E4707/capture.mjs green`, which runs the identical frozen focused test command once. S1 will retain actual failures and stop on regression; no silent test changes or retry. Different-worker source/output acceptance remains separate.
