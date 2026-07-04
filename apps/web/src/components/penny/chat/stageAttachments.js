// stageAttachments — the PURE file-staging core, lifted verbatim from the inline
// logic that used to live in PennyInputBar. Extracted so BOTH the coin composer
// (PennyInputBar) and the /penny Studio surfaces (dropzone + StudioAskBar) share
// ONE validated staging path with byte-identical rules.
//
// Rules (frozen): accept .xlsx/.csv/PDF/images, max 4 files/turn, max 8 MB each.
// A staged attachment matches the shape the engine (usePennyChat.toWireAttachment)
// expects: { local_id, name, mime, kind, dataBase64, preview?, status:'ready' }.
//
// PennyInputBar imports the consts + classifyFile/readAsDataURL/uid from here and
// keeps its own progressive 'reading'→'ready' chip UX. The Studio surfaces use
// stageFiles(), which reads every file up-front and resolves ready attachments.

export const MAX_FILES = 4
export const MAX_FILE_BYTES = 8 * 1024 * 1024
export const ACCEPT = '.xlsx,.csv,application/pdf,image/png,image/jpeg,image/webp'

// MIME / extension → frozen `kind`. CSV + XLSX sometimes arrive with empty or
// generic MIME from the OS, so we fall back to the filename extension.
export function classifyFile(file) {
  const mime = (file.type || '').toLowerCase()
  const name = (file.name || '').toLowerCase()
  if (mime === 'application/pdf' || name.endsWith('.pdf')) return { kind: 'pdf', ok: true }
  if (mime.startsWith('image/')) {
    if (['image/png', 'image/jpeg', 'image/webp'].includes(mime)) return { kind: 'image', ok: true }
    return { kind: 'image', ok: false }
  }
  if (name.endsWith('.csv') || mime === 'text/csv') return { kind: 'csv', ok: true }
  if (
    name.endsWith('.xlsx') ||
    name.endsWith('.xls') ||
    mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    mime === 'application/vnd.ms-excel'
  ) {
    return { kind: 'xlsx', ok: true }
  }
  return { kind: 'pdf', ok: false }
}

export function uid() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `att-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export function readAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result)
    r.onerror = () => reject(r.error)
    r.readAsDataURL(file)
  })
}

// Validate + read a FileList/array into ready attachments. Rejects (bad type, too
// big, over the per-turn cap, unreadable) are reported through onReject(message)
// and skipped. Resolves to the ready attachments (at most MAX_FILES). This is the
// up-front variant used by the Studio dropzone/ask-bar (vs PennyInputBar's
// progressive chip UX which keeps its own 'reading' state).
export async function stageFiles(files, onReject) {
  const reject = typeof onReject === 'function' ? onReject : () => {}
  const cleaned = []
  for (const f of Array.from(files || [])) {
    const { kind, ok } = classifyFile(f)
    if (!ok) {
      reject(`${f.name}: unsupported type. Use XLSX, CSV, PDF, PNG, JPEG, or WebP.`)
      continue
    }
    if (f.size > MAX_FILE_BYTES) {
      reject(`${f.name} is over 8 MB.`)
      continue
    }
    cleaned.push({ file: f, kind })
  }
  if (cleaned.length === 0) return []

  const accepted = cleaned.slice(0, MAX_FILES)
  if (accepted.length < cleaned.length) {
    reject(`Up to ${MAX_FILES} files per message.`)
  }

  const staged = await Promise.all(
    accepted.map(async ({ file, kind }) => {
      try {
        const dataUrl = await readAsDataURL(file)
        const comma = dataUrl.indexOf(',')
        const b64 = comma >= 0 ? dataUrl.slice(comma + 1) : ''
        return {
          local_id: uid(),
          name: file.name,
          mime: file.type || (kind === 'csv' ? 'text/csv' : 'application/octet-stream'),
          kind,
          dataBase64: b64,
          preview: kind === 'image' ? dataUrl : undefined,
          status: 'ready',
        }
      } catch {
        reject(`Couldn’t read ${file.name}.`)
        return null
      }
    }),
  )
  return staged.filter(Boolean)
}
