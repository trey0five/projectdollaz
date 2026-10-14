// ─────────────────────────────────────────────────────────────
// Adapter registry + selection + ingest facade.
// ─────────────────────────────────────────────────────────────
import { detectExplicitDate } from './metadata.js'
import { detectStatementType } from './statements/statementAdapter.js'
import type { IngestionAdapter, IngestionResult } from './types.js'
import { excelAdapter } from './adapters/excelAdapter.js'
import { csvAdapter } from './adapters/csvAdapter.js'
import { parseStatementExport, statementAdapter } from './statements/statementAdapter.js'

// ORDER (issue #31): the plain trial-balance adapters come FIRST and are
// selected by extension. The QuickBooks statement-export adapter is last — it
// only claims a file when given bytes that detect as a statement — and the
// `ingest` facade is where the hand-off actually happens (see below).
export const adapters: IngestionAdapter[] = [excelAdapter, csvAdapter, statementAdapter]

/** Select an adapter by file name (extension). */
export function getAdapter(
  fileName: string,
  bytes?: ArrayBuffer
): IngestionAdapter {
  const adapter = adapters.find((a) => a.canHandle(fileName, bytes))
  if (!adapter) {
    throw new Error(`No ingestion adapter for "${fileName}". Supported: .xlsx, .xls, .csv`)
  }
  return adapter
}

/**
 * Convenience facade: pick an adapter and parse pre-read bytes.
 *
 * HAND-OFF ORDER (issue #31):
 *  1. The plain trial-balance adapter for the extension runs first.
 *  2. The QuickBooks statement-export adapter then runs when EITHER
 *     (a) the plain adapter found no rows (threw / empty), OR
 *     (b) the bytes DETECT as a statement export (banner title or the
 *         section + `Total …` / `Net Income` structure) — detection wins
 *         even when the plain adapter produced rows, because a numbered
 *         "Acct | Desc | Actual" Statement of Activity parses as a TB with
 *         the WRONG signs (natural-positive income), and only the statement
 *         walk knows to flip them.
 *  3. Otherwise the plain result (or its error) stands.
 */
export function ingest(
  fileName: string,
  bytes: ArrayBuffer,
  opts?: { sheet?: string; column?: string }
): IngestionResult {
  let plain: IngestionResult | undefined
  let plainError: unknown
  try {
    plain = getAdapter(fileName, bytes).parse(bytes, opts)
  } catch (e) {
    plainError = e
  }

  let result: IngestionResult
  if (plain && plain.rows.length > 0) {
    const statement = tryStatement(fileName, bytes, opts, false)
    result = statement ?? plain
  } else {
    const statement = tryStatement(fileName, bytes, opts, true)
    if (statement) result = statement
    else if (plainError) throw plainError
    else result = plain!
  }
  const sourceName = result.sourceName ?? fileName
  let metadata = result.metadata
    ? { ...result.metadata, sourceName: result.metadata.sourceName || fileName }
    : undefined
  // The adapters compute metadata before they know the file name, so a sheet
  // with no in-band date (QuickBooks exports print none) would leave the
  // period blank even when the FILENAME carries it ("…6-30-26.xlsx"). Fall
  // back to the filename here, once, and say so in the source.
  if (metadata && !metadata.periodEndDate) {
    const fromName = detectExplicitDate(fileName)
    if (fromName) {
      metadata = { ...metadata, periodEndDate: fromName, periodEndSource: 'filename' }
    }
  }
  return { ...result, sourceName, metadata }
}

/**
 * Run the statement-export adapter. `force` = walk even when detection is
 * negative (the "plain adapter found nothing" fallback); never throws —
 * the plain adapter's own error is the one the caller should see.
 */
function tryStatement(
  fileName: string,
  bytes: ArrayBuffer,
  opts: { sheet?: string; column?: string } | undefined,
  force: boolean,
): IngestionResult | null {
  try {
    // The file NAME is part of detection: QuickBooks names its exports after the
    // report ("… Statement of Activity Budget vs Actuals 6-30-26.xlsx"), and a
    // banner-less export is otherwise indistinguishable from a trial balance.
    const typeHint = detectStatementType(fileName.replace(/[_.\-]+/g, ' '))
    return parseStatementExport(fileName, bytes, { sheet: opts?.sheet, column: opts?.column, force, typeHint })
  } catch {
    return null
  }
}
