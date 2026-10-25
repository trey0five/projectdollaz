// Step 4 — Branding. Logo upload: big images are DOWNSCALED client-side on a canvas
// (~512px longest edge, PNG to keep transparency, JPEG fallback if still heavy) so a
// 5MB+ photo becomes a small, web-friendly logo that always saves; then PATCH school
// via SchoolContext.updateSchool.
// Remove -> logoBase64:null). Logo + brandColor are SCHOOL-WIDE (owner-only);
// committee name + report title are per-period (saved via the wizard PUT, so any
// accountant can set them). Live cover preview mirrors the print cover. After a
// branding PATCH we reload the assembled bundle so the live preview + print pick
// up the new logo/color.
import { useState } from 'react'
import { ImageUp, Trash2, AlertCircle, Building2 } from 'lucide-react'
import { useSchools } from '../../../../context/SchoolContext.jsx'
import {
  DEFAULT_TITLE,
  DEFAULT_COMMITTEE,
  LOGO_MAX_BYTES,
  dataUrlByteLength,
  longDate,
} from '../boardReportUtils.js'
import WizardNav from './WizardNav.jsx'
import { DROP_HIGHLIGHT, useFileDrop } from '../../../../hooks/useFileDrop.js'

const ACCEPT = 'image/png,image/jpeg,image/svg+xml'

// Stored-logo sizing. We accept large uploads (RESIZE_INPUT_MAX) and shrink them so
// the saved logo stays small + web-friendly — no giant base64 riding on every school
// fetch / board-report PDF. MAX_LOGO_DIM caps the longest edge; if the PNG export is
// still heavy (a photographic logo), fall back to JPEG.
const MAX_LOGO_DIM = 512
const RESIZE_INPUT_MAX = 15 * 1024 * 1024 // 15MB raw upload ceiling (we downscale it)
const RESIZE_TARGET_BYTES = 500 * 1024 // PNG over this -> re-export as JPEG

const readFileAsDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('read-failed'))
    reader.readAsDataURL(file)
  })

const loadImage = (src) =>
  new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('decode-failed'))
    img.src = src
  })

