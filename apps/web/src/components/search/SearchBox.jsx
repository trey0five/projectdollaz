// ─────────────────────────────────────────────────────────────────────────────
// SearchBox — Phase 4 platform-wide search, mounted in the AppShell top strip.
//
// DESKTOP (sm+): a centered flex-1 input that opens a debounced, grouped results
// dropdown anchored under the strip. MOBILE (<sm): a search icon that opens a
// full-width overlay panel reusing the same results body.
//
// Behaviour: min-length hint (<2 chars), loading spinner, empty (idle),
// no-results, and grouped results (domain header + count, each item a click-to-
// navigate row with title + snippet + a domain badge). Closes on Escape, on
// click-away (a document mousedown listener on the container ref), and on
// navigate. Keyboard: ArrowUp/Down move the active option, Enter opens it;
// role=combobox/listbox/option + aria-activedescendant wire a11y. All motion is
// gated on useReducedMotion(), matching the AppShell drawer.
//
// THEME: navy panel, gold accents/focus ring — the flashy-but-on-theme memory.
// This component lives ONLY in the header; it never touches the sidebar navIds or
// the Penny anchors.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { Search, X, Loader2, Landmark, BadgeCheck, Building2, ListChecks } from 'lucide-react'
import { useSchools } from '../../context/SchoolContext.jsx'
import { useSearch, MIN_SEARCH_LEN } from '../../hooks/useSearch.js'

const DOMAIN_ICON = {
  core: ListChecks,
  governance: Landmark,
  accreditation: BadgeCheck,
  facilities: Building2,
}

/** Flatten the grouped response into a single ordered list for arrow-key nav. */
function flatten(groups) {
  const flat = []
  for (const g of groups) for (const item of g.items) flat.push(item)
  return flat
}

