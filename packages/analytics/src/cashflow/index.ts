// ─────────────────────────────────────────────────────────────────────────────
// @finrep/analytics — the CASH FLOW PROJECTION engine.
//
// Deterministic, total, and clock-free. Given an opening balance on a stated
// date and a set of dated cash events, it rolls forward and answers the question
// a school cannot answer today: on what date do we run out, and by how much.
//
// The layer above may explain this output in words, and later may translate a
// spoken scenario into different inputs and re-run it. It may never produce the
// figures. See types.ts for why that line is drawn where it is.
// ─────────────────────────────────────────────────────────────────────────────
export * from './types.js'
export * from './civil.js'
export * from './calendar.js'
export * from './project.js'
export * from './tuition.js'
export * from './disbursements.js'
