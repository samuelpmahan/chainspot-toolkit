# E810 actual-flow checkpoint

Written: `run-trial.mjs` and `render-receipt.py`. Only caller syntax and renderer AST parsing have executed; zero CV/import/render calls.

Entry points after root GO:

1. `node /workspace/scratch/8528bb251845/discovery-cycle04/P5/E810/run-trial.mjs`
2. `python /workspace/scratch/8528bb251845/discovery-cycle04/P5/E810/render-receipt.py`

The caller first refuses existing one-shot outputs, verifies exact P3 protocol/R803/helper bytes, accepted 23-entry freeze/history and14-entry recipe closure, Git source object, PNG and original staging hash. It records identity-before.

It restages the exact PNG using accepted `stage-png.py` into E810/source.json with the original image identifier/frame. It verifies both expected PNG/fullRGBA hashes and exact equality to the frozen original staged value. It saves descriptor, the complete supported four-key request, exact bindings and stage command. No ROI or geometry numeric is changed.

| Call | Exact inputs | Saved output |
| --- | --- | --- |
| Accepted PNG stager | Exact source PNG/hash, original staged imageId, frozen source frame | source.json and binding |
| runSourcePixelRoi, once | `{enabled:true,source,roi:p.roi,geometry:p.geometry}` | Full receipt.json; adapter owns mandatory crop+original composition calls |
| Receipt projections only | Both raw branches,18 declared stations,3 widths | All108 ordered candidate rows, CSV, window-level assessments, signed offset residuals |
| Receipt-only renderer | Frozen source PNG/ROI, receipt arrays/fields and bindings | Actual source-pixel/table figure and raw-profile figure |

Missing station/candidate or zero composition execution yields abstention, not falsification. Top UNKNOWN is not assumed unexecuted: actual branch rows and `execution` determine interpretation. Long-positive/short-null can falsify the long-average-as-sustained-pair assertion only when those rows actually ran. Every width, null, nonfinite diagnostic and raw source/crop disagreement remains retained; existing preserveNonFinite serializes receipts and derived JSON. Source projection of an averaged fit is explicitly not a per-point physical edge location.

The caller records identity-after, runtime/process resource measurements and logs. A source/helper change or exception records failure and prohibits adaptive retry. No repository/source/P3 modification, source owner/P6 disclosure, acceptance, AA or calibrated width claim.

The renderer imports no CV code and never resamples source input or recomputes a profile/fit. It crops source rows/columns only for presentation; tables read actual fits/nulls/counts separately for CROP and SOURCE, while companion plots use raw stored profile arrays. Initial render files are exclusive; any later presentation-only correction needs a separately identified renderer amendment, never a CV rerun.

Helper hashes are frozen in helper-freeze.json. Awaiting root GO for exactly this flow; no CV/render has run.
