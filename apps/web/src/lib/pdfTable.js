// #52 — the browser parses spreadsheets itself (the finance intake, Add years,
// Monthly, Budget, the upload sorter) but can't read a PDF; the API rebuilds the
// table it printed and hands it back as an .xlsx File that every existing path
// takes unchanged. A scanned PDF comes back as a plain-words error.
import { recordsImportApi } from './api.js'

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

export const isPdfFile = (file) => !!file && (/\.pdf$/i.test(file.name || '') || file.type === 'application/pdf')

/** A PDF File → the equivalent .xlsx File (same base name). Throws the API's message. */
export async function pdfToXlsxFile(schoolId, file) {
  const fd = new FormData()
  fd.append('file', file)
  const res = await recordsImportApi.pdfTable(schoolId, fd)
  const body = res.data ?? res
  const bin = atob(body.xlsxBase64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new File([bytes], body.fileName || `${(file.name || 'table').replace(/\.pdf$/i, '')}.xlsx`, { type: XLSX_MIME })
}

/** Convert when it's a PDF, else the file itself. */
export async function asTableFile(schoolId, file) {
  return isPdfFile(file) ? pdfToXlsxFile(schoolId, file) : file
}
