# E809 source-hash and actual-flow checkpoint

Written in `run-trial.mjs` and `render-receipt.py`. Only source hashing and syntax checks have run. No stager, adapter, recipe, CV function or renderer has run in E809.

Entry point after root GO:

`/usr/bin/time -v -o /workspace/scratch/8528bb251845/discovery-cycle04/P3/E809/process-resources.txt node --max-old-space-size=4096 /workspace/scratch/8528bb251845/discovery-cycle04/P3/E809/run-trial.mjs`

1. Refuse an existing source/identity/receipt output; verify exact protocol and accepted R802 binding, exact PNG/blob, all adapter freeze files/history and accepted recipe closure. Save identity-before.
2. Copy the exact frozen staging descriptor to request-descriptor. Invoke unchanged accepted stage-png.py on exact original PNG, preserving its imageId/frame, and verify PNG plus decoded fullRGBA identities.
3. Project only sourceBinding into the accepted staged `source` object. Request is exactly `{enabled,source,roi,geometry}`; numeric ROI/geometry/settings remain unchanged. Save complete request, request/descriptor/source hashes and helper identities.
4. Dynamically import unchanged adapter and call runSourcePixelRoi exactly once. Adapter owns support refusal or exactly two compositions, crop first and original full frame second. Save full receipt with existing preserveNonFinite.
5. Extract all108 expected ordered candidate rows without replacing null/missing/not-executed. Record original-frame normal-offset projections, all raw candidates/counts, anchor42 predictions/falsifiers and+6 residuals, complete CSV, resources and identity-after. All18 anchor candidate rows and actual source branch must exist before any anchor outcome; otherwise UNKNOWN/UNOBSERVED. Actual NULL_FIT is distinct from absent/unexecuted, and long-with-short-null is only reported with actual null evidence. No sampling, fit, tuning or rerun is added.
6. Only after receipt inspection, invoke the Python renderer once. It reads actual receipt/descriptor/binding plus verified source PNG. It copies exact integer ROI pixels for a display, labels frozen poses, and prints separate crop/source tables of all ordered34/42/50 fits/nulls and visibility ranges. It does not import or run CV.

| Stage | Inputs | Actual call/output |
| --- | --- | --- |
| Source staging | frozen PNG/hash/imageId/frame | accepted stage-png.py -> source.json |
| Fixed measurement | exact source plus frozen ROI/geometry | one runSourcePixelRoi -> receipt.json, containing two unchanged recipe branches |
| Receipt extraction | raw receipt plus frozen declarations | all-candidate-rows.json, ordered-fit-table.csv, analysis.json, resources.json |
| Presentation | actual receipt plus verified source pixels | render-receipt.py -> E809-actual-receipt.png, renderer-summary.json |

Shared machinery is unchanged: adapter source copying, conservative support, exact closure guards, paired source/crop execution and1e-9 equivalence. Caller supplies only the frozen descriptor projection and retention/reporting.

Explicit boundaries:42 remains a comparison anchor; finite short averages do not prove pointwise continuity; Dev72 ignores windows so long and short3 duplicate sensor pose. Any source/crop discrepancy remains UNKNOWN. No adaptive retry, recentering, widening, changed masks/settings, semantic/calibrated-width acceptance or production action. No external publication. P6 remains undisclosed until helper freeze is acknowledged by root.

Root review requested: is this exact frozen flow authorized to run once and render once? Waiting for root GO, not a new user permission turn.
