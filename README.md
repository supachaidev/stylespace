# StyleSpace

**"All in" x SCG | Bangkok University Senior Project 2026**

Upload a 2D floor plan and instantly explore it in different interior design styles — powered by AI. Deployed entirely on Cloudflare.

## How It Works

1. **Upload** a floor plan image (JPG, PNG)
2. **AI analyzes** the rooms using Claude (Anthropic)
3. **SCG products are recommended** for each room by Claude, picked from the SCG catalog
4. **Base render** is generated in your custom style using Gemini (Google)
5. **Pick a style** — the base render is restyled while keeping the same room layout
6. **Compare styles** — cached results let you switch instantly between generated styles

## Styles

| Style | Description | SCG Products |
|---|---|---|
| Modern Minimal | Clean lines, neutral palette | White Paint, Matte Tile, Cement Board |
| Japanese Zen | Natural wood, earth tones | Cream Paint, Wood Plank Tile, Bamboo Board |
| Industrial Loft | Concrete, exposed elements | Concrete Paint, Cement Board, Charcoal Tile |
| Scandinavian | Bright, cozy, light wood | White Paint, Oak Wood Tile, Warm Gray Paint |
| Thai Contemporary | Teak, terracotta, tropical | Terracotta Tile, Teak Paint, Gold Trim |
| Luxury Modern | Marble, dark accents, gold | Marble Tile, Charcoal Paint, Gold Molding |

## Tech Stack

| Layer | Technology |
|---|---|
| Hosting | Cloudflare Pages |
| API | Cloudflare Pages Functions (Workers runtime) |
| Cache | Cloudflare KV (`STYLESPACE_RENDER_CACHE`) |
| Room Analysis + Recommendations | Claude Sonnet 5 — `claude-sonnet-5` (`@anthropic-ai/sdk`) |
| Image Generation | Gemini 3.1 Flash Image — `gemini-3.1-flash-image` (`@google/genai`) |
| Frontend | TypeScript + Vite |

## Project Structure

```
stylespace/
├── functions/
│   ├── api/
│   │   ├── analyze.ts      # POST /api/analyze   (Claude Vision)
│   │   ├── recommend.ts    # POST /api/recommend (Claude — SCG bill of materials)
│   │   ├── generate.ts     # POST /api/generate  (Gemini — first render, Claude check)
│   │   ├── restyle.ts      # POST /api/restyle   (Gemini — restyle)
│   │   └── share.ts        # POST/GET /api/share (shareable result links)
│   └── _lib/
│       ├── base64.ts       # Chunked base64 ↔ bytes (Workers-safe)
│       ├── cache.ts        # KV render cache
│       ├── catalog.ts      # SCG product catalog accessors
│       ├── env.ts          # Env bindings type
│       ├── formdata.ts     # Typed FormData helpers
│       ├── hash.ts         # WebCrypto SHA-256
│       ├── json.ts         # Tolerant JSON parsing of model output
│       ├── prompts.ts      # All Claude/Gemini prompt text
│       └── ratelimit.ts    # Per-IP rate limiter
├── src/
│   ├── main.ts             # Upload flow, quiz, style picker, history
│   ├── styles.ts           # Style presets + SCG product mapping
│   ├── quiz.ts             # 6-question lifestyle quiz
│   ├── i18n.ts             # TH/EN translations
│   ├── types.ts            # Shared TypeScript interfaces
│   └── lib/resize.ts       # Client-side image resize via Canvas
├── data/scg_catalog.json   # SCG products (SKUs, prices, source URLs)
├── index.html
├── style.css
├── vite.config.ts
├── tsconfig.json           # Frontend
├── tsconfig.functions.json # Workers runtime
├── wrangler.toml           # Pages + KV binding
└── package.json
```

## Setup

### Prerequisites

- Node.js 18+
- Cloudflare account (Workers Paid plan recommended for Gemini latency)
- API keys for [Anthropic](https://console.anthropic.com/) and [Google AI](https://aistudio.google.com/)

### Install

```bash
npm install
cp .dev.vars.example .dev.vars
# Add your ANTHROPIC_API_KEY and GOOGLE_API_KEY to .dev.vars
```

### Create the KV namespace

```bash
npx wrangler kv namespace create STYLESPACE_RENDER_CACHE
npx wrangler kv namespace create STYLESPACE_RENDER_CACHE --preview
```

Paste the returned `id` and `preview_id` into `wrangler.toml`.

### Run (Development)

```bash
npm run dev
```

This runs Vite and `wrangler pages dev` in parallel:
- Vite serves the frontend on **port 3000** with HMR and proxies `/api/*` to wrangler
- Wrangler serves the Pages Functions in `functions/api/*` on port 8788
- Open http://localhost:3000

### Deploy

```bash
# One-time: push your secrets to Pages
npx wrangler pages secret put ANTHROPIC_API_KEY
npx wrangler pages secret put GOOGLE_API_KEY

# Deploy
npm run deploy
```

## API Endpoints

| Method | Path | Description |
|---|---|---|
| POST | `/api/analyze` | Analyze rooms from a floor plan image |
| POST | `/api/recommend` | Pick SCG products for each room (bill of materials) |
| POST | `/api/generate` | Generate first render from floor plan + style |
| POST | `/api/restyle` | Restyle an existing render into a new style |
| POST / GET | `/api/share` | Save a result, or load it from a share link |

## API Costs

Estimated per user, based on the prompt and image sizes (not measured from billing):

| Step | Model | Approx. cost |
|---|---|---|
| Analyze + recommend + render check | Claude Sonnet 5 ($2 / $10 per 1M input / output tokens) | $0.08–0.12 |
| First render | Gemini 3.1 Flash Image ($0.067 per 1K image) | ~$0.07 |
| **Full run** | | **~$0.15–0.19 (≈ ฿5–6)** |
| Each new style | Gemini 3.1 Flash Image | ~$0.07 |
| Cached style | — (served from KV) | free |

Prices from [Claude API pricing](https://platform.claude.com/docs/en/about-claude/pricing) and [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing), checked September 2026.
