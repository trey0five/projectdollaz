// ─────────────────────────────────────────────────────────────────────────────
// schoolLogo — accept a logo file and hand back a small, storable data URL.
//
// Extracted from the board-report branding step so School settings can offer the
// same upload. The logo is SCHOOL-WIDE (it is a property of the school, not of a
// report), so it now has a home in Settings and the report wizard simply reads
// whatever is set there. One copy of the shrink rules, because a logo that saves
// in one place and is rejected in the other is the kind of bug nobody reports.
//
// Big uploads are downscaled on a canvas: a 5MB photo becomes a small web-safe
// logo that always saves and does not ride along on every school fetch. SVG
// passes straight through — it is already vector and already tiny.
// ─────────────────────────────────────────────────────────────────────────────

export const LOGO_MAX_BYTES = 5 * 1024 * 1024
export const RESIZE_INPUT_MAX = 15 * 1024 * 1024
export const MAX_LOGO_DIM = 512
export const RESIZE_TARGET_BYTES = 500 * 1024
export const LOGO_ACCEPT = 'image/png,image/jpeg,image/svg+xml'

/** Approximate decoded byte length of a data URL. */
export function dataUrlByteLength(dataUrl) {
  const i = String(dataUrl ?? '').indexOf(',')
  if (i < 0) return 0
  const b64 = String(dataUrl).slice(i + 1)
  return Math.floor((b64.length * 3) / 4)
}

export const readFileAsDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => resolve(String(fr.result))
    fr.onerror = () => reject(new Error('read-failed'))
    fr.readAsDataURL(file)
  })

const loadImage = (src) =>
  new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('decode-failed'))
    img.src = src
  })

/** PNG (keeps transparency) unless still heavy, then JPEG q0.85. */
export async function shrinkLogo(file) {
  if (file.type === 'image/svg+xml') return readFileAsDataUrl(file)
  const src = await readFileAsDataUrl(file)
  const img = await loadImage(src)
  const longest = Math.max(img.width, img.height) || 1
  const scale = Math.min(1, MAX_LOGO_DIM / longest)
  const w = Math.max(1, Math.round(img.width * scale))
  const h = Math.max(1, Math.round(img.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const cx = canvas.getContext('2d')
  if (!cx) return src
  cx.drawImage(img, 0, 0, w, h)
  let out = canvas.toDataURL('image/png')
  if (dataUrlByteLength(out) > RESIZE_TARGET_BYTES) out = canvas.toDataURL('image/jpeg', 0.85)
  return out
}

/**
 * Validate + shrink in one call.
 * @returns {Promise<{ dataUrl?: string, error?: string }>}
 */
export async function prepareLogo(file) {
  if (!file) return { error: 'No file selected.' }
  if (!/^image\/(png|jpeg|svg\+xml)$/.test(file.type)) {
    return { error: 'Logo must be a PNG, JPG, or SVG.' }
  }
  if (file.size > RESIZE_INPUT_MAX) {
    return { error: 'That file is over 15 MB. Please use a smaller image.' }
  }
  try {
    const dataUrl = await shrinkLogo(file)
    if (dataUrlByteLength(dataUrl) > LOGO_MAX_BYTES) {
      return { error: 'That image is too detailed to shrink down. Please try a simpler logo.' }
    }
    return { dataUrl }
  } catch {
    return { error: 'Could not process that image. Try another file.' }
  }
}
