import nodemailer from 'nodemailer';

type KindleEmailPayload = {
  subject: string;
  text: string;
  attachments?: {
    filename: string;
    content: Buffer | string;
    contentType?: string;
  }[];
};

let transporter: nodemailer.Transporter | null = null;

function ensureTransporter() {
  if (transporter) {
    return transporter;
  }

  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 465;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const secure = (process.env.SMTP_SECURE ?? 'true').toLowerCase() === 'true';

  if (!host || !port || !user || !pass) {
    throw new Error('Missing SMTP configuration (host, port, user, pass)');
  }

  transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });

  return transporter;
}

export async function sendToKindle({ subject, text, attachments }: KindleEmailPayload) {
  const to = process.env.KINDLE_EMAIL;
  const from = process.env.FROM_EMAIL;

  if (!to || !from) {
    throw new Error('Missing KINDLE_EMAIL or FROM_EMAIL');
  }

  const mailer = ensureTransporter();

  await mailer.sendMail({
    from,
    to,
    subject,
    text,
    attachments,
  });
}
