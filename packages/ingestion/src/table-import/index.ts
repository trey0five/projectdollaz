export {
  readTable,
  mainSheet,
  detectHeaderRow,
  detectDelimiter,
  parseDelimited,
  looksLikeWorkbook,
  type TableRead,
  type TableSheet,
} from './read-table.js'
export {
  matchColumns,
  normalizeHeader,
  describeHeader,
  cell,
  type FieldSpec,
  type ColumnMatch,
  type ColumnMatches,
  type MatchHow,
} from './match-columns.js'
export {
  ROSTER_FIELDS,
  rosterFromSheet,
  splitFullName,
  gradeKeyFromText,
  oneRosterCodeForGradeKey,
  toOneRosterUsersCsv,
  type RosterRecord,
  type RosterRead,
} from './schemas/roster.js'
