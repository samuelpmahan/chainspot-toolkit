# E1526 — layout-only v4 checkpoint, before GREEN

## Written in / actual execution so far

`renderer-proposal.v4.mjs` SHA256 `19be2472803e613b40043d4e2ee0adcfc53e59a27cd9c410eef0601a226a45ef`.

Frozen regression `renderer-layout-regression.test.mjs` SHA256 `fbdbbdccab6fe1d69dcbdafa1632be5fa97b10b57683e3249d0a1692c70ad6e2`; inherited13case test `renderer-engineering.v4.test.mjs` SHA256 `eb8d8e4d270cc4f6e033e51b0a3c01223d54ec8269a2c32a49a78076000b1b5d`.

`source-diff.v4.patch` SHA256 `c7257da48d9bc2044c4b4dc6562f4cfd79543c03abf3f1c694c4e96bd7eaf9e7` is the exact text diff against preserved v3. Only scratch V2/E1526 files are authored. v3 source/tests, all prior SVG/PNG/CSV/HTML/AMEND and original raw wires are preserved. G6 alone owns repo/Git.

The new regression was authored/frozen before v4. Its syntax check exited0. The one admitted RED invocation against original v3 exited1 with exactly the intended adjacent-NaN glyph overlap assertion; second finite-only case passed. Actual first boxes: x623.6170212765958 and631.3829787234042 at y1339, font7, conservative width12.6. This is a real renderer-output layout falsifier, not actual rasterized font QA. RED stdout SHA256 `851bb95255aff735cf12b4505cea3c15f41e6579cec2dc14cf490da5ba392df3`; stderr empty. V4 and inherited v4 tests have NOT been syntax-checked/imported/executed. No real trace rerender or conversion has occurred.

## Entry points and prospective calls

`svgGroup(model,group,binding)` remains the pure plot entry used by the frozen synthetic regression. `E1526_RENDERER` selects only preserved v3 or new v4. GREEN calls use v4; original v3 remains imported for exact synthetic CSV and finite-only SVG byte comparison. The inherited13case test changes only its module target/header; assertions/fixtures remain unchanged.

Commands are frozen in `prospective-green.v1.json`: node --check v4 source; node --check inherited v4 test; node --test frozen layout regression with E1526_RENDERER=./renderer-proposal.v4.mjs; node --test inherited13case suite. All projectors are synthetic in-memory only, not a real producer-backed report or PNG. Await root GREEN admission before these v4 executions.

Real entry `renderTrustedPacket({packetPath,packetSha256,outDir})` and its hash-before-pinned-codec-decode/NEW output flow are untouched. A later exact root-admitted source/trust/output packet is mandatory before real rerender, and another scoped GO before conversion/actual PNG review. No real command is admitted by this checkpoint.

## Numbered actual v4 source flow if later executed

1. Existing protocol/raw trust/reader/codec/validation/model/displayRecords/CSV/CLI/HTML/native scalar/unit/raw-link/UNKNOWN logic is unchanged. The entire code diff is header plus the plot helper and geometric plot changes below; no source22/science/wire data is changed.
2. For bilateral plots only, scan already-retained values for nonfinite outcomes. Use the existing scalar token function to keep null, NaN,+Infinity,-Infinity (and unavailable if present) distinct. Group by exact token separately for L and R, retaining every original station index in increasing input order. No native value, flag, denominator or metric is recomputed.
3. Format visible lines like `L NaN @23,24,25`, with matching data-series/data-token/data-indices metadata. Wrap index lists to an8px monospace display budget. This is a display width rule, not a CV/scientific threshold. No value/index is dropped or changed to zero.
4. Only when a bilateral panel has such annotations, reserve10px per annotation line plus6px inside the existing140px plot box. Map its unchanged finite values to the remaining geometric height; all station x positions, validity flags, finite-invalid hollow circles and disconnected valid curve segments remain. Finite-only panels retain exact prior SVG output and are not reflowed.
5. Put the annotation strip below that curve area, with4px clearance before its background/separator. Circle radius remains2.2px, so the strip starts below the lowest finite marker extent rather than painting over it. Annotation baselines are10px apart. The last baseline stays4px above the old plot-box bottom. Existing axes, below-box validity lanes and fit/loss/support captions retain their original surrounding locations; only the plot's lower y-axis label moves with the reserved curve area. Profiles retain their original rendering.
6. The page footprint remains1680x1600, all windows/banks remain, and CSV/CLI/data HTML/raw links are untouched. The actual E1522 CSV target remains SHA256 `53bdcf7cfe714ff0342549a4bf05d5c791f2f7a2d2e3e6054eddd338c833c5a5`; it has NOT been regenerated here. Equality on the real report must be checked only after later admitted rerender. No new native score/selection/acceptance policy or plot/system replacement is introduced.

## Invocation table / shared machinery

| Stage | Inputs / supplied arguments | Output | Executions so far |
|---|---|---|---:|
| RED syntax | Frozen regression source | Syntax status |1,exit0|
| RED actual v3 projector | Synthetic48stations, NaN23/24/25 each side, three banks | Real overlap assertion; finite-only unchanged test |1suite,1fail/1pass|
| New annotation helper/v4 projectors | Same retained synthetic rows after root GO | Grouped side/token/index strip and unchanged data records |0|
| V4 inherited engineering suite | Same13earlier fixtures/assertions | Native shape/outcome retention checks |0|
| Real trust reader/codec/producer/PNG | Not supplied | No real data/visual output |0|

Caller/root supplies scope and later actual render/conversion authority. Existing model/projectors supply all common data fields automatically. Only a later original-resolution PNG inspection can establish whether actual labels/curve-strip clearance/captions are visually readable; glyph-box test GREEN alone is not complete visual green or independent acceptance.

## Explicit boundaries / review

The inherited v3 UNKNOWN/no-best-width/dependence/caller-mask/WHITE-proxy limits and preconversion stage footer are unchanged. Original R1 AMEND remains historical evidence, not erased by this proposal. Test assertions/geometry threshold are frozen from meaningful RED and will not be loosened to pass. Root must inspect exact flow/diff/hashes before GREEN; stop on any unexpected syntax/test failure. No arbitrary new renderer/refactor, source/Git/native/helpers/CV/query/producer/replay/source-pixel decode, real trace rerender, conversion or exposure is authorized here. Root owns native finish; later independent R1 review remains separate.
