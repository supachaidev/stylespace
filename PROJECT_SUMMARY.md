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

**StyleSpace collapses that gap into a single web app.** A homeowner uploads a 2D floor plan, takes a 6-question lifestyle quiz, and within ~30 seconds sees a photorealistic 3D isometric of their space — **finished with real SCG SKUs**, complete with a per-room bill of materials, verified prices in THB, and clickable links back to the SCG retail page.

The render is positioned as **design inspiration applied to the customer's layout**, not a CAD-grade architectural model — an important distinction we lean into in the UI ("Design inspiration for your space"). What matters for the sales conversation is that the materials, the mood, and the BOM are real.

They can then restyle the *same* space in 6 different design looks (Modern Minimal, Japanese Zen, Industrial Loft, Scandinavian, Thai Contemporary, Luxury Modern) — every restyle re-recommends the SCG product mix to match.

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
  ┌──────────────┐   ┌──────────┐   ┌──────────────┐   ┌────────────┐   ┌────────────────────────┐
  │ Upload plan  │ → │   Quiz   │ → │   Analyze    │ → │ Recommend  │ → │   Render + Verify      │
  │  (JPG/PNG)   │   │ 6 Qs     │   │   rooms      │   │ SCG BOM    │   │  Gemini → Claude check │
  └──────────────┘   └──────────┘   └──────────────┘   └────────────┘   └────────────────────────┘
                                       Claude            Claude              │  retry once on
                                                                             │  low-fidelity score
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
| Vision/Reasoning | Anthropic `claude-sonnet-5` | Floor plan parsing + product picking |
| Image Generation | Google `gemini-2.5-flash-image` | Photorealistic isometric output |
| Frontend | TypeScript + Vite, no framework | ~1,900 LOC of plain DOM — fast, transparent, demo-safe |
| Image resize | Browser Canvas | No server-side Pillow needed |

**Operational footprint:** two API keys (`ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`), one KV namespace. That's it. `npm run deploy` ships it.

---

## 5. The AI Pipeline

Each render is the product of multiple sequenced AI calls, each cached.

### Call 1 — `/api/analyze` (Claude Vision)
Input: the customer's floor-plan image.
Output: structured JSON of every room — type, dimensions, normalized x/y/width/depth coordinates, a color swatch, and a wet/dry zone classification.
Has a built-in fallback so the UI never breaks on an unparseable plan. The prompt explicitly preserves the apartment's actual outline (L-shape, T-shape, irregular polygons) rather than flattening it into a rectangle.

### Call 2 — `/api/recommend` (Claude reasoning)
Input: the room list + the chosen style.
Output: a bill of materials drawn **only** from the curated SCG catalog. Claude returns:
- `picks[]` — sku, room_id, quantity, bilingual rationale
- `rationale_en` / `rationale_th` — overall design statement
- `material_summary` — a short paragraph that is **fed back into the render prompt** so the Gemini output visibly uses the chosen finishes (the marble on the floor isn't generic — it's the COTTO SKU Claude picked)

### Call 3 — `/api/generate` (Gemini → Claude Vision verify → optional retry)
The endpoint runs a 3-stage sub-pipeline rather than a single shot:

