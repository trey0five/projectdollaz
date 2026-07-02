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
import { useScope } from '../../context/ScopeContext.jsx'
import { SELLABLE_MODULE_KEYS, MODULE_META } from '../../lib/modules.js'
import SchoolSwitcher from '../SchoolSwitcher.jsx'
import ScopeToggle from './ScopeToggle.jsx'
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
  `group relative flex min-h-[40px] items-center gap-3 rounded-[10px] px-3 py-2 text-[13.5px] font-medium outline-none ring-gold/50 transition-colors focus-visible:ring-2 ${
    active
      ? 'bg-gradient-to-r from-gold/[0.16] to-gold/[0.04] text-white'
      : 'text-white/70 hover:bg-white/[0.06] hover:text-white'
  }`

// A gold left-accent rail marks the active item in the vertical layout.
function ActiveRail({ active }) {
  if (!active) return null
  return <span aria-hidden="true" className="absolute inset-y-1.5 left-0 w-1 rounded-full bg-gold" />
}

export default function AppShell({ children }) {
  const { logout } = useAuth()
  const { hasModule, entitled } = useBilling()
  const { isMultiSchool } = useScope()
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

  // Layer-cake split: the always-on Core group, its elevated Briefing hero, and the
  // licensed domain groups. The briefing is pulled OUT of the Core list and rendered
  // as the prominent top entry (the digital-COO thesis); everything else keeps its
  // frozen navId + behavior.
  const coreGroup = visibleGroups.find((g) => g.module === null)
  const domainGroups = visibleGroups.filter((g) => g.module !== null)
  const heroItem = coreGroup?.items.find((i) => i.hero) ?? null
  const coreItems = (coreGroup?.items ?? []).filter((i) => !i.hero)

  // A labeled section divider: an uppercase heading + optional pill + hairline.
  const sectionHeader = (id, label, pill, tone) => (
    <div className="flex items-center gap-2 px-2 pb-0.5">
      <h2
        id={id}
        className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gold-light/70"
      >
        {label}
      </h2>
      {pill && (
        <span
          className={`rounded-full border px-2 py-[1px] text-[9.5px] font-bold uppercase tracking-[0.08em] ${
            tone === 'lic'
              ? 'border-emerald-300/30 bg-emerald-300/10 text-emerald-200/90'
              : 'border-gold/30 bg-gold/15 text-gold-light'
          }`}
        >
          {pill}
        </span>
      )}
      <span aria-hidden="true" className="h-px flex-1 bg-gradient-to-r from-white/10 to-transparent" />
    </div>
  )

  // One standard nav row (shared by Core + Domains). withIds gates the frozen navId
  // onto the DESKTOP layout only (mobile drawer passes false — no duplicate ids).
  const renderNavItem = (item, withIds) => {
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
        {/* Icon is GOLD when this module is selected, white otherwise. */}
        <item.Icon
          size={17}
          className={`shrink-0 ${active ? 'text-gold-light' : 'text-white/70'}`}
        />
        <span>{item.label}</span>
      </Link>
    )
  }

  const brand = (
    <Link
      to="/"
      aria-label="Go to home dashboard"
      title="Home dashboard"
      className="flex min-w-0 items-center gap-3 rounded-lg px-1 py-1 outline-none ring-gold/50 transition-opacity hover:opacity-90 focus-visible:ring-2"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gold-gradient text-navy-deep shadow-glow">
        <LineChart size={18} />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="truncate font-serif text-[17px] font-semibold leading-tight tracking-[0.01em] text-gold-light">
          Project Dollaz
        </span>
        <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/40">
          Digital COO
        </span>
      </span>
    </Link>
  )

  // The scrollable nav body. `withIds` puts the frozen navId on the DESKTOP links
  // only; the mobile drawer passes withIds=false (no duplicate DOM ids).
  const navBody = (withIds) => (
    <nav aria-label="Primary" className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-3 py-4">
      {/* ── The elevated Briefing — the digital COO, promoted above the rails ── */}
      {heroItem && (
        <Link
          id={withIds ? heroItem.navId : undefined}
          to={heroItem.to}
          aria-label={heroItem.label}
          aria-current={heroItem.match(path) ? 'page' : undefined}
          className={`group relative flex flex-col gap-1 overflow-hidden rounded-xl border-2 px-3.5 py-3 outline-none ring-gold/50 transition-all focus-visible:ring-2 ${
            heroItem.match(path)
              ? 'border-gold bg-gold/15 shadow-glow'
              : 'border-gold/35 bg-white/[0.06] hover:border-gold/70 hover:bg-white/[0.09]'
          }`}
        >
          <span className="flex items-center gap-2.5">
            <heroItem.Icon size={19} className="shrink-0 text-gold-light" />
            <span className="font-serif text-[15px] font-semibold text-white">{heroItem.label}</span>
          </span>
          <span className="text-[11px] normal-case tracking-normal text-white/55">
            Your prioritised command center
          </span>
        </Link>
      )}

      {/* ── Core — the always-included platform substrate ── */}
      {coreItems.length > 0 && (
        <section role="group" aria-labelledby="navgrp-core" className="flex flex-col gap-1.5">
          {sectionHeader('navgrp-core', coreGroup?.label ?? 'Core', coreGroup?.pill, 'core')}
          {coreItems.map((item) => renderNavItem(item, withIds))}
        </section>
      )}

      {/* ── Domains — the licensed vertical engines + read-domain connectors ── */}
      {domainGroups.length > 0 && (
        <section role="group" aria-labelledby="navgrp-domains" className="flex flex-col gap-3">
          {sectionHeader('navgrp-domains', 'Domains', `${domainGroups.length} licensed`, 'lic')}
          {domainGroups.map((group) => {
            // A single-page domain (Governance, Accreditation…) renders as one row.
            if (group.items.length <= 1) {
              return (
                <div key={group.id} className="flex flex-col">
                  {group.items.map((item) => renderNavItem(item, withIds))}
                </div>
              )
            }
            // A multi-page domain (Finance) is a DOMAIN with its pages nested under
            // it: a header row (its own icon + name, → the first page) over the
            // indented child pages with a left guide.
            const GroupIcon = group.Icon
            // The HEADER's own active/gold-icon state: when the group carries an
            // exact `match` (Finance → /finance), the header lights ONLY on its own
            // home route, so a child page keeps its own highlight and the header
            // does not steal it. Groups without `match` fall back to any-child.
            const headerActive = group.match
              ? group.match(path)
              : group.items.some((item) => item.match(path))
            return (
              <div key={group.id} className="flex flex-col gap-0.5">
                <Link
                  to={group.to ?? group.items[0].to}
                  aria-label={group.label}
                  aria-current={headerActive ? 'page' : undefined}
                  className={`group relative flex min-h-[40px] items-center gap-3 rounded-[10px] px-3 py-2 text-[13.5px] font-semibold outline-none ring-gold/50 transition-colors focus-visible:ring-2 ${
                    headerActive ? 'text-white' : 'text-white/85 hover:bg-white/[0.06] hover:text-white'
                  }`}
                >
                  {GroupIcon && (
                    <GroupIcon
                      size={17}
                      className={`shrink-0 ${headerActive ? 'text-gold-light' : 'text-white/70'}`}
                    />
                  )}
                  <span>{group.label}</span>
                </Link>
                <div className="ml-[19px] flex flex-col gap-0.5 border-l border-white/10 pl-2.5">
                  {group.items.map((item) => renderNavItem(item, withIds))}
                </div>
              </div>
            )
          })}
        </section>
      )}

      {showAddons && (
        <section role="group" aria-labelledby="navgrp-addons" className="flex flex-col gap-1.5">
          {sectionHeader('navgrp-addons', 'Add-ons', `${lockedModules.length} available`, 'core')}
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
                className="group flex min-h-[42px] items-center gap-3 rounded-[10px] px-3 py-2 text-left text-white/45 outline-none ring-gold/50 transition-colors hover:bg-white/[0.05] hover:text-white/70 focus-visible:ring-2"
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
      className="flex min-h-[40px] w-full items-center justify-center gap-2 rounded-[10px] border border-white/15 px-4 py-2 text-[13px] font-medium text-white/70 transition-colors hover:bg-white/[0.06] hover:text-white"
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
                className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/15 text-white/80 transition-colors hover:bg-white/[0.06] hover:text-white lg:hidden"
              >
                {menuOpen ? <X size={20} /> : <Menu size={20} />}
              </button>
              <SchoolSwitcher />
              {/* Scope axis: School ↔ Organization — only for a multi-school caller. */}
              {isMultiSchool && <ScopeToggle />}
            </div>
            {/* Middle: platform-wide search (desktop input + mobile icon overlay). */}
            <SearchBox />
            <div className="hidden items-center gap-3 lg:flex">
              <motion.button
                whileTap={reduce ? undefined : { scale: 0.96 }}
                onClick={logout}
                className="flex min-h-[38px] items-center gap-2 rounded-[10px] border border-white/15 px-4 py-1.5 text-[13px] font-medium text-white/70 transition-colors hover:bg-white/[0.06] hover:text-white"
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
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-white/15 text-white/80 transition-colors hover:bg-white/[0.06] hover:text-white"
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
