# R1534 diagnostic history

All commands were scratch-only read-only artifact diagnostics except creation of this review's files. No renderer, conversion, browser, native/Git/source operation, raw-wire decode or source-pixel read occurred.

1. Inventory/read commands: `rg --files`, `sed`, `head`, `rg` on prior R1523 AMEND, E1533/E1534 receipts, E1531 postchecks/manifest and generated CSV/SVG/HTML. An initial combined read was tool-output truncated; E1533/E1534 were then reread separately in full. R1523, postchecks and manifest were available in full.
2. Fresh `sha256sum` and `file` passed, tool chunk `bab2e9`: new PNG `7cae1f6daeb1cbaa790fa51e9e86456e112ae50ced43340e9c5071d0d97c40bd`, PNG 1680x1600 RGBA. All bindings are recorded in result.json.
3. One `view_image` call requested and forwarded `detail:original` for the new masked v4 PNG only. No other PNG was freshly viewed.
4. Read-only CSV inventory command passed, tool chunk `839ec1`: 14972 data rows, expected field/query inventory and sample NaN/finite-invalid/threshold-null rows. This was not raw-wire decoding or recomputation.
5. First `python discovery-cycle06/R1/R1534/review-checks.py` failed exit 1, tool chunk `4ba69c`. Complete failure text:

```text
Traceback (most recent call last):
  File "/workspace/scratch/8528bb251845/discovery-cycle06/R1/R1534/review-checks.py", line 65, in <module>
    assert 'UNKNOWN' in html and 'No best width' in html and 'no edge pair' in html
           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
AssertionError
```

All preceding assertions had passed before this assertion. Inspection of the unchanged HTML header (tool chunk `efe07f`) showed the actual exact wording `No width selection, new score, classifier, refit or pixel access.` This is the pre-existing HTML phrase; `No best width.` is the SVG phrase. Root cause: scratch review expectation incorrectly required identical wording across formats, not a report defect. Only that expected phrase in the scratch check was changed to `No width selection`; no display artifact was modified. The initial failed diagnostic and this correction are deliberately preserved here.

6. The corrected complete check is rerun and its actual result is recorded in result.json. Its stdout provides exact byte identities, annotation/validity checks and retained native semantics. No failure is concealed or treated as a producer failure.
