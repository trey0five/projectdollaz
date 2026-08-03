import { describe, expect, it, vi } from 'vitest'
import { MailerService, READINESS_ONE_PAGER_LABEL } from './mailer.service.js'
import { READINESS_DISCLAIMER } from '../accreditation/readiness-history.service.js'

// ─────────────────────────────────────────────────────────────────────────────
// AIC Phase H — THE BOARD EMAIL IS THE FIFTH SURFACE OF THE READINESS CLAIMS,
// AND THE ONLY ONE WITHOUT A FOOTER.
//
// The four print surfaces render the non-affiliation sentence through
// `VisitPrintFooter`, which THROWS rather than publish a readiness document that
// disclaims nothing. An inbox has no footer — and the board member who reads the
// six paragraphs there is the reader least likely to ever open the app, so they
// are the reader most likely to take "Documented readiness is 62%, defensible
// readiness is 41%. The projected index is 310, which bands as Accredited." for
// an accreditor's finding rather than a self-assessment.
//
// `deliver` is private and is the seam: replacing it captures the exact subject,
// text body and rendered HTML this method would have sent, with no transport, no
// SES client and no nodemailer.
// ─────────────────────────────────────────────────────────────────────────────

interface Sent {
  to: string
  subject: string
  text: string
  html: string
}

function harness() {
  const config = { get: vi.fn(() => undefined) }
  const mailer = new MailerService(config as never)
  const sent: Sent[] = []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(mailer as any).deliver = async (to: string, subject: string, text: string, html: string) => {
    sent.push({ to, subject, text, html })
  }
  return { mailer, sent }
}

const BASE = {
  schoolName: 'St. Example',
  periodLabel: 'FY2025–26',
  body: 'The finance body.',
  link: 'https://app.example.org/board-packet/print?period=p-1',
}

const READINESS = [
  'A visiting team would arrive to the Cognia Performance Standards.',
  'They would likely raise 4 findings.',
]

describe('sendBoardSummary — the readiness claims never travel without the disclaimer', () => {
  it('prints the disclaimer VERBATIM in the plaintext body and in the HTML', async () => {
    const h = harness()
    await h.mailer.sendBoardSummary('board@example.org', {
      ...BASE,
      readinessParagraphs: READINESS,
      readinessLink: 'https://app.example.org/accreditation/board/print?school=school-A',
      readinessDisclaimer: READINESS_DISCLAIMER,
    })
    expect(h.sent).toHaveLength(1)
    const { text, html } = h.sent[0]
    expect(text).toContain(READINESS_DISCLAIMER)
    // The HTML template escapes, so assert on a fragment with no escapable
    // character rather than on the whole sentence.
    expect(html).toContain('not affiliated with, endorsed by, or a submission to Cognia')
    // Exactly once, and LAST — where a footer would be.
    expect(text.split(READINESS_DISCLAIMER)).toHaveLength(2)
    expect(text.trimEnd().endsWith(READINESS_DISCLAIMER)).toBe(true)
    // And the claims it disclaims are all still there, verbatim and in order.
    for (const p of READINESS) expect(text).toContain(p)
    expect(text.indexOf(READINESS[0])).toBeLessThan(text.indexOf(READINESS[1]))
    expect(text).toContain(READINESS_ONE_PAGER_LABEL)
  })

  it('emits NO disclaimer when there are no readiness claims to disclaim', async () => {
    const h = harness()
    await h.mailer.sendBoardSummary('board@example.org', BASE)
    const { text, html } = h.sent[0]
    expect(text).not.toContain('not affiliated with')
    expect(html).not.toContain('not affiliated with')
    // The email a school gets today, unchanged.
    expect(text).toContain('The finance body.')
    expect(text).toContain('View the full board packet: ')
    expect(text).not.toContain(READINESS_ONE_PAGER_LABEL)
  })

  it('a disclaimer with no paragraphs is NOT emitted — it would be a non-sequitur', async () => {
    const h = harness()
    await h.mailer.sendBoardSummary('board@example.org', {
      ...BASE,
      readinessDisclaimer: READINESS_DISCLAIMER,
    })
    expect(h.sent[0].text).not.toContain(READINESS_DISCLAIMER)
  })

  it('paragraphs with a BLANK disclaimer still send — the email is never dropped', async () => {
    // Fail-soft, deliberately asymmetric with the print surfaces: paper can refuse
    // to publish, but a scheduled email that silently stops arriving is a failure
    // nobody notices. The disclaimer's absence here is caught by the spec above,
    // not by dropping a board's monthly summary.
    const h = harness()
    await h.mailer.sendBoardSummary('board@example.org', {
      ...BASE,
      readinessParagraphs: READINESS,
      readinessDisclaimer: '   ',
    })
    expect(h.sent).toHaveLength(1)
    expect(h.sent[0].text).toContain(READINESS[0])
  })
})
