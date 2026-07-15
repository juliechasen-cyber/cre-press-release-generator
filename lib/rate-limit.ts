// In-memory rate limiter for v0.1. Fine for a single-instance Vercel deploy;
// swap for Upstash Redis or Vercel KV if the tool ever runs across regions.

const WINDOW_MS = 24 * 60 * 60 * 1000;
const LIMIT = 5;

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

export function checkRateLimit(ip: string): {
  ok: boolean;
  remaining: number;
  resetAt: number;
} {
  const now = Date.now();
  const existing = buckets.get(ip);

  if (!existing || existing.resetAt <= now) {
    const bucket = { count: 1, resetAt: now + WINDOW_MS };
    buckets.set(ip, bucket);
    return { ok: true, remaining: LIMIT - 1, resetAt: bucket.resetAt };
  }

  if (existing.count >= LIMIT) {
    return { ok: false, remaining: 0, resetAt: existing.resetAt };
  }

  existing.count += 1;
  return { ok: true, remaining: LIMIT - existing.count, resetAt: existing.resetAt };
}

export function getClientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  const real = request.headers.get("x-real-ip");
  if (real) return real.trim();
  return "unknown";
}
