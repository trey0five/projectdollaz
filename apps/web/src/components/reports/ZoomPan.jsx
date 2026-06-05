// ─────────────────────────────────────────────────────────────
// Pinch / drag / wheel zoom-and-pan surface for the full-screen report.
// The child is rendered at its natural size and transformed (translate+scale)
// so the WHOLE document fits the screen on open, then the user can pinch
// (touch), scroll/ctrl-scroll (desktop), double-tap, or use the on-screen
// buttons to zoom in and pan around. touch-action:none lets our handlers own
// the gesture instead of the browser scrolling/zooming the page.
// ─────────────────────────────────────────────────────────────
import { useRef, useState, useLayoutEffect, useEffect, useCallback } from 'react'
import { ZoomIn, ZoomOut, Minimize2 } from 'lucide-react'

const MAX = 6
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))

export default function ZoomPan({ children }) {
  const wrapRef = useRef(null)
  const contentRef = useRef(null)
  const fitRef = useRef(1) // smallest allowed scale = the fit-to-screen scale
  const tfRef = useRef({ s: 1, x: 0, y: 0 })
  const gesture = useRef(null)
  const [tf, setTfState] = useState({ s: 1, x: 0, y: 0 })
  const [fitScale, setFitScale] = useState(1) // mirror of fitRef for render

  const setTf = (next) => {
    tfRef.current = next
    setTfState(next)
  }

  // Center + scale the content so the entire document is visible.
  const fit = useCallback(() => {
    const wrap = wrapRef.current
    const content = contentRef.current
    if (!wrap || !content) return
    const nw = content.offsetWidth || 1
    const nh = content.offsetHeight || 1
    const cw = wrap.clientWidth
    const ch = wrap.clientHeight
    const s = Math.min(cw / nw, ch / nh, 1)
    fitRef.current = s
    setFitScale(s)
    setTf({ s, x: (cw - nw * s) / 2, y: Math.max(12, (ch - nh * s) / 2) })
  }, [])

  useLayoutEffect(() => {
    fit()
    const ro = new ResizeObserver(fit)
    if (wrapRef.current) ro.observe(wrapRef.current)
    if (contentRef.current) ro.observe(contentRef.current)
    return () => ro.disconnect()
  }, [fit, children])

  const localXY = (clientX, clientY) => {
    const r = wrapRef.current.getBoundingClientRect()
    return { x: clientX - r.left, y: clientY - r.top }
  }

  // Zoom toward a focal point (in wrap-local px) so that point stays put.
  const zoomAround = useCallback((nextScale, px, py) => {
    const cur = tfRef.current
    const s = clamp(nextScale, fitRef.current, MAX)
    const cx = (px - cur.x) / cur.s
    const cy = (py - cur.y) / cur.s
    setTf({ s, x: px - cx * s, y: py - cy * s })
  }, [])

  // ── touch: 2-finger pinch, 1-finger pan ──
  const dist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY)
  const mid = (t) => ({ x: (t[0].clientX + t[1].clientX) / 2, y: (t[0].clientY + t[1].clientY) / 2 })

  const onTouchStart = (e) => {
    if (e.touches.length === 2) {
      gesture.current = { type: 'pinch', d0: dist(e.touches), m0: mid(e.touches), tf0: { ...tfRef.current } }
    } else if (e.touches.length === 1) {
      gesture.current = { type: 'pan', p0: { x: e.touches[0].clientX, y: e.touches[0].clientY }, tf0: { ...tfRef.current } }
    }
  }
  const onTouchMove = (e) => {
    const g = gesture.current
    if (!g) return
    if (g.type === 'pinch' && e.touches.length === 2) {
      e.preventDefault()
      const d = dist(e.touches)
      const m = mid(e.touches)
      const s = clamp(g.tf0.s * (d / g.d0), fitRef.current, MAX)
      const r = wrapRef.current.getBoundingClientRect()
      const cx = (g.m0.x - r.left - g.tf0.x) / g.tf0.s
      const cy = (g.m0.y - r.top - g.tf0.y) / g.tf0.s
      setTf({ s, x: m.x - r.left - cx * s, y: m.y - r.top - cy * s })
    } else if (g.type === 'pan' && e.touches.length === 1) {
      e.preventDefault()
      setTf({
        s: g.tf0.s,
        x: g.tf0.x + (e.touches[0].clientX - g.p0.x),
        y: g.tf0.y + (e.touches[0].clientY - g.p0.y),
      })
    }
  }
  const onTouchEnd = (e) => {
    gesture.current =
      e.touches.length === 1
        ? { type: 'pan', p0: { x: e.touches[0].clientX, y: e.touches[0].clientY }, tf0: { ...tfRef.current } }
        : null
  }

  // ── wheel (desktop / trackpad): zoom toward cursor (non-passive) ──
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const onWheel = (e) => {
      e.preventDefault()
      const { x, y } = localXY(e.clientX, e.clientY)
      zoomAround(tfRef.current.s * Math.exp(-e.deltaY * 0.0015), x, y)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [zoomAround])

  const onDoubleClick = (e) => {
    const { x, y } = localXY(e.clientX, e.clientY)
    const zoomedIn = tfRef.current.s > fitRef.current * 1.2
    zoomAround(zoomedIn ? fitRef.current : Math.min(fitRef.current * 2.2, MAX), x, y)
  }

  const buttonZoom = (factor) => {
    const wrap = wrapRef.current
    if (!wrap) return
    zoomAround(tfRef.current.s * factor, wrap.clientWidth / 2, wrap.clientHeight / 2)
  }

  return (
    <div className="relative flex-1 overflow-hidden">
      <div
        ref={wrapRef}
        className="h-full w-full touch-none select-none"
        style={{ cursor: tf.s > fitScale * 1.02 ? 'grab' : 'zoom-in' }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onDoubleClick={onDoubleClick}
      >
        <div
          ref={contentRef}
          className="origin-top-left will-change-transform"
          style={{ width: 'max-content', transform: `translate(${tf.x}px, ${tf.y}px) scale(${tf.s})` }}
        >
          {children}
        </div>
      </div>

      {/* zoom controls */}
      <div className="absolute bottom-4 right-4 flex flex-col gap-2">
        <ZoomButton label="Zoom in" onClick={() => buttonZoom(1.4)}>
          <ZoomIn size={18} />
        </ZoomButton>
        <ZoomButton label="Zoom out" onClick={() => buttonZoom(1 / 1.4)}>
          <ZoomOut size={18} />
        </ZoomButton>
        <ZoomButton label="Fit to screen" onClick={fit}>
          <Minimize2 size={18} />
        </ZoomButton>
      </div>
    </div>
  )
}

function ZoomButton({ label, onClick, children }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/25 bg-navy/85 text-white shadow-lift backdrop-blur transition hover:bg-navy"
    >
      {children}
    </button>
  )
}
