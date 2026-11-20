import { createHash, createHmac, timingSafeEqual } from "node:crypto";

// Proves a draft came from /api/generate, so /api/send-email can't be used to
// mail arbitrary content. The key is derived from the server-only Anthropic key.
function signingKey(): Buffer {
  const secret = process.env.ANTHROPIC_API_KEY;
  if (!secret) throw new Error("ANTHROPIC_API_KEY is not set");
  return createHash("sha256").update(`draft-signature:${secret}`).digest();
}

export function signDraft(draftText: string): string {
  return createHmac("sha256", signingKey()).update(draftText).digest("hex");
}

export function verifyDraft(draftText: string, signature: unknown): boolean {
  if (typeof signature !== "string" || !/^[0-9a-f]{64}$/.test(signature)) return false;
  const expected = Buffer.from(signDraft(draftText), "hex");
  return timingSafeEqual(expected, Buffer.from(signature, "hex"));
}
