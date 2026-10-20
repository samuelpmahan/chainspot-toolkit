# How to work in chainspot-toolkit (all agents)

Read this before changing anything. Sam owns the design and acceptance. `DOCTRINE.md` holds his rulings and the
evidence behind them. Every rule here was learned the hard way.

This file is the map; the details are one step away:
- `node scripts/pxc.mjs explain <topic>` prints a topic page from `docs/agents/`: prototyping, boundary, parts,
  calculations, fg, evidence, lanes (two agents: platform and algorithm, who owns what, how the algorithm lane starts).
- `node scripts/pxc.mjs doctor [file | --attempt id]` shows what is outside the system, with the fix.
- `node scripts/pxc.mjs scaffold query | calculation | mixin ...` writes the right shape, with a passing test.
- `node scripts/pxc.mjs state [--retest] [--freeze]` derives the state of every stage on every dev course (goal, expected,
  result, status, freshness) and re-runs only the stale cells. Status is never typed by hand.

**Prototype freely.** Scratch scripts, Python and direct pixel loops are fine while an idea is unproven, and
nothing blocks them. When it works, graduate it (`explain prototyping`): doctor, then scaffold, then prove identical
output.

## Work in the system, not around it

- **PxC is the PixelCache: a cache-semantic store.** Every Calculation's output is a Part at an address. Read Parts
  with `store.get(address)`. Never look for, or re-derive a Part from, the artifact files written beside a run.
  A runner's store sits on the PxC snapshot (`early/s3.pxc.bin`) as its board (see `ports/s4recover/run.mjs`).
- **Math is written once, inside the store, and invoked from outside by query.**
  - PixelSets: `fn.q.pxset.*` (`fg/pxset.mjs`).
  - Poses: `fn.q.pose.*` (`ports/s4recover/poseSpace.mjs`).
  - Renders: `fn.q.part.render` (`fg/render.mjs`).
  New pixel math becomes an operation or query there (`scaffold query <family>`), matching on the union of Part
  kinds and backings.
- **A Part owns its whole tree:** its px and every pixel list in its own Parts (`has.*`). Infer ownership from the
  structure (`ownedPx`, or the reference `px.baskets#3`); never pick fields by hand.
- **Backings are the store's business.** A list, a label of a shared plane, or a byte array can change behind the
  boundary without anything outside changing.
- **A derived view is its own Calculation with its own address** (`tk.*`). Never put a reshaped copy at an existing
  address.
- **A Part a Calculation needs is declared as that Calculation's inPart.** It is then produced on first need.
  Declaring it on a caller computes it eagerly.
- **State is an argument, not shared mutation.** Example: the pads already owned are passed to the pose queries.
- **Data conditions are recorded results, never throws.** Examples: "no anchor pads", "lane not run", "no testimony".
  Only integrity checks stop a run: hash mismatches, mutated source pixels.

## Default properties: automatic, never hand-written

- **Every Calculation is profiled.** The store logs every call with its time and the `emits` its output declares.
  Put measures in `emits`; never time things by hand. The log becomes the `instrumentation.json` sidecar; view it
  with `fg/profile.mjs`.
- **Opaque hot spots are flagged automatically.** Any call whose own time (outside its nested store calls) is 5% of the
  run or more is an OPAQUE HOT SPOT: its steps happen outside the garden and the profile cannot see them. Every profile
  summary carries them, every profile page fails a verdict on them, runners print them, and `pxc doctor --attempt` lists
  them. Fix one by making its steps store queries or Calculations; never by raising the threshold.
- **Every composed FG** is `instrumented`, `profiled` and `rendered` (`fg/compose.mjs`, registry
  `DEFAULT_PROPERTIES`). Records hold only deterministic numbers, with units (`unitful`); timings never go in.
- **Every Part is renderable.** `fn.q.part.render` renders any address to flipbook kinds. If a Part does not
  render, add a case to `fg/render.mjs`; never write a renderer at the call site.
- **Reusable FG behaviour is a mixin** in `fg/mixins.mjs`, composed with `pipe(...)`. Declare its property in
  `stages/*.json`; the registry test checks it.

## Before building anything

