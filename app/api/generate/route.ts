import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import {
  GeneratorOutputJsonSchema,
  GeneratorOutputSchema,
  UserBriefSchema,
  type GeneratorOutput,
} from "@/lib/schema";
import { SYSTEM_PROMPT, buildUserMessage } from "@/lib/prompt";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

const client = new Anthropic();

export async function POST(request: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      {
        error: "not_configured",
        message:
          "The server is missing ANTHROPIC_API_KEY. Add it to 02_build/.env.local and save — Next.js will hot-reload.",
      },
      { status: 503 },
    );
  }
  const ip = getClientIp(request);
  const limit = checkRateLimit(ip);
  if (!limit.ok) {
    return NextResponse.json(
      {
        error: "rate_limited",
        message:
          "You've hit the daily limit of 5 drafts. Email us if you need more.",
        reset_at: new Date(limit.resetAt).toISOString(),
      },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "invalid_json", message: "Request body must be JSON." },
      { status: 400 },
    );
  }

  const parsed = UserBriefSchema.safeParse(body);
  if (!parsed.success) {
    const flat = parsed.error.flatten();
    console.error("[generate] invalid brief:", JSON.stringify(flat, null, 2));
    console.error("[generate] body received:", JSON.stringify(body, null, 2));
    const firstFieldErr = Object.entries(flat.fieldErrors)[0];
    const message = firstFieldErr
      ? `${firstFieldErr[0]}: ${firstFieldErr[1]?.[0] ?? "invalid"}`
      : flat.formErrors[0] ?? "The form data was invalid.";
    return NextResponse.json(
      { error: "invalid_brief", message, issues: flat },
      { status: 400 },
    );
  }
  const brief = parsed.data;

  let response;
  try {
    response = await client.messages.create({
      model: "claude-sonnet-5",
      // Drafting a wire-format release from a filled-in brief is a structured
      // writing task, not a reasoning task — extended thinking added ~50s of
      // latency (blowing past this route's 60s maxDuration on Vercel) for no
      // quality gain. Turn it off for fast, deterministic drafts.
      thinking: { type: "disabled" },
      max_tokens: 8192,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildUserMessage(brief) }],
      output_config: {
        format: {
          type: "json_schema",
          schema: GeneratorOutputJsonSchema,
        },
      },
    });
    console.log(
      "[generate] usage:",
      JSON.stringify(response.usage),
      "stop_reason:",
      response.stop_reason,
    );
  } catch (err) {
    if (err instanceof Anthropic.APIError) {
      return NextResponse.json(
        {
          error: "llm_error",
          status: err.status,
          message: err.message,
        },
        { status: 502 },
      );
    }
    throw err;
  }

  if (response.stop_reason === "refusal") {
    return NextResponse.json(
      {
        error: "refused",
        message:
          "The generator declined this brief. Rephrase or remove sensitive content and try again.",
      },
      { status: 422 },
    );
  }

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    console.error(
      "[generate] no text block. stop_reason:",
      response.stop_reason,
      "block types:",
      JSON.stringify(response.content.map((b) => b.type)),
    );
    return NextResponse.json(
      { error: "empty_response", message: "No draft returned." },
      { status: 502 },
    );
  }

  let parsedOutput: GeneratorOutput;
  try {
    parsedOutput = GeneratorOutputSchema.parse(JSON.parse(textBlock.text));
  } catch (err) {
    return NextResponse.json(
      {
        error: "invalid_output",
        message: "Generator returned malformed JSON.",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 502 },
    );
  }

  const generateWebhook = process.env.GENERATE_WEBHOOK;
  if (generateWebhook) {
    const lead = {
      submitted_at: new Date().toISOString(),
      release_type: brief.release_type,
      property_name: brief.property_name || "",
      property_address: brief.property_address,
      city: brief.city,
      state: brief.state,
      property_type: brief.property_type,
      key_stat_value: brief.key_stat_value,
      key_stat_unit: brief.key_stat_unit,
      asking_price: brief.asking_price ?? "",
      broker_name: brief.broker_name,
      broker_title: brief.broker_title,
      firm_name: brief.firm_name,
      media_contact_name: brief.media_contact_name || "",
      media_contact_email: brief.media_contact_email || "",
      media_contact_phone: brief.media_contact_phone || "",
    };
    try {
      await fetch(generateWebhook, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(lead),
      });
    } catch (err) {
      console.error("generate_webhook_failed", err);
    }
  }

  return NextResponse.json(
    {
      ...parsedOutput,
      brief,
      rate_limit_remaining: limit.remaining,
    },
    { status: 200 },
  );
}
