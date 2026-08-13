// ─────────────────────────────────────────────────────────────────────────────
// A minimal ZIP writer.
//
// NO DEPENDENCY ON PURPOSE. The API image prunes anything that is not a direct
// dependency (see the xlsx and multer incidents), and a data-export feature that
// breaks in the container and works locally is worse than one that does not
// exist. ZIP is a stable, fully specified container and Node 22 ships crc32 in
// zlib, so the whole thing is ~100 lines of buffer writing against a format that
// has not changed since 1993.
//
// Deflate, not store: a tenant export is CSV, which compresses roughly 5:1, and
// the school is downloading this over whatever connection the school office has.
// ─────────────────────────────────────────────────────────────────────────────
import { crc32, deflateRawSync } from 'node:zlib'

export interface ZipEntry {
  /** Path inside the archive, forward-slashed. */
  name: string
  data: Buffer
}

const LOCAL_SIG = 0x04034b50
const CENTRAL_SIG = 0x02014b50
const END_SIG = 0x06054b50
/** 2.0 — the minimum that understands deflate. */
const VERSION = 20
/** Bit 11: the name is UTF-8. Without it, accented school names mangle. */
const UTF8_FLAG = 0x0800

/**
 * DOS time is a 1980-epoch bitfield. We deliberately stamp every entry with a
 * FIXED timestamp rather than the clock: it makes an export byte-reproducible
 * for the same data, which is what lets a school (or a court) show that two
 * downloads of the same period are the same download.
 */
const DOS_TIME = 0
const DOS_DATE = 0x2821 // 1 Jan 2000

function localHeader(entry: ZipEntry, crc: number, compressedSize: number): Buffer {
  const name = Buffer.from(entry.name, 'utf8')
  const head = Buffer.alloc(30)
  head.writeUInt32LE(LOCAL_SIG, 0)
  head.writeUInt16LE(VERSION, 4)
  head.writeUInt16LE(UTF8_FLAG, 6)
  head.writeUInt16LE(8, 8) // deflate
  head.writeUInt16LE(DOS_TIME, 10)
  head.writeUInt16LE(DOS_DATE, 12)
  head.writeUInt32LE(crc, 14)
  head.writeUInt32LE(compressedSize, 18)
  head.writeUInt32LE(entry.data.length, 22)
  head.writeUInt16LE(name.length, 26)
  head.writeUInt16LE(0, 28)
  return Buffer.concat([head, name])
}

function centralHeader(entry: ZipEntry, crc: number, compressedSize: number, offset: number): Buffer {
  const name = Buffer.from(entry.name, 'utf8')
  const head = Buffer.alloc(46)
  head.writeUInt32LE(CENTRAL_SIG, 0)
  head.writeUInt16LE(VERSION, 4)
  head.writeUInt16LE(VERSION, 6)
  head.writeUInt16LE(UTF8_FLAG, 8)
  head.writeUInt16LE(8, 10)
  head.writeUInt16LE(DOS_TIME, 12)
  head.writeUInt16LE(DOS_DATE, 14)
  head.writeUInt32LE(crc, 16)
  head.writeUInt32LE(compressedSize, 20)
  head.writeUInt32LE(entry.data.length, 24)
  head.writeUInt16LE(name.length, 28)
  head.writeUInt16LE(0, 30) // extra
  head.writeUInt16LE(0, 32) // comment
  head.writeUInt16LE(0, 34) // disk
  head.writeUInt16LE(0, 36) // internal attrs
  head.writeUInt32LE(0, 38) // external attrs
  head.writeUInt32LE(offset, 42)
  return Buffer.concat([head, name])
}

/** Build a ZIP archive in memory. */
export function buildZip(entries: ZipEntry[]): Buffer {
  const parts: Buffer[] = []
  const central: Buffer[] = []
  let offset = 0

  for (const entry of entries) {
    const compressed = deflateRawSync(entry.data)
    const crc = crc32(entry.data)
    const local = localHeader(entry, crc, compressed.length)
    parts.push(local, compressed)
    central.push(centralHeader(entry, crc, compressed.length, offset))
    offset += local.length + compressed.length
  }

  const dir = Buffer.concat(central)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(END_SIG, 0)
  end.writeUInt16LE(0, 4) // disk
  end.writeUInt16LE(0, 6) // disk with central dir
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(dir.length, 12)
  end.writeUInt32LE(offset, 16)
  end.writeUInt16LE(0, 20) // comment
  return Buffer.concat([...parts, dir, end])
}

/**
 * One CSV row, RFC-4180 quoted.
 *
 * Excel is the destination for most of these files, so the rules that matter are
 * the boring ones: quote anything containing a comma, a quote or a newline, and
 * double an embedded quote. A leading =, +, - or @ is prefixed with a quote to
 * stop Excel evaluating a cell as a formula — a school's own data should never
 * execute when they open it.
 */
export function csvRow(values: unknown[]): string {
  return values
    .map((v) => {
      if (v === null || v === undefined) return ''
      let s = typeof v === 'object' ? JSON.stringify(v) : String(v)
      if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    })
    .join(',')
}

/** A whole CSV file from a homogeneous row set, with a stable column order. */
export function toCsv(rows: Array<Record<string, unknown>>, columns?: string[]): string {
  const cols = columns ?? [...new Set(rows.flatMap((r) => Object.keys(r)))]
  const lines = [csvRow(cols), ...rows.map((r) => csvRow(cols.map((c) => r[c])))]
  // BOM: Excel reads a plain UTF-8 CSV as the system codepage and mangles every
  // accented name in the roster.
  return `﻿${lines.join('\r\n')}\r\n`
}
