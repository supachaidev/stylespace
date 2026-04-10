# StyleSpace

**"All in" x SCG | Bangkok University Senior Project 2026**

Upload a 2D floor plan and instantly explore it in different interior design styles — powered by AI.

## How It Works

1. **Upload** a floor plan image (JPG, PNG)
2. **AI analyzes** the rooms using Claude (Anthropic)
3. **Base render** is generated in Modern Minimal style using Gemini (Google)
4. **Pick a style** — the base render is restyled while keeping the same room layout
5. **Compare styles** — cached results let you switch instantly between generated styles

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
| Backend | FastAPI (Python) |
| Room Analysis | Claude Sonnet (Anthropic) |
| Image Generation | Gemini 2.5 Flash (Google) |
| Frontend | TypeScript + Vite |

## Project Structure

```
floorplan-3d/
├── backend/
│   ├── main.py            # FastAPI endpoints
│   ├── analyze.py          # Claude Vision room detection
│   ├── render.py           # Gemini image generation + restyling
│   └── requirements.txt
├── frontend/
│   ├── index.html
│   ├── style.css
│   ├── vite.config.ts
│   └── src/
│       ├── main.ts         # Upload flow, style picker, history
│       ├── styles.ts       # Style presets + SCG product mapping
│       └── types.ts        # Shared TypeScript interfaces
└── README.md
```

## Setup

### Prerequisites

- Python 3.11+
- Node.js 18+
- API keys for [Anthropic](https://console.anthropic.com/) and [Google AI](https://aistudio.google.com/)

### Install

```bash
# Backend
cd backend
pip install -r requirements.txt
cp .env.example .env
# Add your ANTHROPIC_API_KEY and GOOGLE_API_KEY to .env

# Frontend
cd ../frontend
npm install
```

### Run (Development)

```bash
# Terminal 1 — Backend
cd backend
uvicorn main:app --reload --port 8000

# Terminal 2 — Frontend
cd frontend
npm run dev
```

Open http://localhost:3000

### Build (Production)

```bash
cd frontend && npm run build
cd ../backend
uvicorn main:app --port 8000
# Serves frontend/dist/ as static files
```

## API Endpoints

| Method | Path | Description |
|---|---|---|
| POST | `/api/process` | Analyze rooms + generate base render |
| POST | `/api/restyle` | Restyle base render into a new style |
| POST | `/api/analyze` | Analyze rooms only |
| POST | `/api/render` | Generate single style render |
