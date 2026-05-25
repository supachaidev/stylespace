# StyleSpace

**Upload a floor plan. Get a photorealistic isometric render styled with real SCG products — in under a minute.**

A Bangkok University senior project built in partnership with **SCG ("All in" × SCG)**.
Live demo deployed entirely on Cloudflare. No servers, no Python, no Docker.

---

## 1. The Pitch (in 30 seconds)

Today, an SCG customer planning a renovation has to:

1. Find a designer or browse a showroom.
2. Imagine what COTTO tiles, SCG roofing, or SmartBoard will look like in *their* home.
3. Hope the colors and textures actually match.

**StyleSpace collapses that gap into a single web app.** A homeowner uploads a 2D floor plan, takes a 6-question lifestyle quiz, and within ~30 seconds sees their floor plan rendered as a photorealistic 3D isometric — **already finished with real SCG SKUs**, complete with a per-room bill of materials, verified prices in THB, and clickable links back to the SCG retail page.

They can then restyle the *same* layout in 6 different design looks (Modern Minimal, Japanese Zen, Industrial Loft, Scandinavian, Thai Contemporary, Luxury Modern) — every restyle re-recommends the SCG product mix to match.

For SCG, every render is a **personalized product catalog** for a specific customer's home.

---

## 2. Why This Matters to SCG

| Problem SCG faces today | What StyleSpace does |
|---|---|
| Customers can't visualize products in their own space | Renders the customer's *actual floor plan* with SCG materials applied |
| Catalogs are static, generic, and overwhelming | Generates a personalized BOM — 5–15 SKUs scoped to the rooms in the plan |
| No direct path from inspiration → purchase | Every product card links back to its HomePro / OneStockHome / COTTO Life page |
| Hard to demonstrate range across brands | A single render touches COTTO tiles + SCG roofing + SCG SmartBoard + paint partners (TOA, BEGER) |
| Style preferences are hard to capture from a sales conversation | The lifestyle quiz produces an explicit style fingerprint, ranked by % match |

**Catalog status:** `data/scg_catalog.json` ships with **24 real SKUs** — 17 COTTO, 5 SCG, 1 TOA, 1 BEGER. **18 of 24** have prices verified directly against the retailer's live page; the rest are clearly flagged as mid-market estimates. Every entry has a `source_url` for audit.

---

## 3. The User Flow

```
  ┌──────────────┐   ┌──────────┐   ┌──────────────┐   ┌────────────┐   ┌──────────────┐
  │ Upload plan  │ → │   Quiz   │ → │   Analyze    │ → │ Recommend  │ → │   Render     │
  │  (JPG/PNG)   │   │ 6 Qs     │   │   rooms      │   │ SCG BOM    │   │  isometric   │
  └──────────────┘   └──────────┘   └──────────────┘   └────────────┘   └──────────────┘
                                       Claude            Claude             Gemini
                                                                              │
                                                                              ▼
                                                                      ┌──────────────┐
                                                                      │   Restyle    │
                                                                      │  in 6 looks  │
                                                                      └──────────────┘
                                                                          Gemini
```

**End result on screen:**
- Photorealistic isometric render of the customer's floor plan
- Per-room area in m² (editable — BOM prices rescale live)
- Bill of materials with brand, SKU, qty, THB price, "why this product" rationale
- Style picker showing the other 5 looks (cached: switching is instant)
- TH / EN toggle on everything

---

## 4. Architecture

**Stack: 100% Cloudflare. Zero traditional servers.**

```
Browser (Vite-built TS bundle)
    │
    │  /api/analyze   ─┐
    │  /api/recommend ─┤
    │  /api/generate  ─┼─▶  Cloudflare Pages Functions (Workers runtime)
    │  /api/restyle   ─┤         │
    │  /api/share     ─┘         ├─▶  Anthropic Claude Sonnet 4  (vision + reasoning)
    │                            ├─▶  Google Gemini 2.5 Flash    (image generation)
    │                            └─▶  Cloudflare KV  (render + BOM cache)
```

| Layer | Tech | Why |
|---|---|---|
| Hosting | Cloudflare Pages | Global CDN, zero cold-start, free tier covers the demo |
| Compute | Pages Functions (Workers) | File-based routing — `functions/api/*.ts` |
| Cache | Cloudflare KV | Keyed by `sha256(image)_sha256(prompt)` — instant re-renders |
| Vision/Reasoning | Anthropic `claude-sonnet-4-20250514` | Floor plan parsing + product picking |
| Image Generation | Google `gemini-2.5-flash-image` | Photorealistic isometric output |
| Frontend | TypeScript + Vite, no framework | ~1,900 LOC of plain DOM — fast, transparent, demo-safe |
| Image resize | Browser Canvas | No server-side Pillow needed |

**Operational footprint:** two API keys (`ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`), one KV namespace. That's it. `npm run deploy` ships it.

---

## 5. The 4-Call AI Pipeline

Each render is the product of four sequenced AI calls, each cached.

### Call 1 — `/api/analyze` (Claude Vision)
Input: the customer's floor-plan image.
Output: structured JSON of every room — type, dimensions, normalized x/y/width/depth coordinates, a color swatch, and a wet/dry zone classification.
Has a built-in fallback so the UI never breaks on an unparseable plan.

