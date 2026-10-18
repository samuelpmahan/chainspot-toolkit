# R1526 independent bounded synthetic validation checkpoint

No independent test/import/projection has run yet. Read complete v4 source, frozen layout regression, exact v3/v4 diff, author RED/GREEN receipts/raw logs and preserved preexecution flow. Existing root/native review authority explicitly permits one independent15case synthetic validation after this flow checkpoint; no new code or assertions are authored here.

Entry: `E1526_RENDERER=./renderer-proposal.v4.mjs node --test discovery-cycle06/V2/E1526/renderer-layout-regression.test.mjs discovery-cycle06/V2/E1526/renderer-engineering.v4.test.mjs`, cwd workspace.

1. Rehash exact v4 renderer19be247..., frozen regressionfbdbbd..., inherited13testeb8d8e..., and preserved v3 originals. Require new stdout/stderr paths.
2. One node-test invocation executes the unchanged two layout cases and unchanged inherited13 cases. Its scoped environment selects only the allowlisted v4 module for the layout regression. Preserved v3 is imported only as the existing synthetic finite-SVG/CSV comparison reference; no old RED run is repeated.
3. Layout fixtures call pure in-memory SVG and CSV stages on hand-declared48station data, checking conservative emitted glyph boxes, explicit L/R/token/index identity, hollow finite-invalid points, disconnected curves, unchanged native values/CSV and byte-identical finite-only SVG. Inherited cases exercise the previous native shape/outcome/reference and synthetic SVG/HTML/CSV checks.
4. Capture original stdout/stderr to new R1/R1526 paths with noclobber and record UTC observation boundaries/actual execution-tool exit. Preserve first unexpected failure; no assertion/code/geometry-threshold edits, no retries or automatic repairs.
5. Inspect results and rehash originals, then write an independent review receipt. Fifteen synthetic checks are bounded geometry/retention evidence only. No actual font rasterization or real PNG/data report is produced; R1523 visual AMEND remains unresolved pending later separately admitted actual outputs/views.

| Boundary | Inputs | Output |
|---|---|---|
| Frozen tests | Exact unchanged source/tests and illustrative synthetic native rows |15assertion results |
| Pure projectors | Synthetic models only | In-memory SVG/HTML/CSV strings; no real files |
| Capture | New raw log paths | Observed exit and retained original stdout/stderr |

No real trace, codec, product/recipe/vendor/query/CV/producer/replay, source pixels/PNG, browser, Git/native mutation or helpers are supplied or invoked. Trust/caps/CSV/HTML/raw code remains unchanged by the v4 source diff. Root's existing bounded validation authorization covers this exact prospective run; a real rerender/conversion remains outside scope.
