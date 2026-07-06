// One-off generator for oneroster-1.1.zip — a synthetic OneRoster 1.1 bulk export
// used by parse.spec.ts (and available for the live-CSV import test). Dependency-free
// ZIP writer (STORED + DEFLATE, correct CRC32) so the committed fixture is a real,
// spec-valid archive. Re-run with: node build-fixture.mjs
import { deflateRawSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()
function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

// Build a ZIP from { name -> string }. `deflate` names are compressed (method 8),
// the rest STORED (method 0) — so the reader is exercised on both paths.
function buildZip(files, deflateNames = new Set()) {
  const locals = []
  const central = []
  let offset = 0
  for (const [name, text] of Object.entries(files)) {
    const data = Buffer.from(text, 'utf8')
    const useDeflate = deflateNames.has(name)
    const comp = useDeflate ? deflateRawSync(data) : data
    const method = useDeflate ? 8 : 0
    const crc = crc32(data)
    const nameBuf = Buffer.from(name, 'utf8')

    const lh = Buffer.alloc(30)
    lh.writeUInt32LE(0x04034b50, 0)
    lh.writeUInt16LE(20, 4) // version needed
    lh.writeUInt16LE(0, 6) // flags
    lh.writeUInt16LE(method, 8)
    lh.writeUInt16LE(0, 10) // mod time
    lh.writeUInt16LE(0, 12) // mod date
    lh.writeUInt32LE(crc, 14)
    lh.writeUInt32LE(comp.length, 18)
    lh.writeUInt32LE(data.length, 22)
    lh.writeUInt16LE(nameBuf.length, 26)
    lh.writeUInt16LE(0, 28) // extra len
    locals.push(lh, nameBuf, comp)

    const ch = Buffer.alloc(46)
    ch.writeUInt32LE(0x02014b50, 0)
    ch.writeUInt16LE(20, 4)
    ch.writeUInt16LE(20, 6)
    ch.writeUInt16LE(0, 8)
    ch.writeUInt16LE(method, 10)
    ch.writeUInt16LE(0, 12)
    ch.writeUInt16LE(0, 14)
    ch.writeUInt32LE(crc, 16)
    ch.writeUInt32LE(comp.length, 20)
    ch.writeUInt32LE(data.length, 24)
    ch.writeUInt16LE(nameBuf.length, 28)
    ch.writeUInt16LE(0, 30) // extra
    ch.writeUInt16LE(0, 32) // comment
    ch.writeUInt16LE(0, 34) // disk
    ch.writeUInt16LE(0, 36) // internal attrs
    ch.writeUInt32LE(0, 38) // external attrs
    ch.writeUInt32LE(offset, 42)
    central.push(ch, nameBuf)

    offset += lh.length + nameBuf.length + comp.length
  }
  const localBuf = Buffer.concat(locals)
  const centralBuf = Buffer.concat(central)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(0, 4)
  eocd.writeUInt16LE(0, 6)
  eocd.writeUInt16LE(Object.keys(files).length, 8)
  eocd.writeUInt16LE(Object.keys(files).length, 10)
  eocd.writeUInt32LE(centralBuf.length, 12)
  eocd.writeUInt32LE(localBuf.length, 16)
  eocd.writeUInt16LE(0, 20)
  return Buffer.concat([localBuf, centralBuf, eocd])
}

const USER_HEADER =
  'sourcedId,status,dateLastModified,enabledUser,orgSourcedIds,role,username,userIds,givenName,familyName,middleName,identifier,email,sms,phone,agentSourcedIds,grades,password'

// One row helper — only the columns that matter are filled; the rest are blank.
function user(id, status, role, given, family, grades) {
  const g = grades.includes(',') ? `"${grades}"` : grades
  return `${id},${status},2026-06-01T00:00:00.000Z,true,org-1,${role},${given.toLowerCase()}.${family.toLowerCase()},,${given},${family},,${id},${given.toLowerCase()}@ex.edu,,,,${g},`
}

const users = [
  USER_HEADER,
  user('s1', 'active', 'student', 'Ada', 'Pre', 'PR'), // → PK3
  user('s2', 'active', 'student', 'Ben', 'Pek', 'PK'), // → PK4
  user('s3', 'active', 'student', 'Cy', 'Kaye', 'KG'), // → K
  user('s4', 'active', 'student', 'Dot', 'One', '01'), // → 1
  user('s5', 'active', 'student', 'Eli', 'Nine', '09'), // → 9
  user('s6', 'active', 'student', 'Fay', 'Nineten', '09,10'), // first token 09 → 9
  user('s7', 'active', 'student', 'Gus', 'Twelve', '12'), // → 12
  user('s8', 'active', 'student', 'Hana', 'Unknown', '99'), // unknown → warning, uncounted
  user('s9', 'tobedeleted', 'student', 'Ivy', 'Gone', '05'), // withdrawn → not counted
  // Quoted givenName with an embedded comma exercises the CSV parser's quoting.
  's10,active,2026-06-01T00:00:00.000Z,true,org-1,student,rob.roy,,"Rob, Jr.",Roy,,s10,rob@ex.edu,,,,03,', // → grade 3
  user('t1', 'active', 'teacher', 'Tom', 'Teach', '13'), // non-student → dropped
  '', // trailing blank line
].join('\n')

// enrollments.csv — per-class links; MUST be ignored. Padded out so that if the
// parser ever read it, the total would balloon far past the users headcount.
const enrollHeader = 'sourcedId,status,dateLastModified,classSourcedId,schoolSourcedId,userSourcedId,role,primary,beginDate,endDate'
const enrollRows = [enrollHeader]
for (let i = 0; i < 40; i++) {
  enrollRows.push(`e${i},active,2026-06-01T00:00:00.000Z,class-${i % 5},org-1,s${(i % 8) + 1},student,true,,`)
}
const enrollments = enrollRows.join('\n')

const academicSessions = [
  'sourcedId,status,dateLastModified,title,type,startDate,endDate,parentSourcedId,schoolYear',
  'ay-2024,active,2026-06-01T00:00:00.000Z,2024-25,schoolYear,2024-08-15,2025-06-15,,2025',
  'ay-2025,active,2026-06-01T00:00:00.000Z,2025-26,schoolYear,2025-08-15,2026-06-15,,2026',
].join('\n')

const orgs = [
  'sourcedId,status,dateLastModified,name,type,identifier,parentSourcedId',
  'org-1,active,2026-06-01T00:00:00.000Z,Test Academy,school,ta,',
].join('\n')

const zip = buildZip(
  { 'users.csv': users, 'enrollments.csv': enrollments, 'academicSessions.csv': academicSessions, 'orgs.csv': orgs },
  new Set(['users.csv', 'enrollments.csv']), // deflate these two; STORE the sessions/orgs
)

const outDir = dirname(fileURLToPath(import.meta.url))
writeFileSync(join(outDir, 'oneroster-1.1.zip'), zip)
console.log(`wrote oneroster-1.1.zip (${zip.length} bytes)`)
