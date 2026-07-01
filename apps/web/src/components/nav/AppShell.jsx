// ─────────────────────────────────────────────────────────────────────────────
// AppShell — the grouped LEFT SIDEBAR + slim TOP STRIP that replaces the flat
// TopBar. Mounted ONCE in AuthedLayout (wrapping the Outlet), so — unlike the old
// per-page <TopBar/> — the chrome renders a single time around every route.
//
// LAYOUT: a `lg:flex` shell. On lg+ the Sidebar is a `fixed` w-64 left rail and
// the content column is offset by `lg:pl-64`; the TopStrip is a sticky slim header
// inside that column holding SchoolSwitcher + the user/logout menu. On <lg the
// sidebar collapses to a hamburger-driven off-canvas DRAWER (backdrop + Escape +
// close-on-navigate + focus move/restore); SchoolSwitcher + logout live in the
// drawer foot so they stay reachable.
//
// MODULE MODEL: NAV_GROUPS (sidebarNav.js) is filtered by hasModule; the Add-ons
// upsell group lists SELLABLE_MODULE_KEYS where hasModule(key) === false and deep-
// links /settings/billing. Core is never gated/upsold; trial (all-access) shows
// every licensed group and NO Add-ons block.
//
// PENNY: the desktop sidebar links carry id={navId} (the frozen targetRegistry
// anchors); the mobile drawer links DO NOT (duplicate ids would break
// getElementById — Penny glides on the desktop layout, and a `hidden lg:flex`
// desktop link measures 0×0 on mobile so Penny simply parks, exactly as before).
//
// HOOKS: the ONLY setState-in-effect is the sanctioned deferred close-on-navigate
// (Promise.resolve().then) ported from TopBar; Escape/scroll-lock and focus-move
// are DOM side-effects (listeners / .focus()), not state writes. Active state is
// derived per render from useLocation. PRINT: the whole shell chrome is no-print.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  LogOut,
  LineChart,
  Menu,
  X,
  Lock,
  Plus,
  Landmark,
  BadgeCheck,
  Users,
  UserCog,
  Building2,
  HeartHandshake,
  LineChart as PlanIcon,
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext.jsx'
import { useBilling } from '../../context/BillingContext.jsx'
import { SELLABLE_MODULE_KEYS, MODULE_META } from '../../lib/modules.js'
import SchoolSwitcher from '../SchoolSwitcher.jsx'
import SearchBox from '../search/SearchBox.jsx'
import { NAV_GROUPS, SETTINGS_ITEM } from './sidebarNav.js'

// Per-module icon for the (dimmed) Add-ons rows; falls back to a Lock badge.
const LOCKED_ICON = {
  planning: PlanIcon,
  governance: Landmark,
  enrollment: Users,
  hr: UserCog,
  facilities: Building2,
  advancement: HeartHandshake,
  accreditation: BadgeCheck,
}

const itemClass = (active) =>
  `group relative flex min-h-[44px] items-center gap-3 rounded-lg border-2 px-3 py-2 text-[14px] font-semibold uppercase tracking-[0.08em] outline-none ring-gold/50 transition-all focus-visible:ring-2 ${
    active
      ? 'border-gold/60 bg-gold/10 text-gold-light'
      : 'border-white/15 text-white/70 hover:border-gold/60 hover:text-white'
  }`

// A gold left-accent rail marks the active item in the vertical layout.
function ActiveRail({ active }) {
  if (!active) return null
  return <span aria-hidden="true" className="absolute inset-y-1.5 left-0 w-1 rounded-full bg-gold" />
}