- Check whether the system already has it: a Part, a query, a mixin, a Calculation. Ask the store first.
- Implement Sam's general rules exactly as he gives them, before inventing signals of your own. Examples:
  - "assume the sought sprite is occluded";
  - "the tee→badge segment is straight hallway";
  - "a visible fragment pins a pose";
  - "S1-S3 are a fast first pass, S4 recovers".
  No detours he did not ask for.
- When stuck, render it legibly and ask. Sam often sees the differentiator in a picture.

## Evidence and reporting

- Every number carries a unit AND a referent: what it measures, on which course or image.
- Name candidates Excel-style (`Basket cX`) until identity is proven, then `Basket 4`. Never invent hole labels.
- Testimony is optional and impeachable: hand marks are often a few px off. A disagreement with it is settled by
  rendering both and cross-referencing by eye, never by treating testimony as ground truth.
- Judges report agreement with Sam's testimony, never acceptance.
  - Use one match rule per kind: tee 8 px, basket 12 px.
  - Calibrate ground-truth-free cross-validation on annotated courses before trusting it on unannotated ones.
- GLOBAL means it holds across courses AND zoom scales. Everything else is LOCAL (measured per image) or VARIABLE.
  Never put an absolute px bound on a map-scaled quantity.
- Renders must be legible enough to validate by eye: labelled, coloured by status, with a legend.

## Changing code

- **A refactor must give identical output** on every dev course (`docs/evidence/dev-s1s4/ATTEMPTS`) before you
  claim it. Diff recovered poses, scores, evidence and misses. `node scripts/pxc.mjs state --retest` re-runs the
  stale cells and shows every row against `frozen.json` (same / changed / new).
- **A behaviour change must be judged** (`node ports/judge/judge.mjs --specimen X --attempt ID`) and reported as
  TP/FN/FP plus right/wrong hole, per course.
- **Checks:**
  - `architecture.test.mjs`: an advisory report of boundary debt. It never fails. After paying debt, run
    `UPDATE_RATCHET=1 node --test architecture.test.mjs`.
  - `fg/render.dev.test.mjs`: every Part of every dev PxC renders.
  - `fg/pxset.dev.test.mjs`: every backing gives the same answers.
  - The registry checks declarations against `stages/*.json`.
  - `unitful` checks the units of anything published.
- **Run everything:** `node --test fg/*.test.mjs fg/*/*.test.mjs ports/*/*.test.mjs impl.load.test.mjs architecture.test.mjs inventory.test.mjs models.test.mjs provider-adapter.test.mjs`

## Commands

- **S0-S3 (plus lanes), from the working tree:**
  `node toolkit.mjs neat --recipe recipes/chainspot-s0-s7.json --specimen golden --until 4 --lanes s3-findfamily-structural-fix,s4.basketRecovery`.
  It prints `next`; run that command.
- **S4 tee recovery on an attempt:** `node ports/s4recover/run.mjs --specimen golden --attempt ID`.
  Writes `instrumentation.json` and a flipbook with profile and Part pages.
- **S3 association:** `node ports/s3assoc/run.mjs --specimen golden --attempt ID`.
- **Disk:** a run writes each image once, as a file under its `img/`, and references it: write flipbooks with
  `writeFlipbook` (`fg/node-flipbook.mjs`), never inline base64 renders or the source image into frames, flipbooks
  or SVGs. `node scripts/pxc.mjs prune --dry-run` shows what deleting old attempts and superseded runs frees.
- **Specimens:** golden, lenard, townelake, heritage, alex, northpark (full courses); lenard1-5 (zoomed views of
  Lenard). Testimony is in `testimony/<specimen>/`. Captures (tiles S0 stitches into one course, `explain boundary`):
  therecCapture, dashsCapture, lenardCapture; therec is The Rec as one raster.

## Constraints

- `sealed/` in chainspot-corpus is off-limits. Validation is held out.
- Never commit in the bare mining clones (`/home/user/mine/*`). No PRs unless asked. No model identifiers in commits.
- Hash discrepancies are not geometry; geometry is what matters.
- Do not mute anti-aliased pixels until there is a baseline through S7.