- **3a (Gemini):** generate the initial render. Instead of the raw floor plan, Gemini receives a **clean room schematic** rendered client-side (solid color blocks + labels on a neutral background, sized to the apartment's true aspect ratio). The schematic gives Gemini one unambiguous spatial signal instead of a noisy architectural drawing.
- **3b (Claude Vision verify):** Claude sees both the schematic and the render side by side and scores layout fidelity (room count, outline shape, missing rooms) as structured JSON.
- **3c (Gemini retry, conditional):** if the score is below threshold AND Claude flags it as retryable, Gemini regenerates **once** with the specific issues appended as corrective feedback ("L-shape was squared off into a rectangle", "entry hall missing", etc.). Verify failures are non-fatal — the original render ships if Claude can't be reached.

### Call 4 — `/api/restyle` (Gemini)
Input: the existing render + a new style prompt.
Output: the same layout rendered in a different design language. Same camera, same walls — different look. Cached so a returning user pays nothing to flip between styles.

**Cost envelope per fresh render:** ~$0.06–0.10 in API spend (verify pass adds ~$0.005; retry triggers maybe 1-in-3 fresh renders and adds ~$0.04). **Cached restyle: ~$0.**

**Why this architecture matters:** image-generation models like Gemini 2.5 Flash Image are excellent at materials, lighting, and mood, but weaker at *strict spatial constraints*. The schematic + verify-retry combination is how we extract the most layout fidelity available from the current generation of models without giving up the photorealism. Section 8 covers the path to higher layout accuracy as a follow-on milestone.

---

## 6. Polish That Will Show on Demo Day

Things already in the build that the CTO will notice:

- **Bilingual everywhere** — full TH/EN i18n on quiz, BOM, rationales, error states
- **Live price rescaling** — edit a room's m² and the BOM totals update without an API call
- **Style picker with thumbnails** — gradient previews before render, real swatches after
- **Custom "Made for You" style** — generated from quiz answers, not just a preset
- **Persistent render history** — KV-cached, shareable via `/api/share`
- **Theme toggle** — light/dark with current-theme icon
- **Mobile responsive** — overflow menus anchor correctly on small screens
- **Demo-safe error paths** — every endpoint has a fallback response

Layout-fidelity work (most recent push, on `layout-accuracy` branch):

- **Schematic-based layout anchoring** — `src/lib/annotate.ts` generates a clean color-block schematic from the analyze JSON and feeds it to Gemini as the reference image; the noisy original plan no longer competes for Gemini's attention
- **Coordinate-precise prompting** — `buildBasePrompt` emits exact normalized coordinates plus a 12×8 ASCII layout grid, cross-referenced by room marker `[1]`, `[2]`, …
- **Outline-preserving analyze prompt** — Claude is explicitly instructed to leave exterior space uncovered, so L-shaped apartments produce L-shaped schematics (no more rectangular flattening)
- **Verify-and-retry loop** — `buildVerifyPrompt` + the new 3-stage `generate.ts` (see Section 5, Call 3) catches the worst layout outliers automatically
- **Honest framing** — result page now leads with *"Design inspiration for your space"* in EN/TH, removing the false expectation of pixel-perfect plan reproduction

Recent commits:
```
layout-accuracy  Schematic generator + verify-and-retry layout fidelity loop
layout-accuracy  Send Gemini an annotated guide image and exact coords
layout-accuracy  Add PROJECT_SUMMARY.md for SCG CTO presentation
f7b9f19          use pnpm
5c866dc          Show current-theme icon on toggle
d6e2d64          Let users edit per-room m² and rescale BOM prices live
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

### Next major milestone

**1. CAD-grade layout fidelity via in-browser 3D extrusion (~2 weeks).**
Today the layout pipeline is *schematic → Gemini interpretation*. The next step is *schematic → deterministic Three.js scene → Gemini-textured surfaces*. We already extract a precise room schematic; extruding it into a real 3D scene in the browser (Three.js, all client-side) gives us layout truth by construction — every wall is in the right place because we put it there. Gemini's role narrows from "interpret a plan" to "generate a texture for this floor / wall / countertop", which is what image-gen models are actually good at. Expected accuracy jump: from today's ~70-80% layout match to ~95%+, with no per-request cost increase (textures are cached aggressively). This is the highest-leverage technical investment available and the right answer to *"can we trust this enough to send to a real dealer?"*

### Things the architecture already supports

2. **Showroom inventory hook** — swap the static `scg_catalog.json` for a live SCG inventory API; recommendations would filter by in-stock SKUs near the user's postal code.
3. **"Send to dealer" lead capture** — the BOM is already structured JSON; one webhook turns it into a qualified lead in SCG's CRM.
4. **Augmented catalog** — extend beyond the current 24 SKUs (currently floor tiles, sanitary, roofing, wall panels, paint) into furniture, lighting, and outdoor.
5. **Save & revisit** — Cloudflare D1 (already in the Cloudflare stack) for user accounts; KV is currently the only persistence.
6. **Render variants** — Gemini supports multi-output; show 3 versions per style and let the user pick the best.
7. **Style transfer from a reference photo** — the user uploads a Pinterest pin, Claude extracts style tags, Gemini renders the customer's space in that aesthetic.
8. **Layout-fidelity badge** — surface the Claude-Vision verify score on the result page ("Layout match: 92%") so users see when a render is high-confidence vs. inspiration-only.

---

## 9. Repository Tour (for the technical part of the meeting)

```
stylespace/
├── functions/
│   ├── api/
│   │   ├── analyze.ts       Claude Vision — floor plan → room JSON (outline-preserving)
│   │   ├── recommend.ts     Claude reasoning — rooms + style → SCG BOM
│   │   ├── generate.ts      Gemini render + Claude Vision verify + corrective retry
│   │   ├── restyle.ts       Gemini — redecorate same layout
│   │   └── share.ts         Public share links for renders
│   └── _lib/
│       ├── base64.ts        Workers-safe chunked base64
│       ├── cache.ts         KV cache layer
│       ├── catalog.ts       SCG catalog loader + product lookup
│       ├── env.ts           Typed bindings + secrets
│       ├── hash.ts          WebCrypto SHA-256
│       └── prompts.ts       All Claude/Gemini prompt templates (incl. verify)
├── src/
│   ├── main.ts              Upload, quiz, picker, history, i18n (~1,900 LOC)
│   ├── styles.ts            6 style presets + custom/random generators
│   ├── quiz.ts              6-question lifestyle quiz + scoring
│   ├── i18n.ts              TH/EN translations + reactive subscribers
│   ├── types.ts             Shared TypeScript interfaces
│   └── lib/
│       ├── resize.ts        Browser Canvas image resizer
│       └── annotate.ts      Schematic generator (color-block reference for Gemini)
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
