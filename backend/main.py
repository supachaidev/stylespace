from fastapi import FastAPI, File, UploadFile, Form
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import base64 as b64mod
import json
import os
from dotenv import load_dotenv
from render import generate_base_render, restyle_render
from analyze import analyze_rooms
from image_utils import resize_image, image_hash
from cache import get_cached, set_cached

load_dotenv()
app = FastAPI(title="StyleSpace")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


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

        small_bytes = resize_image(image_bytes, max_size=512)
        img_hash = image_hash(small_bytes)

        cached = get_cached(img_hash, style_prompt)
        if cached:
            return {"render_url": f"data:image/png;base64,{cached}"}

        b64 = await generate_base_render(rooms, style_prompt, small_bytes, "image/jpeg")
        set_cached(img_hash, style_prompt, b64)
        return {"render_url": f"data:image/png;base64,{b64}"}
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})


@app.post("/api/restyle")
async def restyle_endpoint(
    base_image: str = Form(...),
    style_prompt: str = Form(...),
):
    """Restyle the base render into a different interior design style."""
    try:
        b64_data = base_image.split(",", 1)[1] if "," in base_image else base_image

        img_hash = image_hash(b64_data.encode()[:2048])
        cached = get_cached(f"restyle_{img_hash}", style_prompt)
        if cached:
            return {"render_url": f"data:image/png;base64,{cached}"}

        result_b64 = await restyle_render(b64_data, style_prompt)
        set_cached(f"restyle_{img_hash}", style_prompt, result_b64)
        return {"render_url": f"data:image/png;base64,{result_b64}"}
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})


# Serve built frontend in production
dist_path = os.path.join(os.path.dirname(__file__), "..", "frontend", "dist")
if os.path.exists(dist_path):
    app.mount("/", StaticFiles(directory=dist_path, html=True), name="static")
