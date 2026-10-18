// Page contract with render.mjs (same as coldopen-v3): window.__ready, __total
// (frames), __seek(i) (async; paints frame i), __meta (written next to the mp4).
// ?alpha=1 → the scene leaves its backdrop transparent (render.mjs then keeps
// the alpha channel).
import { FPS, params } from './util.js'

export async function boot(setup) {
  try {
    await bootInner(setup)
  } catch (e) {
    console.error('BOOT FAILED', e && (e.stack || e.message || e))
    window.__failed = true
  }
}

async function bootInner(setup) {
  const q = params()
  const alpha = q.alpha === '1'
  document.documentElement.classList.toggle('alpha', alpha)
  await document.fonts.ready
  await Promise.all(
    ['600 40px "EB Garamond"', '500 40px "EB Garamond"', '400 20px Montserrat', '500 20px Montserrat', '600 20px Montserrat', '700 20px Montserrat'].map(
      (f) => document.fonts.load(f).catch(() => null),
    ),
  )
  const scene = await setup({ alpha, q })
  const total = q.total ? parseInt(q.total, 10) : Math.round(scene.sec * FPS)
  window.__total = total
  window.__meta = { ...(scene.meta || {}), frames: total, fps: FPS, sec: total / FPS, alpha }
  window.__seek = async (i) => {
    await scene.render(i / FPS, i)
    window.__dbg = scene.dbg ? scene.dbg() : null
  }
  await window.__seek(0)
  window.__ready = true
}
