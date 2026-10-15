// Plate — a REAL product screenshot as a captioned figure on the ground: one
// hairline, the panel radius, no shadow, no tilt. The shots live in
// /public/landing/shots/<name>-v<N>-{960,1440}.webp, captured from the live app
// on sample data at 2× and downsampled. Home is the full 1440×900 frame; the
// secondary shots are CROPPED to their content region (no sidebar, no top
// strip, no mascot) so the product's own type stays legible on the landing.
// Versioned names because public/ ships with a one-year immutable cache — never
// overwrite a shot in place; bump the version. width/height reserve the box (no
// layout shift); below-the-fold → lazy.
//
// layout="aside" puts the caption in a margin column beside the image (a
// ledger's margin note) from md up; below md it falls under the image.
import Reveal from './Reveal.jsx'
import '../../styles/pending/p5-landing.css'

export const SHOT_VERSION = 'v2'

export default function Plate({ name, title, caption, alt, sizes = '100vw', width = 1440, height = 900, layout = 'stack', delay = 0, className = '' }) {
  const base = `/landing/shots/${name}-${SHOT_VERSION}`
  return (
    <Reveal delay={delay} y={16} className={className}>
      <figure className={layout === 'aside' ? 'plate plate-aside' : 'plate'}>
        <span className="plate-frame">
          <img
            src={`${base}-1440.webp`}
            srcSet={`${base}-960.webp 960w, ${base}-1440.webp 1440w`}
            sizes={sizes}
            width={width}
            height={height}
            loading="lazy"
            decoding="async"
            alt={alt}
          />
        </span>
        <figcaption className="plate-cap">
          <b>{title}</b>
          <span>{caption}</span>
        </figcaption>
      </figure>
    </Reveal>
  )
}
