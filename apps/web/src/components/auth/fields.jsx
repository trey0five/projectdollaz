// Small shared form primitives for the auth pages: labeled text input and a
// password input with a show/hide toggle. Styled to match the cream card.
import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'

const labelCls =
  'mb-2 block text-[14px] font-semibold uppercase tracking-[0.14em] text-muted'
const inputCls =
  'w-full rounded-lg border-2 border-border bg-white px-4 py-3 text-base text-ink outline-none transition-colors focus:border-gold'

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
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted transition-colors hover:text-gold"
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
    <div className="min-h-[20px] rounded-md bg-danger/10 px-3 py-2 text-center text-[15px] text-danger">
      {children}
    </div>
  )
}

export function FormSuccess({ children }) {
  if (!children) return null
  return (
    <div className="rounded-md bg-emerald-500/10 px-3 py-2 text-center text-[15px] text-emerald-700">
      {children}
    </div>
  )
}
