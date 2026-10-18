---
name: pxc
description: How to build in chainspot-toolkit's PxC system (PixelCache store, Parts, Calculations, queries, FunctionalGuarantees, default properties profiled/renderable). Use before writing pixel math, adding a Calculation or store query, adding an FG property, reading a run's outputs, graduating a prototype, or reporting/rendering/judging results.
---

# Working in the PxC system

Start from what the task is, load only the page it needs (`node scripts/pxc.mjs explain <topic>` prints it from
`docs/agents/`), and let the scripts write the shape.

| the task | read | then run |
|---|---|---|
| trying an idea quickly | nothing; prototype freely | |
| a prototype works | `explain prototyping` | `node scripts/pxc.mjs doctor <file>` |
| pixel math / a question about pixels | `explain boundary` | `node scripts/pxc.mjs scaffold query <family>` |
| reading a run's inputs or outputs | `explain parts` | `store.get(address)` on the PxC board, never artifact files |
| a step that computes a Part | `explain calculations` | `node scripts/pxc.mjs scaffold calculation <dir> <name>` |
| a reusable check on a stage | `explain fg` | `node scripts/pxc.mjs scaffold mixin <name>` |
| reporting, rendering, judging, claiming a constant | `explain evidence` | `node ports/judge/judge.mjs ...`; `fn.q.part.render` |
| is this run healthy / profiled / renderable? | | `node scripts/pxc.mjs doctor --attempt <id>` |
| where does every stage stand on every dev course; what did my change make stale? | | `node scripts/pxc.mjs state [--retest]` |

## Defaults you get without writing anything

- Every Calculation call is timed, and its output's `emits` are recorded.
- Every composed FG is profiled, instrumented and rendered.
- Every Part renders (`fn.q.part.render`).

So: put measures in `emits` and units on numbers, and add a case to `fg/render.mjs` if a new shape does not render.

## Before claiming

- **Refactor:** identical output on every dev course (`docs/evidence/dev-s1s4/ATTEMPTS`).
- **Behaviour change:** judged per course (TP/FN/FP, right/wrong hole).
- **Sam's general rules:** implement them as given before inventing signals.
