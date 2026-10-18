# Three lanes, two agents each: S5, S6, S7 (Sam, 2026-10-18)

"S7 alpha composition informs S5 learning and S6 discrimination." Each lane builds its stage the way S4 is built
(a ComparableForkJoin on keys, every implementation included, a pointer by a stated rule, judged against testimony,
a cell in the state matrix). Within a lane the two agents build complementary halves; across lanes they trade
through contracts, never through each other's code.

| lane | branch / worktree | agent A: the stage | agent B: the measurement it rides on |
|---|---|---|---|
| S5 pairing | `lane/s5` (`/home/user/lanes/s5`) | `fn.Tee.pairBadge`: every tee (S3 observed + S4 recovered) paired with its badge; judge "hole n's tee pairs with badge n"; cell `S5pairs` | **learning**: `fn.q.pair.*` axis-residual queries; `tk.s5.residualProfile` (course-local residual of tee axis vs badge ray on straight pairs); un-composite the pad with the S7 alpha profile before fitting the axis |
| S6 straight | `lane/s6` (`/home/user/lanes/s6`) | `fn.Hole.straight`: straight vs bent per pair (variants: the 3-point `straight3`, `pathLoss`, `pinned` two-ray rows); judge TP/FP/FN/TN vs Sam's bends; cell `S6straight` | **discrimination**: `fn.q.path.*`: overlay fraction along tee -> basket from the alpha profile; `tk.s6.pathLoss` per pair; the course-local path transparency profile learned on straight holes |
| S7 trace | `lane/s7` (`/home/user/lanes/s7`) | **alpha composition**: `tk.s7.alphaProfile` per `contracts/alpha.profile@1.mjs`, fitted on the C1/C2 fills (known geometry) and straight-hole ribbons; `fn.q.alpha.*` queries; legible swatch + unmixed-crop renders | **trace**: `px.s7.overlayFrac` (a derived view), ride the path from the badge exit tee -> badge -> basket; bend points vs Sam's `corridorBends`; judge `S7bends`; cell `S7trace` |

## What crosses lanes

- `contracts/alpha.profile@1.mjs` is the only shared surface: the Part address `tk.s7.alphaProfile`, its shape, and
  the pure `composite` / `unmix` / `overlayFraction` functions. S5-B and S6-B consume it as an inPart (declared, so it
  is produced on first need) and record `no alpha profile` when it is absent; they test against a fixture profile.
- The S7 lane's first commit of a working profile is merged into `lane/s5` and `lane/s6` by the orchestrator
  (`git merge lane/s7`); a lane may do that itself once `git log lane/s7 -- fg/alpha` shows it.
- S5's pairs (`px.tees.pairs`) feed S6; S6's straight pairs feed S7's calibration. Until merged, each lane uses the
  pinned late outputs (`--until 5|6|7`) or the judge's `S5straight` rows as its upstream and says so.

## Rules (binding, from AGENTS.md and Sam)

- Work in the system: Parts by address, math as store queries, state as an argument, data conditions recorded.
  Every Calculation profiled by the store (never a hand stopwatch); every Part renderable; every composed FG
  instrumented, profiled, rendered.
- One match rule per kind (tee 8 px, basket 12 px; a bend within half the corridor width). Testimony is optional and
  impeachable; report agreement, never acceptance. Candidates `Tee cX` until proven. Units and referents on every number.
- Call the shot before every run; grade it after; an uncalled change is a finding to investigate.
- Two agents in one worktree own disjoint files (the table above); `git add <own files>` only; retry on `index.lock`.
  Commit small with the session trailer lines; never push; never a model identifier in a commit.
- Never touch `/home/user/chainspot-toolkit` (the main checkout), `/home/user/mine/*`, or `sealed/`.
