// ─────────────────────────────────────────────────────────────────────────────
// email-template.ts — the ONE branded HTML wrapper for every transactional email
// KYRO sends (verification, password reset, invitations, board summaries, alerts,
// support). Table-based + inline styles + web-safe fonts so it renders in Outlook,
// Gmail, Apple Mail, etc. Company colours: navy header, blue→violet→coral accent,
// blue CTA. The logo is the CloudFront-hosted transparent lockup (alt text keeps
// it readable when a client blocks images). Every text input is HTML-escaped.
// ─────────────────────────────────────────────────────────────────────────────

const NAVY = '#101C3D'
const BLUE = '#2563EB'
const VIOLET = '#8b5cf6'
const CORAL = '#FF6B5E'
const PAGE_BG = '#eef2fb'
const INK = '#101C3D'
const BODY = '#475069'
const MUTED = '#8a94a6'
const BORDER = '#e6eaf3'

function esc(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export interface BrandedEmailOptions {
  webOrigin: string
  /** Hidden inbox-preview line. */
  preheader?: string
  heading: string
  /** Body paragraphs (plain strings; escaped + rendered as <p>). */
  paragraphs?: string[]
  /** Primary call-to-action button. */
  cta?: { label: string; url: string }
  /** A monospace code block (e.g. a password-reset code) shown prominently. */
  code?: string
  /** Show a raw fallback link under the CTA ("or paste this link"). */
  linkFallback?: string
}

/** Render the full branded HTML document for a transactional email. */
export function renderBrandedEmail(o: BrandedEmailOptions): string {
  const year = new Date().getFullYear()
  const logo = `${o.webOrigin.replace(/\/+$/, '')}/kyro-email-logo.png`

  const paragraphs = (o.paragraphs || [])
    .filter((p) => p && p.trim())
    .map(
      (p) =>
        `<p style="margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.65;color:${BODY};">${esc(
          p,
        ).replace(/\n/g, '<br>')}</p>`,
    )
    .join('')

  const codeBlock = o.code
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:8px 0 20px;">
         <div style="display:inline-block;background:${PAGE_BG};border:1px solid ${BORDER};border-radius:12px;padding:16px 28px;font-family:'Courier New',Courier,monospace;font-size:30px;font-weight:bold;letter-spacing:6px;color:${INK};">${esc(
           o.code,
         )}</div>
       </td></tr></table>`
    : ''

  const cta = o.cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 4px;"><tr>
         <td align="center" bgcolor="${BLUE}" style="border-radius:10px;">
           <a href="${esc(o.cta.url)}" target="_blank" style="display:inline-block;padding:14px 30px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:10px;">${esc(
             o.cta.label,
           )}</a>
         </td>
       </tr></table>`
    : ''

  const linkFallback = o.linkFallback
    ? `<p style="margin:18px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:${MUTED};">
         If the button doesn't work, paste this link into your browser:<br>
         <a href="${esc(o.linkFallback)}" target="_blank" style="color:${BLUE};word-break:break-all;">${esc(
           o.linkFallback,
         )}</a>
       </p>`
    : ''

  const preheader = o.preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;height:0;width:0;">${esc(
        o.preheader,
      )}</div>`
    : ''

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(
    o.heading,
  )}</title></head>
<body style="margin:0;padding:0;background:${PAGE_BG};-webkit-font-smoothing:antialiased;">
${preheader}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAGE_BG};padding:28px 12px;">
  <tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid ${BORDER};box-shadow:0 12px 40px -18px rgba(16,28,61,0.35);">
      <!-- Header -->
      <tr><td align="center" style="background:${NAVY};padding:30px 24px 26px;">
        <img src="${logo}" width="170" alt="KYRO" style="display:block;border:0;outline:none;text-decoration:none;height:auto;">
      </td></tr>
      <!-- Accent bar (3 solid cells → renders everywhere, unlike CSS gradients) -->
      <tr><td style="font-size:0;line-height:0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
          <td width="34%" height="4" style="background:${BLUE};font-size:0;line-height:0;">&nbsp;</td>
          <td width="33%" height="4" style="background:${VIOLET};font-size:0;line-height:0;">&nbsp;</td>
          <td width="33%" height="4" style="background:${CORAL};font-size:0;line-height:0;">&nbsp;</td>
        </tr></table>
      </td></tr>
      <!-- Body -->
      <tr><td style="padding:38px 44px 34px;">
        <h1 style="margin:0 0 18px;font-family:Georgia,'Times New Roman',serif;font-size:24px;line-height:1.25;color:${INK};font-weight:normal;">${esc(
          o.heading,
        )}</h1>
        ${paragraphs}
        ${codeBlock}
        ${cta}
        ${linkFallback}
      </td></tr>
      <!-- Footer -->
      <tr><td style="background:#f7f9fd;border-top:1px solid ${BORDER};padding:24px 44px;">
        <p style="margin:0 0 4px;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:${INK};">
          <strong>KYRO</strong> <span style="color:${MUTED};">— Knowledge Yielding Resource Optimizer</span>
        </p>
        <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:${MUTED};">
          Financial intelligence for schools. Questions? <a href="mailto:support@ourkyro.com" style="color:${BLUE};text-decoration:none;">support@ourkyro.com</a>
        </p>
      </td></tr>
    </table>
    <p style="font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#a3abbb;margin:16px 0 0;">© ${year} KYRO. All rights reserved.</p>
  </td></tr>
</table>
</body></html>`
}
