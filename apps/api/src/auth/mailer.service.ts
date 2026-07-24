import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import nodemailer, { type Transporter } from 'nodemailer'
import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2'

/**
 * Pluggable mailer. Delivery path is chosen by `mail.provider`:
 *   - 'ses'  → Amazon SES via the AWS SDK. On ECS the ECS task role supplies
 *              credentials (no static SMTP secret); the From address uses the
 *              verified `ourkyro.com` domain identity.
 *   - 'smtp' → nodemailer over a configured SMTP host (SMTP_*).
 *   - ''     → DEV: log the link/code to the console.
 * Tokens are ALWAYS persisted in the DB by the caller, so tests can retrieve
 * them via psql even in dev. Tokens are never returned in API responses.
 */
@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name)
  private readonly provider: string
  private readonly from: string
  private readonly webOrigin: string
  private readonly region: string
  private readonly supportEmail: string
  private smtpTransporter: Transporter | null = null
  private sesClient: SESv2Client | null = null

  constructor(config: ConfigService) {
    this.provider = config.get<string>('mail.provider') ?? ''
    this.from = config.get<string>('mail.from') ?? 'KYRO <noreply@ourkyro.com>'
    this.region = config.get<string>('mail.region') ?? 'us-east-1'
    this.webOrigin = config.get<string>('webOrigin') ?? 'http://localhost:5173'
    this.supportEmail = config.get<string>('mail.supportEmail') ?? 'support@ourkyro.com'

    if (this.provider === 'smtp') {
      const port = config.get<number>('smtp.port') ?? 587
      this.smtpTransporter = nodemailer.createTransport({
        host: config.get<string>('smtp.host') ?? '',
        port,
        secure: port === 465,
        auth: {
          user: config.get<string>('smtp.user') ?? '',
          pass: config.get<string>('smtp.pass') ?? '',
        },
      })
    }
  }

  async sendVerificationEmail(email: string, token: string): Promise<void> {
    const link = `${this.webOrigin}/verify-email?token=${token}`
    await this.deliver(
      email,
      'Verify your KYRO email',
      `Welcome to KYRO! Verify your email:\n\n${link}\n`,
      `Verification link for ${email}: ${link}`,
    )
  }

  async sendBoardSummary(
    email: string,
    opts: { schoolName: string; periodLabel: string | null; body: string; link: string },
  ): Promise<void> {
    const { schoolName, periodLabel, body, link } = opts
    const subject = `${schoolName} — board financial summary${
      periodLabel ? ` (${periodLabel})` : ''
    }`
    const text =
      `${schoolName}${periodLabel ? ` · ${periodLabel}` : ''}\n\n${body}\n\n` +
      `View the full board packet: ${link}\n`
    await this.deliver(email, subject, text, `Board summary for ${email}: ${link}`)
  }

  /**
   * Phase 4E — proactive alerts / standing requests. A pre-composed subject+body
   * (scheduled digest OR edge-triggered threshold alert) from AlertService. Sends
   * real mail when configured, else a [DEV MAIL] console stub — the alert is still
   * recorded as sent by the caller (lastSentAt) regardless.
   */
  async sendAlert(email: string, subject: string, text: string): Promise<void> {
    await this.deliver(email, subject, text, `Alert email for ${email}: ${subject}`)
  }

  async sendPasswordResetEmail(email: string, code: string): Promise<void> {
    await this.deliver(
      email,
      'Your KYRO password reset code',
      `Your password reset code is: ${code}\n\nIt expires in 15 minutes.`,
      `Password reset code for ${email}: ${code}`,
    )
  }

  async sendInvitationEmail(
    email: string,
    token: string,
    schoolName: string,
    role: string,
  ): Promise<void> {
    const link = `${this.webOrigin}/login?invite=${token}`
    await this.deliver(
      email,
      `You've been invited to ${schoolName} on KYRO`,
      `You've been invited to join ${schoolName} as ${role}.\n\nSign in / create an account, then accept the invite:\n${link}\n\nInvitation token: ${token}`,
      `Invitation token for ${email} (school ${schoolName}, role ${role}): ${token}`,
    )
  }

  /**
   * In-app support request. Emails the verified support address with the message,
   * setting Reply-To to the AUTHENTICATED sender so a reply reaches them — the From
   * ALWAYS stays the verified domain identity (`this.from`), so the user is never
   * spoofed into From. `replyTo` + subject are header-sanitized (CR/LF stripped) to
   * prevent header injection; the message rides only in the Text body (newlines safe).
   */
  async sendSupportEmail(
    fromUserEmail: string,
    fromName: string,
    subject: string,
    message: string,
  ): Promise<void> {
    const replyTo = this.sanitizeHeader(fromUserEmail)
    const safeSubject = `[KYRO Support] ${this.sanitizeHeader(subject)}`
    const text = `From: ${fromName} <${replyTo}>\nUser email: ${replyTo}\n\n${message}\n`

    if (this.provider === 'ses') {
      await this.getSes().send(
        new SendEmailCommand({
          FromEmailAddress: this.from,
          Destination: { ToAddresses: [this.supportEmail] },
          ReplyToAddresses: [replyTo],
          Content: {
            Simple: {
              Subject: { Data: safeSubject },
              Body: { Text: { Data: text } },
            },
          },
        }),
      )
      return
    }
    if (this.smtpTransporter) {
      await this.smtpTransporter.sendMail({
        from: this.from,
        to: this.supportEmail,
        replyTo,
        subject: safeSubject,
        text,
      })
      return
    }
    this.logger.log(`[DEV MAIL] Support from ${replyTo}: ${safeSubject}`)
  }

  /** Strip CR/LF (header-injection defense) + clamp length for any header value. */
  private sanitizeHeader(s: string): string {
    return s.replace(/[\r\n]+/g, ' ').trim().slice(0, 200)
  }

  private getSes(): SESv2Client {
    if (!this.sesClient) this.sesClient = new SESv2Client({ region: this.region })
    return this.sesClient
  }

  private async deliver(
    to: string,
    subject: string,
    text: string,
    devLog: string,
  ): Promise<void> {
    if (this.provider === 'ses') {
      await this.getSes().send(
        new SendEmailCommand({
          FromEmailAddress: this.from,
          Destination: { ToAddresses: [to] },
          Content: {
            Simple: {
              Subject: { Data: subject },
              Body: { Text: { Data: text } },
            },
          },
        }),
      )
      return
    }
    if (this.smtpTransporter) {
      await this.smtpTransporter.sendMail({ from: this.from, to, subject, text })
      return
    }
    // DEV mode — log to console; token also lives in the DB for test retrieval.
    this.logger.log(`[DEV MAIL] ${devLog}`)
  }
}
