// ─────────────────────────────────────────────────────────────
// Adapter registry + selection + ingest facade.
// ─────────────────────────────────────────────────────────────
import { detectExplicitDate } from './metadata.js'
import type { IngestionAdapter, IngestionResult, IngestOptions, IntakeMemory, SavedLayout } from './types.js'
import { excelAdapter } from './adapters/excelAdapter.js'
import { csvAdapter } from './adapters/csvAdapter.js'
import {
  parseStatementExport,
  statementAdapter,
  StatementExportError,
  isBudgetReport,
  statementTypeFromFileName,
} from './statements/statementAdapter.js'
import { IngestError, isIngestError, type IngestErrorCode } from './intake/errors.js'
import { analyzeFile, explainFailure, layoutSignature, readGrid } from './intake/preview.js'
import { parseWithColumns } from './intake/override.js'

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
 *
 *  NEVER HIJACK A TRIAL BALANCE: a grid with Debit | Credit columns is a TB
 *  whatever the file is named — the statement adapter returns null for it
 *  (hasDebitCreditHeader), so the file-name hint below can only ever promote
 *  a grid that has NO debit/credit columns. And the `force` walk needs a
 *  known section row; a flat unlabeled grid surfaces the plain adapter's
 *  own error instead of a silently re-signed import.
 *
 *  A statement that was recognised but REFUSED (a budget-only "Budget
 *  Overview" has no Actual column) throws StatementExportError out of here —
 *  that message, not the plain adapter's, is the one the user needs.
 */
export function ingest(fileName: string, bytes: ArrayBuffer, opts?: IngestOptions): IngestionResult {
  // 0. The person picked the columns: read exactly those (errors propagate —
  //    the picker shows them live). Statement-ness is still the detector's call.
  if (opts?.columns) {
    return finalize(fileName, parseWithColumns(fileName, bytes, opts.columns, { memory: opts.memory, source: 'picked' }))
  }
  // 1. The automatic read, exactly as before (memory only threads the
  //    synthetic-number pins through the statement walk).
  try {
    return finalize(fileName, automaticRead(fileName, bytes, opts))
  } catch (err) {
    // 2. It FAILED: try the school's remembered layouts (never-hijack — a
    //    file the automatic read accepts never reaches this line). NEVER after
    //    a budget refusal: a Budget Overview by month has the same header
    //    signature as a "P&L by Month", and a budget must never import as
    //    actuals because a layout was remembered.
    if (!(err instanceof StatementExportError)) {
      const remembered = rememberedRead(fileName, bytes, opts)
      if (remembered) return finalize(fileName, remembered)
    }
    // 3. Final failure: one IngestError with the plain reason + the preview.
    throw toIngestError(fileName, bytes, err, opts)
  }
}

/** The pre-#32 ingest() body, unchanged except for threading the synthetic pins. */
function automaticRead(fileName: string, bytes: ArrayBuffer, opts?: IngestOptions): IngestionResult {
  const adapterOpts = opts ? { sheet: opts.sheet, column: opts.column } : undefined
  let plain: IngestionResult | undefined
  let plainError: unknown
  try {
    plain = getAdapter(fileName, bytes).parse(bytes, adapterOpts)
  } catch (e) {
    plainError = e
  }

  if (plain && plain.rows.length > 0) {
    // A refused statement (a sibling "Budget Overview" tab) must not fail a
    // workbook whose trial balance parsed: keep the plain result and carry the
    // refusal as a warning. The refusal is only FATAL when nothing else parsed.
    try {
      const statement = tryStatement(fileName, bytes, opts, false)
      return statement ?? plain
    } catch (e) {
      if (!(e instanceof StatementExportError)) throw e
      // …unless the sheet the plain adapter read IS the budget report (a Budget
      // Overview whose names carry account numbers, "40100 Tuition", parses
      // as a garbage TB): then the refusal is this file's own, and fatal.
      if (plainSheetIsBudget(fileName, bytes, plain)) throw e
      return { ...plain, warnings: [...(plain.warnings ?? []), e.message] }
    }
  }
  const statement = tryStatement(fileName, bytes, opts, true)
  if (statement) return statement
  if (plainError) throw plainError
  return plain!
}

/** Did the plain adapter read a sheet that is itself a budget report (banner / sheet name / file name)? */
function plainSheetIsBudget(fileName: string, bytes: ArrayBuffer, plain: IngestionResult): boolean {
  try {
    const { grid, sheet } = readGrid(fileName, bytes, plain.metadata?.sheet ?? null)
    return isBudgetReport(grid, sheet ?? '', -1, fileName)
  } catch {
    return false
  }
}

/**
 * The sourceName default + the filename-date fallback. The adapters compute
 * metadata before they know the file name, so a sheet with no in-band date
 * (QuickBooks exports print none) would leave the period blank even when the
 * FILENAME carries it ("…6-30-26.xlsx"). Fall back to the filename here, once,
 * and say so in the source.
 */
function finalize(fileName: string, result: IngestionResult): IngestionResult {
  const sourceName = result.sourceName ?? fileName
  let metadata = result.metadata
    ? { ...result.metadata, sourceName: result.metadata.sourceName || fileName }
    : undefined
  if (metadata && !metadata.periodEndDate) {
    const fromName = detectExplicitDate(fileName)
    if (fromName) {
      metadata = { ...metadata, periodEndDate: fromName, periodEndSource: 'filename' }
    }
  }
  return { ...result, sourceName, metadata }
}

/** How many top rows a remembered header may have drifted to (a new banner row, a blank line). */
const LAYOUT_SCAN_ROWS = 31

/**
 * Try each remembered layout (newest first) on a file whose automatic read
 * failed: the layout's own sheet first, then every sheet; the header row is
 * wherever (rows 0..30) a row's layoutSignature equals the remembered one.
 */
function rememberedRead(fileName: string, bytes: ArrayBuffer, opts?: IngestOptions): IngestionResult | null {
  const layouts: SavedLayout[] = opts?.memory?.layouts ?? []
  if (!layouts.length) return null
  let sheets: string[]
  try {
    sheets = readGrid(fileName, bytes).sheets
  } catch {
    return null
  }
  const isCsv = sheets.length === 0
  for (const layout of layouts) {
    if (!layout || typeof layout.signature !== 'string') continue
    const order: Array<string | null> = isCsv
      ? [null]
      : [...(layout.sheet && sheets.includes(layout.sheet) ? [layout.sheet] : []), ...sheets.filter((n) => n !== layout.sheet)]
    for (const sheet of order) {
      let grid
      try {
        grid = readGrid(fileName, bytes, sheet).grid
      } catch {
        continue
      }
      for (let row = 0; row < Math.min(LAYOUT_SCAN_ROWS, grid.length); row++) {
        if (layoutSignature(grid, row) !== layout.signature) continue
        try {
          return parseWithColumns(
            fileName,
            bytes,
            {
              sheet,
              headerRow: row,
              acct: layout.acct,
              desc: layout.desc,
              amount: layout.amount,
              debit: layout.debit,
              credit: layout.credit,
            },
            { memory: opts?.memory, source: 'remembered' },
          )
        } catch {
          // A stale layout: ignore it and try the next one.
        }
        break // first matching row only, per sheet
      }
    }
  }
  return null
}

/** Wrap the final automatic-path failure in one IngestError (message unchanged). */
function toIngestError(fileName: string, bytes: ArrayBuffer, err: unknown, opts?: IngestOptions): IngestError {
  if (isIngestError(err)) return err
  const message = err instanceof Error ? err.message : String(err)
  const make = (code: IngestErrorCode, preview: ReturnType<typeof analyzeFile> = null, column?: number): IngestError => {
    const { reason, ask } = explainFailure(code, preview?.preview ?? null, column != null ? { column } : undefined)
    return new IngestError(message, code, reason, ask, preview?.preview ?? null)
  }
  if (/No ingestion adapter/.test(message)) return make('unsupported')
  if (err instanceof StatementExportError) return make('budget-only')
  if (/appears empty or unreadable/.test(message)) return make('empty')
  let analysis: ReturnType<typeof analyzeFile>
  try {
    analysis = analyzeFile(fileName, bytes, { sheet: opts?.sheet })
  } catch {
    return make('empty')
  }
  if (!analysis) return make('empty')
  const { preview, nameMapped } = analysis
  const acct = preview.guess.acct
  const acctFound =
    acct >= 0 && (preview.columns[acct]?.kind === 'acct' || nameMapped.acct === acct)
  if (!acctFound) return make('no-accounts', analysis)
  const otherText = preview.columns.some((c) => c.index !== acct && c.kind === 'text') || (nameMapped.desc >= 0 && nameMapped.desc !== acct)
  if (!otherText) return make('no-description', analysis)
  return make('no-amount', analysis)
}

/**
 * Run the statement-export adapter. `force` = walk even when detection is
 * negative (the "plain adapter found nothing" fallback — still gated on a
 * known section row inside the adapter). Swallows every error EXCEPT a
 * StatementExportError (a recognised statement that must not be imported as
 * actuals): for anything else the plain adapter's own error is the one the
 * caller should see.
 */
function tryStatement(
  fileName: string,
  bytes: ArrayBuffer,
  opts: IngestOptions | undefined,
  force: boolean,
): IngestionResult | null {
  try {
    // The file NAME is part of detection: QuickBooks names its exports after the
    // report ("… Statement of Activity Budget vs Actuals 6-30-26.xlsx"), and a
    // banner-less export is otherwise indistinguishable from a trial balance.
    // It is only a HINT — a Debit | Credit grid ignores it (see the adapter).
    const typeHint = statementTypeFromFileName(fileName)
    const knownSynthetic = opts?.memory?.synthetic
    return parseStatementExport(fileName, bytes, {
      sheet: opts?.sheet,
      column: opts?.column,
      force,
      typeHint,
      ...(knownSynthetic ? { knownSynthetic } : {}),
    })
  } catch (e) {
    if (e instanceof StatementExportError) throw e
    return null
  }
}
