# CRE Press Release Generator — v0.1

Next.js app that turns a short broker form into a wire-format press release, a
`.docx`, and an optional "email it to me" delivery.

Free for end users. Rate-limited to 5 drafts per IP per 24 hours to control LLM cost.

## Stack

- **Next.js 15** (App Router) on Node.js
- **Anthropic API** — Claude Sonnet 5 via `@anthropic-ai/sdk`, using
  `output_config.format` for structured JSON output
- **`docx`** — `.docx` composition with image above headline
- **Resend** — transactional email for the "Email it to me" flow, plus
  plain-text lead notifications
- **Zod** — form validation

## Files

```
02_build/
├── app/
│   ├── page.tsx                       # Server page → renders <Generator />
│   ├── layout.tsx
│   ├── globals.css
│   └── api/
│       ├── generate/route.ts          # POST — brief JSON → draft JSON
│       ├── render/route.ts            # POST — multipart → .docx
│       └── send-email/route.ts        # POST — multipart → transactional email
├── components/
│   └── Generator.tsx                  # Client component — the whole UX
├── lib/
│   ├── schema.ts                      # Zod + shared TS types + JSON Schema
│   ├── prompt.ts                      # System prompt (adapted from generator-prompt.md)
│   ├── render.ts                      # .docx renderer
│   ├── notify.ts                      # Plain-text lead notification via Resend
│   └── rate-limit.ts                  # In-memory 5/IP/24hr limiter
├── next.config.mjs
├── tsconfig.json
├── package.json
├── .env.example
└── README.md
```

## Setup

```sh
cd 02_build
cp .env.example .env.local
# Edit .env.local — see "Environment" below

npm install
npm run dev            # http://localhost:3000
```

## Environment

| Var | Required for | Notes |
|---|---|---|
| `ANTHROPIC_API_KEY` | generation | Get from console.anthropic.com |
| `RESEND_API_KEY` | email | Get from resend.com |
| `RESEND_FROM` | email | e.g. `drafts@crenorthstar.com` — must be a verified sender |
| `RESEND_REPLY_TO` | email | e.g. `hello@crenorthstar.com` |
| `NEXT_PUBLIC_SITE_URL` | attribution | Currently unused in v0.1 UI, reserved for footer link |
| `NOTIFY_EMAIL` | lead alerts | Optional. Plain-text notification on every generate and every email submit. Unset = no notification |
| `GENERATE_WEBHOOK` | lead capture | Optional Google Apps Script Web App URL, fired on a successful generate. Unset = silent no-op |
| `EMAIL_WEBHOOK` | lead capture | Optional Google Apps Script Web App URL, fired on "Email it to me". Unset = silent no-op |

The generate/render endpoints work without Resend. The "Email it to me" button
returns a friendly error until Resend is configured.

## What each endpoint does

### `POST /api/generate`

- Input: JSON body matching `UserBriefSchema` in `lib/schema.ts`
- Rate-limited per IP (5/24hr)
- Calls Claude Sonnet 5 with structured outputs
- Returns `{ draft_text, draft_html, image_placement_note, warnings, brief }`

### `POST /api/render`

- Input: `multipart/form-data` with `draft_text`, `format` (`docx` — the only
  supported format), `slug`, optional `image`, `image_orientation`, `image_credit`
- Returns the file bytes with `content-disposition: attachment`

### `POST /api/send-email`

- Input: `multipart/form-data` with `payload` (JSON) and optional `image`
- Renders the `.docx`, attaches it, sends via Resend
- Marketing subscribe (`subscribe_northstar`) is a **TODO** — see comment in
  route; wire this into whatever list system CRE Northstar uses

## Deploy to Vercel

```sh
npm install -g vercel
vercel                 # first-time setup
vercel --prod
```

Set the environment variables in the Vercel dashboard (Settings → Environment
Variables). `docx` is declared in `serverExternalPackages` in `next.config.mjs`
so it runs on the Node.js runtime.

## Rate limiting

The current implementation is **in-memory**, which is fine for a single
Vercel serverless instance but resets on cold starts and does not share state
across regions. For a real launch, swap `lib/rate-limit.ts` for:

- Vercel KV (`@vercel/kv`) — simplest given the deploy target
- Upstash Redis (`@upstash/ratelimit`) — battle-tested sliding window

Signature is one function; the change is ~15 lines.

## Not in v0.1

- Marketing email opt-in isn't wired to a real list system (TODO in
  `send-email/route.ts`)
- No captcha — rate limit is the only abuse control
- No i18n — English only
- No account / saved drafts / revision history
- No image auto-crop or advanced sizing beyond the landscape/portrait
  detection done client-side

## What lives where

- **Voice/style rules** — `lib/prompt.ts` mirrors `01_scope/output/generator-prompt.md`.
  When the scope doc changes, resync this file.
- **Form fields** — `lib/schema.ts` mirrors `01_scope/output/form-spec.md`.
- **Email copy** — `app/api/send-email/route.ts` mirrors
  `01_scope/output/email-flow.md`.

Keep those three pairs in sync as the spec evolves.
