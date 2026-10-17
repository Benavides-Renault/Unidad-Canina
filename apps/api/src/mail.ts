import nodemailer from 'nodemailer';
export const mailConfigured = () => Boolean(process.env.SMTP_HOST && process.env.SMTP_FROM);
export async function sendMail(to: string, subject: string, text: string, messageId?: string) {
  if (!mailConfigured()) return false;
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 1025),
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
      : undefined,
    connectionTimeout: 10000,
    socketTimeout: 20000,
  });
  try {
    await transport.sendMail({
      from: process.env.SMTP_FROM,
      to,
      subject,
      text,
      ...(messageId ? { messageId: `<${messageId}@valkyr.internal>` } : {}),
    });
    return true;
  } finally {
    transport.close();
  }
}
