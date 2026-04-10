"""
render.py — Gemini Image Generation for Interior Design Renders
================================================================

This module handles all image generation via Google's Gemini multimodal AI.
It provides two distinct generation modes:

  1. generate_base_render() — Floor Plan → First 3D Render
     Takes a 2D floor plan image + room data + style description and produces
     a photorealistic isometric 3D cutaway rendering. This is the "expensive"
     first call that interprets the floor plan layout.

  2. restyle_render() — Existing Render → New Style
     Takes an already-generated render and transforms it into a different
     interior design style. This is faster and cheaper because Gemini only
     needs to change materials/furniture/colors — not re-interpret the
     floor plan from scratch.

Why two functions instead of one?
  Regenerating from the floor plan for every style change would be:
  - Slower (Gemini needs to understand the layout each time)
  - More expensive (larger input = more tokens)
  - Less consistent (room positions might shift between renders)

  The restyle approach solves all three problems by reusing the base render
  as a visual reference, so Gemini only needs to "redecorate" the rooms.

Model used: gemini-2.5-flash-image (fast image generation with good quality)
"""

from google import genai
import base64
import os
from dotenv import load_dotenv

load_dotenv()

# Initialize the Gemini client with API key from .env
client = genai.Client(api_key=os.getenv("GOOGLE_API_KEY"))


# ─── Prompt Builder for Base Render ──────────────────────────────────────────
#
# This function converts the structured room data from Claude into a
# human-readable description that helps Gemini understand the layout.
#
# For each room, we describe:
#   - Its label (e.g., "Living Room")
#   - Its relative size (small/medium/large based on area)
#   - Its position in the floor plan (e.g., "top-left", "bottom-center")
#
# This textual description, combined with the actual floor plan image,
# gives Gemini enough context to generate an accurate 3D render.

def build_base_prompt(room_data: dict, style_prompt: str) -> str:
    """
    Build a detailed prompt for Gemini's first render generation.

    Args:
        room_data:    The room analysis result from Claude (dict with "rooms" list)
        style_prompt: The interior design style description (e.g., "modern minimalist...")

    Returns:
        A formatted string prompt ready to send to Gemini.
    """
    rooms = room_data.get("rooms", [])
    total = len(rooms)

    room_descriptions = []
    for room in rooms:
        x = room["x"]
        y = room["y"]
        w = room["width"]
        d = room["depth"]

        # Determine horizontal position based on room center
        h_pos = "left" if x + w / 2 < 0.35 else "right" if x + w / 2 > 0.65 else "center"
        # Determine vertical position based on room center
        v_pos = "top" if y + d / 2 < 0.35 else "bottom" if y + d / 2 > 0.65 else "middle"
        # Classify size based on area (fraction of total floor plan)
        size = "large" if w * d > 0.1 else "small" if w * d < 0.04 else "medium"

        room_descriptions.append(
            f"- {room['label']} ({size}, at {v_pos}-{h_pos} of the plan)"
        )

    room_list = "\n".join(room_descriptions)

    return f"""Generate a photorealistic isometric 3D cutaway rendering of this apartment floor plan.

The apartment has exactly {total} rooms:
{room_list}

INTERIOR DESIGN STYLE:
{style_prompt}

REQUIREMENTS:
- Isometric view from above at a 45-degree angle, no roof, all rooms visible.
- Show exactly {total} rooms matching the floor plan layout — no more, no less.
- Add furniture appropriate to each room type.
- Professional architectural rendering, high quality, detailed.
- The layout must match the original floor plan."""


# ─── Base Render Generation ──────────────────────────────────────────────────

async def generate_base_render(room_data: dict, style_prompt: str, image_bytes: bytes, mime_type: str = "image/jpeg") -> str:
    """
    Generate a photorealistic 3D render from a floor plan image.

    This is the first render in the pipeline. It takes the actual floor plan
    image as input so Gemini can match the room layout precisely.

    Args:
        room_data:    Room analysis from Claude (used to build the text prompt)
        style_prompt: Interior design style description for Gemini
        image_bytes:  The floor plan image (already resized to 512px by caller)
        mime_type:    MIME type of the image

    Returns:
        Base64-encoded PNG string of the generated render (no data URL prefix).

    Raises:
        ValueError: If Gemini doesn't return an image in its response.
    """
    prompt = build_base_prompt(room_data, style_prompt)

    # Send both the text prompt and the floor plan image to Gemini
    response = client.models.generate_content(
        model="gemini-2.5-flash-image",
        contents=[
            prompt,
            # Attach the floor plan image as binary data
            genai.types.Part.from_bytes(data=image_bytes, mime_type=mime_type),
        ],
        config=genai.types.GenerateContentConfig(
            # Request both IMAGE and TEXT modalities — Gemini may include
            # explanatory text alongside the generated image
            response_modalities=["IMAGE", "TEXT"],
        ),
    )

    # Extract the generated image from the response parts
    for part in response.candidates[0].content.parts:
        if part.inline_data and part.inline_data.mime_type.startswith("image/"):
            return base64.b64encode(part.inline_data.data).decode()

    raise ValueError("Gemini did not return an image.")


# ─── Restyle Render ──────────────────────────────────────────────────────────

async def restyle_render(base_image_b64: str, style_prompt: str) -> str:
    """
    Transform an existing render into a different interior design style.

    Unlike generate_base_render(), this function takes an already-rendered
    image (not a floor plan) and asks Gemini to change only the style
    while preserving the exact room layout and camera angle.

    Args:
        base_image_b64: Base64-encoded PNG of the existing render
        style_prompt:   The new interior design style to apply

    Returns:
        Base64-encoded PNG string of the restyled render (no data URL prefix).

    Raises:
        ValueError: If Gemini doesn't return an image in its response.
    """
    # Decode the base64 string back to raw bytes for the API
    base_image_bytes = base64.b64decode(base_image_b64)

    # The restyle prompt explicitly tells Gemini to keep the layout unchanged
    # and only modify the interior design elements
    prompt = f"""Transform this interior design rendering into a different style.
Keep the EXACT same room layout, camera angle, and room positions. Do NOT change the architecture or room arrangement.
Only change the interior design style: walls, floors, furniture, lighting, and decor.

NEW STYLE:
{style_prompt}

RULES:
- Keep the same isometric camera angle and room positions exactly as shown.
- Replace all furniture, wall colors, floor materials, and decorations to match the new style.
- Every room must remain in the same position and size.
- The result should look like the same apartment redesigned by a different interior designer."""

    response = client.models.generate_content(
        model="gemini-2.5-flash-image",
        contents=[
            prompt,
            # Send the existing render as the reference image
            genai.types.Part.from_bytes(data=base_image_bytes, mime_type="image/png"),
        ],
        config=genai.types.GenerateContentConfig(
            response_modalities=["IMAGE", "TEXT"],
        ),
    )

    # Extract the restyled image from the response
    for part in response.candidates[0].content.parts:
        if part.inline_data and part.inline_data.mime_type.startswith("image/"):
            return base64.b64encode(part.inline_data.data).decode()

    raise ValueError("Gemini did not return an image.")
