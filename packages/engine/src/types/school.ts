// ─────────────────────────────────────────────────────────────
// School configuration consumed by the engine. The engine is
// I/O-free and auth-agnostic: `pin` is ignored here (web keeps it).
// ─────────────────────────────────────────────────────────────
export interface SchoolConfig {
  name?: string
  netAssetsBegin: number
  pyNetAssetsBegin: number
  auditNetAssetsBegin: number
  pin?: string
}
