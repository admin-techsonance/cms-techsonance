import { db } from '@/db';
import { companySettings } from '@/db/schema';
import { env } from '@/server/config/env';
import { logger } from '@/server/logging/logger';

function getFromAddress(settings?: {
  email?: string | null;
}) {
  const address = env.SMTP_FROM_EMAIL ?? settings?.email ?? env.SMTP_USER ?? 'no-reply@localhost';
  const name = env.SMTP_FROM_NAME ?? 'TechSonance InfoTech LLP';
  return `"${name}" <${address}>`;
}

async function createTransporter() {
  const [settings] = await db.select().from(companySettings).limit(1);

  const host = env.SMTP_HOST ?? settings?.smtpHost ?? null;
  const port = env.SMTP_PORT ?? settings?.smtpPort ?? 587;
  const user = env.SMTP_USER ?? settings?.smtpUser ?? null;
  const password = env.SMTP_PASSWORD ?? settings?.smtpPassword ?? null;

  const nodemailer = await import('nodemailer');

  if (!host || !user || !password) {
    if (env.NODE_ENV !== 'production') {
      return {
        transporter: nodemailer.default.createTransport({ jsonTransport: true }),
        settings,
        usesJsonTransport: true,
      };
    }

    throw new Error('SMTP configuration is incomplete for password reset emails');
  }

  return {
    transporter: nodemailer.default.createTransport({
      host,
      port,
      secure: port === 465,
      auth: {
        user,
        pass: password,
      },
    }),
    settings,
    usesJsonTransport: false,
  };
}

export async function sendPasswordResetOtpEmail(input: {
  email: string;
  firstName: string;
  otp: string;
}) {
  const { transporter, settings, usesJsonTransport } = await createTransporter();
  const appBaseUrl = env.APP_BASE_URL ?? 'http://localhost:3000';

  const result = await transporter.sendMail({
    from: getFromAddress(settings),
    to: input.email,
    subject: 'Your password reset OTP',
    text: `Hello ${input.firstName}, your TechSonance CMS password reset OTP is ${input.otp}. It expires in ${env.PASSWORD_RESET_OTP_TTL_MINUTES} minutes.`,
    html: `
      <div style="font-family: Arial, sans-serif; padding: 24px; color: #0f172a;">
        <h2 style="margin: 0 0 12px; color: #0f172a;">Password Reset Request</h2>
        <p style="margin: 0 0 16px;">Hello ${input.firstName},</p>
        <p style="margin: 0 0 16px;">Use the following one-time password to continue resetting your TechSonance CMS password:</p>
        <div style="display:inline-block; padding: 14px 20px; border-radius: 12px; background:#fff7ed; color:#ea580c; font-size: 28px; font-weight: 700; letter-spacing: 8px;">
          ${input.otp}
        </div>
        <p style="margin: 16px 0 0;">This OTP expires in ${env.PASSWORD_RESET_OTP_TTL_MINUTES} minutes.</p>
        <p style="margin: 16px 0 0; color: #64748b;">If you did not request this, you can safely ignore this email.</p>
        <p style="margin: 24px 0 0; color: #64748b;">${appBaseUrl}</p>
      </div>
    `,
  });

  if (usesJsonTransport) {
    logger.warn('password_reset_otp_dev_fallback', {
      email: input.email,
      otp: input.otp,
      preview: typeof result?.message === 'string' ? result.message : null,
      note: 'SMTP is not configured, so no real email was sent. Use the OTP from this log in local development.',
    });
  }

  logger.info('password_reset_otp_sent', {
    email: input.email,
  });
}
