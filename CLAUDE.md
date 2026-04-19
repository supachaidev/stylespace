# CLAUDE.md — StyleSpace
# Project: "All in" × SCG | Bangkok University Senior Project

## 🎯 Project Overview
Upload a 2D floor plan → take a quick lifestyle quiz → get a photorealistic
isometric render → restyle the same layout in other interior-design looks.
Deployed entirely on Cloudflare.

## 🏗 Architecture (Cloudflare-only)

```
Browser (Vite bundle on Cloudflare Pages)
    │
    │  fetch /api/analyze  ─┐
    │  fetch /api/generate ─┼─▶  Cloudflare Pages Functions (Workers)
    │  fetch /api/restyle  ─┘         │
    │                                 ├─▶  Anthropic (@anthropic-ai/sdk)
    │                                 ├─▶  Google Gemini (@google/genai)
    │                                 └─▶  Cloudflare KV (STYLESPACE_RENDER_CACHE)
```

- **Pages**: static hosting for the Vite-built frontend (`dist/`)
- **Pages Functions**: `functions/api/*.ts` run as Workers for /api/* routes
- **KV**: `STYLESPACE_RENDER_CACHE` stores base64 PNGs keyed by `{imageHash}_{promptHash}`
- **Secrets**: `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY` via `wrangler pages secret put`

There is no separate backend server. Everything runs on Cloudflare.

---

## 📁 Project Structure

```
stylespace/
├── functions/
│   ├── api/
│   │   ├── analyze.ts       # POST /api/analyze  — Claude Vision
│   │   ├── generate.ts      # POST /api/generate — Gemini, first render
│   │   └── restyle.ts       # POST /api/restyle  — Gemini, redecorate
│   └── _lib/
│       ├── base64.ts        # Chunked base64 ↔ Uint8Array (Workers-safe)
│       ├── cache.ts         # KV render cache
│       ├── env.ts           # Env type (bindings + secrets)
│       ├── hash.ts          # WebCrypto SHA-256 helper
│       └── prompts.ts       # All Claude/Gemini prompt text
├── src/
│   ├── main.ts              # Upload flow, quiz, picker, history, i18n
│   ├── styles.ts            # Style presets + custom/random generators
│   ├── quiz.ts              # 6-question lifestyle quiz data + scoring
│   ├── i18n.ts              # TH/EN translation table + subscribers
│   ├── types.ts             # Shared TypeScript interfaces
│   └── lib/resize.ts        # Canvas-based image resize (replaces Pillow)
├── public/                  # Static assets (favicon, etc.)
├── index.html               # Vite entry
├── style.css
├── vite.config.ts
├── tsconfig.json            # Frontend config
├── tsconfig.functions.json  # Workers runtime config
├── wrangler.toml            # Pages + KV binding + nodejs_compat flag
└── package.json             # Unified: frontend deps + Anthropic/Gemini SDKs
```

---

## 🔑 Environment Variables

Local development (`.dev.vars` — gitignored):
```
ANTHROPIC_API_KEY=...
GOOGLE_API_KEY=...
```

Production:
```bash
npx wrangler pages secret put ANTHROPIC_API_KEY
npx wrangler pages secret put GOOGLE_API_KEY
```

---

## 🛠 Tech Stack

| Layer | Technology | Notes |
|---|---|---|
| Hosting | Cloudflare Pages | Serves Vite `dist/` statically |
| API | Pages Functions (Workers) | File-based routing under `functions/api/` |
| Cache | Cloudflare KV | Binding name: `STYLESPACE_RENDER_CACHE` |
| Room Analysis | Anthropic `claude-sonnet-4-20250514` | Via `@anthropic-ai/sdk` |
| Image Generation | Gemini `gemini-2.5-flash-image` | Via `@google/genai` |
| Frontend | TypeScript + Vite + ESM | No framework; manual DOM |
| Compat flag | `nodejs_compat` | Needed by the Anthropic SDK |

---

## 🧩 API Contracts

### `POST /api/analyze`
Body: `multipart/form-data` with `file` (resized to 1024px by the browser).
Returns:
```json
{
  "rooms": [{ "id":"room_1","label":"Living Room","type":"living",
              "x":0.0,"y":0.0,"width":0.5,"depth":0.4,"color":"#E8D5B7" }],
  "total_rooms": 5
}
```
On parse failure, returns a single-room FALLBACK so the UI never breaks.

### `POST /api/generate`
Body: `multipart/form-data` with `file` (resized to 512px), `style_prompt`, `room_data`.
Returns `{ "render_url": "data:image/png;base64,..." }`.
Cached in KV at `sha256(image)_sha256(stylePrompt)`.

### `POST /api/restyle`
Body: `multipart/form-data` with `base_image` (data URL of an existing render), `style_prompt`.
Returns `{ "render_url": "data:image/png;base64,..." }`.
Cached in KV at `restyle_sha256(image-fingerprint)_sha256(stylePrompt)`.

Error responses (all endpoints): `{ "error": "..." }` with a non-2xx status.

---

## 🏃 How to Run

### Development:
```bash
npm install
cp .dev.vars.example .dev.vars   # fill in API keys
npx wrangler kv namespace create STYLESPACE_RENDER_CACHE
npx wrangler kv namespace create STYLESPACE_RENDER_CACHE --preview
# Paste the ids into wrangler.toml
npm run dev                       # → http://localhost:3000
```

`npm run dev` runs Vite and `wrangler pages dev` in parallel via `concurrently`:
- Vite on port 3000 serves the frontend with HMR and proxies `/api/*` to wrangler
- Wrangler on port 8788 runs the Functions in `functions/api/*.ts` via Miniflare

### Production:
```bash
npx wrangler pages secret put ANTHROPIC_API_KEY
npx wrangler pages secret put GOOGLE_API_KEY
npm run deploy                    # builds, then wrangler pages deploy
```

---

## ⚠️ Critical Constraints

- No FastAPI, no Python, no Pillow. Everything runs in the Workers runtime.
- No `any` types — everything must be properly typed.
- Anthropic SDK: `@anthropic-ai/sdk` (requires `nodejs_compat` compat flag).
- Gemini SDK: `@google/genai` (the new unified SDK — NOT `@google/generative-ai`).
- Claude model must be `claude-sonnet-4-20250514`.
- Gemini model must be `gemini-2.5-flash-image`.
- Image resize happens **in the browser** via Canvas (`src/lib/resize.ts`).
- Cache lives in **KV only** — do not reintroduce a disk cache. Pages Functions are ephemeral.
- Hashing: use WebCrypto `crypto.subtle.digest('SHA-256', …)`, not Node `crypto`.
- Base64 of large PNGs must use the chunked helpers in `functions/_lib/base64.ts`
  (plain `String.fromCharCode(...bytes)` overflows the argument-count stack).
- `npm run check` must pass both tsconfigs with zero errors before demo day.

---

## 🧪 Test Commands

```bash
# Typecheck both the frontend and the Functions
npm run check

# Smoke-test a Function locally (wrangler must be running via `npm run dev`)
curl -X POST http://localhost:8788/api/analyze \
  -F "file=@sample_plans/test.jpg" | python3 -m json.tool
```

---

## 🎯 Demo Success Criteria

- [ ] Upload floor plan → analyze + generate complete within ~30s
- [ ] Style picker shows all presets; clicking restyles the base render
- [ ] Cached styles switch instantly (no API call)
- [ ] TH/EN toggle re-renders all visible text
- [ ] `npm run build` and `npm run check` pass with zero errors
- [ ] No crashes or console errors during the demo flow
