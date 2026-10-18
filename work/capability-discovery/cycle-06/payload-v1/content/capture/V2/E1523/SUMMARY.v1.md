# E1523 — four PNGs, author inspection only

Existing Inkscape1.2.2 converted the exact four E1522 SVGs once each to new1680x1600 PNGs; all exits0. Each conversion's stdout is empty and stderr retains a GtkRecentManager warning. Version/command timing/exit/input/output/capture hashes are in `result.json`; no retry or edits occurred.

All four actual PNGs were viewed with original-resolution requests. Group/window/origin/width banks, native conditions, visible denominators and UNKNOWN/control warnings are visible. Sampled labels across all four groups match the existing unchanged CSV. No outer-page clipping was observed.

Remaining issues: masked-primary long48 NaN labels overlap; tiny annotation/validity text needs original-size viewing; panel axes are independently display-scaled. The unchanged PNG footer inherits preconversion renderer-stage 'No PNG/visual QA claim' wording; the current receipt reports subsequent limited author inspection, not independent/human acceptance.

This is the renderer author's QA, not independent R1 acceptance. No source-pixel decode/CV/query/AI image/renderer rerun/browser/Git/native/helper action or native-value recomputation. Preserve all four PNGs, warnings and source bytes for R1's separate visual review; stop here without layout repair.
