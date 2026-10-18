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
