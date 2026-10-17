"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.THREE_FACTOR_SHARED_SERVICES = void 0;
/**
 * Three-factor infrastructure owned by the shared composition boundary.
 *
 * This registry is deliberately metadata-only. `OcclusionDetector` is already
 * constructed once per detector run by the engine and is exposed through
 * `FeatureContext`; registering its descriptor here must not create another
 * detector, feature, or engine unit.
 */
exports.THREE_FACTOR_SHARED_SERVICES = [
    {
        id: 'occlusion',
        kind: 'run-scoped-infrastructure',
        scope: 'run',
        note: 'Known opaque/alpha footprint seam shared by three-factor stages.'
    }
];
//# sourceMappingURL=shared-services.js.map