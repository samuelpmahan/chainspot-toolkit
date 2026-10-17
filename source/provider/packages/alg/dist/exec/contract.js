"use strict";
// Shared exec contract for the compiled-operation execution model
// (Wave 1A). Types only — no runtime logic lives here, so both chunks
// (A: compiler/gateway/receipts under src/exec/**; B: g0/adapters/UI) can
// depend on a stable shape from minute one, before either side's design
// has settled.
//
// R1 (browser-safe core): everything below describes DATA. Writing an
// artifact or receipt to disk is the job of an INJECTED sink the caller
// hands to executeCompiledPlan — never something a type here performs.
// This file imports nothing and reaches no I/O.
Object.defineProperty(exports, "__esModule", { value: true });
//# sourceMappingURL=contract.js.map