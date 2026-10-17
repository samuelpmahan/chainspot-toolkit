# BasketPoint: where the C1 spokes meet the basket stem

![BasketPoint](basketpoint.png)

Sam (2026-10-17): "the spokes intersect with the basket tip edge at a
precise point. I bet THAT'S the precise BasketPoint."

- Each basket's C1 spoke is fitted as a free line (ridge points, PCA), with
  no centre assumed (`spokes.py`). The basket sprite is screen-constant
  (46 x 72 px on all courses), so every spoke should pass one point in the
  sprite frame. `solve.py` solves that point by least squares over 59
  spokes on 5 courses (outliers dropped at 3 MAD).
- **BasketPoint = (bbox x + 22.5, bbox y + 71) + (+0.34, +0.73) px.** That is
  the stem's bottom pixel edge (y + 71.5) at its centre.
  - Spoke residual: median 0.38 px, rms 0.81 px.
  - Bootstrap 95%: x +0.06..+0.61 px, y +0.38..+1.02 px.
  - Per course: golden (+0.23, +1.14), lenard (-0.57, +0.62),
    townelake (+0.38, +0.84), heritage (+1.48, +0.33),
    alex (+0.19, +0.85, residual 0.26 px).
- Cross-check against Sam's annotated basket points: median 0.88-1.09 px on
  lenard, townelake and heritage. Golden's annotations sit a mean 3.3 px above.
