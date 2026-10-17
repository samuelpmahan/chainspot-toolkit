"use strict";
// Detector contract — the boundary between the app and any detection
// implementation (in-app worker, LAB process, experimental notebook).
// The LAB codes against THIS file; it never needs the app's tree.
//
// Rules (see docs/cv-orchestration.md):
// - Coordinates are IMAGE-LOCAL pixels of the ORIGINAL (uncropped) image.
// - Emissions are immutable observations; identity resolution happens app-side.
// - Detectors are pure over (pixels, params): same input ⇒ same emissions.
//
// Three separable jobs, three event kinds on one channel:
//   'object'      — something IS at (x, y): badge, basket, tee, droplet…
//   'label'       — that badge reads "7" (with candidates when unsure)
//   'association' — that badge belongs to that basket/tee/path
// A detector may emit any subset; later passes may emit labels/associations
// for detIds produced by an earlier pass over the same image.
Object.defineProperty(exports, "__esModule", { value: true });
//# sourceMappingURL=detect.js.map