from google import genai
import base64
import os
from dotenv import load_dotenv

load_dotenv()

client = genai.Client(api_key=os.getenv("GOOGLE_API_KEY"))


def build_base_prompt(room_data: dict, style_prompt: str) -> str:
    rooms = room_data.get("rooms", [])
    total = len(rooms)

    room_descriptions = []
    for room in rooms:
        x = room["x"]
        y = room["y"]
        w = room["width"]
        d = room["depth"]

        h_pos = "left" if x + w / 2 < 0.35 else "right" if x + w / 2 > 0.65 else "center"
        v_pos = "top" if y + d / 2 < 0.35 else "bottom" if y + d / 2 > 0.65 else "middle"
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


async def generate_base_render(room_data: dict, style_prompt: str, image_bytes: bytes, mime_type: str = "image/jpeg") -> str:
    """Generate a render from the floor plan in the given style. Returns base64 PNG."""
    prompt = build_base_prompt(room_data, style_prompt)
    response = client.models.generate_content(
        model="gemini-2.5-flash-image",
        contents=[
            prompt,
            genai.types.Part.from_bytes(data=image_bytes, mime_type=mime_type),
        ],
        config=genai.types.GenerateContentConfig(
            response_modalities=["IMAGE", "TEXT"],
        ),
    )
    for part in response.candidates[0].content.parts:
        if part.inline_data and part.inline_data.mime_type.startswith("image/"):
            return base64.b64encode(part.inline_data.data).decode()
    raise ValueError("Gemini did not return an image.")


async def restyle_render(base_image_b64: str, style_prompt: str) -> str:
    """Restyle an existing render image into a different interior design style. Returns base64 PNG."""
    base_image_bytes = base64.b64decode(base_image_b64)

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
            genai.types.Part.from_bytes(data=base_image_bytes, mime_type="image/png"),
        ],
        config=genai.types.GenerateContentConfig(
            response_modalities=["IMAGE", "TEXT"],
        ),
    )
    for part in response.candidates[0].content.parts:
        if part.inline_data and part.inline_data.mime_type.startswith("image/"):
            return base64.b64encode(part.inline_data.data).decode()
    raise ValueError("Gemini did not return an image.")
