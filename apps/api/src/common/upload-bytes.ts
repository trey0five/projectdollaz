// #52 — a PDF upload becomes the table it printed, as an .xlsx, before any
// parser sees it; a scanned PDF (no text layer) is refused in plain words.
// Every upload entry calls this first, so the rest of the pipeline never
// learns that PDFs exist.
import { BadRequestException } from '@nestjs/common'
import { isPdf, pdfToXlsx, SCANNED_PDF_MESSAGE } from '@finrep/ingestion/pdf'

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

export interface UploadLike {
  buffer: Buffer
  originalname?: string
  size?: number
  mimetype?: string
}

/** The file as a table: a PDF is converted (name → .xlsx); anything else passes through untouched. */
export async function tableBytes<T extends UploadLike>(file: T | undefined): Promise<T | undefined> {
  if (!file?.buffer || file.buffer.length === 0 || !isPdf(file.buffer)) return file
  let converted
  try {
    converted = await pdfToXlsx(file.buffer)
  } catch {
    throw new BadRequestException('Couldn’t open this PDF. Export the report again, or save it as Excel or CSV.')
  }
  if (converted.table.scanned || converted.table.grid.length === 0) throw new BadRequestException(SCANNED_PDF_MESSAGE)
  const buffer = Buffer.from(converted.xlsx)
  return {
    ...file,
    buffer,
    size: buffer.length,
    mimetype: XLSX_MIME,
    ...(file.originalname ? { originalname: `${file.originalname.replace(/\.pdf$/i, '')}.xlsx` } : {}),
  }
}
