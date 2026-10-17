// ─────────────────────────────────────────────────────────────────────────────
// scholarArt — the Scholar's drawing, ported part-for-part from the owner-
// approved "B · The Scholar" mock (kyro-owl-mocks/b/index.html, owlMarkup()).
//
// PLAIN JS ON PURPOSE: no React, no DOM imports. The in-app <ScholarOwl> and the
// demo-film rig both build their SVG from scholarMarkup(), so the film owl IS the
// app owl. Every shape, colour and pivot below is the mock's, in the mock's own
// user units (the mock's viewBox was "-30 -20 320 320"); only the FRAME changed:
// the viewBox is cropped to the idle silhouette (see scholarGeometry.js) and the
// SVG draws with overflow visible, so wings, the tossed cap and confetti may
// leave the box while the resting bird fills it exactly.
//
// What changed from the mock, deliberately:
//  - The listening rings (pulseA/pulseB, two r=128 circles BEHIND the bird) are
//    gone. Since bdf5655 nothing round sits behind the mascot; the only shape
//    under the bird is its ground shadow, an ellipse UNDER the feet.
//  - The ancA/ancB measuring dots are gone: the tassel works out the cap's
//    position in code (scholarTassel.js), never from the DOM.
//  - Parts are moved with the SVG `transform` attribute, written as
//    translate(pivot+offset) rotate scale translate(−pivot) — exactly what the
//    mock's CSS `transform-box:view-box; transform-origin:<pivot>` did (checked
//    in Chromium), but it renders the same in every engine and in jsdom.
//  - Two optional extras the mock did not need: a `tiny` variant for ≤36px and a
//    `dark` tone (a sky-blue rim + soft glow that follows the silhouette, on the
//    bird only — never on the shadow).
// ─────────────────────────────────────────────────────────────────────────────

/** The mock's palette, verbatim. */
export const COLORS = Object.freeze({
  body: '#3343C4',
  shade: '#2935A8',
  disc: '#4E60E6',
  wing: '#25329C',
  wingHi: '#2E3DB3',
  belly: '#A5DCFF',
  chev: '#6CBDF0',
  ink: '#121A4A',
  brow: '#151C55',
  gold: '#F5B83D',
  goldD: '#DE9A2A',
  coral: '#FF7A6B',
  cap: '#232C7E',
  capL: '#2B3592',
  capEdge: '#0F1540',
  capBase: '#161D55',
  // Dark-tone rim + glow (the mock's sky / sky-bright).
  rim: '#A5DCFF',
  glow: '#7CCBFF',
})

/** Confetti colours (the mock's CF list). */
export const CONFETTI_COLORS = Object.freeze(['#F5B83D', '#FF7A6B', '#3B4BDB', '#7CCBFF', '#1E2A78', '#FFD27A'])

export const BODY_PATH =
  'M130 64C188 64 212 92 212 140L213 214C213 254 180 277 130 277C80 277 47 254 47 214L48 140C48 92 72 64 130 64Z'

/**
 * Pivot of every animated part, in the coordinate space its transform applies
 * in (the mock's O(x,y)). `cap` sits inside the static rotate(-10 130 60) group,
 * so its pivot is in that rotated space — as in the mock.
 */
export const PIVOTS = Object.freeze({
  flip: [130, 160],
  shadow: [130, 289],
  root: [130, 280],
  squash: [130, 284],
  breath: [130, 284],
  feet: [130, 282],
  tuftL: [82, 80],
  tuftR: [178, 80],
  head: [130, 160],
  cheekL: [70, 164],
  cheekR: [190, 164],
  eyeOpenL: [96, 128],
  eyeOpenR: [164, 128],
  pupilL: [99, 130],
  pupilR: [161, 130],
  happyL: [96, 128],
  happyR: [164, 128],
  browL: [94, 88],
  browR: [166, 88],
  lowerBeak: [130, 156],
  upperBeak: [130, 140],
  glasses: [130, 128],
  sweat: [207, 98],
  cap: [130, 50],
  wingL: [62, 150],
  wingR: [198, 150],
  dots: [222, 50],
  dot1: [246, 4],
  dot2: [262, 4],
  dot3: [278, 4],
})

