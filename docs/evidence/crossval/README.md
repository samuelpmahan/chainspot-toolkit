# Cross-validation without ground truth (S1-S4 outputs, every dev course)

Sam (2026-10-18): "LEARN TO CROSS VALIDATE WITHOUT GROUND TRUTH SO YOU CAN
REPORT INTELLIGENTLY". Each hole's basket is claimed by independent
geometric signals. Testimony is never read by the signals. It is used only
afterwards, to calibrate how far each kind of agreement can be trusted.

## Signals

- **Straight.** Tee n, badge n and a BasketPoint lie on one line (TLS max
  residual <= 1.5 px), and the basket is the first one past the badge. That
  basket is K n. Every straight hole is derivable this way: three points in
  a line.
- **Spoke.** Basket k's C1 spoke runs from its BasketPoint to the front edge
  of tee n+1. Ridge evidence is read along every predicted line and matched
  one-to-one, so basket k is K n. This works for bent holes too.
- **Exclusivity.** Each basket ends exactly one hole. Claims are weighted:
  straight 1; spoke min(1, margin / 5 lum), so a spoke that barely prefers
  its tee barely counts. A one-to-one assignment then settles conflicts.
  When exactly one hole and one basket are left, they pair (elimination).
- **Inputs.** Tees are S3 plus S4 recovered; baskets are S2 plus S4
  recovered; all from the fresh attempts in `../dev-s1s4/ATTEMPTS`.

## Calibration against Sam's annotations

75 annotated holes: golden, lenard, townelake and heritage (all 18 each),
plus alex holes 6, 13 and 16.

| how the basket was claimed | right | wrong |
|---|---|---|
| two signals agree | 33/33 | - |
| one signal: spoke | 14/14 | - |
| one signal: straight | 5/6 | heritage 9 |
| exclusivity settled a conflict | 10/11 | heritage 1 |
| elimination (last hole, last basket) | 1/1 (alex 6) | - |
| unresolved (no claim, never guessed) | 10 holes | - |

That is 63 of 65 claims right. Both errors are on heritage, the
smallest-scale and most crowded course.

## Alex and northpark (`alex.png`, `northpark.png`; `*-look.png` = every hole not confirmed by two signals)

| course | basket claims | tees |
|---|---|---|
| alex | 18/18: 12 two signals, 3 spoke-only, 2 straight-only, 1 elimination | 17/18 (Tee 12 missing) |
| northpark | 18/18: 11 two signals, 3 spoke-only, 3 straight-only, 1 settled by exclusivity | 17/18 (Tee 5 missing) |

- **Trust.** On calibration, two-signal and spoke-only claims were never
  wrong; straight-only and exclusivity were right 5/6 and 10/11. So the
  single-signal and settled holes in the `*-look.png` sheets are the ones
  to eyeball. Alex's 3 annotated holes (6, 13, 16) all agree.
- **Missing tees: a hypothesis, consistent but not proven.** Each tee S4
  cannot place sits where hole n-1's basket is, and that basket's spoke
  points at tee n.
  - Heritage Tee 6: Sam's point is 40 px from Basket 5's BasketPoint, under
    the sprite.
  - Alex Tee 12: Badge 12 is 139 px from K11 (this course's tee-to-badge
    range is 93-163 px).
  - Northpark Tee 5: Badge 5 is 159 px from K4 (range 65-205 px).

  S4's pose scorer needs visible pad pixels, so it rejects a pad that lies
  wholly under a sprite ("no accepted pose"). The fix is entailment: the
  pose lies inside the occluder, its axis is on badge n's ray, and its front
  edge is on basket n-1's spoke.

Files: `crossval.py` writes `crossval.json`, with truth agreement only
where testimony exists; `render.py` draws the pages.
