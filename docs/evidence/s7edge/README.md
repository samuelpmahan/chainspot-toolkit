# S7 hallway (path ribbon) tracker: prototype, three competing seeds

Python evidence scripts, not a pipeline stage. Every number is in px unless marked.
BasketPoint = basket sprite tip (bbox x + 22.5, bbox y + 71) + (+0.34, +0.73) px, solved from 59 C1 spokes.

## Model, measured
- **Ribbon width is course-local.** Estimated truth-blind from the visible pads' axes (`widthscan.py`):

  | Course | Width | W / C1 radius |
  |---|---|---|
  | Alex | 33.55 px | 0.93 |
  | Golden | 41.85 px | 0.94 |
  | Lenard | 35.10 px | 1.43 |
  | Townelake | 36.50 px | 1.46 |
  | Heritage | 31.55 px | 1.50 |

  The ratio to C1 is not constant across courses. On Sam's straight first legs the best widths are 35, 37 and 31 px (Lenard, Townelake, Heritage), within 0.5 px.
- **Edge test.** Fixed-centreline edge contrast (inside band minus outside band) > 8 lum separates ribbon from off-ribbon:
  - Alex: 90% vs 5% of stations pass.
  - Golden: 80% vs 1%.
- **Tee end.** The tee end is a round cap of radius W/2, centred 0.424 L ahead of the pad centre. Fitting that cap on its edges recovers the pad centre within 0.27–1.83 px on 11 of 12 visible Alex tees (hole 9: 97 px).
- **Hidden tee example.** Alex hole 12's tee is entailed under basket 11 at (458.4, 226.4) px, in a box 4.2 x 4.9 px. This agrees with `../ac12` within 0.5 px.

## Implementations
1. **Tee-seeded** (`runall2.py`, `refine_all.py`, `render.py`; Alex and Golden). Starts at each visible pad and follows its axis.
2. **Badge-only** (`badgeseed.py`, `renderb.py <course> badge`). Finds the ribbon through each S1 badge and marches both ways.
3. **Association-first** (`pipeline3.py`, `renderb.py <course> p3`), in Sam's order:
   1. Take the frozen S3 association.
   2. Test STRAIGHT holes as the single segment tee -> BasketPoint. The test reads only unmasked stations and needs width within 1.5 px, centre within 1.5 px, edge steps at least 2x a competitor line, and no ribbon continuing past the BasketPoint.
   3. Two straight holes on one BasketPoint: the one whose ribbon caps there keeps it.
   4. Trace bent holes from the pad axis. Bend vertices are refined by render-and-score.
   5. Use the badge scan for the remaining holes.

## Results by hole number (implementation 3; see summary.txt)
| Course | Unique BasketPoint | Sam basket within 6 px | Sam bends | Agrees with badge-only |
|---|---|---|---|---|
| Golden | 16/18 (lost: 6, 18) | 16/16 | 8 matched, median 3.48 px, max 9.53 px | 14/18 |
| Lenard | 16/18 (lost: 9, 12) | 16/16 | none annotated | 15/18 |
| Townelake | 16/18 (lost: 11, 16) | 16/16 | hole 7: 1.13 px | 14/18 |
| Alex | 14/18 (lost: 4, 7, 18 = the three baskets S2 missed; 10) | 3/3 | 16: 0.8 px; 13: 1.2 px; 6: 5.7 px | 17/18 |
| Heritage | 7/18 | 3/7 (wrong basket: 1, 9, 14, 17) | mostly unmatched | 11/18 |

Tee-seeded vs badge-only, on holes with a visible tee: Alex 11/12 and Golden 11/12 agree on end and bend count. Their bend vertices agree within 0.22–2.33 px.

## Known failures
- **Bent-hole tracing is the weak link** (Heritage: 16 bent holes). The bend search scores the next leg over 70 px. It fails when that leg runs under sprites, rings or other ribbons, and when two bends are close together.
- **Short straight holes.** The competitor test needs the competitor angle scaled to atan(W / length). After scaling, Lenard 1, 2, 14 and Townelake 5 still fall through to tracing, which finds the same straight answer.
- **Golden hole 18** is lost from its pad but reached BP1 with 2 bends in the badge-only seed.
- **The cap locator jumps 22–54 px on 5 of 13 visible golden tees.** It is only needed for hidden tees.
- **Alex hole 13's hidden tee** finds no pose with the pad fully hidden. Its fallback sits 36.6 px from Sam's tee point and 6.9 px from Sam's corridor start.
- **Sam's 5.4 deg kink on Alex hole 6 is not in the raster.** The edges 25–85 px and 125–185 px from the tee lie on one straight line within ±0.4 px.
- **Golden basket testimony** = BasketPoint − (0.34, 3.73) px on 15 of 18 holes, i.e. sprite tip + (0, −3.0) px after the −4 frame offset.
