import nodemailer from 'nodemailer';

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  const host = process.env.SMTP_HOST;
  if (!host) return null;
  transporter = nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS || '' }
      : undefined
  });
  return transporter;
}

export function isEmailConfigured() {
  return !!process.env.SMTP_HOST;
}

export async function sendEmailFallback({ to, subject, body, url }) {
  const mailer = getTransporter();
  if (!mailer || !to) return { skipped: 'email not configured' };

  const text = `${body}\n\nOpen PolySchedule: ${url || './index.html#proposals'}`;
  await mailer.sendMail({
    from: process.env.EMAIL_FROM || 'PolySchedule <noreply@polyschedule.local>',
    to,
    subject: subject || 'PolySchedule update',
    text
  });
  return { sent: true };
}
