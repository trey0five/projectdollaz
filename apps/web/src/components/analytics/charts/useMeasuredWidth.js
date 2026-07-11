import { useLayoutEffect, useRef, useState } from 'react'

// useMeasuredWidth — the React equivalent of the mockup's `host.clientWidth`.
// Returns [ref, width]; attach ref to the chart's container <div>. A ResizeObserver
// keeps the pixel width current so axis labels/paddings stay crisp (rather than
// scaling with the viewBox). Falls back to `fallback` before first measure / in
// non-DOM environments.
export function useMeasuredWidth(fallback = 520) {
  const ref = useRef(null)
  const [width, setWidth] = useState(fallback)

  useLayoutEffect(() => {
    const node = ref.current
    if (!node || typeof ResizeObserver === 'undefined') return
    const measure = () => {
      const w = node.clientWidth
      if (w) setWidth(w)
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(node)
    return () => ro.disconnect()
  }, [])

  return [ref, width]
}
