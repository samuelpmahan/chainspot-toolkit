# ChainSpot doctrine (Sam's rulings)

What Sam has decided, each with the evidence that made it concrete. Agents
read this before changing a Stage. Where the repo and Sam disagree, Sam is
right and the repo is behind. Every number carries a unit.

## The scene

- The image is a satellite photo with **rendered sprites** drawn over it:
  semi-transparent grey hole path, per-basket C1 (10 m, solid) and C2
  (20 m, dashed) circles with semi-transparent fills, rigid tee pads,
  baskets, numbered badges. Understand how the scene is built; do not
  guess and check.
- **C2 = 2 x C1 exactly**, both centred on the basket. Measured ratio
  1.96-2.06 across four courses; the spread is our fit error. Their radius
  gives the course scale in px per m.
- **Tee pads are one rigid template per course.** Pad size scales with the
  map; frame stroke (about 3.5 px ends, 3.0 px sides) and C2 dash period
  (about 25.5 px) are constant in screen px. The pad interior is a
  course-constant grey (golden RGB 158/157/159).
- **Z-order is not perfectly consistent**: learn it by cropping and
  inspecting. Overpaint is subtractive (it removes pixels, never fuses).
- **Anti-aliasing pixels must be owned.** Brightness detectors are blind to
  their biggest distractor otherwise: about 155 px per basket (white-black
  seam) are unowned today. Exact owned pixels refine everything downstream.
- **Do not mute AA pixels yet.** First a baseline all the way through S7;
  then muting AA is one AblationForkJoin row, measured against that
  baseline across every stage. Muting also blinds the brightness-driven CV:
  hole paths read brighter than terrain because of their alpha, so the
  effect on S6/S7 must be observed, not assumed. (Golden..alex contact
  sheets, 2026-10-17: unowned AA blend = 32,365 px over 81 baskets, 10,329
  px over 76 tees; badges' existing 2-px mute already covers all of theirs.)
- **Fit sprites as anti-aliased renders, not thresholded masks.**
  Thresholding drops the blend on both edges of a stroke, which shrinks
  pads; the blend pixels carry the sub-pixel edge position.
- Each basket's C1 has a light spoke that points at the **front edge** of
  the next hole's tee (the end facing its badge); median 1.0-2.6 deg.
- **BasketPoint** (Sam, 2026-10-17: the spokes meet the stem's tip edge at
  a precise point) = basket bbox (x + 22.5, y + 71) + (+0.34, +0.73) px: the
  bottom edge of the stem, solved from 59 spokes on 5 courses (residual
  median 0.38 px). See `docs/evidence/basketpoint/`.
- Visible path width differs from the annotation corridor; treat
  `corridorWidthPx` as a tolerance, not pixel truth.

## Stages

| Stage | Contract | Judge |
|---|---|---|
| S1 | badges and numerals; needs no external truth | count = holes, labels 1..N |
| S2 | baskets, **precision only** | Sam's basket points |
| S3 | visible tees, **precision only**; recall is S4's. Initial association (Sam, 2026-10-17): each unoccluded pad pairs with at most 2 badges, one obviously better; continuing its axis to a BasketPoint starts S5's straight-hole matching before recovery (`ports/s3assoc/`) | Sam's tee points, hole numbers |
| S4 | recover tees and baskets until counts match badge cardinality N; occlusion-aware by default: assume the sought sprite is occluded; entail from what must be true | Sam's points |
| S5 | a tee's **long axis points directly at its badge**; residual indicts the tee fit | hole n's tee pairs with badge n |
| S6 | straight holes are the trivial case: objective path loss along tee to basket; learn the course-local path transparency profile there | straight-hole residual |
| S7 | find the path signal and ride it; all holes resolve tee to badge to basket, trace stays in the ribbon; perfection = bend points on the centreline | Sam's bends |

## Points and identity

- **The tee is the full pad; its position is the pad centre.** Sam's
  annotation of an occluded pad marks the centroid of the visible hole
  (semi-transparent tint does not hide it; opaque sprites do), so judge
  testimony there and report the full-pad error beside it.
- Identity is geometric, not hashes: equality Contracts with tolerances
  (`contracts/`). Hashes only check that bytes written are bytes read.
- `sealed/` in chainspot-corpus is off-limits until Sam says otherwise.
  Acceptance is always Sam's; judges report agreement, never acceptance.

## How we work

- FGs are functional: Composition -> Composition. Mixins, flow combinators
  (ComparableForkJoin, AblationForkJoin), tests and forced renders are all
  FGs. Parallel implementations, compared directly, are the priority.
- Calculations declare inParts and outParts; everything goes through the
  addressed store, never a side channel.
- Build from what is certain; let interfaces reveal themselves through
  need. Wherever friction emerges is an opportunity to abstract and
  automate. Pragmatic and cross-verifiable beats perfect rule following.
- Progress course by course, stage by stage; explain each stage's numbers
  against the stage before. Each thing learned is part of the long tail.
