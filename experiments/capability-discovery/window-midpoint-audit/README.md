# Window midpoint audit — default OFF

Receipt-only, exposed-data geometry; no CV or image reads. Fixed E809 receipt and geometry module hashes are checked before dynamic import and again after measurement. All12 rows/60 candidates, gaps/isolates/raw long context, complete descriptors and source/crop residuals are retained. Width42/50 are hypotheses, not calibrated truth. P1 uses full-five geometry only; missing/error abstains.

After separate execution approval:

`node cli.mjs --enabled --run-id E3010 --out NEW_DIRECTORY`

Creates measurement.json and cli.txt exclusively in a fresh directory. CLI prints the actual measurement hash. Separate render.mjs reads that same trace/hash without recomputing geometry. No overwrite/retry. Hash checks do not authenticate a hostile runtime or prove RSS. Fabricated checks: `node --test meaningful.test.mjs`.
