# FunctionalGuarantees: compositions of properties

- **An FG** is `guarantee({ id, guards, ... }, pipe(composition, ...decorators))` (`fg/compose.mjs`). Each decorator
  (mixin, `fg/mixins.mjs`) adds checks, frames or record fields and never changes a produced value.
- **Default properties, added to every FG:** `profiled` (its own call subtree: calls and summed emits, with units),
  `instrumented` (call counts), `rendered` (it must draw at least one frame). The registry lists them in
  `DEFAULT_PROPERTIES`.
- **Mixins in use:** lane, gated, witnessed (provider / branch / path), conserved, delta, judged, materialized,
  framed, published, unitful.
- **Declaring:** every non-default property an FG composes is declared in its `stages/*.json` entry. The registry
  test (`fg/forkjoin.test.mjs`) fails on drift.
- **Records are hashed evidence.** Put only deterministic, unitful numbers in them; timings go to the sidecar.
- **Scaffold:** `node scripts/pxc.mjs scaffold mixin <name>`.
