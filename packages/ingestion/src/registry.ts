// ─────────────────────────────────────────────────────────────
// Adapter registry + selection + ingest facade.
// ─────────────────────────────────────────────────────────────
import { detectExplicitDate } from './metadata.js'
import type { IngestionAdapter, IngestionResult } from './types.js'
import { excelAdapter } from './adapters/excelAdapter.js'
import { csvAdapter } from './adapters/csvAdapter.js'

export const adapters: IngestionAdapter[] = [excelAdapter, csvAdapter]

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

/** Convenience facade: pick an adapter and parse pre-read bytes. */
export function ingest(
  fileName: string,
  bytes: ArrayBuffer,
  opts?: { sheet?: string }
): IngestionResult {
  const result = getAdapter(fileName, bytes).parse(bytes, opts)
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
