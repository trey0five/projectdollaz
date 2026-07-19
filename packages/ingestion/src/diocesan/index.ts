// ─────────────────────────────────────────────────────────────────────────────
// @finrep/ingestion/diocesan — SERVER-ONLY entry for the multi-school diocesan
// enrollment parser (uses xlsx). Kept OFF the main browser barrel so the web
// bundle never pulls it in (the vite gotcha). The API imports the parser here.
// ─────────────────────────────────────────────────────────────────────────────
export { parseDiocesanEnrollment, gradeKeyFromColumn } from './parse.js'
export type { ParseDiocesanOptions } from './parse.js'
