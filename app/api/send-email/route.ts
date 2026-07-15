import { NextResponse } from "next/server";
import { Resend } from "resend";
import { RELEASE_TYPE_LABELS, type UserBrief } from "@/lib/schema";
import { renderDocx, renderPdf, type ImageInput } from "@/lib/render";

export const runtime = "nodejs";
export const maxDuration = 45;

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

type SendPayload = {
  first_name: string;
  last_name: string;
  company?: string;
  title?: string;
  email: string;
  phone?: string;
  subscribe_northstar?: boolean;
  draft_text: string;
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

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM;
  const replyTo = process.env.RESEND_REPLY_TO;
  if (!apiKey || !from) {
    return NextResponse.json(
      { error: "email_not_configured", message: "Email is not configured on the server." },
      { status: 503 },
    );
  }

  // Optional image passthrough for compositing into the attachments
  const imageFile = form.get("image");
  let image: ImageInput = null;
  if (imageFile && imageFile instanceof File && imageFile.size > 0) {
    if (imageFile.size > MAX_IMAGE_BYTES) {
      return NextResponse.json(
        { error: "image_too_large", message: "Image exceeds 10 MB." },
        { status: 413 },
      );
    }
    const mime = imageFile.type;
    if (mime !== "image/jpeg" && mime !== "image/png") {
      return NextResponse.json(
        { error: "bad_image_type", message: "Only JPEG or PNG." },
        { status: 415 },
      );
    }
    image = {
      bytes: Buffer.from(await imageFile.arrayBuffer()),
      mime,
      orientation: payload.brief.image_orientation ?? "landscape",
      credit: payload.brief.image_credit,
    };
  }

  const slug =
    (payload.slug || slugify(payload.brief.property_name || payload.brief.property_address)) ||
    "cre-press-release";
  const label = RELEASE_TYPE_LABELS[payload.brief.release_type];

  const [docx, pdf] = await Promise.all([
    renderDocx(payload.draft_text, image),
    renderPdf(payload.draft_text, image),
  ]);

  const resend = new Resend(apiKey);

  const greeting = `Hi ${payload.first_name},`;
  const body =
    `${greeting}\n\n` +
    `Here's the draft you generated on the CRE Press Release Generator. ` +
    `Both formats are attached — .docx for editing, .pdf for sending as-is.\n\n` +
    `Attached:\n` +
    `  • cre-press-release-${slug}.docx\n` +
    `  • cre-press-release-${slug}.pdf\n\n` +
    `A few reminders before you publish:\n` +
    `  • Fill in any [BRACKETED SLOTS] we left as placeholders\n` +
    `  • Have the broker approve or rewrite the [DRAFT QUOTE] line\n` +
    `  • Double-check every number against the source deal\n\n` +
    `We don't store your draft. If you need it again later, generate a new one — it takes about a minute.\n\n` +
    `— The team behind CRE Northstar\n` +
    `   crenorthstar.com\n\n` +
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
        {
          filename: `cre-press-release-${slug}.pdf`,
          content: pdf,
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

  const leadWebhook = process.env.ZAPIER_LEAD_WEBHOOK;
  if (leadWebhook) {
    const lead = {
      first_name: payload.first_name.trim(),
      last_name: payload.last_name.trim(),
      company: payload.company?.trim() || "",
      title: payload.title?.trim() || "",
      email: payload.email.trim(),
      phone: payload.phone?.trim() || "",
      subscribe_northstar: !!payload.subscribe_northstar,
      release_type: label,
      property_name: payload.brief.property_name || "",
      property_city: payload.brief.city || "",
      property_state: payload.brief.state || "",
      submitted_at: new Date().toISOString(),
    };
    try {
      await fetch(leadWebhook, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(lead),
      });
    } catch (err) {
      console.error("lead_webhook_failed", err);
    }
  }

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
