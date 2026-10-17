"use strict";
// Shared Straight Test (S0) receipt seam.
//
// This file deliberately contains only data contracts. It is the boundary
// between the geometry producer and the trace/CLI/VisualRender consumers:
// neither consumer may recreate an angle, projection, candidate, or verdict.
// All coordinates are source-image pixels in the canonical execution frame.
Object.defineProperty(exports, "__esModule", { value: true });
exports.STRAIGHT_TEST_COORDINATE_FRAME = exports.STRAIGHT_TEST_FEATURE_ID = void 0;
exports.STRAIGHT_TEST_FEATURE_ID = 'straightTest';
exports.STRAIGHT_TEST_COORDINATE_FRAME = 'original-image-px';
//# sourceMappingURL=st.straightTest.contract.js.map