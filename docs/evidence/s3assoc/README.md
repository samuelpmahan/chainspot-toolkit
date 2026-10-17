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
| lenard | 17/17 | 15/15 | 2 | - |
| townelake | 17/17 | 14/14 | 0 | - |
| heritage | 14/14 | 0/0 | 1 | - |
| alex | no testimony; 13/13 associated (S3 #12 by path side: badges 5 and 3 sit on opposite ends of one axis) | 8 candidates | | |

## Nothing is dropped: tracked and rendered for inspection

![inspect](inspect.png)

Every pad keeps its 3 nearest badges by axis residual, with no angle cutoff.
`inspect` flags:
- a pairing more than 2 px off the axis;
- any tie or no-badge verdict;
- an axis that misses a BasketPoint by 3-10 px.

The first version dropped 3 pads as "no badge". Rendering them showed the
measurement was ours: the "badge centre" was the first bright S1 part,
which on 5 badges (lenard 12; heritage 12, 13, 15; alex 18) is the digit
"1" (7 x 21 px). Their white frame is not its own S1 part, which is an S1
finding. With the badge bbox centre, all 76 pads on 5 courses sit within
**1.90 px** of their badge (median 0.65 px):

| course | lateral px median / max |
|---|---|
| golden | 0.67 / 1.83 |
| lenard | 0.65 / 1.55 |
| townelake | 0.60 / 1.48 |
| heritage | 0.96 / 1.90 |
| alex | 0.49 / 0.81 |

The error is a constant ~1-2 px of position, so thresholds are in px, not
deg (Heritage's badges are only 45-128 px away).

- The S3 moment angle is off by a median 1.27 deg (max 6.28 deg) from the AA
  fit. With it, only 46/63 associations were right; the AA pose is what
  makes association work.
- Path side is crude and calibrated on golden/heritage/alex (badge on the
  path side 15/15, 11/11, 11/12). On lenard (8/16) and townelake (13/17) the
  strip test itself is suspect, so it is only used to break ties.
