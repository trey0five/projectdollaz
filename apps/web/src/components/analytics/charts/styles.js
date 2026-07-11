// ─────────────────────────────────────────────────────────────────────────────
// styles.js — one-time global CSS injection for the analytics v2 chart library.
// Self-contained: ports the mockup's motion keyframes (.viztip, vpulse, glowline)
// + the bar-race row transitions so the library never depends on tokens.css. All
// classes are namespaced `fr-` to avoid collisions. Idempotent; called on first
// chart render. Reduced-motion is honored by each component NOT applying the
// animation classes (so the element renders in its final, static state).
// ─────────────────────────────────────────────────────────────────────────────

let injected = false

export function ensureChartStyles() {
  if (injected || typeof document === 'undefined') return
  injected = true
  const s = document.createElement('style')
  s.setAttribute('data-fr-charts', '')
  s.textContent = `
  .fr-viztip{position:fixed;z-index:60;pointer-events:none;background:var(--ink,#101C3D);color:#fff;
    font-size:12.5px;line-height:1.35;border-radius:10px;padding:8px 12px;
    box-shadow:0 10px 24px -8px rgba(16,28,61,.4);opacity:0;transition:opacity .12s;max-width:240px}
  .fr-viztip b{display:block;font-size:11px;letter-spacing:.08em;text-transform:uppercase;
    color:rgba(255,255,255,.6);margin-bottom:2px}
  .fr-viztip .trow{display:flex;align-items:center;gap:7px;white-space:nowrap}
  .fr-viztip .trow i{width:8px;height:8px;border-radius:50%;flex-shrink:0}
  .fr-viztip .trow em{font-style:normal;font-variant-numeric:tabular-nums;margin-left:auto;
    padding-left:12px;font-weight:700}
  @keyframes fr-fade{from{opacity:0}to{opacity:1}}
  @keyframes fr-vpulse{0%{transform:scale(1);opacity:.5}70%{transform:scale(2.6);opacity:0}
    100%{transform:scale(2.6);opacity:0}}
  @keyframes fr-growx{from{transform:scaleX(.001)}to{transform:scaleX(1)}}
  @keyframes fr-radar-in{from{opacity:0;transform:scale(.25)}to{opacity:1;transform:scale(1)}}
  .fr-fadein{animation:fr-fade .4s ease both}
  .fr-pulse{transform-box:fill-box;transform-origin:center;animation:fr-vpulse 2.2s ease-out infinite}
  .fr-glow{filter:drop-shadow(0 2px 5px rgba(37,99,235,.35))}
  .fr-growx{transform-box:fill-box;transform-origin:left center;animation:fr-growx .7s cubic-bezier(.22,1,.36,1) backwards}
  .fr-radar-in{transform-box:fill-box;transform-origin:center;animation:fr-radar-in .7s cubic-bezier(.22,1,.36,1) backwards}
  /* bar race */
  .fr-race{position:relative}
  .fr-rrow{position:absolute;left:0;right:0;display:flex;align-items:center;gap:10px;height:32px;
    transition:transform .8s cubic-bezier(.22,1,.36,1)}
  .fr-rname{width:132px;font-size:12.5px;font-weight:700;display:flex;gap:7px;align-items:center;
    white-space:nowrap;color:var(--ink,#101C3D)}
  .fr-rname i{width:10px;height:10px;border-radius:50%;flex-shrink:0}
  .fr-rbarwrap{flex:1;display:block}
  .fr-rbar{display:block;height:16px;border-radius:0 4px 4px 0;transition:width .9s cubic-bezier(.22,1,.36,1)}
  .fr-rval{font-size:12px;font-weight:700;font-variant-numeric:tabular-nums;color:#3D4A6B;width:54px;text-align:right}
  .fr-ryear{position:absolute;right:6px;bottom:-6px;font-size:44px;font-weight:800;color:#101C3D;
    opacity:.08;letter-spacing:-.03em;pointer-events:none}
  .fr-replay{font-family:inherit;font-size:12px;font-weight:700;color:#2563EB;background:#EFF6FF;
    border:0;border-radius:8px;padding:5px 12px;cursor:pointer;transition:background .2s}
  .fr-replay:hover{background:#DBEAFE}
  .fr-legend-btn{background:none;border:0;cursor:pointer;font:inherit;padding:2px 6px;margin:-2px -6px;
    border-radius:8px;transition:background .15s}
  .fr-legend-btn:hover{background:#F2F5FC}`
  document.head.appendChild(s)
}
