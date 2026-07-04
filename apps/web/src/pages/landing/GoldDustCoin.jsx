// ─────────────────────────────────────────────────────────────────────────────
// GoldDustCoin — the hero's living visual: ~700 gold flecks drift in chaos and
// spring-assemble into Penny's coin (ring + dashed inner ring + serif "P"),
// hold, scatter, and reassemble on a slow cycle. The pointer repels nearby
// flecks; they always spring home. 2D canvas only (no WebGL): targets are
// sampled from an offscreen render of the coin, each fleck is a pre-rendered
// glow sprite (drawImage — no per-particle shadowBlur), dpr capped at 2.
// Decorative (aria-hidden). Reduced motion: one static assembled frame, zero
// timers. rAF pauses entirely when the canvas leaves the viewport.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useRef } from 'react'
import { useReducedMotion } from 'framer-motion'

const GOLD = ['#e8d4a8', '#d4b47a', '#b89650', '#f0d596']

// Frame budget for each beat of the cycle (~60fps): assemble + hold ≈ 9s,
// scatter ≈ 1.4s. The spring itself settles in the first ~1.5s of assemble.
const ASSEMBLE_FRAMES = 540
const SCATTER_FRAMES = 84

// Pre-render one soft glow sprite per gold tone: bright core, feathered halo.
function makeSprites() {
  return GOLD.map((color) => {
    const s = document.createElement('canvas')
    s.width = s.height = 32
    const g = s.getContext('2d')
    const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16)
    grad.addColorStop(0, '#fff7e0')
    grad.addColorStop(0.28, color)
    grad.addColorStop(1, 'rgba(184,150,80,0)')
    g.fillStyle = grad
    g.fillRect(0, 0, 32, 32)
    return s
  })
}

export default function GoldDustCoin({ className = '' }) {
  const canvasRef = useRef(null)
  const reduce = useReducedMotion()

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return undefined
    const ctx = canvas.getContext('2d')
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const sprites = makeSprites()
    const mouse = { x: -9999, y: -9999 }
    let W = 0
    let H = 0
    let parts = []
    let raf = 0
    let frame = 0
    let phase = 'assemble'
    let visible = true
    let disposed = false

    // Render the coin offscreen (ring, dashed inner ring, serif P) and sample
    // the opaque pixels on a grid — those points are the flecks' home targets.
    function sampleTargets() {
      const off = document.createElement('canvas')
      off.width = W
      off.height = H
      const o = off.getContext('2d')
      const cx = W * 0.5
      const cy = H * 0.5
      const R = Math.min(W, H) * 0.34
      o.strokeStyle = '#fff'
      o.lineWidth = Math.max(6, R * 0.1)
      o.beginPath()
      o.arc(cx, cy, R, 0, 7)
      o.stroke()
      o.lineWidth = Math.max(2, R * 0.035)
      o.setLineDash([R * 0.12, R * 0.09])
      o.beginPath()
      o.arc(cx, cy, R * 0.8, 0, 7)
      o.stroke()
      o.setLineDash([])
      o.fillStyle = '#fff'
      o.font = `600 ${R * 1.15}px "EB Garamond", Georgia, serif`
      o.textAlign = 'center'
      o.textBaseline = 'middle'
      o.fillText('P', cx, cy + R * 0.06)
      const img = o.getImageData(0, 0, W, H).data
      // Grid step tuned to land near ~700 flecks; coarsen if we overshoot.
      let step = Math.max(4, Math.floor(6 * dpr))
      let targets = []
      for (let pass = 0; pass < 3; pass++) {
        targets = []
        for (let y = 0; y < H; y += step) {
          for (let x = 0; x < W; x += step) {
            if (img[(y * W + x) * 4 + 3] > 128) targets.push({ x, y })
          }
        }
        if (targets.length <= 850) break
        step += 2
      }
      return targets
    }

    function build() {
      parts = sampleTargets().map((t) => ({
        x: Math.random() * W,
        y: Math.random() * H,
        tx: t.x,
        ty: t.y,
        vx: 0,
        vy: 0,
        rand: null,
        sprite: sprites[(Math.random() * sprites.length) | 0],
        r: (Math.random() * 1.5 + 1.1) * dpr,
      }))
    }

    function drawStatic() {
      ctx.clearRect(0, 0, W, H)
      for (const p of parts) {
        ctx.drawImage(p.sprite, p.tx - p.r * 3, p.ty - p.r * 3, p.r * 6, p.r * 6)
      }
    }

    function loop() {
      if (disposed || !visible) {
        raf = 0
        return
      }
      ctx.clearRect(0, 0, W, H)
      frame++
      if (phase === 'assemble' && frame > ASSEMBLE_FRAMES) {
        phase = 'scatter'
        frame = 0
      } else if (phase === 'scatter' && frame > SCATTER_FRAMES) {
        phase = 'assemble'
        frame = 0
        for (const p of parts) p.rand = null
      }
      const repelR = 90 * dpr
      for (const p of parts) {
        let gx
        let gy
        if (phase === 'assemble') {
          gx = p.tx
          gy = p.ty
        } else {
          if (!p.rand) p.rand = { x: Math.random() * W, y: Math.random() * H }
          gx = p.rand.x
          gy = p.rand.y
        }
        let ax = (gx - p.x) * 0.045
        let ay = (gy - p.y) * 0.045
        const dx = p.x - mouse.x
        const dy = p.y - mouse.y
        const d2 = dx * dx + dy * dy
        if (d2 < repelR * repelR) {
          const d = Math.sqrt(d2) || 1
          const f = (1 - d / repelR) * 3.2
          ax += (dx / d) * f
          ay += (dy / d) * f
        }
        p.vx = (p.vx + ax) * 0.86
        p.vy = (p.vy + ay) * 0.86
        p.x += p.vx
        p.y += p.vy
        ctx.drawImage(p.sprite, p.x - p.r * 3, p.y - p.r * 3, p.r * 6, p.r * 6)
      }
      raf = requestAnimationFrame(loop)
    }

    function maybeStart() {
      if (!raf && !reduce && visible && parts.length) raf = requestAnimationFrame(loop)
    }

    // (Re)measure + rebuild. Called on mount, resize, and font-ready (the "P"
    // is resampled once EB Garamond has actually loaded).
    function size() {
      const rect = canvas.getBoundingClientRect()
      if (rect.width < 40 || rect.height < 40) return
      W = canvas.width = Math.round(rect.width * dpr)
      H = canvas.height = Math.round(rect.height * dpr)
      build()
      if (reduce) drawStatic()
      else maybeStart()
    }

    const onMove = (e) => {
      const r = canvas.getBoundingClientRect()
      mouse.x = (e.clientX - r.left) * dpr
      mouse.y = (e.clientY - r.top) * dpr
    }
    const onLeave = () => {
      mouse.x = -9999
      mouse.y = -9999
    }

    const ro = new ResizeObserver(size)
    ro.observe(canvas)
    const io = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting
        maybeStart()
      },
      { threshold: 0.05 },
    )
    io.observe(canvas)
    if (!reduce) {
      canvas.addEventListener('pointermove', onMove)
      canvas.addEventListener('pointerleave', onLeave)
    }
    size()
    document.fonts?.ready?.then(() => {
      if (!disposed) size()
    })

    return () => {
      disposed = true
      if (raf) cancelAnimationFrame(raf)
      ro.disconnect()
      io.disconnect()
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerleave', onLeave)
    }
  }, [reduce])

  return <canvas ref={canvasRef} aria-hidden="true" className={`block h-full w-full ${className}`} />
}
