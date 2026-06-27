// Step 4 — Branding. Logo upload (FileReader -> data URL, client size-check
// ~400KB pre-send, thumbnail preview, PATCH school via SchoolContext.updateSchool;
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

const ACCEPT = 'image/png,image/jpeg,image/svg+xml'

export default function Step4Branding({ ctx }) {
  const { data, draft, dispatch, goTo, canEdit, isOwner, school, reload } = ctx
  const { updateSchool } = useSchools()

  const [logoErr, setLogoErr] = useState('')
  const [busy, setBusy] = useState(false)

  const branding = data?.branding || {}
  const logo = branding.logoBase64 || null
  const brandColor = branding.brandColor || null

  // ── School-wide branding (owner-only) ───────────────────────────────────────
  const onLogoFile = (file) => {
    if (!file) return
    setLogoErr('')
    if (!/^image\/(png|jpeg|svg\+xml)$/.test(file.type)) {
      setLogoErr('Logo must be a PNG, JPG, or SVG.')
      return
    }
    const reader = new FileReader()
    reader.onload = async () => {
      const dataUrl = String(reader.result || '')
      if (dataUrlByteLength(dataUrl) > LOGO_MAX_BYTES) {
        setLogoErr('That image is over 400KB. Please use a smaller logo.')
        return
      }
      await patchBranding({ logoBase64: dataUrl })
    }
    reader.onerror = () => setLogoErr('Could not read that file. Try another image.')
    reader.readAsDataURL(file)
  }

  const patchBranding = async (patch) => {
    if (!school?.id) return
    setBusy(true)
    setLogoErr('')
    try {
      await updateSchool(school.id, patch)
      await reload()
    } catch (e) {
      const msg = e?.response?.data?.message
      setLogoErr(typeof msg === 'string' ? msg : 'Could not save branding. Please try again.')
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
        <h2 className="font-serif text-2xl font-semibold text-navy">Branding &amp; cover</h2>
        <p className="mt-1 text-[13.5px] text-muted">
          Personalize the cover page. The logo &amp; accent color are saved for your school; the
          title &amp; committee are per report.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        {/* Controls */}
        <div className="space-y-5">
          {/* Logo */}
          <div>
            <label className="mb-1.5 block text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">
              School logo {!isOwner && <span className="normal-case text-muted/70">(owner only)</span>}
            </label>
            <div className="flex items-center gap-3">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-rule/60 bg-section">
                {logo ? (
                  <img src={logo} alt="School logo" className="max-h-full max-w-full object-contain" />
                ) : (
                  <Building2 size={22} className="text-muted/50" />
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {isOwner && (
                  <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-gold/40 bg-gold/10 px-3 py-2 text-[12.5px] font-semibold text-navy transition-colors hover:bg-gold/20">
                    <ImageUp size={14} className="text-gold" />
                    {logo ? 'Replace' : 'Upload logo'}
                    <input
                      type="file"
                      accept={ACCEPT}
                      className="hidden"
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
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-[12.5px] font-semibold text-muted transition-colors hover:border-rose-300 hover:text-rose-600 disabled:opacity-50"
                  >
                    <Trash2 size={14} /> Remove
                  </button>
                )}
              </div>
            </div>
            <p className="mt-1.5 text-[11px] text-muted">PNG, JPG, or SVG up to 400KB.</p>
            {logoErr && (
              <p className="mt-1.5 flex items-center gap-1.5 text-[12.5px] text-rose-600">
                <AlertCircle size={14} /> {logoErr}
              </p>
            )}
          </div>

          {/* Accent color */}
          {isOwner && (
            <div>
              <label className="mb-1.5 block text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">
                Accent color
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={brandColor || '#0B1F3A'}
                  disabled={busy}
                  onChange={(e) => onPickColor(e.target.value)}
                  className="h-9 w-12 cursor-pointer rounded border border-border bg-white"
                  aria-label="Brand accent color"
                />
                <span className="text-[12.5px] tabular-nums text-muted">{brandColor || '#0B1F3A'}</span>
              </div>
            </div>
          )}

          {/* Report title */}
          <div>
            <label className="mb-1.5 block text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">
              Report title
            </label>
            <input
              type="text"
              value={titleValue}
              readOnly={!canEdit}
              maxLength={160}
              onChange={(e) => dispatch({ type: 'setField', field: 'reportTitle', value: e.target.value })}
              placeholder={DEFAULT_TITLE}
              className="w-full rounded-lg border border-border bg-white px-3.5 py-2.5 text-[14px] text-ink outline-none transition-colors focus:border-gold read-only:bg-section"
            />
          </div>

          {/* Committee */}
          <div>
            <label className="mb-1.5 block text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">
              Committee name
            </label>
            <input
              type="text"
              value={committeeValue}
              readOnly={!canEdit}
              maxLength={120}
              onChange={(e) => dispatch({ type: 'setField', field: 'committeeName', value: e.target.value })}
              placeholder={DEFAULT_COMMITTEE}
              className="w-full rounded-lg border border-border bg-white px-3.5 py-2.5 text-[14px] text-ink outline-none transition-colors focus:border-gold read-only:bg-section"
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
      <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-gold">Cover preview</p>
      <div className="overflow-hidden rounded-xl border border-rule/60 bg-white shadow-card">
        <div className="h-1.5 w-full" style={{ backgroundColor: accent }} />
        <div className="flex flex-col items-center px-6 py-9 text-center">
          {logo ? (
            <img src={logo} alt="" className="mb-4 max-h-[72px] max-w-[180px] object-contain" />
          ) : (
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-section">
              <Building2 size={24} className="text-muted/50" />
            </div>
          )}
          <h3 className="font-serif text-xl font-semibold text-navy">
            {school?.name || data?.branding?.schoolName || 'Your School'}
          </h3>
          <p className="mt-1 text-[12px] font-semibold uppercase tracking-[0.1em]" style={{ color: accent }}>
            {data?.label || ''}
          </p>
          <p className="mt-4 max-w-[260px] font-serif text-[15px] text-navy">
            {titleValue.trim() || DEFAULT_TITLE}
          </p>
          <p className="mt-1 text-[12.5px] text-muted">{committeeValue.trim() || DEFAULT_COMMITTEE}</p>
          {data?.periodEndDate && (
            <p className="mt-3 text-[11px] text-muted">For the year ending {longDate(data.periodEndDate)}</p>
          )}
        </div>
      </div>
    </div>
  )
}
