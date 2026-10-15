// Frosted-glass form primitives for the DARK auth surfaces (login / register /
// reset / verify / onboarding). The light in-app pages keep using fields.jsx —
// these are the same shapes re-cut for translucent cards over the navy aurora:
// white-on-glass inputs with a primary-blue focus ring (radius per the system). Import the class strings
// (glassLabel / glassInput) directly for custom inputs (code fields etc.).
import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'

export const glassLabel =
  'mb-2 block text-[11px] font-semibold uppercase tracking-[0.08em] text-white/60'
export const glassInput =
  'w-full rounded-md border border-white/15 bg-white/[0.06] px-4 py-3 text-base text-white ' +
  'placeholder-white/35 outline-none transition-all duration-200 ' +
  'focus:border-white/50 focus:bg-white/[0.09] focus:ring-2 focus:ring-[#2563eb]/40 ' +
  'autofill:shadow-[inset_0_0_0_1000px_rgba(15,28,52,0.9)] autofill:[-webkit-text-fill-color:#fff]'

export function GlassTextField({ label, hint, className = '', ...props }) {
  return (
    <div className={`mb-5 ${className}`}>
      <label className={glassLabel}>{label}</label>
      <input className={glassInput} {...props} />
      {hint && <p className="mt-1.5 text-[13px] leading-snug text-white/45">{hint}</p>}
    </div>
  )
}

export function GlassPasswordField({ label, value, onChange, placeholder, autoComplete, onEnter }) {
  const [show, setShow] = useState(false)
  return (
    <div className="mb-5">
      <label className={glassLabel}>{label}</label>
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          autoComplete={autoComplete}
          onKeyDown={(e) => e.key === 'Enter' && onEnter?.()}
          className={`${glassInput} pr-12`}
        />
        <button
          type="button"
          tabIndex={-1}
          onClick={() => setShow((s) => !s)}
          aria-label={show ? 'Hide password' : 'Show password'}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-white/45 transition-colors hover:text-white"
        >
          {show ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
    </div>
  )
}

export function GlassFormError({ children }) {
  if (!children) return <div className="min-h-[20px]" />
  return (
    <div className="min-h-[20px] rounded-md border border-white/10 border-l-2 border-l-red-400 bg-white/[0.04] px-3 py-2 text-left text-[14px] text-white">
      {children}
    </div>
  )
}

export function GlassFormSuccess({ children }) {
  if (!children) return null
  return (
    <div className="rounded-md border border-white/10 border-l-2 border-l-emerald-400 bg-white/[0.04] px-3 py-2 text-left text-[14px] text-white">
      {children}
    </div>
  )
}
