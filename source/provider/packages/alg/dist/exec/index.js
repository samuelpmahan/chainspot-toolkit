"use strict";
// Browser-safe exec surface: the shared contract, the generic evidence
// board, the in-memory/null sinks, the compiler, and the ONE gateway. The
// Node-only filesystem sink lives at a separate subpath
// ('@chainspot/alg/exec/node-sink') and is deliberately NOT re-exported
// here, so importing '@chainspot/alg/exec' never pulls in node:fs/node:path
// (R1).
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
__exportStar(require("./contract"), exports);
__exportStar(require("./board"), exports);
__exportStar(require("./sink"), exports);
__exportStar(require("./compile"), exports);
__exportStar(require("./gateway"), exports);
__exportStar(require("./operations"), exports);
__exportStar(require("./feature-set"), exports);
__exportStar(require("./pcr"), exports);
__exportStar(require("../stages/S0/clean"), exports);
//# sourceMappingURL=index.js.map