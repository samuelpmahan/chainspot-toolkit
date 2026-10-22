# S7 first legs owned from the start (2026-10-22)

The coordinator noticed this in the seatacFull 16 evidence render: the S7 default's route to Basket cc rides hole 17's
hallway straight over badge 17.

Every hole's first leg is known from the skeleton before any route is solved: tee cap S → badge → B*. Here
B* = tee + 2 × the badge's distance along the tee axis (the badge sits at the middle of the first leg). The rule makes
those segments owned from the start:

- A route may cross another hole's first leg, but may not run along it. This is the existing owned-corridor test
  (`kbends.mjs legRunsAlong`): more than half of a leg's samples, taken W/4 apart, lie within W/2 of the first leg and
  within 30° of parallel to it.
- A route may not pass over another hole's badge plate (the S1 badge box).

## 1. Measurement first (no adoption)

The measurement is `tk.s7.firstLegCheck` (`ports/s7route/firstLegs.mjs`, runner `ports/s7route/firstLegRun.mjs`), run on
the dev attempts in `docs/evidence/dev-s1s4/ATTEMPTS` and the 11 validation views. S7 only.

**Sam's routes on dev (testimony).** 75 routes: golden 18, lenard 18, townelake 18, heritage 18, alex 3. **None breaks
either rule.**

**Sam's six validation holes** (the default's routes, which he called right): Beaver 4 and 19, Coleto 10, 11 and 18,
SeaTac 19. **None breaks either rule.** In fact no default route on those views breaks one.

**The default's routes elsewhere.** No default route runs along another hole's first leg on any course. Seven routes pass
over another hole's badge plate, all on validation views:

| view, hole | the default's route | known? |
|---|---|---|
| seatacFull 16 | to Basket cc: legs 4 and 5 over badge 17 | known wrong (32.17 R1 vs 11.19 R1 in the capture) |
| seatacFull 10 | to Basket cu: leg 1 over badge 13 | known wrong (the 10/11 swap) |
| seatacFull 11 | to Basket cp: leg 1 over badge 5 | known wrong (the 10/11 swap) |
| beaverranchLazy 3 | to Basket cp: leg 2 over badge 4 | cross-view wrong (19.05 vs 10.62 R1) |
| beaverranchLazy 17 | to Basket cl: leg 1 over badge 18 | cross-view wrong (12.9 vs 9.75 R1) |
| beaverranchLazy 20 | to Basket cm: leg 2 over badge 4 | cross-view wrong (10.92 vs 8.06 R1) |
| fountainhillsLazy 2 | to Basket cl: leg 1 over badge 17 | no capture length to compare |

So every default route that breaks the rule is wrong on the existing labels, or has no label.

**Skeleton contradictions.** On three holes the hole's OWN first leg (S → B*) passes over another hole's badge plate:

- seatacFull 10, over badge 13;
- seatacFull 11, over badges 5 and 12;
- fountainhillsLazy 2, over badge 17.

There are none on dev. On these holes the tee's badge association is the suspect, which matches the lane cross-check's
earlier reading of seatacFull 11.

In the first build, these holes were bound by the rules like any other. They then took other holes' baskets: seatacFull
10 took hole 12's, 11 took hole 6's, and fountainhillsLazy 2 took hole 19's. Cross-view went 123 → 125, with 4 new
disagreements.

The rule therefore states the contradiction:

- A contradicted hole's first leg is owned by nobody.
- The rules do not bind that hole's routes; this is recorded in its `why`.
- Its badge plate stays foreign to the other holes.

## 2. The rule set

`routeMatchKBendsSeq3SearchWFirstLegs` is the S7 default plus `seqFirstLegs: true`; its implementation is in
`impl/fn.Hole.trace/`. The evidence sibling is kept as is. Inside the default's sequencing (`match.mjs seqCellsOf`):

- the first legs join the owned corridors, from the start, for every chain, split, polish and follower route;
- the K ≤ 1 routes are ruled out where they run along a first leg (`kCellAt` owned);
- the other holes' badge plates join the foreign C1 rings (`seq.mjs foreignRingsOf`, `kbends.mjs ringCrossed`);
- a straight claim whose straight route breaks either rule is not made, and the hole is solved as bent;
- the final route's placement and badge prior are undone where they break a rule, as is already done for rings.

Without the option, the default's output is identical to HEAD (end basket and every vertex) on all 17 courses.

## 3. Judgement (S7 only, existing attempts)

**Dev**: agreement with testimony, then bends hit / missed / extra. The default and the sibling give the same result on
every course:

| course | agree | bends |
|---|---|---|
| golden | 17/18 | 10/0/1 |
| lenard | 18/18 | 0/0/0 |
| townelake | 18/18 | 3/0/0 |
| heritage | 18/18 | 18/1/1 |
| alex | 3/3 | 0/0/0 |

No route changes on any dev course, northpark included. Golden's 17/18 (hole 5) predates this change: it comes from the
dev attempt rebuilt after the evidence merge, and the default reads 17/18 at HEAD on that attempt too.

**Validation**:

- **Sam's six:** unchanged, same routes.
- **seatacFull 16:** fixed. It now goes to Basket co, 11.01 R1, against 11.10 R1 in the capture.
- **seatacFull 10 / 11:** unchanged. They are skeleton contradictions, and the cause is the tee-badge association
  upstream of S7.
- **beaverranchLazy 3, 17, 20:** fixed.
  - Hole 3 goes to Basket cm: 10.58 vs 10.62 R1.
  - Hole 17 is no longer claimed straight over badge 18: 9.26 vs 9.75 R1.
  - Hole 20: 7.94 vs 8.06 R1.
- **beaverranchLazy 1 and 21:** swapped baskets cr and cs.
  - Hole 17's freed basket (cl) entered hole 21's top-3 neighbourhood and pushed cs out of it.
  - Hole 1 now reads 14.06 vs 11.66 R1, a regression.
  - Hole 21 still reads within 15 % (12.82 vs 13.32 R1).
- **Cross-view agreement:** 123/133 for the default, **126/133** for the sibling.
  - 4 fixed: seatacFull 16, beaverranchLazy 3, 17, 20.
  - 1 new disagreement: beaverranchLazy 1.

**Time**, in ms. The sibling's time is measured on the store after the default ran, so the scene and the route table are
shared; it covers the sibling's own cells and final routes:

| course | default | sibling |
|---|---|---|
| golden | 3223 | 838 |
| heritage | 10008 | 2519 |
| townelake | 2912 | 1026 |
| lenard | 1544 | 14 |
| alex | 4843 | 1491 |
| northpark | 2918 | 444 |
| beaverranch Capture / Full / Lazy | 18596 / 12344 / 10429 | 5665 / 3020 / 2904 |
| coletocreek Capture / Full / Lazy | 13234 / 13169 / 13045 | 3914 / 3435 / 1671 |
| fountainhills Capture / Full / Lazy | 6184 / 1973 / 4173 | 1091 / 54 / 793 |
| seatac Capture / Full | 14106 / 15497 | 5253 / 2993 |

## Renders

The check renders through `fn.q.part.render` (`fg/s7route/firstLegRender.mjs`):

- one crop per route that breaks a rule;
- one crop per changed hole, the default's route dashed white beside the sibling's in green;
- every other hole's first leg drawn in cyan, every badge plate outlined, a legend.

To produce them: `node ports/s7route/firstLegRun.mjs --specimen S --attempt ID --out DIR`.
