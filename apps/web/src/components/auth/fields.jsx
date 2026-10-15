// Small shared form primitives for the auth pages: labeled text input and a
// password input with a show/hide toggle. Plain ledger fields (hairline, radius
// 6, primary focus ring); errors/success as a 2px mark + ink text.
import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'

const labelCls =
  'mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.08em] text-ink2'
const inputCls =
  'w-full rounded-md border border-hair/20 bg-white px-3.5 py-2.5 text-[15px] text-ink outline-none transition-[border-color,box-shadow] hover:border-hair/30 focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/20'

export function TextField({ label, ...props }) {
  return (
    <div className="mb-5">
      <label className={labelCls}>{label}</label>
      <input className={inputCls} {...props} />
    </div>
  )
}

export function PasswordField({ label, value, onChange, placeholder, autoComplete, onEnter }) {
  const [show, setShow] = useState(false)
  return (
    <div className="mb-5">
      <label className={labelCls}>{label}</label>
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          autoComplete={autoComplete}
          onKeyDown={(e) => e.key === 'Enter' && onEnter?.()}
          className={`${inputCls} pr-12`}
        />
        <button
          type="button"
          tabIndex={-1}
          onClick={() => setShow((s) => !s)}
          aria-label={show ? 'Hide password' : 'Show password'}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-ink2 transition-colors hover:text-ink"
        >
          {show ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
    </div>
  )
}

export function FormError({ children }) {
  if (!children) return <div className="min-h-[20px]" />
  return (
    <div className="min-h-[20px] border-l-2 border-risk bg-risk/[0.04] px-3 py-2 text-[14px] text-ink" role="alert">
      {children}
    </div>
  )
}

export function FormSuccess({ children }) {
  if (!children) return null
  return (
    <div className="border-l-2 border-good bg-good/[0.04] px-3 py-2 text-[14px] text-ink" role="status">
      {children}
    </div>
  )
}
