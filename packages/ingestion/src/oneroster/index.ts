// ─────────────────────────────────────────────────────────────
// @finrep/ingestion/oneroster — SERVER-ONLY entry (the parser uses node:zlib to
// read the OneRoster ZIP). Kept OFF the main barrel so the web bundle, which
// imports @finrep/ingestion for the browser-safe xlsx/budget parsers, never
// pulls a node: builtin into rollup. The api imports the roster parser here.
// ─────────────────────────────────────────────────────────────
export { parseOneRosterCsv } from './parse.js'
export type { ParseOneRosterOptions } from './parse.js'
export { ONEROSTER_GRADE_MAP } from './grades.js'
