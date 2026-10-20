# The PxC boundary: math once, inside the store

PxC (PixelCache) is a cache-semantic store. Code outside it asks questions by Part address. Inside, each question is
answered once, by pattern matching on the union of Part kinds and backings.

**Existing queries:**

| query | answers | lives in |
|---|---|---|
| `fn.q.pxset.count / bbox / intersectCount / render` | PixelSets: `{ value, unit }` | `fg/pxset.mjs` |
| `fn.q.pose.overview / searchBadge / occluderSearch / describe / evaluate` | rigid-template poses | `ports/s4recover/poseSpace.mjs` |
| `fn.q.pair.residual` | a tee axis vs the ray to its badge plate: residual deg, signed perpendicular px (S5) | `ports/s5pair/residualQuery.mjs` (the S5 learning lane's `fn.q.pair.*` replaces it) |
| `fn.q.part.render` | the default render of any Part | `fg/render.mjs` |
| `fn.tk.instrumentation.calls` | the profile: calls under a caller | `fg/store.mjs` |

**Argument references:**
- `'px.badges#3'`: item 3 of a list of objects carrying `px`.
- `'px.components#bright:17'`: label 17 of a component plane.
- A plain address: the Part itself.

**Shared operations** (compose these instead of writing loops): `ownerPlane` (ownership, with an explicit overlap
policy) and `componentStats` (area, unowned remainder, touches).

**Backings are internal.** A PixelSet is `list` or `label`, with a bbox index per plane. Change or add a backing
inside `fg/pxset.mjs`; nothing outside changes. `pxsetProperties` (`fg/pxset.test.mjs`) proves every backing of the
same pixels gives the same answers.

**Adding a query:** `node scripts/pxc.mjs scaffold query <family>` writes a table for
`registerQueries(store, TABLE)` (`fg/store.mjs`). That gives you caching by arguments, profiling, and a required
unit on every answer. Register it where the store is built: a runner, or `createPartStore` for built-ins.

## The app boundary: `tk.export.course`

Screenshots in, course geometry out, nothing else crosses. `fn.tk.export.course` (`ports/export/course.calc.mjs`) produces the
Part `tk.export.course`: one `chainspot.course-geometry` v1 document (`contracts/export.course@1.mjs`: the format, a validator,
and when two exported holes are the same hole: tee 8 px, basket 12 px, bends within half the corridor width).

- `holes` and `numberBadges` are ChainSpot ProjectState v7 `AnnotatedHole` and `HoleNumberBadgeAnchor`, field for field. Hole `n`
  carries the S3/S4 tee, the S7 routeMatch basket, the route's interior vertices as `corridorBends`, and the course hallway W as
  `corridorWidthPx`. Ids are `hole-<n>`; `shots` is always `[]`.
- What the CV is unsure of is outside them: `evidence[]` (status resolved / straight / partial / unresolved, `confidence.level`
  confirmed / unconfirmed / noReading from the hallway sensor, tee / basket / trace, reasons) and `candidates[]` (unclaimed baskets,
  `Basket cX`, never numbered).
- Frame: the ORIGINAL UPLOAD. S0's removed top rows are added back to y; `source.s0Crop` and `source.sha256` say what the numbers refer to.
- Run: `node ports/export/run.mjs --specimen golden --attempt ID [--attempts-root DIR]` writes `course-geometry.json` (the Part's value),
  its render `tk.export.course.png` (holes coloured by status over the course, with a legend), and `instrumentation.json`. The export is
  blind: no testimony is read.
- Not yet: holes whose number is proven by S5 pairing (S7 numbers a hole by its S1 badge label and the S3/S4 tee association); tee
  candidates; S7 as a store Part (the runner registers the S7 Calculations itself).
