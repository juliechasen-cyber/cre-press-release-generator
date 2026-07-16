import { Resend } from "resend";

export async function notifyLead(subject: string, lines: Array<[string, unknown]>) {
  const to = process.env.NOTIFY_EMAIL;
  const from = process.env.RESEND_FROM;
  const apiKey = process.env.RESEND_API_KEY;
  if (!to || !from || !apiKey) return;

  const body = lines
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");

  try {
    const resend = new Resend(apiKey);
    await resend.emails.send({ from, to, subject, text: body });
  } catch (err) {
    console.error("notify_email_failed", err);
  }
}
