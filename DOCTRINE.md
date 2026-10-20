# ChainSpot doctrine (Sam's rulings)

What Sam has decided, each with the evidence that made it concrete. Agents
read this before changing a Stage. Where the repo and Sam disagree, Sam is
right and the repo is behind. Every number carries a unit.

## How to read these rulings (Sam, 2026-10-18)

- **Phronesis and cleanrooming.** Sam's rulings are practical judgement on particular cases (heritage hole 8 is
  straight); the cleanroom keeps that judgement honest: rebuild from behaviour and a stated spec, prove equivalence
  on outputs (geometry, not hashes), hold validation out (`sealed/`).
- **Metaphors are specs.** "Model it after Redis" became the keyspace; "known endpoints, work backwards" is
  conditioning on a collider; "scoring and matching are separate, symbiotic phases" is two kinds of Calculation.
  An agent that treats one as an image builds the wrong thing.
- **The scene is a generative model.** Course -> hole n -> {tee, badge, basket, path}; stages condition on the known
  nodes first (badges, ring geometry, then endpoints) and infer the uncertain ones from them.
- **What it learns is generalization.** Declarative composition makes recombination predictable, which is what lets
  a shot be called before the run; a called shot that lands on a combination never run before is the evidence that
  something was learned rather than memorized, and an uncalled change is where the model is wrong. Dev is solved
  reliably first; then the rest of the corpus opens up for true learning, and `sealed/` stays the unseen test.

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
| S6 | straight holes are the trivial case: objective path loss along tee to basket; learn the course-local path transparency profile there. Heritage hole 8 is straight (Sam, 2026-10-18, from the S6 render: his mark's bend sat 2.67 px off the 272 px line); the corrected annotation is a new file | straight-hole residual |
| S7 | find the path signal and ride it; all holes resolve tee to badge to basket, trace stays in the ribbon; perfection = bend points on the centreline. Known endpoints first (Sam, 2026-10-18): the ABFeature era paired every badge with every basket endpoint, scored the pairs and assigned them one-to-one, which is what let it assume known endpoints and work backwards from the basket. The hallway tracker prototypes (`docs/evidence/s7edge`, `s7main`: 16/18 on golden, lenard, townelake) graduate before any new signal | Sam's bends |

**Partial views are stitched first (Sam, 2026-10-19).** S4's tee budget (N = badges in frame) and S7's one-to-one
assignment assume the whole course is in the frame, and they should: a partial view (lenard1-5) is stitched into the
whole course before S0 (autostitch: `source/provider/packages/alg/src/stitch.ts`, not yet wired into the toolkit).
Stitched images stay deferred until absolute-pixel and absolute-ratio issues stop appearing. The checklist is the
inventory of absolute px and fixed cross-unit ratios in S0-S7 (`docs/evidence/abs-px/INVENTORY.md`; E19: between 1x and 2.33x the map scales 2.33x, pad
sprites 2.04x and the hallway ribbon 1.45x, so a rule written in one of those units and applied to another drifts up
to 1.6x). No off-frame rule is built for partial views.

**Stitching is native, now (Sam, 2026-10-19, superseding the deferral above).** A capture of several tiles is one
course that someone zoomed in on to make the screenshots easier, so stitching is part of the import flow. The thin
end-to-end slice is The Rec (a 9-hole thrown round that needs stitching, so nothing may assume 18 holes) and the
3-hole loop on Dash's Track. Effort guide: the long tail is closed by a correction UI, not by more CV. A bend is
fixed in 3 clicks or fewer; with endpoints right and most straights and bends right, a bad course costs 10-15 clicks.
CV effort moves to non-dev courses, to learn what to nail down and what to adapt.

**UDisc renders differently at different zooms (Sam, 2026-10-20).** A sprite is not one thing that scales; its
parts follow different laws. Measured on The Rec (single raster vs the zoomed L tile, map 1.66-1.74x): a tee pad's
grey fill scales with the map (28x17 -> 52x33 px), its white frame stays ~3-4 px at every zoom, and its colours do not
change (fill 158, frame 255). Badges are fixed-size sprites (54-57 x 42-44 px at 1x and 2.33x). The hallway ribbon
scaled 1.45x where the map scaled 2.33x (E19). So every rule names which law its quantity follows: map-scaled
(expressed in rC1px, the radius of the basket's C1 circle measured per image; never the hallway width, which follows its own curve), screen-fixed (a constant px, GLOBAL), or a ratio only
between quantities that follow the same law. Accommodating this variety is the requirement, not an edge case.

**A stitched course is one raster (Sam, 2026-10-19).** The tiles of one capture (lenard1-5; Dash's Track's four
tiles and overview) are not separate images to judge, match or count one by one. Mathematically there is a single
course raster in a single frame. Mechanically it may be backed by several rasters plus their placements, which is the
store's business, like any other backing. So identity, counts, budgets and judging take the course as the unit: a
tile with 4 badges is not "refused", it is part of a course that has 18. Per-tile numbers are diagnostics, never
verdicts.

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
- **PxC is queryable; math is written once, inside it** (Sam, 2026-10-18).
  PxC is a cache-semantic store whose backing per Part type can be refined
  (a list today, a selector over a shared plane tomorrow) without anything
  outside the store boundary changing. Code outside asks questions by Part
  address (`fn.q.pxset.count / bbox / intersectCount / render`), answers
  are `{ value, unit }` and cached by their arguments (Parts are
  write-once). The math pattern-matches on the backing in ONE place
  (`fg/pxset.mjs`); consumers compose operations (`ownerPlane`,
  `componentStats`), never re-derive them. Tests are written once over the
  union (`pxsetProperties`: every backing of the same px answers the same)
  and run on any input (`fg/pxset.dev.test.mjs`: every dev course).
  The S4 pose search lives behind the boundary the same way
  (`ports/s4recover/poseSpace.mjs`, `fn.q.pose.*`). The greedy loop only
  asks questions; the pads already owned are an argument, never shared
  mutable state; answers are reused inside the store when a new pad cannot
  change them.
- **Profiling is a property, not code in the work** (Sam, 2026-10-18).
  (1) Work worth measuring is a Calculation: the PartStore times every call
  and copies the measures its output declares in `emits` onto the call's
  entry. (2) A runner's store is instrumented (`fg/profile.mjs`
  every store keeps its call log and offers it as
  `fn.tk.instrumentation.calls`; runners write it as the
  `instrumentation.json` sidecar. (3) `profiled` is a DEFAULT property of
  every composed FG (with instrumented, rendered): its record gets its own
  call subtree, calls and summed emits, deterministic, with units. Timings stay
  in the sidecar, never in hashed records; `profileSummary` /
  `profileFrame` turn any sidecar into a table or flipbook page.
  A Part a Calculation needs is declared as ITS inPart, so it is produced on
  first need. Declaring it on a caller resolves it eagerly (golden paid
  254 ms for a hallway it never used).

- **A Part owns its whole tree** (Sam, 2026-10-18: "That's why a Part
  contains its own Parts and Calculations, and why Calculations contain
  their inParts, executable, and outParts"). What a Part owns is inferred
  from its structure, never picked field by field per consumer: every
  pixel list anywhere in it (`ownedPx`, `fg/pxset.mjs`). On every dev
  course a basket's shell (`has.findShellFamily.blackPx`) is a subset of
  its px (98 of 98 baskets), and a badge also owns its mute ring
  (`has.mute.px`). The artifact JSON reshapes the same Part with different
  field names, which is how two consumers came to pick fields by hand.
- **A PixelCache holds one raster and views on it** (Sam, 2026-10-18: "PixelCache
  should mean this is 9 views on the same single raster"; he calls this an
  illustrative metaphor, not a ruling: the direction, not a mandate). An attempt today
  writes nine full-frame RGBA artifacts (badgePx, muted, counters, basketPx,
  remaining x2, teePx, refinedPx, eliminatedPx; 10.7 MB each, 96 MB of a
  217 MB attempt), every one `px.image.cropped` with alpha zeroed on a pixel
  set that is itself a Part. They are views: a raster query over the one
  image and a PixelSet (`fn.q.raster.maskAlpha`), recounted in memory by the
  materialize FGs with the sha in the receipt, never written as bytes. The
  same rule as the Calculations: served, not stored. Attempts are
  reproducible from the recipe, so unreferenced ones are deleted
  (`state --prune`); the ReproducibleRecipe is the artifact.
- **S0's autocrop stays** (Sam, 2026-10-18). It was added in August to quiet an
  agent, and it stays for two reasons: (1) to expand later; (2) so that agents
  are broken of over-reliance on sha-based equivalence (a crop changes every
  hash downstream while the geometry is the same; "hash discrepancies are not
  geometry"). Never remove it to make hashes line up.
- **Everything is included by default; the cache makes it tractable** (Sam,
  2026-10-18: "default OFF hardens over time until prototyping is impossible.
  ComparableForkJoin exists so that everything is included by default. This
  is made tractable by the warm caching of PxC. If you model this one after
  Redis you don't even need separate branches"). Lane flags that default OFF
  are the thing to retire: every implementation runs every time, as a variant
  key in ONE store (`px.tees.refined@structural`), a pointer names the
  accepted variant, and a call whose inputs and code have not changed is a
  cache hit (key = sha256 of the Calculation, its code, its args and its
  inputs' keys), so running everything costs only the new work. The snapshot
  is the keyspace dump. `fg/store.mjs` carries this: keyOf, variants, point,
  cache, keyspace.
- **Interface vs TypedInterface; delegates are FGs** (Sam, 2026-10-18).
  An address list is an Interface; a TypedInterface also says what kind
  of Part sits at each address. A slot is a C#-style delegate: a typed
  signature (typed inParts -> typed outParts) plus its contract, declared
  as an FG; any implementation with that signature plugs in. Because a
  Calculation carries its inParts, its executable and its outParts,
  (executable hash, inPart hashes) keys its outParts: dependency-aware
  cache invalidation. The whole closure compiles, so it is checkable
  statically, before anything runs.
- **ComparableForkJoin defines its contract and comparison as FGs**, with
  or without defaults (Sam, 2026-10-18). Then anything can be tested and
  compared, and testable implementations accumulate side by side instead
  of being forced into branches or hidden. Recipes (Bazel-like) make
  artifacts ephemeral: the ReproducibleRecipe is the actual artifact.
- **Testimony is optional and impeachable** (Sam, 2026-10-18). Hand marks
  are often a few px off, and "known" tee poses are often a little wrong.
  Testimony is one signal among others, never ground truth; a
  disagreement with it is a question settled by visual cross-referencing
  (render both), not a verdict against the pipeline. Every run must work
  without it.

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