/** Every part the evaluator may move, in paint order. */
export const PARTS = Object.freeze(Object.keys(PIVOTS))

/** Parts that start hidden (opacity 0) in the art. */
export const HIDDEN_PARTS = Object.freeze(['happyL', 'happyR', 'sweat', 'dots'])

/** The static −10° tilt the cap sits in (the mock's <g transform="rotate(-10 130 60)">). */
export const CAP_TILT = Object.freeze({ deg: -10, cx: 130, cy: 60 })
/** The tassel hangs from here, in cap space. */
export const TASSEL_PIVOT = Object.freeze([183, 45])
/** The cap button (the other end of the gold cord), in cap space. */
export const CAP_BUTTON = Object.freeze([130, 42])

/** How many confetti pieces a celebrating owl carries (the mock threw 34). */
export const CONFETTI_COUNT = 34

const n = (v) => (Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100))

/**
 * The owl as an SVG string.
 *
 * @param {object} o
 * @param {string} o.uid      unique, url()-safe id stem (two owls on a page must differ)
 * @param {string} o.viewBox  the frame (scholarGeometry VIEWBOX string)
 * @param {boolean} [o.tiny]  ≤36px variant: thicker spectacles, no belly chevrons,
 *                            no lens glints, heavier brows and cord
 * @param {'light'|'dark'} [o.tone]  dark = sky rim + glow on the bird only
 * @param {number} [o.rim]    rim width in owl units (dark tone)
 * @param {boolean} [o.confetti]  include the confetti layer
 */
