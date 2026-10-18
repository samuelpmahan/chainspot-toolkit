# FunctionalGuarantees: compositions of properties

- **An FG** is `guarantee({ id, guards, ... }, pipe(composition, ...decorators))` (`fg/compose.mjs`). Each decorator
  (mixin, `fg/mixins.mjs`) adds checks, frames or record fields and never changes a produced value.
- **Default properties, added to every FG:** `profiled` (its own call subtree: calls and summed emits, with units),
  `instrumented` (call counts), `rendered` (it must draw at least one frame). The registry lists them in
  `DEFAULT_PROPERTIES`.
- **Mixins in use:** lane, gated, witnessed (provider / branch / path), conserved, delta, judged, materialized,
  framed, published, unitful.
- **Skeletons** (`fg/skeletons.mjs`): a stage's FG written once. `assemblyGuarantee` is the S1-S3 assembly chain
  (branchRun, lane, delta, gated, reproduction, witnessed branch and path, materialized with reread, published with
  lane evidence); `materializeGuarantee` is the S1-S3 set materialize chain (read, serialize with the wiring checks,
  witness, checks, layer conservation, artifacts, frames, published). A new stage passes only its own steps; names,
  ids, lanes, artifact paths and record keys follow from `{ stage, noun }`. See `fg/s2/fg.s2.pxBaskets.*.fg.mjs`.
- **Declaring:** every non-default property an FG composes is declared in its `stages/*.json` entry. The registry
  test (`fg/forkjoin.test.mjs`) fails on drift.
- **Records are hashed evidence.** Put only deterministic, unitful numbers in them, in a deterministic order (never
  sorted by time); timings go to the sidecar.
- **Scaffold:** `node scripts/pxc.mjs scaffold mixin <name>`.