// Downscale a raster logo to a web-friendly size via canvas. SVGs pass through (vector,
// already tiny). Returns a small data URL — PNG (preserves transparency) unless it's
// still heavy, then JPEG q0.85.
async function shrinkLogo(file) {
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

export default function Step4Branding({ ctx }) {
  const { data, draft, dispatch, goTo, canEdit, isOwner, school, reload } = ctx
  const { updateSchool } = useSchools()

  const [logoErr, setLogoErr] = useState('')
  const [busy, setBusy] = useState(false)

  const branding = data?.branding || {}
  const logo = branding.logoBase64 || null
  const brandColor = branding.brandColor || null

  // ── School-wide branding (owner-only) ───────────────────────────────────────
  const onLogoFile = async (file) => {
    if (!file) return
    setLogoErr('')
    if (!/^image\/(png|jpeg|svg\+xml)$/.test(file.type)) {
      setLogoErr('Logo must be a PNG, JPG, or SVG.')
      return
    }
    if (file.size > RESIZE_INPUT_MAX) {
      setLogoErr('That file is over 15 MB. Please use a smaller image.')
      return
    }
    setBusy(true)
    try {
      // Shrink big uploads to a small, web-friendly logo before saving.
      const dataUrl = await shrinkLogo(file)
      if (dataUrlByteLength(dataUrl) > LOGO_MAX_BYTES) {
        setLogoErr('That image is too detailed to shrink down. Please try a simpler logo.')
        setBusy(false)
        return
      }
      await patchBranding({ logoBase64: dataUrl })
    } catch {
      setLogoErr('Could not process that image. Try another file.')
      setBusy(false)
    }
  }

  // A logo dropped on the Upload/Replace button runs the same onLogoFile.
  const { dragging: logoDragging, dropProps: logoDropProps } = useFileDrop({
    accept: ACCEPT,
    disabled: !isOwner || busy,
    onFiles: ([f]) => onLogoFile(f),
    onReject: (msg) => setLogoErr(msg),
  })

  const patchBranding = async (patch) => {
    if (!school?.id) return
    setBusy(true)
    setLogoErr('')
    try {
      await updateSchool(school.id, patch)
    } catch (e) {
      // The SAVE itself failed. class-validator returns `message` as an array;
      // surface its first line so the user sees the real reason, not the fallback.
      const raw = e?.response?.data?.message
      const msg = Array.isArray(raw) ? raw[0] : raw
      setLogoErr(typeof msg === 'string' ? msg : 'Could not save branding. Please try again.')
      setBusy(false)
      return
    }
    // Save succeeded — refresh the assembled bundle so the live preview/print pick
    // up the change. A reload hiccup must NOT masquerade as a save failure (this was
    // the long-standing "Could not save branding" bug: reload was undefined in ctx).
    try {
      await reload?.()
    } catch {
      /* preview will catch up on the next load; the save is already persisted */
    } finally {
      setBusy(false)
    }
  }

  const onPickColor = (value) => {
    if (isOwner) patchBranding({ brandColor: value })
  }

  // ── Per-period title/committee (any editor) ─────────────────────────────────
  const titleValue = draft.reportTitle || ''
  const committeeValue = draft.committeeName || ''

  return (
    <div>
      <header className="mb-5">
        <h2 className="font-serif text-title font-medium text-ink">Branding &amp; cover</h2>
        <p className="mt-1 text-[13.5px] text-ink2">
          Personalize the cover page. The logo &amp; accent color are saved for your school; the
          title &amp; committee are per report.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        {/* Controls */}
        <div className="space-y-5">
          {/* Logo */}
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.08em] text-ink2">
              School logo {!isOwner && <span className="normal-case text-ink2/70">(owner only)</span>}
            </label>
            <div className="flex items-center gap-3">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-[8px] border border-hair bg-ground">
                {logo ? (
                  <img src={logo} alt="School logo" className="max-h-full max-w-full object-contain" />
                ) : (
                  <Building2 size={22} className="text-ink2/50" />
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {isOwner && (
                  <label
                    {...logoDropProps}
                    title="Choose a logo — or drop the image here"
                    className={`btn btn-secondary btn-sm cursor-pointer focus-within:outline focus-within:outline-2 focus-within:outline-[#2563EB]/50 ${
                      logoDragging ? DROP_HIGHLIGHT : ''
                    }`}
                  >
                    <ImageUp size={14} aria-hidden="true" />
                    {logo ? 'Replace' : 'Upload logo'}
                    <input
                      type="file"
                      accept={ACCEPT}
                      className="sr-only"
                      disabled={busy}
                      onChange={(e) => {
                        onLogoFile(e.target.files?.[0])
                        e.target.value = ''
                      }}
                    />
                  </label>
                )}
                {isOwner && logo && (
                  <button
                    type="button"
                    onClick={() => patchBranding({ logoBase64: null })}
                    disabled={busy}
                    className="btn btn-quiet btn-sm"
                  >
                    <Trash2 size={14} /> Remove
                  </button>
                )}
              </div>
            </div>
            <p className="mt-1.5 text-[11px] text-ink2">
              PNG, JPG, or SVG — choose one or drop it on the button. Large images are resized automatically to a web-friendly size.
            </p>
            {logoErr && (
              <p className="b2-callout b2-risk mt-1.5" role="alert">
                <AlertCircle size={14} aria-hidden="true" /> {logoErr}
              </p>
            )}
          </div>

          {/* Accent color */}
          {isOwner && (
            <div>
              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.08em] text-ink2">
                Accent color
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={brandColor || '#0B1F3A'}
                  disabled={busy}
                  onChange={(e) => onPickColor(e.target.value)}
                  className="h-9 w-12 cursor-pointer rounded border border-hair bg-white"
                  aria-label="Brand accent color"
                />
                <span className="text-[12.5px] tabular-nums text-ink2">{brandColor || '#0B1F3A'}</span>
              </div>
            </div>
          )}

          {/* Report title */}
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.08em] text-ink2">
              Report title
            </label>
            <input
              type="text"
              value={titleValue}
              readOnly={!canEdit}
              maxLength={160}
              onChange={(e) => dispatch({ type: 'setField', field: 'reportTitle', value: e.target.value })}
              placeholder={DEFAULT_TITLE}
              className="b2-input read-only:bg-ground"
            />
          </div>

          {/* Committee */}
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.08em] text-ink2">
              Committee name
            </label>
            <input
              type="text"
              value={committeeValue}
              readOnly={!canEdit}
              maxLength={120}
              onChange={(e) => dispatch({ type: 'setField', field: 'committeeName', value: e.target.value })}
              placeholder={DEFAULT_COMMITTEE}
              className="b2-input read-only:bg-ground"
            />
          </div>
        </div>

        {/* Live cover preview */}
        {renderCoverPreview({ data, school, logo, brandColor, titleValue, committeeValue })}
      </div>

      <WizardNav onBack={() => goTo(3)} onNext={() => goTo(5)} nextLabel="Generate" />
    </div>
  )
}

function renderCoverPreview({ data, school, logo, brandColor, titleValue, committeeValue }) {
  const accent = brandColor || '#0B1F3A'
  return (
    <div className="lg:sticky lg:top-24">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink2">Cover preview</p>
      <div className="overflow-hidden rounded-[8px] border border-hair bg-white">
        <div className="h-1.5 w-full" style={{ backgroundColor: accent }} />
        <div className="flex flex-col items-center px-6 py-9 text-center">
          {logo ? (
            <img src={logo} alt="" className="mb-4 max-h-[72px] max-w-[180px] object-contain" />
          ) : (
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-[8px] bg-ground">
              <Building2 size={24} className="text-ink2/50" />
            </div>
          )}
          <h3 className="font-serif text-xl font-semibold text-ink">
            {school?.name || data?.branding?.schoolName || 'Your School'}
          </h3>
          <p className="mt-1 text-[12px] font-semibold uppercase tracking-[0.1em]" style={{ color: accent }}>
            {data?.label || ''}
          </p>
          <p className="mt-4 max-w-[260px] font-serif text-[15px] text-ink">
            {titleValue.trim() || DEFAULT_TITLE}
          </p>
          <p className="mt-1 text-[12.5px] text-ink2">{committeeValue.trim() || DEFAULT_COMMITTEE}</p>
          {data?.periodEndDate && (
            <p className="mt-3 text-[11px] text-ink2">For the year ending {longDate(data.periodEndDate)}</p>
          )}
        </div>
      </div>
    </div>
  )
}
