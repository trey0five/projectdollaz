// ─────────────────────────────────────────────────────────────
// Adapter registry + selection + ingest facade.
// ─────────────────────────────────────────────────────────────
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
  const metadata = result.metadata
    ? { ...result.metadata, sourceName: result.metadata.sourceName || fileName }
    : undefined
  return { ...result, sourceName, metadata }
}
