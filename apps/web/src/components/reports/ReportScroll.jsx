// ─────────────────────────────────────────────────────────────
// Fit-to-width wrapper for the financial statements.
//
// The statements use fixed-px numeric columns (~640px for the 4-column SOA /
// SFP / Net Assets, ~420px for the 2-column SCF). Rather than make the user
// scroll left/right on a phone, we render the report at its natural width and
// scale it DOWN to fit the container, so the ENTIRE document is visible at a
// glance (no horizontal scroll). On desktop the container is already wide
// enough, so the scale is 1 and layout is unchanged. Tapping the report opens
// the full-screen zoomable view (see Dashboard + ReportExpandOverlay).
//
// RawReports: inside the full-screen overlay we DON'T want this auto-fit — the
// ZoomPan surface controls scale instead — so the overlay wraps its content in
// <RawReports> and ReportScroll then renders the report at natural size.
// ─────────────────────────────────────────────────────────────
import { createContext, useContext, useLayoutEffect, useRef, useState } from 'react'

const RawContext = createContext(false)

/** Render reports at natural size (no auto-fit) — used inside the zoom overlay. */
export function RawReports({ children }) {
  return <RawContext.Provider value={true}>{children}</RawContext.Provider>
}

const MIN_W = { wide: 640, narrow: 420, none: 0 }

export default function ReportScroll({ width = 'wide', children }) {
  const raw = useContext(RawContext)
  const minW = MIN_W[width] ?? 0

  if (raw) {
    return <div style={minW ? { minWidth: `${minW}px` } : undefined}>{children}</div>
  }
  return <FitToWidth minW={minW}>{children}</FitToWidth>
}

function FitToWidth({ minW, children }) {
  const outer = useRef(null)
  const inner = useRef(null)
  const [scale, setScale] = useState(1)
  const [height, setHeight] = useState(undefined)
  const [innerW, setInnerW] = useState(minW || undefined)

  useLayoutEffect(() => {
    const measure = () => {
      const o = outer.current
      const i = inner.current
      if (!o || !i) return
      const cw = o.clientWidth
      if (!cw) return
      // Natural width = the container width, but never below the report's
      // minimum (so columns never crush); scale down to the container.
      const target = minW ? Math.max(cw, minW) : cw
      i.style.width = `${target}px` // set imperatively so the height read is correct
      const naturalH = i.offsetHeight
      const s = target ? cw / target : 1
      setInnerW(target)
      setScale(s)
      setHeight(naturalH * s)
    }
    measure()
    const ro = new ResizeObserver(measure)
    if (outer.current) ro.observe(outer.current)
    return () => ro.disconnect()
  }, [minW, children])

  return (
    <div ref={outer} className="fit-outer overflow-hidden" style={{ height }}>
      <div
        ref={inner}
        className="fit-inner origin-top-left"
        style={{ width: innerW, transform: `scale(${scale})` }}
      >
        {children}
      </div>
    </div>
  )
}
