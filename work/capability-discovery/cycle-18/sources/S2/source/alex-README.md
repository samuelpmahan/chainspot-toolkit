# AlexClark testimony (Sam)

Source: `chainspot-corpus/dev/Annotated.zip` ->
`Annotated/AlexClark/AlexClark-full.annotation.json`. It uses the older
schema (`course`, `holes[].tee/basket/left/right`).

- Sam labels **only the bent holes**. Each has a tee point, a basket point
  and the left/right corridor polylines.
- `number` in this file is the annotation's own order, NOT the hole number:
  annotation #1 = hole 16, #2 = hole 13, #3 = hole 6 (matched by geometry on
  2026-10-17).
- Frame: the source frame. **Canonical y = annotation y - 4** (S0
  upperRowsRemoved for AlexClark-original).
- Measured against S2 (2026-10-17): all 3 annotated baskets are detected,
  BasketPoint at 1.40 px (hole 16), 2.79 px (hole 13) and 3.20 px (hole 6)
  from Sam's points.
