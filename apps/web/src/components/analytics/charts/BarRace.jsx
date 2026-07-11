import { useEffect, useRef, useState } from 'react'
import { ensureChartStyles } from './styles.js'
import { useReducedMotion } from './useReducedMotion.js'

// ─────────────────────────────────────────────────────────────────────────────
// BarRace — ports the mockup's renderRace/playRace. A CSS-transition race: rows
// reorder via translateY (.8s), bars grow via width (.9s), 1300ms per frame, and
// the ranking is recomputed each frame (stable color per entity — never repainted
// on re-rank). Reduced motion → jump straight to the FINAL frame, transitions off.
// A ▶ Play button restarts and calls onReplay(). Colors come IN per entity.
//
// props: frames=[{year:string, values:[{id,name,color,value}]}], max?, autoplay?, onReplay?
// ─────────────────────────────────────────────────────────────────────────────
export default function BarRace({ frames = [], max, autoplay = true, onReplay }) {
  ensureChartStyles()
  const reduce = useReducedMotion()
  const lastIdx = Math.max(0, frames.length - 1)
  const [idx, setIdx] = useState(reduce ? lastIdx : 0)
  const timerRef = useRef(null)

  // stable entity order (first appearance) → row identity for CSS reorder
  const ids = []
  const meta = {}
  frames.forEach((f) => {
    ;(f.values || []).forEach((v) => {
      if (!(v.id in meta)) {
        meta[v.id] = v
        ids.push(v.id)
      }
    })
  })

  const finite = (v) => (Number.isFinite(v) ? v : 0)
  const maxVal =
    max ??
    Math.max(1, ...frames.flatMap((f) => (f.values || []).map((v) => finite(v.value))))

  const ROW = 40
  const framesKey = frames.map((f) => f.year).join(',')

  // Called from the ▶ Play button (event handler → setState is fine here).
  function play() {
    clearInterval(timerRef.current)
    if (reduce) {
      setIdx(lastIdx)
      return
    }
    let i = 0
    setIdx(0)
    timerRef.current = setInterval(() => {
      i += 1
      if (i >= frames.length) {
        clearInterval(timerRef.current)
        return
      }
      setIdx(i)
    }, 1300)
  }

  // Autoplay on mount / frames change. No synchronous setState in the effect body:
  // the reset runs in rAF and each step runs inside the interval callback (async).
  useEffect(() => {
    if (!autoplay || reduce) return
    const raf = requestAnimationFrame(() => setIdx(0))
    let i = 0
    timerRef.current = setInterval(() => {
      i += 1
      if (i >= frames.length) {
        clearInterval(timerRef.current)
        return
      }
      setIdx(i)
    }, 1300)
    return () => {
      cancelAnimationFrame(raf)
      clearInterval(timerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [framesKey, reduce, autoplay])

  const frame = frames[reduce ? lastIdx : Math.min(idx, lastIdx)] || { year: '', values: [] }
  const valById = {}
  ;(frame.values || []).forEach((v) => {
    valById[v.id] = v.value
  })
  // rank (desc) for the current frame → each id's row position
  const ranked = [...ids].sort((a, b) => (valById[b] ?? 0) - (valById[a] ?? 0))
  const rankOf = {}
  ranked.forEach((id, r) => {
    rankOf[id] = r
  })

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginBottom: 6 }}>
        <button
          type="button"
          className="fr-replay"
          onClick={() => {
            onReplay?.()
            play()
          }}
        >
          ▶ Play
        </button>
      </div>
      <div className="fr-race" style={{ position: 'relative', height: ids.length * ROW }}>
        {ids.map((id) => {
          const v = valById[id] ?? 0
          const m = meta[id]
          return (
            <div
              key={id}
              className="fr-rrow"
              style={{
                transform: `translateY(${rankOf[id] * ROW}px)`,
                transition: reduce ? 'none' : undefined,
              }}
            >
              <span className="fr-rname">
                <i style={{ background: m.color }} />
                {m.name}
              </span>
              <span className="fr-rbarwrap">
                <span
                  className="fr-rbar"
                  style={{
                    background: m.color,
                    width: `${(100 * finite(v)) / maxVal}%`,
                    transition: reduce ? 'none' : undefined,
                  }}
                />
              </span>
              <span className="fr-rval">{typeof v === 'number' ? v.toLocaleString() : v}</span>
            </div>
          )
        })}
        <span className="fr-ryear">{frame.year}</span>
      </div>
    </div>
  )
}
