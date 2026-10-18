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
- **Scale comes from the rings only** (Sam, 2026-10-18: "pad size COULD
  vary. Circle1Radius and Circle2Radius WILL NEVER VARY"). C1 = 10 m and
  C2 = 20 m are the app's definition; R1 in px is the image's scale. Nothing
  course-made (pads, hallways) ever sets or corrects it.
- **Tee pads are one rigid template per image.** On all 11 dev images a pad
  is a 6.0 m x 4.0 m ground rectangle outlined by a screen-px frame stroke
  (3.53-3.62 px ends, 3.01-3.05 px sides): length = 3.53 px + 0.597 x R1,
  width = 2.99 px + 0.399 x R1, max residual 0.27 px. That is an observed
  prior, not a constant: pad size is course data. Predict from it, fit the
  image's own pads, and report a miss as a finding about the pads. The pad interior is an image-constant grey
  (golden RGB 158/157/159). The C2 dash period is NOT screen-constant (an
  earlier reading said 25.5 px): it is 21.5-33.5 px, see the ledger below.
- **Constant means constant across courses AND zoom scales** (Sam,
  2026-10-17). Every claim carries its scope (`fg/scene/invariants.mjs`,
  `docs/evidence/ledger/`):
  GLOBAL (holds on full courses and zoomed views): basket sprite 46 x 72
  px; badge sprite size by label; frame and ring strokes in screen px;
  C2 = 2 x C1 (10 m and 20 m by definition: the scale anchor).
  LOCAL (one value per image, measured on every run, free orientation in a
  blind run): R1 (21-56 px), pad template (prior 6 m x 4 m, checked), pad frame px, S3 band fill,
  hallway width (31-52 px), C2 dash period. Hallway width / R1 and dashes
  per C2 circle fall in two scale regimes (1.46-1.49 and ~10 dashes when
  R1 <= 27 px; 0.93-0.94 and ~21 dashes when R1 >= 36 px; full Lenard and
  its zooms sit on opposite sides): measured, never assumed.
  VARIABLE: counts in view (a zoomed view can show a basket whose badge is
  off-screen). A bound in absolute px on a map-scaled quantity is a hidden
  scale assumption: S3's band fill bound and the s7main R1 search range
  both broke at zoom.
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

- **PxC is the PixelCache: Parts are addressed, never hunted for** (Sam,
  2026-10-18). Every Calculation's output is a Part at an address, held in
  the PxC and reused by every consumer that names it (`px.components`,
  `px.badges`, ...). A consumer reads the board (`store.get(address)`); it
  never checks whether some file exists or re-derives a Part from artifact
  files written beside it. Derived views are Calculations of their own with
  their own addresses (`tk.s4.*`), not reshaped copies at an existing
  address. `ports/s4recover` reads the S3 PxC this way.

- FGs are functional: Composition -> Composition. Mixins, flow combinators
  (ComparableForkJoin, AblationForkJoin), tests and forced renders are all
  FGs. Parallel implementations, compared directly, are the priority.
- Calculations declare inParts and outParts; everything goes through the
  addressed store, never a side channel.
- Build from what is certain; let interfaces reveal themselves through
  need. Wherever friction emerges is an opportunity to abstract and
  automate. Pragmatic and cross-verifiable beats perfect rule following.
- **Every number names its referent, not just its unit**: what was counted,
  out of what, where. "3 missing" says nothing; "S2 found 15 of Alex's 18
  basket sprites; Sam annotated 3 baskets (holes 16, 13, 6), all found" does.
  A field that looks like an id but isn't one (Alex's annotation `number` is
  its order, not the hole) gets an explicit map in the data
  (`testimony/alex/hole-numbers.json`), never a remembered inference.
- **Candidates are named Excel style** (Sam, 2026-10-17): `{Tee|Badge|Basket}
  c[a-z]+` (ca, cb, ... cz, caa) in raster order of their centres, until
  their identity is proven; then `Tee 12`. A letter code can never be read
  as a hole number, a count or a list index (`fg/names.mjs`).
- Progress course by course, stage by stage; explain each stage's numbers
  against the stage before. Each thing learned is part of the long tail.
