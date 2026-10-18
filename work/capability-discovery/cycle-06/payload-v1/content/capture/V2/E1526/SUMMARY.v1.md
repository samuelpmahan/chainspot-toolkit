# E1526 — synthetic layout RED/GREEN, no real rerender

Tests-first: preserved v3 genuinely failed the frozen48station adjacent-NaN output-geometry regression; the finite-only comparison passed. Only then was v4 constructed. Root reviewed exact flow/diff/hashes before admitting four checks once.

Both admitted syntax checks exited0. The unchanged layout regression passed2/2 against v4; inherited assertions passed13/13. Empty stderr, no unexpected failure/retry/assertion change. `result.json` records all six RED/GREEN-phase commands, UTC times, observed exits and raw hashes.

V4 conditionally reserves an internal annotation strip for bilateral nonfinite outcomes and visibly lists side/token/station indices. Values/flags/curves/CSV/CLI/HTML/raw machinery are not recomputed. Finite-only SVG identity, hollow invalid markers, broken valid curves, token/index identity and exact synthetic CSV equality pass. Source SHA256 `19be2472803e613b40043d4e2ee0adcfc53e59a27cd9c410eef0601a226a45ef`; regression `fbdbbdccab6fe1d69dcbdafa1632be5fa97b10b57683e3249d0a1692c70ad6e2`; inherited13tests `eb8d8e4d270cc4f6e033e51b0a3c01223d54ec8269a2c32a49a78076000b1b5d`.

This is a geometric falsifier and retention test, not actual-font/PNG visual acceptance. Prior source/tests/figures/raw AMEND remain unchanged, including the exact original CSV `53bdcf7cfe714ff0342549a4bf05d5c791f2f7a2d2e3e6054eddd338c833c5a5`. No real rerender/conversion/producer/codec/wire/CV/query/replay/source-pixel/Git/native/helper action occurred.

`next-real-render-proposal.v1.json` is construction only. Stop for independent review and later exact root admission; eventual actual PNG original-detail review must inspect strip/curve/validity/caption clearance and readability. G6 owns repository/Git; root owns native finish.
