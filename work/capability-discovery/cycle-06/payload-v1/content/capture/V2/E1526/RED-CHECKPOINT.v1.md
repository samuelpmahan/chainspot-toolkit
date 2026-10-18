# E1526 — tests-first RED checkpoint, no repair written

Written: `renderer-layout-regression.test.mjs`. It has not been imported, syntax-checked or run. The preserved v3 renderer is the RED target; no v4 exists yet and no old source/figure/AMEND/raw wire is changed. R1/R1523 was read fully as text and agrees with the root's x-spacing cause.

Future synthetic RED call: `E1526_RENDERER=../E1520/renderer-proposal.v3.mjs node --test discovery-cycle06/V2/E1526/renderer-layout-regression.test.mjs`. It imports only Node assertions/test plus the preserved renderer; the existing trust reader/codec are not called. No original producer/wire/pixel data is read. Synthetic calls generate in-memory SVG and CSV strings only, already covered by E1526's bounded brief, not a real trace rerender.

1. Build one declared synthetic masked-primary/long48 comparison with48stations and all three nominal banks. Each side has adjacent NaN23,24,25, null20,+Infinity28,-Infinity29, and retained finite-invalid21,22,26,27; all are illustrative, not new observations.
2. Call the actual renderer `svgGroup`, parse its emitted nonfinite text nodes, and compare their glyph boxes. Expected v3 failure is real adjacent annotation overlap: about7.77px station spacing versus a conservative12.6px NaN text box at7px font. Missing imports or syntax errors are not accepted as meaningful RED.
3. Once geometry no longer overlaps, the same frozen test requires explicit side/token/station identity in each of three banks, retained hollow finite-invalid markers and disconnected curves, exact synthetic CSV agreement with preserved v3, and unmodified null/NaN/infinities. A second finite-only test requires SVG byte identity with v3.

| Boundary | Input | Output | Executions so far |
|---|---|---|---:|
| Existing v3 renderer | Synthetic48station model only | In-memory SVG/CSV assertion subjects |0|
| New regression | Actual emitted annotation geometry | Expected overlap assertion, not assumed PASS |0|
| Product/codec/real trace/PNG | Not supplied | No route used |0|

After a meaningful observed RED, author only the minimal versioned plot-layout remedy: grouped side/token/station-index text in a bounded annotation strip, with finite curves/markers and validity semantics retained; no CSV/HTML/value/threshold change. Freeze actual-flow/diff/hashes/prospective GREEN commands before executing v4. No real rerender/conversion or independent visual-green claim is authorized. Root owns scoped guards and native lifecycle; G6 alone owns repo/Git.