export function scholarMarkup({ uid, viewBox, tiny = false, tone = 'light', rim = 4, confetti = false }) {
  const C = COLORS
  const clip = `${uid}-bc`
  const tf = `${uid}-tone`
  const dark = tone === 'dark'
  const glassW = tiny ? 8 : 4.5
  const armW = tiny ? 7 : 4
  const browW = tiny ? 9.5 : 7
  const cordW = tiny ? 5 : 3
  const shadowFill = dark ? '#03081F' : '#1E2A78'
  const shadowOpacity = dark ? '.34' : '.13'

  const filter = dark
    ? `<filter id="${tf}" filterUnits="userSpaceOnUse" x="-80" y="-140" width="420" height="470" color-interpolation-filters="sRGB">` +
      // ring = dilate(A) minus close(A): the OUTER outline only. Small gaps
      // inside the silhouette (between the cap brim, tuft and tassel) stay
      // background instead of filling with rim colour.
      `<feMorphology in="SourceAlpha" operator="dilate" radius="${n(rim)}" result="d"/>` +
      `<feMorphology in="d" operator="erode" radius="${n(rim)}" result="c"/>` +
      `<feComposite in="d" in2="c" operator="out" result="ring"/>` +
      `<feFlood flood-color="${C.rim}" flood-opacity=".95"/><feComposite in2="ring" operator="in" result="rim"/>` +
      `<feGaussianBlur in="ring" stdDeviation="${n(rim * 2.2)}" result="b"/>` +
      `<feFlood flood-color="${C.glow}" flood-opacity=".55"/><feComposite in2="b" operator="in" result="glow"/>` +
      `<feMerge><feMergeNode in="glow"/><feMergeNode in="rim"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`
    : ''

  const chevrons = tiny
    ? ''
    : `<g fill="none" stroke="${C.chev}" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round">` +
      `<path d="M108 204l8 7 8-7"/><path d="M136 204l8 7 8-7"/><path d="M122 226l8 7 8-7"/></g>`

  const glints = tiny
    ? ''
    : `<path d="M107 107Q115.5 110 119 118" fill="none" stroke="#fff" stroke-opacity=".8" stroke-width="3" stroke-linecap="round"/>` +
      `<path d="M175 107Q183.5 110 187 118" fill="none" stroke="#fff" stroke-opacity=".8" stroke-width="3" stroke-linecap="round"/>`

  let confettiLayer = ''
  if (confetti) {
    let pieces = ''
    for (let i = 0; i < CONFETTI_COUNT; i++) {
      pieces += `<rect data-cf="${i}" x="-4" y="-6" width="8" height="12" rx="2" fill="${CONFETTI_COLORS[i % CONFETTI_COLORS.length]}" opacity="0"/>`
    }
    confettiLayer = `<g data-p="confetti" pointer-events="none">${pieces}</g>`
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" overflow="visible" aria-hidden="true" focusable="false" ` +
    `style="position:absolute;inset:0;width:100%;height:100%;overflow:visible;display:block">` +
    `<defs><clipPath id="${clip}"><path d="${BODY_PATH}"/></clipPath>${filter}</defs>` +
    `<g data-p="flip">` +
    `<g data-p="shadow"><ellipse data-shadow="" cx="130" cy="289" rx="64" ry="7.5" fill="${shadowFill}" opacity="${shadowOpacity}"/></g>` +
    `<g data-p="tone"${dark ? ` filter="url(#${tf})"` : ''}>` +
    `<g data-p="root"><g data-p="squash"><g data-p="breath">` +
    `<g data-p="feet" fill="${C.gold}">` +
    `<ellipse cx="99" cy="281" rx="6.5" ry="6"/><ellipse cx="109" cy="283" rx="6.5" ry="6"/><ellipse cx="119" cy="281" rx="6.5" ry="6"/>` +
    `<ellipse cx="141" cy="281" rx="6.5" ry="6"/><ellipse cx="151" cy="283" rx="6.5" ry="6"/><ellipse cx="161" cy="281" rx="6.5" ry="6"/></g>` +
    `<g data-p="tuftL"><path d="M68 88Q54 66 42 44Q72 48 100 70Z" fill="${C.body}"/></g>` +
    `<g data-p="tuftR"><path d="M192 88Q206 66 218 44Q188 48 160 70Z" fill="${C.shade}"/></g>` +
    `<path d="${BODY_PATH}" fill="${C.body}"/>` +
    `<g clip-path="url(#${clip})"><ellipse cx="268" cy="196" rx="86" ry="178" fill="${C.shade}"/>` +
    `<ellipse cx="130" cy="228" rx="56" ry="54" fill="${C.belly}"/></g>` +
    chevrons +
    `<g data-p="head">` +
    `<circle cx="96" cy="128" r="40" fill="${C.disc}"/><circle cx="164" cy="128" r="40" fill="${C.disc}"/>` +
    `<g data-p="cheekL"><ellipse cx="70" cy="164" rx="12" ry="7.5" fill="${C.coral}" opacity=".92"/></g>` +
    `<g data-p="cheekR"><ellipse cx="190" cy="164" rx="12" ry="7.5" fill="${C.coral}" opacity=".92"/></g>` +
    `<g data-p="eyeOpenL"><circle cx="96" cy="128" r="24" fill="#fff"/>` +
    `<g data-p="pupilL"><circle cx="99" cy="130" r="12.5" fill="${C.ink}"/><circle cx="94.5" cy="125" r="4.3" fill="#fff"/><circle cx="103.5" cy="134.5" r="1.9" fill="#fff" opacity=".85"/></g></g>` +
    `<g data-p="eyeOpenR"><circle cx="164" cy="128" r="24" fill="#fff"/>` +
    `<g data-p="pupilR"><circle cx="161" cy="130" r="12.5" fill="${C.ink}"/><circle cx="156.5" cy="125" r="4.3" fill="#fff"/><circle cx="165.5" cy="134.5" r="1.9" fill="#fff" opacity=".85"/></g></g>` +
    `<path data-p="happyL" d="M82 134Q96 117 110 134" fill="none" stroke="${C.ink}" stroke-width="6.5" stroke-linecap="round" opacity="0"/>` +
    `<path data-p="happyR" d="M150 134Q164 117 178 134" fill="none" stroke="${C.ink}" stroke-width="6.5" stroke-linecap="round" opacity="0"/>` +
    `<path data-p="browL" d="M77 93Q93 82 111 88" fill="none" stroke="${C.brow}" stroke-width="${browW}" stroke-linecap="round"/>` +
    `<path data-p="browR" d="M149 88Q167 82 183 93" fill="none" stroke="${C.brow}" stroke-width="${browW}" stroke-linecap="round"/>` +
    `<ellipse cx="130" cy="159" rx="5.5" ry="5" fill="#6E1835"/>` +
    `<g data-p="lowerBeak"><path d="M122 155Q130 159 138 155Q135 166 130 170Q125 166 122 155Z" fill="${C.goldD}"/></g>` +
    `<g data-p="upperBeak"><path d="M117 141Q130 134 143 141Q139 154 130 165Q121 154 117 141Z" fill="${C.gold}"/><path d="M130 136.6Q138 137.6 143 141Q139 154 130 165Z" fill="#E9A833"/></g>` +
    `<g data-p="glasses"><g fill="none" stroke="${C.gold}" stroke-linecap="round">` +
    `<path d="M67.5 122L51 116" stroke-width="${armW}"/><path d="M192.5 122L209 116" stroke-width="${armW}"/>` +
    `<path d="M124.5 124Q130 118.5 135.5 124" stroke-width="${armW}"/>` +
    `<circle cx="96" cy="128" r="29" stroke-width="${glassW}" fill="#fff" fill-opacity=".1"/>` +
    `<circle cx="164" cy="128" r="29" stroke-width="${glassW}" fill="#fff" fill-opacity=".1"/></g>` +
    glints +
    `</g>` +
    `<path data-p="sweat" opacity="0" d="M208 80Q218 95 213 102Q208 106.5 203 102Q198 95 208 80Z" fill="#8ED3FF" stroke="#fff" stroke-width="1.5"/>` +
    `<g transform="rotate(${CAP_TILT.deg} ${CAP_TILT.cx} ${CAP_TILT.cy})"><g data-p="cap">` +
    `<path d="M101 52L101 68Q130 80 159 68L159 52Z" fill="${C.capBase}"/>` +
    `<path d="M74 44L130 60L186 44L186 48.5L130 64.5L74 48.5Z" fill="${C.capEdge}"/>` +
    `<path d="M130 28L186 44L130 60L74 44Z" fill="${C.cap}"/>` +
    `<path d="M130 28L74 44L130 60Z" fill="${C.capL}"/>` +
    `<path d="M130 42Q160 40 183 45" fill="none" stroke="${C.gold}" stroke-width="${cordW}" stroke-linecap="round"/>` +
    `<g data-p="tassel">` +
    `<path d="M183 45L183 73" stroke="${C.gold}" stroke-width="${cordW}" stroke-linecap="round"/>` +
    `<rect x="178.5" y="70" width="9" height="6.5" rx="2.2" fill="${C.goldD}"/>` +
    `<path d="M178 75.5L188 75.5L190.5 97Q183 101 175.5 97Z" fill="${C.gold}"/>` +
    (tiny ? '' : `<path d="M181 80L180 96M185 80L186 96" stroke="#D88F22" stroke-width="1.4" stroke-linecap="round"/>`) +
    `</g>` +
    `<circle cx="130" cy="42" r="4.6" fill="${C.gold}"/>` +
    `</g></g>` +
    `</g>` + // head
    `<g data-p="wingL"><path d="M62 146C40 154 30 192 38 228C41 242 50 248 57 238C70 216 74 178 68 150Z" fill="${C.wing}"/>` +
    `<path d="M61 156C50 168 45 188 47 208C55 194 62 176 64 158Z" fill="${C.wingHi}"/></g>` +
    `<g data-p="wingR"><path d="M198 146C220 154 230 192 222 228C219 242 210 248 203 238C190 216 186 178 192 150Z" fill="${C.wing}"/>` +
    `<path d="M199 156C210 168 215 188 213 208C205 194 198 176 196 158Z" fill="${C.wingHi}"/></g>` +
    `</g></g></g>` + // breath, squash, root
    `</g>` + // tone
    `<g data-p="dots" opacity="0">` +
    `<circle cx="214" cy="58" r="4" fill="#fff" stroke="#DCE2F3" stroke-width="1.5"/>` +
    `<circle cx="226" cy="40" r="6.5" fill="#fff" stroke="#DCE2F3" stroke-width="1.5"/>` +
    `<rect x="226" y="-14" width="72" height="36" rx="18" fill="#fff" stroke="#DCE2F3" stroke-width="1.5"/>` +
    `<circle data-p="dot1" cx="246" cy="4" r="4.8" fill="#3B4BDB"/>` +
    `<circle data-p="dot2" cx="262" cy="4" r="4.8" fill="#3B4BDB"/>` +
    `<circle data-p="dot3" cx="278" cy="4" r="4.8" fill="#3B4BDB"/>` +
    `</g>` +
    `</g>` + // flip
    confettiLayer +
    `</svg>`
  )
}

