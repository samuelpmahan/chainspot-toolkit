# ChainSpot toolkit export

Investigation copy of the ChainSpot stage toolkit, exported 2026-10-17 for
the findFamily task. The recipes (`recipes/`) are the artifacts; everything
else is what they invoke or pin. Stage checkpoint pin:
`de9849cb45e4b940dffdd4d21daa85a2ac07fd15a53a251f658db67216dfc6d8`.
Pinned provider base: `5433854c72b1dc5aa420934d91e16458c2abe09f`
(unmodified, under `source/provider/`). Golden specimen:
`source/provider/artifacts/replay/source/IMG_5641.jpg`.

Run from this root: `node toolkit.mjs neat` to pin a checkpoint,
`node --test recipes/stages.test.mjs` for the stage tests,
`node replay.mjs` for the S7 baseline replay.

`attempts/` (run evidence) and `node_modules/` are excluded; the recipes
regenerate the evidence. Canonical work continues in Boone's workspace;
this is the shared investigation surface.