### Call 2 — `/api/recommend` (Claude reasoning)
Input: the room list + the chosen style.
Output: a bill of materials drawn **only** from the curated SCG catalog. Claude returns:
- `picks[]` — sku, room_id, quantity, bilingual rationale
- `rationale_en` / `rationale_th` — overall design statement
- `material_summary` — a short paragraph that is **fed back into the render prompt** so the Gemini output visibly uses the chosen finishes (the marble on the floor isn't generic — it's the COTTO SKU Claude picked)

### Call 3 — `/api/generate` (Gemini)
Input: floor plan image + style prompt + room data + the material summary from Call 2.
Output: photorealistic isometric PNG.

### Call 4 — `/api/restyle` (Gemini)
Input: the existing render + a new style prompt.
Output: the same layout rendered in a different design language. Same camera, same walls — different look. Cached so a returning user pays nothing to flip between styles.

**Cost envelope per fresh render:** ~$0.05–0.10 in API spend. **Cached restyle: ~$0.**

---

## 6. Polish That Will Show on Demo Day

Things already in main that the CTO will notice:

- **Bilingual everywhere** — full TH/EN i18n on quiz, BOM, rationales, error states
- **Live price rescaling** — edit a room's m² and the BOM totals update without an API call
- **Style picker with thumbnails** — gradient previews before render, real swatches after
- **Custom "Made for You" style** — generated from quiz answers, not just a preset
- **Persistent render history** — KV-cached, shareable via `/api/share`
- **Theme toggle** — light/dark with current-theme icon
- **Mobile responsive** — overflow menus anchor correctly on small screens
- **Demo-safe error paths** — every endpoint has a fallback response

Recent commits (last week):
```
f7b9f19 use pnpm
5c866dc Show current-theme icon on toggle
d6e2d64 Let users edit per-room m² and rescale BOM prices live
a6b28f9 Anchor result overflow menu left on mobile
77b83cc Tighten result actions and add quiz back, BOM toggle, render zoom
```

---

## 7. What's Real vs. What's Mocked

| Component | Status |
|---|---|
| Floor plan analysis | **Real** — live Claude Vision call |
| SCG product catalog | **Real** — 24 SKUs, 18 prices verified against retailer pages |
| Product recommendation | **Real** — live Claude reasoning over the catalog |
| Render generation | **Real** — live Gemini 2.5 Flash Image |
| Style restyle | **Real** — live Gemini call, KV cached |
| Prices | THB, sourced from HomePro / OneStockHome / COTTO Life / Thaiwatsadu (2026-05-01) |

Nothing in the demo path is a mock.

---

## 8. Roadmap — What I'd Build Next With SCG

Things the architecture already supports, just not built yet:

1. **Showroom inventory hook** — swap the static `scg_catalog.json` for a live SCG inventory API; recommendations would filter by in-stock SKUs near the user's postal code.
2. **"Send to dealer" lead capture** — the BOM is already structured JSON; one webhook turns it into a qualified lead in SCG's CRM.
3. **Augmented catalog** — extend beyond the current 24 SKUs (currently floor tiles, sanitary, roofing, wall panels, paint) into furniture, lighting, and outdoor.
4. **Save & revisit** — Cloudflare D1 (already in the Cloudflare stack) for user accounts; KV is currently the only persistence.
5. **Render variants** — Gemini supports multi-output; show 3 versions per style and let the user pick.
6. **Style transfer from a reference photo** — the user uploads a Pinterest pin, Claude extracts style tags, Gemini renders the floor plan in that aesthetic.

---

## 9. Repository Tour (for the technical part of the meeting)

```
stylespace/
├── functions/
│   ├── api/
│   │   ├── analyze.ts       Claude Vision — floor plan → room JSON
│   │   ├── recommend.ts     Claude reasoning — rooms + style → SCG BOM
│   │   ├── generate.ts      Gemini — first photorealistic render
│   │   ├── restyle.ts       Gemini — redecorate same layout
│   │   └── share.ts         Public share links for renders
│   └── _lib/
│       ├── base64.ts        Workers-safe chunked base64
│       ├── cache.ts         KV cache layer
│       ├── catalog.ts       SCG catalog loader + product lookup
│       ├── env.ts           Typed bindings + secrets
│       ├── hash.ts          WebCrypto SHA-256
│       └── prompts.ts       All Claude/Gemini prompt templates
├── src/
│   ├── main.ts              Upload, quiz, picker, history, i18n (~1,900 LOC)
│   ├── styles.ts            6 style presets + custom/random generators
│   ├── quiz.ts              6-question lifestyle quiz + scoring
│   ├── i18n.ts              TH/EN translations + reactive subscribers
│   ├── types.ts             Shared TypeScript interfaces
│   └── lib/resize.ts        Browser Canvas image resizer
├── data/
│   └── scg_catalog.json     24 real SKUs, 18 with verified prices
├── index.html
├── style.css
├── wrangler.toml            KV binding + nodejs_compat flag
└── package.json
```

**Quality bar:** `npm run check` typechecks both the frontend (`tsconfig.json`) and the Workers (`tsconfig.functions.json`) with zero errors. No `any` types. No dead code.

---

## 10. One-line Summary for the Slide

> *StyleSpace turns any 2D floor plan into a photorealistic 3D render finished with real SCG products — giving every SCG customer a personalized catalog of their own home.*
