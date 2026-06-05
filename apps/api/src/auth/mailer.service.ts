import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import nodemailer, { type Transporter } from 'nodemailer'

/**
 * Pluggable mailer. When SMTP_HOST is configured, sends real email. Otherwise
 * (DEV) it logs the link/code to the console. Tokens are ALWAYS persisted in the
 * DB by the caller, so tests can retrieve them via psql even in dev. Tokens are
 * never returned in API responses.
 */
@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name)
  private readonly transporter: Transporter | null
  private readonly from: string
  private readonly webOrigin: string

  constructor(config: ConfigService) {
    const host = config.get<string>('smtp.host')
    this.from = config.get<string>('smtp.from') ?? 'finrep <no-reply@finrep.dev>'
    this.webOrigin = config.get<string>('webOrigin') ?? 'http://localhost:5173'

    if (host) {
      this.transporter = nodemailer.createTransport({
        host,
        port: config.get<number>('smtp.port') ?? 587,
        secure: (config.get<number>('smtp.port') ?? 587) === 465,
        auth: {
          user: config.get<string>('smtp.user') ?? '',
          pass: config.get<string>('smtp.pass') ?? '',
        },
      })
    } else {
      this.transporter = null
    }
  }

  async sendVerificationEmail(email: string, token: string): Promise<void> {
    const link = `${this.webOrigin}/verify-email?token=${token}`
    await this.deliver(
      email,
      'Verify your finrep email',
      `Welcome to finrep! Verify your email:\n\n${link}\n`,
      `Verification link for ${email}: ${link}`,
    )
  }

  async sendPasswordResetEmail(email: string, code: string): Promise<void> {
    await this.deliver(
      email,
      'Your finrep password reset code',
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
      `You've been invited to ${schoolName} on finrep`,
      `You've been invited to join ${schoolName} as ${role}.\n\nSign in / create an account, then accept the invite:\n${link}\n\nInvitation token: ${token}`,
      `Invitation token for ${email} (school ${schoolName}, role ${role}): ${token}`,
    )
  }

  private async deliver(
    to: string,
    subject: string,
    text: string,
    devLog: string,
  ): Promise<void> {
    if (this.transporter) {
      await this.transporter.sendMail({ from: this.from, to, subject, text })
      return
    }
    // DEV mode — log to console; token also lives in the DB for test retrieval.
    this.logger.log(`[DEV MAIL] ${devLog}`)
  }
}