export default function AppShell({ children }) {
  const { logout } = useAuth()
  const { hasModule, entitled } = useBilling()
  const navigate = useNavigate()
  const reduce = useReducedMotion()
  const location = useLocation()
  const path = location.pathname

  const [menuOpen, setMenuOpen] = useState(false)
  const hamburgerRef = useRef(null)
  const drawerCloseRef = useRef(null)

  // Close the drawer on navigation. Deferred to a microtask so it's not a
  // synchronous setState-in-effect (react-hooks/set-state-in-effect); idempotent.
  useEffect(() => {
    let cancelled = false
    Promise.resolve().then(() => {
      if (!cancelled) setMenuOpen(false)
    })
    return () => {
      cancelled = true
    }
  }, [path])

  // Escape-to-close + body-scroll-lock + focus move-in/restore while open. These
  // are DOM side-effects (listeners / .focus()), not state writes.
  useEffect(() => {
    if (!menuOpen) return undefined
    const trigger = hamburgerRef.current
    const onKey = (e) => {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const raf = window.requestAnimationFrame(() => {
      if (drawerCloseRef.current) drawerCloseRef.current.focus()
    })
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
      window.cancelAnimationFrame(raf)
      if (trigger) trigger.focus()
    }
  }, [menuOpen])

  // Locked sellable modules → the Add-ons upsell. hasModule returns true while
  // billing loads / for trial / for any licensed module, so `=== false` avoids a
  // pre-load upsell flash and this list is empty for trial + fully-licensed. The
  // block only shows for an entitled school (a not-entitled school is a subscribe
  // gate handled elsewhere; don't render an upsell wall there).
  const lockedModules = SELLABLE_MODULE_KEYS.filter((k) => hasModule(k) === false)
  const showAddons = entitled && lockedModules.length > 0

  const visibleGroups = NAV_GROUPS.filter((g) => g.module === null || hasModule(g.module))

  const brand = (
    <Link
      to="/"
      aria-label="Go to home dashboard"
      title="Home dashboard"
      className="flex min-w-0 items-center gap-3 rounded-lg px-1 py-1 outline-none ring-gold/50 transition-opacity hover:opacity-90 focus-visible:ring-2"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gold/15 text-gold-light shadow-glow">
        <LineChart size={20} />
      </span>
      <span className="truncate font-serif text-[15px] uppercase tracking-[0.16em] text-gold-light">
        Project Dollaz
      </span>
    </Link>
  )

  // The scrollable nav body. `withIds` puts the frozen navId on the DESKTOP links
  // only; the mobile drawer passes withIds=false (no duplicate DOM ids).
  const navBody = (withIds) => (
    <nav aria-label="Primary" className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-3 py-4">
      {visibleGroups.map((group) => (
        <section
          key={group.id}
          role="group"
          aria-labelledby={group.label ? `navgrp-${group.id}` : undefined}
          aria-label={group.label ? undefined : 'Overview'}
          className="flex flex-col gap-1.5"
        >
          {group.label && (
            <h2
              id={`navgrp-${group.id}`}
              className="px-2 pb-0.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-gold-light/70"
            >
              {group.label}
            </h2>
          )}
          {group.items.map((item) => {
            const active = item.match(path)
            return (
              <Link
                key={item.to}
                id={withIds ? item.navId : undefined}
                to={item.to}
                aria-label={item.label}
                aria-current={active ? 'page' : undefined}
                title={item.label}
                className={itemClass(active)}
              >
                <ActiveRail active={active} />
                <item.Icon size={17} className="shrink-0" />
                <span>{item.label}</span>
              </Link>
            )
          })}
        </section>
      ))}

      {showAddons && (
        <section role="group" aria-labelledby="navgrp-addons" className="flex flex-col gap-1.5">
          <h2
            id="navgrp-addons"
            className="px-2 pb-0.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-gold-light/70"
          >
            Add-ons
          </h2>
          {lockedModules.map((key) => {
            const meta = MODULE_META[key]
            const Icon = LOCKED_ICON[key] || Lock
            return (
              <button
                key={key}
                type="button"
                onClick={() => navigate('/settings/billing')}
                aria-label={`Add ${meta?.label ?? key} module`}
                title={meta?.description ?? undefined}
                className="group flex min-h-[44px] items-center gap-3 rounded-lg border-2 border-white/10 px-3 py-2 text-left text-white/45 outline-none ring-gold/50 transition-all hover:border-gold/40 hover:text-white/70 focus-visible:ring-2"
              >
                <span className="relative flex shrink-0 items-center">
                  <Icon size={16} className="opacity-70" />
                  <Lock size={10} className="absolute -bottom-1 -right-1 text-gold-light/80" />
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-[13px] font-semibold uppercase tracking-[0.08em]">
                    {meta?.label ?? key}
                  </span>
                  {meta?.description && (
                    <span className="truncate text-[11px] font-normal normal-case tracking-normal text-white/35">
                      {meta.description}
                    </span>
                  )}
                </span>
                <span className="flex shrink-0 items-center gap-1 rounded-full border border-gold/50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-gold-light">
                  <Plus size={11} /> Add
                </span>
              </button>
            )
          })}
        </section>
      )}
    </nav>
  )

  // Settings, pinned to the foot. `withIds` mirrors the nav-body rule.
  const settingsLink = (withIds) => {
    const active = SETTINGS_ITEM.match(path)
    return (
      <Link
        id={withIds ? SETTINGS_ITEM.navId : undefined}
        to={SETTINGS_ITEM.to}
        aria-label={SETTINGS_ITEM.label}
        aria-current={active ? 'page' : undefined}
        title={SETTINGS_ITEM.label}
        className={itemClass(active)}
      >
        <ActiveRail active={active} />
        <SETTINGS_ITEM.Icon size={17} className="shrink-0" />
        <span>{SETTINGS_ITEM.label}</span>
      </Link>
    )
  }

  const signOutButton = (
    <motion.button
      whileTap={reduce ? undefined : { scale: 0.96 }}
      onClick={logout}
      className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg border-2 border-white/20 px-4 py-2 text-[13px] font-semibold uppercase tracking-[0.12em] text-white/70 transition-all hover:border-gold/60 hover:text-white"
    >
      <LogOut size={15} /> Sign Out
    </motion.button>
  )

  return (
    <>
      <div className="min-h-screen lg:flex">
        {/* ── Desktop sidebar (lg+): fixed left rail, carries the frozen navIds ── */}
        <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r-2 border-gold/30 bg-navy-gradient shadow-navy-glow lg:flex">
          <div className="shrink-0 border-b border-white/10 px-4 py-4">{brand}</div>
          {navBody(true)}
          <div className="shrink-0 border-t border-white/10 px-3 py-3">{settingsLink(true)}</div>
        </aside>

        {/* ── Content column (offset by the fixed rail on lg+) ─────────────────── */}
        <div className="app-content-offset flex min-w-0 flex-1 flex-col lg:pl-64">
          {/* Slim top strip: hamburger (<lg) + SchoolSwitcher + user/logout. */}
          <header className="no-print sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b-2 border-gold/30 bg-navy-gradient px-4 shadow-navy-glow sm:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <button
                ref={hamburgerRef}
                type="button"
                onClick={() => setMenuOpen((o) => !o)}
                aria-label={menuOpen ? 'Close menu' : 'Open menu'}
                aria-expanded={menuOpen}
                aria-controls="app-sidebar-drawer"
                className="flex h-10 w-10 items-center justify-center rounded-lg border-2 border-white/20 text-white/80 transition-all hover:border-gold/60 hover:text-white lg:hidden"
              >
                {menuOpen ? <X size={20} /> : <Menu size={20} />}
              </button>
              <SchoolSwitcher />
            </div>
            {/* Middle: platform-wide search (desktop input + mobile icon overlay). */}
            <SearchBox />
            <div className="hidden items-center gap-3 lg:flex">
              <motion.button
                whileTap={reduce ? undefined : { scale: 0.96 }}
                onClick={logout}
                className="flex min-h-[40px] items-center gap-2 rounded-lg border-2 border-white/20 px-4 py-1.5 text-[13px] font-semibold uppercase tracking-[0.12em] text-white/70 transition-all hover:border-gold/60 hover:text-white"
              >
                <LogOut size={15} /> Sign Out
              </motion.button>
            </div>
          </header>

          <main className="min-w-0 flex-1">{children}</main>
        </div>
      </div>

      {/* ── Mobile drawer (<lg): off-canvas sidebar ───────────────────────────── */}
      <AnimatePresence>
        {menuOpen && (
          <>
            <motion.div
              className="no-print fixed inset-0 z-40 bg-navy-deep/50 backdrop-blur-sm lg:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMenuOpen(false)}
              aria-hidden="true"
            />
            <motion.aside
              id="app-sidebar-drawer"
              role="dialog"
              aria-modal="true"
              aria-label="Primary navigation"
              initial={reduce ? false : { x: '-100%' }}
              animate={{ x: 0 }}
              exit={reduce ? { opacity: 0 } : { x: '-100%' }}
              transition={reduce ? { duration: 0 } : { type: 'tween', duration: 0.24 }}
              className="no-print fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col border-r-2 border-gold/30 bg-navy-gradient shadow-navy-glow lg:hidden"
            >
              <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-4 py-3">
                {brand}
                <button
                  ref={drawerCloseRef}
                  type="button"
                  onClick={() => setMenuOpen(false)}
                  aria-label="Close menu"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border-2 border-white/20 text-white/80 transition-all hover:border-gold/60 hover:text-white"
                >
                  <X size={20} />
                </button>
              </div>
              {navBody(false)}
              <div className="shrink-0 space-y-2 border-t border-white/10 px-3 py-3">
                {settingsLink(false)}
                <div className="sm:hidden">
                  <SchoolSwitcher />
                </div>
                {signOutButton}
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  )
}
