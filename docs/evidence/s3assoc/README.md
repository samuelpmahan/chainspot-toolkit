# S3 initial association (ports/s3assoc)

![overview](assoc-overview.png)

Sam (2026-10-17): unoccluded pads associate with at most 2 badges, one an
obviously better fit; straight-hole matching (S5) can be largely done before
recovery starts.

`node ports/s3assoc/run.mjs --specimen NAME --attempt ID`:
1. Fits every visible pad as an AA render (`padPose.mjs`, ported from the
   numpy prototype; it reproduces Alex's template 25.019 x 17.377 px).
2. Associates each pad's axis with badge centres within 3 deg (`associate.mjs`).
   An opposite-sense tie is broken by the side the path leaves from.
3. Continues the axis past the badge to the nearest BasketPoint.

| course | badge agrees with Sam | straight holes called straight (basket seen in S2) | straight, basket unseen in S2 | bent holes hit by chance |
|---|---|---|---|---|
| golden | 15/15 | 6/6 | 1 | 7, 14 (507-552 px; S6's ribbon must reject) |
| lenard | 16/17 (1 no badge) | 15/15 | 2 | - |
| townelake | 17/17 | 14/14 | 0 | - |
| heritage | 12/14 (2 no badge) | 0/0 | 1 | - |
| alex | no testimony; 12 associated (1 by path side), 1 no badge | 8 candidates | | |

- The S3 moment angle is off by a median 1.27 deg (max 6.28 deg) from the AA
  fit. With it, only 46/63 associations were right; the AA pose is what
  makes association work.
- No-badge pads:
  - Heritage holes 12 and 13: the badge is 74 px away but 8.5-8.8 deg off
    the axis.
  - Lenard hole 12: the pad is occluded.
  - Alex S3 #6: badge 18 at 5.79 deg, badge 1 at 470 px.
- Path side is crude and calibrated on golden/heritage/alex (badge on the
  path side 15/15, 11/11, 11/12). On lenard (8/16) and townelake (13/17) the
  strip test itself is suspect, so it is only used to break ties.
