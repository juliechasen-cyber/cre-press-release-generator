import { NextResponse, after } from "next/server";
import { Resend } from "resend";
import { RELEASE_TYPE_LABELS, type UserBrief } from "@/lib/schema";
import { renderDocx } from "@/lib/render";
import { notifyLead } from "@/lib/notify";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { verifyDraft } from "@/lib/draft-signature";

export const runtime = "nodejs";
export const maxDuration = 45;


type SendPayload = {
  first_name: string;
  last_name: string;
  company?: string;
  title?: string;
  email: string;
  phone?: string;
  subscribe_northstar?: boolean;
  draft_text: string;
  draft_signature?: string;
  brief: UserBrief;
  slug?: string;
};

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.includes("multipart/form-data")) {
    return NextResponse.json(
      { error: "unsupported_media", message: "Send multipart/form-data." },
      { status: 415 },
    );
  }

  const form = await request.formData();
  const payloadRaw = String(form.get("payload") || "");
  let payload: SendPayload;
  try {
    payload = JSON.parse(payloadRaw);
  } catch {
    return NextResponse.json(
      { error: "bad_payload", message: "payload must be JSON." },
      { status: 400 },
    );
  }

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email || "");
  if (!emailOk) {
    return NextResponse.json(
      { error: "bad_email", message: "Enter a valid email address." },
      { status: 400 },
    );
  }
  if (!payload.first_name?.trim() || !payload.last_name?.trim()) {
    return NextResponse.json(
      { error: "missing_name", message: "First name and last name are required." },
      { status: 400 },
    );
  }
  if (!payload.draft_text) {
    return NextResponse.json(
      { error: "missing_draft", message: "draft_text is required." },
      { status: 400 },
    );
  }

  if (!verifyDraft(payload.draft_text, payload.draft_signature)) {
    return NextResponse.json(
      { error: "bad_signature", message: "Generate a draft first, then email it." },
      { status: 403 },
    );
  }

  const limit = checkRateLimit(`send-email:${getClientIp(request)}`);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "rate_limited", message: "You've hit today's email limit. Please try again tomorrow." },
      { status: 429 },
    );
  }

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM;
  const replyTo = process.env.RESEND_REPLY_TO;
  if (!apiKey || !from) {
    return NextResponse.json(
      { error: "email_not_configured", message: "Email is not configured on the server." },
      { status: 503 },
    );
  }

  const slug =
    (payload.slug || slugify(payload.brief.property_name || payload.brief.property_address)) ||
    "cre-press-release";
  const label = RELEASE_TYPE_LABELS[payload.brief.release_type];

  const docx = await renderDocx(payload.draft_text, null);

  const resend = new Resend(apiKey);

  const greeting = `Hi ${payload.first_name},`;
  const body =
    `${greeting}\n\n` +
    `Here's the draft you generated on the CRE Press Release Generator. ` +
    `It's attached as a .docx so you can edit it in Word or Google Docs.\n\n` +
    `Attached:\n` +
    `  • cre-press-release-${slug}.docx\n\n` +
    `A few reminders before you publish:\n` +
    `  • Fill in any [BRACKETED SLOTS] we left as placeholders\n` +
    `  • Have the broker approve or rewrite the [DRAFT QUOTE] line\n` +
    `  • Double-check every number against the source deal\n\n` +
    `We don't store your draft. If you need it again later, generate a new one — it takes about a minute.\n\n` +
    `— Julie Chasen\n` +
    `   juliechasen.com\n\n` +
    `You received this because you asked us to email your draft. This is a one-time send.`;

  try {
    await resend.emails.send({
      from,
      to: payload.email,
      replyTo: replyTo || undefined,
      subject: `Your ${label} press release draft`,
      text: body,
      attachments: [
        {
          filename: `cre-press-release-${slug}.docx`,
          content: docx,
        },
      ],
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: "send_failed",
        message: err instanceof Error ? err.message : "Failed to send email.",
      },
      { status: 502 },
    );
  }

  const lead: Array<[string, unknown]> = [
    ["submitted_at", new Date().toISOString()],
    ["first_name", payload.first_name.trim()],
    ["last_name", payload.last_name.trim()],
    ["email", payload.email.trim()],
    ["company", payload.company?.trim()],
    ["title", payload.title?.trim()],
    ["phone", payload.phone?.trim()],
    ["subscribe_northstar", payload.subscribe_northstar ? "yes" : "no"],
    ["release_type", label],
    ["property_name", payload.brief.property_name],
    ["property_city", payload.brief.city],
    ["property_state", payload.brief.state],
  ];

  // Lead capture runs after the response is sent — the user shouldn't wait
  // on webhook/email round-trips for the confirmation.
  after(async () => {
    const leadWebhook = process.env.EMAIL_WEBHOOK;
    if (leadWebhook) {
      try {
        await fetch(leadWebhook, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(Object.fromEntries(lead)),
        });
      } catch (err) {
        console.error("lead_webhook_failed", err);
      }
    }
    await notifyLead(
      `New CRE lead — ${payload.first_name} ${payload.last_name} (${payload.company?.trim() || "no company"})`,
      lead,
    );
  });

  return NextResponse.json({ ok: true }, { status: 200 });
}

function slugify(s: string | undefined): string {
  if (!s) return "";
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}