/** The shared results body (used by both the desktop dropdown and mobile overlay). */
function ResultsBody({ q, results, loading, error, activeIndex, onHover, onPick }) {
  const trimmed = q.trim()
  if (trimmed.length < MIN_SEARCH_LEN) {
    return (
      <p className="px-4 py-6 text-center text-sm text-white/50">
        Type at least {MIN_SEARCH_LEN} characters to search.
      </p>
    )
  }
  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 px-4 py-6 text-sm text-white/60">
        <Loader2 size={16} className="animate-spin" /> Searching…
      </div>
    )
  }
  if (error) {
    return <p className="px-4 py-6 text-center text-sm text-rose-300">{error}</p>
  }
  if (results.total === 0) {
    return (
      <p className="px-4 py-6 text-center text-sm text-white/50">
        No matches for “{trimmed}”.
      </p>
    )
  }

  // Precompute each group's starting offset into the flat option list (no mutation
  // during render — the group's flat index = its offset + the item's local index).
  const groupOffsets = []
  results.groups.reduce((acc, g) => {
    groupOffsets.push(acc)
    return acc + g.items.length
  }, 0)

  return (
    <div role="listbox" aria-label="Search results" className="max-h-[60vh] overflow-y-auto py-2">
      {results.groups.map((group, gi) => {
        const Icon = DOMAIN_ICON[group.domain] ?? Search
        return (
          <div key={group.domain} className="mb-1">
            <div className="flex items-center gap-2 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-gold/80">
              <Icon size={13} />
              {group.label}
              <span className="ml-auto rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-white/60">
                {group.count}
              </span>
            </div>
            {group.items.map((item, ii) => {
              const idx = groupOffsets[gi] + ii
              const active = idx === activeIndex
              return (
                <button
                  key={`${item.type}-${item.id}`}
                  type="button"
                  id={`search-opt-${idx}`}
                  role="option"
                  aria-selected={active}
                  onMouseEnter={() => onHover(idx)}
                  onClick={() => onPick(item)}
                  className={`flex w-full flex-col items-start gap-0.5 px-4 py-2 text-left transition-colors ${
                    active ? 'bg-gold/15' : 'hover:bg-white/5'
                  }`}
                >
                  <span className="flex w-full items-center gap-2">
                    <span className="truncate text-sm font-medium text-white">{item.title}</span>
                    {item.matchedField ? (
                      <span className="ml-auto shrink-0 rounded bg-white/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-white/50">
                        {item.matchedField}
                      </span>
                    ) : null}
                  </span>
                  {item.snippet ? (
                    <span className="line-clamp-1 text-xs text-white/55">{item.snippet}</span>
                  ) : null}
                </button>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}

export default function SearchBox() {
  const reduce = useReducedMotion()
  const navigate = useNavigate()
  const { activeSchool } = useSchools()
  const schoolId = activeSchool?.id ?? null
  const { q, setQ, results, loading, error } = useSearch(schoolId)

  const [open, setOpen] = useState(false) // desktop dropdown
  const [mobileOpen, setMobileOpen] = useState(false) // mobile overlay
  const [activeIndex, setActiveIndex] = useState(-1)

  const containerRef = useRef(null)
  const mobileInputRef = useRef(null)

  const flat = useMemo(() => flatten(results.groups), [results.groups])

  // Typing resets the highlighted option (new query → stale highlight cleared)
  // without a set-state-in-effect; the arrow keys re-establish it.
  const updateQuery = (value) => {
    setQ(value)
    setActiveIndex(-1)
  }

  // Close the desktop dropdown on click-away + Escape.
  useEffect(() => {
    if (!open) return undefined
    const onDown = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  // Focus the mobile input when the overlay opens.
  useEffect(() => {
    if (mobileOpen) mobileInputRef.current?.focus()
  }, [mobileOpen])

  if (!schoolId) return null

  const close = () => {
    setOpen(false)
    setMobileOpen(false)
  }

  const pick = (item) => {
    close()
    setQ('')
    navigate(item.link)
  }

  const onKeyDown = (e) => {
    if (e.key === 'Escape') {
      close()
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setOpen(true)
      setActiveIndex((i) => (flat.length ? (i + 1) % flat.length : -1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => (flat.length ? (i <= 0 ? flat.length - 1 : i - 1) : -1))
    } else if (e.key === 'Enter') {
      if (activeIndex >= 0 && flat[activeIndex]) {
        e.preventDefault()
        pick(flat[activeIndex])
      }
    }
  }

  const bodyProps = {
    q,
    results,
    loading,
    error,
    activeIndex,
    onHover: setActiveIndex,
    onPick: pick,
  }

  const activeDescendant = activeIndex >= 0 ? `search-opt-${activeIndex}` : undefined

  return (
    <>
      {/* ── Desktop: centered input + anchored dropdown (sm+) ─────────────── */}
      <div ref={containerRef} className="relative hidden min-w-0 flex-1 justify-center sm:flex">
        <div className="relative w-full max-w-md">
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/40"
          />
          <input
            type="text"
            role="combobox"
            aria-expanded={open}
            aria-controls="search-listbox"
            aria-autocomplete="list"
            aria-activedescendant={activeDescendant}
            aria-label="Search"
            value={q}
            placeholder="Search policies, tasks, standards…"
            onChange={(e) => {
              updateQuery(e.target.value)
              setOpen(true)
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={onKeyDown}
            className="w-full min-w-0 rounded-lg border-2 border-white/15 bg-navy-deep/40 py-1.5 pl-9 pr-9 text-sm text-white placeholder:text-white/40 transition-all focus-visible:border-gold/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/50"
          />
          {q ? (
            <button
              type="button"
              onClick={() => {
                setQ('')
                setOpen(false)
              }}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-white/50 hover:text-white"
            >
              <X size={14} />
            </button>
          ) : null}

          <AnimatePresence>
            {open && q.trim().length > 0 ? (
              <motion.div
                id="search-listbox"
                initial={reduce ? false : { opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, y: -6 }}
                transition={reduce ? { duration: 0 } : { duration: 0.16 }}
                className="absolute left-0 right-0 top-full z-40 mt-2 overflow-hidden rounded-xl border-2 border-gold/30 bg-navy-gradient shadow-navy-glow"
              >
                <ResultsBody {...bodyProps} />
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </div>

      {/* ── Mobile: search icon → full-width overlay (<sm) ────────────────── */}
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        aria-label="Search"
        className="flex h-10 w-10 items-center justify-center rounded-lg border-2 border-white/20 text-white/80 transition-all hover:border-gold/60 hover:text-white sm:hidden"
      >
        <Search size={18} />
      </button>

      <AnimatePresence>
        {mobileOpen ? (
          <>
            <motion.div
              className="no-print fixed inset-0 z-40 bg-navy-deep/60 backdrop-blur-sm sm:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={close}
              aria-hidden="true"
            />
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label="Search"
              initial={reduce ? false : { opacity: 0, y: -12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, y: -12 }}
              transition={reduce ? { duration: 0 } : { duration: 0.2 }}
              className="no-print fixed inset-x-0 top-0 z-50 border-b-2 border-gold/30 bg-navy-gradient p-3 shadow-navy-glow sm:hidden"
            >
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search
                    size={16}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/40"
                  />
                  <input
                    ref={mobileInputRef}
                    type="text"
                    role="combobox"
                    aria-expanded
                    aria-autocomplete="list"
                    aria-activedescendant={activeDescendant}
                    aria-label="Search"
                    value={q}
                    placeholder="Search…"
                    onChange={(e) => updateQuery(e.target.value)}
                    onKeyDown={onKeyDown}
                    className="w-full rounded-lg border-2 border-white/15 bg-navy-deep/40 py-2 pl-9 pr-3 text-sm text-white placeholder:text-white/40 focus-visible:border-gold/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/50"
                  />
                </div>
                <button
                  type="button"
                  onClick={close}
                  aria-label="Close search"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border-2 border-white/20 text-white/80 hover:border-gold/60 hover:text-white"
                >
                  <X size={18} />
                </button>
              </div>
              <div className="mt-2 overflow-hidden rounded-xl border border-white/10 bg-navy-deep/30">
                <ResultsBody {...bodyProps} />
              </div>
            </motion.div>
          </>
        ) : null}
      </AnimatePresence>
    </>
  )
}
