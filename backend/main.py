"""
main.py — FastAPI Application Entry Point
==========================================

This is the central server for the StyleSpace application. It exposes three
API endpoints that power the floor-plan-to-interior-design pipeline:

  1. POST /api/analyze   → Detect rooms from a floor plan image (Claude Vision)
  2. POST /api/generate  → Generate the first 3D render from a floor plan + style
  3. POST /api/restyle   → Transform an existing render into a different style

Architecture overview:
  ┌─────────┐   /api/analyze    ┌──────────┐
  │ Browser │ ────────────────▶ │ Claude   │  (room detection)
  │         │   /api/generate   │ Vision   │
  │         │ ────────────────▶ ├──────────┤
  │         │                   │ Gemini   │  (image generation)
  │         │   /api/restyle    │ Flash    │
  │         │ ────────────────▶ │          │
  └─────────┘                   └──────────┘

Cost optimization strategies used here:
  - Input images are resized before sending to AI APIs (smaller = cheaper)
  - Generated renders are cached on disk so repeated requests are free
  - The "restyle" approach reuses a single base render instead of regenerating
    from scratch for each style, cutting Gemini calls significantly

In production, this server also serves the built frontend (Vite dist/) as
static files, so only one process needs to run.
"""

from fastapi import FastAPI, File, UploadFile, Form
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import base64 as b64mod
import json
import os
from dotenv import load_dotenv

# Internal modules (each handles one concern)
from render import generate_base_render, restyle_render  # Gemini image generation
from analyze import analyze_rooms                         # Claude Vision room detection
from image_utils import resize_image, image_hash          # Pillow resize + SHA-256
from cache import get_cached, set_cached                  # File-based render cache

# Load environment variables from .env file (API keys live there)
load_dotenv()

# Create the FastAPI application instance
app = FastAPI(title="StyleSpace")

# Allow all origins so the Vite dev server (port 3000) can talk to FastAPI (port 8000).
# In production this is fine because both are served from the same origin.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── Endpoint 1: Analyze Floor Plan ──────────────────────────────────────────
#
# Receives a floor plan image and returns structured JSON describing each room
# (label, type, bounding box coordinates). This data is used by:
#   - The frontend to show "3 rooms detected: Living Room, Bedroom, Kitchen"
#   - The /api/generate endpoint to tell Gemini what rooms exist and where
#
# The image is resized to 1024px (larger than render input) because room
# detection needs more detail to read labels and identify boundaries.

@app.post("/api/analyze")
async def analyze_endpoint(file: UploadFile = File(...)):
    """Analyze floor plan rooms only — no image generation."""
    try:
        image_bytes = await file.read()
        # Resize to 1024px for analysis (needs more detail than rendering)
        small_bytes = resize_image(image_bytes, max_size=1024)
        return await analyze_rooms(small_bytes, "image/jpeg")
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})


# ─── Endpoint 2: Generate First Render ───────────────────────────────────────
#
# This is the "expensive" call — it sends the floor plan image + room data +
# style description to Gemini and gets back a photorealistic 3D render.
#
# Flow:
#   1. Resize the uploaded floor plan to 512px (cost optimization)
#   2. Hash the resized image → used as part of the cache key
#   3. Check if we already have a cached render for this image + style
#   4. If not cached, call Gemini to generate a new render
#   5. Cache the result for future requests
#
# The response is a data URL (data:image/png;base64,...) that the browser
# can display directly in an <img> tag without any additional downloads.

@app.post("/api/generate")
async def generate_endpoint(
    file: UploadFile = File(...),
    style_prompt: str = Form(...),
    room_data: str = Form(...),
):
    """Generate first render from floor plan image + style. Returns render as data URL."""
    try:
        image_bytes = await file.read()
        rooms = json.loads(room_data)

        # Resize to 512px — smaller image = lower API cost, and Gemini
        # doesn't need high resolution to understand the floor plan layout
        small_bytes = resize_image(image_bytes, max_size=512)
        img_hash = image_hash(small_bytes)

        # Check disk cache first — avoids redundant Gemini calls entirely
        cached = get_cached(img_hash, style_prompt)
        if cached:
            return {"render_url": f"data:image/png;base64,{cached}"}

        # No cache hit — generate a fresh render via Gemini
        b64 = await generate_base_render(rooms, style_prompt, small_bytes, "image/jpeg")

        # Store in cache for next time
        set_cached(img_hash, style_prompt, b64)

        return {"render_url": f"data:image/png;base64,{b64}"}
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})


# ─── Endpoint 3: Restyle Existing Render ─────────────────────────────────────
#
# Instead of regenerating from the floor plan for every style change, this
# endpoint takes an existing render and transforms it into a new style.
# This is faster and cheaper because Gemini only needs to change materials,
# furniture, and colors — not re-interpret the floor plan from scratch.
#
# IMPORTANT: The base image is sent at FULL resolution (not resized).
# Earlier we tried resizing to 512px here too, but it degraded the output
# quality significantly. Since this is image-to-image (not floor-plan-to-image),
# Gemini needs the full detail of the original render to produce good results.
#
# The base_image arrives as a data URL from the frontend. We strip the
# "data:image/png;base64," prefix before processing.

@app.post("/api/restyle")
async def restyle_endpoint(
    base_image: str = Form(...),
    style_prompt: str = Form(...),
):
    """Restyle the base render into a different interior design style."""
    try:
        # Strip the data URL prefix if present (e.g., "data:image/png;base64,...")
        b64_data = base_image.split(",", 1)[1] if "," in base_image else base_image

        # Use first 2048 bytes of the base64 string as a fingerprint for caching.
        # We don't need to hash the entire image — just enough to identify it.
        img_hash = image_hash(b64_data.encode()[:2048])

        # Check cache — prefix with "restyle_" to separate from generate cache
        cached = get_cached(f"restyle_{img_hash}", style_prompt)
        if cached:
            return {"render_url": f"data:image/png;base64,{cached}"}

        # Call Gemini to restyle the render (full-size, no resize!)
        result_b64 = await restyle_render(b64_data, style_prompt)

        # Cache for future requests
        set_cached(f"restyle_{img_hash}", style_prompt, result_b64)

        return {"render_url": f"data:image/png;base64,{result_b64}"}
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})


# ─── Static File Serving (Production) ────────────────────────────────────────
#
# In production, `npm run build` outputs the frontend to frontend/dist/.
# This block mounts that directory so FastAPI serves the SPA directly.
# In development, Vite's dev server handles the frontend instead (port 3000),
# and proxies /api/* requests to FastAPI (port 8000) via vite.config.ts.

dist_path = os.path.join(os.path.dirname(__file__), "..", "frontend", "dist")
if os.path.exists(dist_path):
    app.mount("/", StaticFiles(directory=dist_path, html=True), name="static")
