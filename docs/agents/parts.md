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
