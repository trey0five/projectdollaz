// ─────────────────────────────────────────────────────────────────────────────
// ContextSwitcher — the ui.v2 header's ONE "what am I viewing" picker, replacing
// the SchoolSwitcher + ScopeToggle pair. The trigger names the current context
// (org scope: "Whole organization"; school scope: the active school); the
// menu offers "Whole organization" (whenever the caller has an org — even one
// school, so a freshly named org from onboarding is visible) above the school
// list. Selecting the org item → setScope('org'); selecting a school →
// setActiveSchool(id) + setScope('school') — the SAME context writes the two old
// controls made, just from one surface. v1 keeps SchoolSwitcher/ScopeToggle.
//
// A11y: Escape closes + returns focus to the trigger; outside-click closes;
// focus moves to the first menu item on open; reduced motion = fade-only.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { ChevronDown, Check, Building2, Layers } from 'lucide-react'
import { useSchools } from '../../context/SchoolContext.jsx'
import { useScope } from '../../context/ScopeContext.jsx'

/**
 * The school's logo at nav scale, on a light chip.
 *
 * The sidebar sits on near-black and school logos are drawn for white paper, so
 * the chip is doing the same job it does on the briefing band — without it half
 * the marks in a diocese are a dark smudge. A school with no logo keeps the
 * generic building glyph rather than inventing a mark at 16px, where two or
 * three letters are illegible anyway.
 */
function SchoolMark({ school, fallbackClass = 'text-white/50' }) {
  if (school?.logoBase64) {
    return (
      <span className="grid h-[18px] w-[18px] shrink-0 place-items-center overflow-hidden rounded-[5px] bg-white/95 p-[1.5px]">
        <img src={school.logoBase64} alt="" className="h-full w-full object-contain" />
      </span>
    )
  }
  return <Building2 size={15} className={`shrink-0 ${fallbackClass}`} />
}

export default function ContextSwitcher() {
  const { schools, activeSchool, setActiveSchool } = useSchools()
  const { scope, setScope, hasOrg, orgName, orgSchoolCount } = useScope()
  const navigate = useNavigate()
  const location = useLocation()
  const reduce = useReducedMotion()
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)
  const triggerRef = useRef(null)
  const firstItemRef = useRef(null)

  const orgMode = scope === 'org' && hasOrg

  // Outside-click closes (mousedown, like SchoolSwitcher).
  useEffect(() => {
    if (!open) return undefined
    const onClick = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  // Escape closes + focus returns to the trigger; focus moves in on open.
  useEffect(() => {
    if (!open) return undefined
    const trigger = triggerRef.current
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    const raf = window.requestAnimationFrame(() => {
      if (firstItemRef.current) firstItemRef.current.focus()
    })
    return () => {
      window.removeEventListener('keydown', onKey)
      window.cancelAnimationFrame(raf)
      if (trigger) trigger.focus()
    }
  }, [open])

  if (!activeSchool && !orgMode) return null

  const label = orgMode ? 'Whole organization' : activeSchool?.name ?? ''

  const pickOrg = () => {
    setScope('org')
    setOpen(false)
    // ALWAYS land on the organization home. This used to navigate only from
    // /analytics, on the theory that other pages would react to the scope flip —
    // but module pages are school-scoped, so picking "Whole organization" from
    // /finance or /accreditation changed a value nobody read and the screen sat
    // still. A control that visibly does nothing teaches people it is broken.
    // Choosing the org IS choosing to go where the org lives; /app renders the
    // org dashboard under scope='org'.
    if (location.pathname !== '/app') navigate('/app')
  }
  const pickSchool = (id) => {
    setActiveSchool(id)
    setScope('school')
    setOpen(false)
  }

  const itemClass = (active) =>
    `flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[13.5px] outline-none ring-inset ring-gold/50 transition-colors hover:bg-white/[0.08] focus-visible:ring-2 ${
      active ? 'font-semibold text-white' : 'text-white/80'
    }`

  return (
    <div ref={rootRef} className="relative min-w-0">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Viewing ${label} — switch context`}
        title={label}
        className="flex min-h-[38px] w-full min-w-0 items-center gap-2 rounded-[10px] border border-white/15 px-3 py-1.5 text-[13px] font-medium text-white/80 outline-none ring-gold/50 transition-colors hover:bg-white/[0.06] hover:text-white focus-visible:ring-2"
      >
        {orgMode ? (
          <Layers size={15} className="shrink-0 text-gold-light" />
        ) : (
          <SchoolMark school={activeSchool} fallbackClass="text-gold-light" />
        )}
        <span className="min-w-0 truncate">{label}</span>
        <ChevronDown
          size={14}
          className={`shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            aria-label="Switch context"
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
            className="absolute left-0 z-50 mt-2 max-h-[70vh] w-72 overflow-y-auto rounded-xl border border-white/15 bg-navy-deep py-1 shadow-2xl"
          >
            {hasOrg && (
              <>
                <button
                  ref={firstItemRef}
                  type="button"
                  role="menuitem"
                  onClick={pickOrg}
                  className={itemClass(orgMode)}
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.08] text-gold-light">
                    <Layers size={16} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">Whole organization</span>
                    <span className="block truncate text-[11.5px] font-normal text-white/50">
                      {orgName || 'Organization'} · {orgSchoolCount} school
                      {orgSchoolCount === 1 ? '' : 's'}
                    </span>
                  </span>
                  {orgMode && <Check size={16} className="shrink-0 text-gold-light" />}
                </button>
                <div aria-hidden="true" className="mx-3 my-1 h-px bg-white/10" />
              </>
            )}
            {schools.map((s, i) => {
              const active = !orgMode && s.id === activeSchool?.id
              return (
                <button
                  key={s.id}
                  ref={!hasOrg && i === 0 ? firstItemRef : undefined}
                  type="button"
                  role="menuitem"
                  onClick={() => pickSchool(s.id)}
                  className={itemClass(active)}
                >
                  <SchoolMark school={s} />
                  <span className="min-w-0 flex-1 truncate">{s.name}</span>
                  {active && <Check size={16} className="shrink-0 text-gold-light" />}
                </button>
              )
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
