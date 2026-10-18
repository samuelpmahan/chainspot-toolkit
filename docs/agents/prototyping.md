# Prototyping, then graduating

Prototype anywhere and in any style: scratch scripts, Python, direct pixel loops. Nothing blocks you. Speed of
discovery matters more than structure while the idea is unproven.

Once it works, graduate it so the next person gets it for free:

1. Run `node scripts/pxc.mjs doctor <file>`. It names every artifact-file read and every pixel loop, with the fix.
2. Scaffold the right shape, then move your logic into it:
   - `node scripts/pxc.mjs scaffold query <family>`: new pixel math becomes a store query (`fn.q.<family>.*`).
   - `node scripts/pxc.mjs scaffold calculation <dir> <name>`: a step that produces a Part.
   - `node scripts/pxc.mjs scaffold mixin <name>`: a reusable FG property.
3. Prove identical output on every dev course (`docs/evidence/dev-s1s4/ATTEMPTS`) before claiming the refactor. If
   behaviour changed on purpose, judge it instead (`evidence`).
4. Run `UPDATE_RATCHET=1 node --test architecture.test.mjs` to record the lower debt. The report is advisory and
   never fails.
