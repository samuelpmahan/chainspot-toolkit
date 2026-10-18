# Evidence and reporting

- **Numbers:** every number has a unit AND a referent (what it measures, on which course or image).
- **Renders:** legible enough to validate by eye, with labels, colour by status, and a legend. Render, then decide.
  Sam often sees the differentiator in a picture.
- **Judging:** a judge reports agreement with Sam's testimony, never acceptance
  (`node ports/judge/judge.mjs --specimen X --attempt ID`). Report TP/FN/FP and right/wrong hole, per course. Use
  one match rule per kind: tee 8 px, basket 12 px.
- **Testimony is optional and impeachable:** hand marks are often a few px off and "known" tee poses a little
  wrong. Every run works without it. A disagreement is a render to cross-reference by eye, not a verdict.
- **No ground truth** (northpark, most of alex): cross-validate with independent signals. Calibrate how far each
  agreement class can be trusted on the annotated courses first (`docs/evidence/crossval/`).
- **Constants:** GLOBAL only if it holds across courses AND zoom scales. LOCAL is measured per image; VARIABLE
  depends on the view. Never put an absolute px bound on a map-scaled quantity (`docs/evidence/ledger/`).
- **Refactors:** identical output on every dev course is the claim. **Behaviour changes:** judged, per course.
- **Sam's rules:** implement his general rules as he gives them before inventing signals. Make no detours he did not
  ask for.