// ── Pose → attributes ───────────────────────────────────────────────────────

const r2 = (v) => Math.round(v * 100) / 100

/**
 * The SVG transform attribute for one part's pose: the mock's CSS
 * `transform-origin:<pivot>; transform: translate(x,y) rotate(r) scale(sx,sy)`
 * written out. Identity → '' (attribute removed).
 */
export function transformAttr(part, p) {
  if (!p) return ''
  const x = r2(p.x || 0)
  const y = r2(p.y || 0)
  const r = r2(p.r || 0)
  const sx = Math.round((p.sx ?? 1) * 1000) / 1000
  const sy = Math.round((p.sy ?? 1) * 1000) / 1000
  if (!x && !y && !r && sx === 1 && sy === 1) return ''
  const [ox, oy] = PIVOTS[part] || [0, 0]
  if (!r && sx === 1 && sy === 1) return `translate(${x} ${y})`
  let s = `translate(${r2(ox + x)} ${r2(oy + y)})`
  if (r) s += ` rotate(${r})`
  if (sx !== 1 || sy !== 1) s += ` scale(${sx} ${sy})`
  s += ` translate(${-ox} ${-oy})`
  return s
}

const opacityAttr = (o) => (o == null ? '' : String(Math.round(o * 1000) / 1000))

