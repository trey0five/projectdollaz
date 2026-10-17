// ─────────────────────────────────────────────────────────────────────────────
// scholarTicker — ONE animation loop for every Scholar on the page.
//
// Home can show three owls at once and the landing page four; they all share
// this one requestAnimationFrame loop. Each frame runs in two passes so the
// browser never has to lay out mid-frame: every owl's `read` first (only owls
// in the air read their box, for the tassel), then every owl's `write` (pure
// attribute writes, and only of attributes whose text changed).
//
// The loop stops itself whenever nothing needs it:
//   - the tab is hidden (visibilitychange),
//   - every owl is off-screen (one shared IntersectionObserver),
//   - every owl is paused,
// and restarts on the next change. Reduced-motion owls never join it.
//
// No imports and no React: browser globals are looked up lazily and can be
// injected (tests, the film rig), so this file also loads in Node.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {object} [env]
 * @param {(cb: (t:number)=>void) => any} [env.raf]
 * @param {(h:any) => void} [env.caf]
 * @param {() => boolean} [env.isHidden]
 * @param {(fn: () => void) => () => void} [env.onVisibility]  subscribe → unsubscribe
 * @param {(cb: (entries:any[]) => void) => {observe:Function, unobserve:Function, disconnect:Function}|null} [env.makeObserver]
 */
export function createScholarTicker(env = {}) {
  const g = typeof globalThis !== 'undefined' ? globalThis : {}
  const raf = env.raf || ((cb) => g.requestAnimationFrame(cb))
  const caf = env.caf || ((h) => g.cancelAnimationFrame(h))
  const isHidden = env.isHidden || (() => !!(g.document && g.document.visibilityState === 'hidden'))
  const onVisibility =
    env.onVisibility ||
    ((fn) => {
      if (!g.document || !g.document.addEventListener) return () => {}
      g.document.addEventListener('visibilitychange', fn)
      return () => g.document.removeEventListener('visibilitychange', fn)
    })
  const makeObserver =
    env.makeObserver ||
    ((cb) => (typeof g.IntersectionObserver === 'function' ? new g.IntersectionObserver(cb, { rootMargin: '64px' }) : null))

  const entries = new Set()
  const byEl = new Map()
  let handle = null
  let last = 0
  let frames = 0
  let unsubVis = null
  let observer = null

  const wanted = () => {
    if (isHidden()) return false
    for (const e of entries) if (e.visible && !e.paused) return true
    return false
  }

  function frame(ts) {
    handle = null
    const now = typeof ts === 'number' ? ts : Date.now()
    const dt = last ? Math.min(100, now - last) : 16
    last = now
    frames++
    const live = []
    for (const e of entries) if (e.visible && !e.paused) live.push(e)
    for (const e of live) if (e.read) e.read(now)
    for (const e of live) e.write(now, dt)
    schedule()
  }

  function schedule() {
    if (wanted()) {
      if (handle == null) handle = raf(frame)
    } else {
      if (handle != null) caf(handle)
      handle = null
      last = 0 // resume without a giant dt
    }
  }

  function ensureObserver() {
    if (observer !== null) return
    observer =
      makeObserver((list) => {
        for (const it of list) {
          const e = byEl.get(it.target)
          if (e) e.visible = !!it.isIntersecting
        }
        schedule()
      }) || false
  }

  return {
    /**
     * Join the loop. entry: { write(now, dt), read?(now), el?, paused? }.
     * Returns a function that leaves it.
     */
    add(entry) {
      if (entry.visible === undefined) entry.visible = true
      entries.add(entry)
      if (!unsubVis) unsubVis = onVisibility(schedule)
      if (entry.el) {
        ensureObserver()
        if (observer) {
          byEl.set(entry.el, entry)
          observer.observe(entry.el)
        }
      }
      schedule()
      return () => {
        entries.delete(entry)
        if (entry.el && observer) {
          observer.unobserve(entry.el)
          byEl.delete(entry.el)
        }
        if (!entries.size) {
          if (unsubVis) unsubVis()
          unsubVis = null
          if (observer) observer.disconnect()
          observer = null
          byEl.clear()
        }
        schedule()
      }
    },
    /** Change an entry's flags (paused / visible) and re-check the loop. */
    set(entry, patch) {
      Object.assign(entry, patch)
      schedule()
    },
    /** True while a frame is queued. */
    get running() {
      return handle != null
    },
    /** Frames run so far (tests, perf checks). */
    get frames() {
      return frames
    },
    get size() {
      return entries.size
    },
  }
}

let shared = null
/** The page-wide ticker every <ScholarOwl> joins. */
export function scholarTicker() {
  if (!shared) shared = createScholarTicker()
  return shared
}
