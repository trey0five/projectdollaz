import { useEffect, useRef } from 'react'

// useDtOverflow — the sideways-scroll fade for a hand-built `.dt-wrap` (a
// table that is not the DataTable primitive). Same contract as DataTable: when
// the table is wider than its wrap, the wrap carries data-overflow="x"
// (surface.css paints a right-edge fade) and data-at-end flips once the reader
// has scrolled to the last column. Returns the ref for the wrap element.
export default function useDtOverflow(deps = []) {
  const ref = useRef(null)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return undefined
    const measure = () => {
      const over = el.scrollWidth > el.clientWidth + 1
      if (over) el.setAttribute('data-overflow', 'x')
      else el.removeAttribute('data-overflow')
      el.setAttribute('data-at-end', String(!over || el.scrollLeft + el.clientWidth >= el.scrollWidth - 1))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    el.addEventListener('scroll', measure, { passive: true })
    return () => {
      ro.disconnect()
      el.removeEventListener('scroll', measure)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return ref
}
