# Calculations: profiled by default

```js
store.register('fn.tk.<stage>.<name>', {
  inParts: [...], outParts: ['tk.<stage>.<name>'], calls: [...],
  calculate: (io) => ({ 'tk.<stage>.<name>': { ...value, emits: { thingsCount: 3 } } })
})
```

- **profiled (default):** every call is logged with its time and the `emits` its output declares (`fg/store.mjs`).
  Put measures in `emits`, with unit-bearing names. Never time anything by hand. The runner writes the log as
  `instrumentation.json`; `fg/profile.mjs` turns it into a table or a flipbook page (`profileSummary`,
  `profileFrame`, `callSubtree`).
- **Lazy by declaration:** declare a Part as the inPart of the Calculation that needs it, so it is produced on first
  need. Declaring it on a caller resolves it eagerly. On golden that cost 254 ms for a hallway it never used.
- **Total:** a data condition is a recorded result, not a throw. Only integrity checks (hashes, mutated source
  pixels) stop a run.
- **Pure:** never mutate an input Part. Pass changing state as an argument (e.g. the owned pads in `fn.q.pose.*`).
- **A capability** (no outParts) returns `{ value, unit, emits? }` to its caller and is profiled the same way.
- **Scaffold:** `node scripts/pxc.mjs scaffold calculation <dir> <name>`.
