# Parts: addressed, cached, renderable

- **A Part is a value at an address.** It is written once, with its producer and inParts recorded
  (`store.provenance`).
- **Read with `store.get(address)`.** A runner's store sits on the PxC snapshot as its base board:
  ```js
  createPartStore({ base: board })   // board = the deserialized early/s3.pxc.bin
  ```
  Every S0-S3 Part (`px.image.cropped`, `px.badges`, `px.baskets`, `px.components`, `px.tees`, ...) then resolves.
  Never re-derive a Part from the artifact files written beside it.
- **Lane outputs not on that board** (S3 structural fix, basket bridge, late S4) enter as one named constant:
  `store.constant('fn.tk.<runner>.laneOutputs', {...})`.
- **A derived view is a Calculation with its own address** (`tk.<stage>.<name>`). Never put a reshaped copy at an
  existing address.
- **renderable (default):** `store.call('fn.q.part.render', { a: address })` renders any Part to flipbook kinds:
  pxset, bbox, points, ledger, scalar, raster. The shape union is in `fg/render.mjs`
  (`partKind`, `renderValue`). If something does not render, add a case there. `fg/render.dev.test.mjs` renders every
  Part of every dev PxC.
- **Names:** use candidates (`Basket cX`, `fg/names.mjs`) until identity is proven, then the hole number.
- **Keys (the keyspace):** every Part has a content key (`store.keyOf(address)`): a produced Part carries the cache
  key of the call that made it, `sha256({ fn, code, args, inputs: [[inPart, key]...] })`; a provider or constant Part
  is digested by value (typed arrays by their bytes, once per run). A call whose key is in the store's cache is served,
  not computed, and logged with `cached: 1`. `createPartStore({ cache })` takes any `{ has, get, set }`; the default
  Map is shared with the store's branches. The `code` of a Calculation defaults to the digest of `calculate`'s
  source: pass `code` yourself when `calculate` wraps something else (an implementation, a file), or the key will
  not change when that something changes.
- **Variants:** `address@variant` is its own address (`px.tees.refined@structural`), so every implementation of a
  slot lives side by side in one store; `store.variants(address)` lists them; `store.point(address, target, { by })`
  names the accepted one and `get(address)` follows it. A branch is a key prefix, not a separate store.
- **Persistent cache (`fg/cas.mjs`):** the runners (S4, S5, S5 residual, S6, S6 pathLoss, S7 alpha) pass
  `createCas()` (root `attempts/cas/`, gitignored) as the store's `cache` by default; `--no-cas` opts out. The key
  already holds content, so it is valid forever: a constant is keyed per Part by its own value without its locators
  (`attempt`, `run`), a runner's `codeSalt` is the sha of its module closure (`fg/closure.mjs`), and a discovered
  implementation carries the sha of its own closure. `node scripts/pxc.mjs cas --stats | --prune-older-than DAYS`.
