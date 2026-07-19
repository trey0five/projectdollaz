// ─────────────────────────────────────────────────────────────────────────────
// peerVocab — the School-Comparison peer vocabulary as consumed by the WEB.
//
// Single source of truth: the semantic-layer package (@finrep/analytics/peers.ts).
// The web must NEVER redefine a band/formula (moat rule) — so this module is a pure
// pass-through re-export. (It briefly held a build-time mirror while the frontend
// was built in parallel, before the backend's exports landed; that mirror is now
// collapsed to these re-exports so there is exactly one definition of the bands,
// types, and derivations. Change them in packages/analytics/src/peers.ts.)
// ─────────────────────────────────────────────────────────────────────────────
export {
  SIZE_BANDS,
  SCHOOL_TYPES,
  GRADE_KEYS,
  sizeBandOf,
  sizeBandLabel,
  gradeOrdinal,
} from '@finrep/analytics'
