# Width and offset negative probes

Copy this directory intact to `experiments/capability-discovery/probes/width`. Run from any working directory with Node 24 or newer:

```sh
node /path/to/width/probe.mjs --out receipts/actual.json
```

Or run `npm test` inside this directory. There are no installed dependencies, network requests, absolute imports or repository writes. Output paths are relative to this package, not the shell working directory. The four exact bundled source files are verified against their SHA256 and Git blob IDs before use. Original source comments and authorship are retained; `provenance.json` names the repository, exact ref and original path. Node strips the bundled Dev72 TypeScript types at load time.

`probe.mjs` builds small grayscale RGBA fixtures and calls existing source operations. It records strict nominal-width arguments separately from occupied rows and measured edge separation. It checks weak fits at the finite profile boundary, rejection by the default center gate followed by recovery under an explicitly wider gate, and a valid ribbon's low sensor score after a small center shift.

The missing-evidence cases distinguish rail-channel UNKNOWN from an interior-only combined score of 1. The legacy width estimator returns a number even when every candidate has zero visible samples, or when no candidate/segment exists. Those returns remain in the diagnostic receipt; `recipe.mjs` returns width null and UNKNOWN. Nonfinite scores are tagged explicitly rather than silently serialized as null.

`experiment.recipe.json` specifies input frames, stage calls, output measures, eligibility, evidence checks and UNKNOWN boundaries. `assessLocalWidth` requires an explicit caller confidence policy, qualified straight segments, bilateral evidence, candidate separation, width spread, safe profile boundaries and a held-out check within reported uncertainty. Its positive result permits comparison only; it always says `promoted: false`. Thresholds in the recipe control test are synthetic fixture inputs, not accepted physical constants. No production code calls this guard yet.

The shipped receipt reports actual execution. Re-running regenerates it. Synthetic checks establish software behavior and counterexamples only: they establish neither real-course width confidence nor organic-blob rejection, image accuracy, endpoint identity or a new CV default. Course-local ribbon width never supplies meter scale. No AA muting occurs.

Attribution: exact toolkit sources are drawn from `37a2dba87d61262f661af70f1a22440736e61efc` and active reference `49255331791b1245cf0f9cd699816175f94e70f2`; exact Dev72 source is from `samuelpmahan/ChainSpot` at `ef2a4fc2dc4720d3647f705464342f119d5a39a5`. Original headers remain in `vendor/`. Bundling does not add a license grant or claim authorship of these operations.

Revision 2 repairs initial R202 AMEND: negative/nonfinite spread, nonpositive or repeated candidate widths, and missing/nonfinite paired rails remain UNKNOWN. Run `node --test recipe.test.mjs` for structural regressions. `receipts/actual.json` is preserved first-pass evidence; `receipts/repair-E207.json` binds the revised wrapper and unchanged exact sources. All eligibility remains comparison-only and promoted=false.