/**
 * Find the animated parts inside a rendered owl (any element with
 * querySelector/querySelectorAll — a real DOM, jsdom, or the film rig's page).
 */
export function collectParts(root) {
  const parts = {}
  for (const k of PARTS) parts[k] = root.querySelector(`[data-p="${k}"]`)
  parts.tassel = root.querySelector('[data-p="tassel"]')
  parts.confetti = Array.from(root.querySelectorAll('[data-cf]'))
  return parts
}

function setAttr(el, name, value, cache, key) {
  if (cache[key] === value) return
  cache[key] = value
  if (value === '') el.removeAttribute(name)
  else el.setAttribute(name, value)
}

/**
 * Write a pose to the parts, touching only attributes whose text changed
 * (`cache` is the per-owl memo of what was last written).
 */
export function writePose(parts, pose, cache) {
  for (const k of PARTS) {
    const el = parts[k]
    if (!el) continue
    const p = pose.parts[k]
    setAttr(el, 'transform', transformAttr(k, p), cache, `${k}:t`)
    // Opacity: '' (attribute removed) means fully opaque.
    const o = p && p.o != null ? Math.max(0, Math.min(1, p.o)) : 1
    setAttr(el, 'opacity', o >= 0.999 ? '' : opacityAttr(o), cache, `${k}:o`)
  }
  if (parts.tassel) {
    const deg = r2(pose.tassel || 0)
    setAttr(parts.tassel, 'transform', deg ? `rotate(${deg} ${TASSEL_PIVOT[0]} ${TASSEL_PIVOT[1]})` : '', cache, 'tassel')
  }
  if (parts.confetti && parts.confetti.length) {
    const pieces = pose.confetti || []
    parts.confetti.forEach((el, i) => {
      const c = pieces[i]
      if (!c || c.o <= 0) {
        setAttr(el, 'opacity', '0', cache, `cf${i}:o`)
        return
      }
      setAttr(el, 'opacity', opacityAttr(c.o), cache, `cf${i}:o`)
      setAttr(
        el,
        'transform',
        `translate(${r2(c.x)} ${r2(c.y)}) rotate(${r2(c.r)}) scale(${r2(c.w / 8)} ${r2(c.h / 12)})`,
        cache,
        `cf${i}:t`,
      )
    })
  }
}
