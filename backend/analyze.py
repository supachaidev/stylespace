"""
analyze.py — Floor Plan Room Detection via Claude Vision
=========================================================

This module uses Anthropic's Claude Vision (a multimodal AI / VLM) to
analyze a 2D floor plan image and extract structured room data.

How it works:
  1. The floor plan image is sent to Claude as a base64-encoded image
  2. Claude identifies each room (label, type, position, size)
  3. The response is parsed as JSON with bounding box coordinates
  4. Overlapping rooms are automatically fixed via `fix_overlaps()`

The coordinate system uses normalized fractions (0.0 to 1.0) where:
  - (0, 0) = top-left corner of the floor plan
  - (1, 1) = bottom-right corner
  - x/width = horizontal axis, y/depth = vertical axis

This normalized system means the frontend doesn't need to know the
actual pixel dimensions of the original image.

The output is consumed by:
  - The frontend (to display "N rooms detected: ...")
  - The /api/generate endpoint (to build a detailed prompt for Gemini)
"""

import anthropic
import base64
import json
import os
from dotenv import load_dotenv

load_dotenv()

# Initialize the Anthropic client with API key from .env
client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))

# ─── Prompt for Claude Vision ────────────────────────────────────────────────
#
# This prompt is carefully crafted to get Claude to:
#   1. Identify all rooms visible in the floor plan
#   2. Return precise bounding boxes in normalized coordinates
#   3. Ensure rooms tile together without gaps or overlaps
#   4. Use consistent color coding by room type
#   5. Always return English labels (even if the plan has Thai labels)
#
# The step-by-step process in the prompt helps Claude think methodically
# about room placement rather than guessing coordinates.

ANALYZE_PROMPT = """You are analyzing a 2D floor plan image to extract room bounding boxes for a 3D visualization.

COORDINATE SYSTEM:
- The image is a 1.0 × 1.0 grid.
- x=0.0 is the LEFT edge, x=1.0 is the RIGHT edge.
- y=0.0 is the TOP edge, y=1.0 is the BOTTOM edge.
- (x, y) is the TOP-LEFT corner of a room's bounding box.
- width extends RIGHT from x, depth extends DOWN from y.

STEP-BY-STEP PROCESS:
1. First, identify all rooms and their labels from the floor plan.
2. Mentally divide the floor plan into a grid. Think about which rooms are adjacent to which.
3. Place rooms so they TILE together like puzzle pieces — shared walls should have matching coordinates.
   For example, if Room A ends at x=0.5 (x=0.1, width=0.4), the room to its right should start at x=0.5.
4. CRITICAL: Rooms must NOT overlap. Check every pair. If room A occupies x=[0.1, 0.5] y=[0.0, 0.4] and room B occupies x=[0.3, 0.7] y=[0.2, 0.6], they overlap — fix this.
5. Rooms should collectively cover the entire floor plan area with minimal gaps.
6. Use increments of 0.05 for cleaner alignment.

Return ONLY valid JSON. No markdown, no explanation, no code fences.

{
  "rooms": [
    {
      "id": "room_1",
      "label": "Living Room",
      "type": "living",
      "x": 0.0,
      "y": 0.0,
      "width": 0.5,
      "depth": 0.4,
      "color": "#E8D5B7"
    }
  ],
  "total_rooms": 5
}

Room types: living, bedroom, kitchen, bathroom, dining, corridor, balcony, other
Colors: living=#E8D5B7, bedroom=#B7C4E8, kitchen=#E8E4B7, bathroom=#B7E8E4,
        dining=#E8C4B7, corridor=#D4D4D4, balcony=#C4E8B7, other=#E0E0E0

IMPORTANT: All room labels MUST be in English, even if the floor plan has labels in another language. Translate them."""


# ─── Overlap Correction ─────────────────────────────────────────────────────
#
# Even with careful prompting, Claude sometimes returns rooms that overlap
# slightly. This function iterates over every pair of rooms and shrinks
# the overlapping one along whichever axis has the smaller overlap.
#
# Example: if two rooms overlap by 0.05 horizontally and 0.15 vertically,
# we shrink the horizontal dimension (smaller fix = less visual distortion).
#
# The minimum room size is clamped to 0.05 to prevent rooms from
# disappearing entirely.

def fix_overlaps(rooms: list) -> list:
    """Shrink overlapping rooms so they don't intersect."""
    for i, a in enumerate(rooms):
        for b in rooms[i + 1:]:
            # Calculate bounding box edges for both rooms
            ax1, ay1 = a["x"], a["y"]
            ax2, ay2 = a["x"] + a["width"], a["y"] + a["depth"]
            bx1, by1 = b["x"], b["y"]
            bx2, by2 = b["x"] + b["width"], b["y"] + b["depth"]

            # Check if the two rectangles overlap (AABB intersection test)
            if ax1 < bx2 and ax2 > bx1 and ay1 < by2 and ay2 > by1:
                # They overlap — calculate overlap amount on each axis
                overlap_x = min(ax2 - bx1, bx2 - ax1)
                overlap_y = min(ay2 - by1, by2 - ay1)

                if overlap_x < overlap_y:
                    # Horizontal overlap is smaller → shrink along x-axis
                    if ax1 < bx1:
                        # Room A is to the left → shrink A's right edge
                        a["width"] = max(0.05, bx1 - ax1)
                    else:
                        # Room B is to the left → shrink B's right edge
                        b["width"] = max(0.05, ax1 - bx1)
                else:
                    # Vertical overlap is smaller → shrink along y-axis
                    if ay1 < by1:
                        a["depth"] = max(0.05, by1 - ay1)
                    else:
                        b["depth"] = max(0.05, ay1 - by1)
    return rooms


# ─── Fallback Data ───────────────────────────────────────────────────────────
#
# If Claude's response can't be parsed (malformed JSON, unexpected format),
# we return a single generic room covering most of the floor plan.
# This ensures the app never crashes — the user just sees one big room
# instead of a detailed breakdown.

FALLBACK = {
    "rooms": [{"id": "room_1", "label": "Room", "type": "other",
               "x": 0.1, "y": 0.1, "width": 0.8, "depth": 0.8,
               "color": "#E0E0E0"}],
    "total_rooms": 1
}


# ─── Main Analysis Function ─────────────────────────────────────────────────

async def analyze_rooms(image_bytes: bytes, mime_type: str = "image/jpeg") -> dict:
    """
    Send a floor plan image to Claude Vision and get back structured room data.

    Args:
        image_bytes: The floor plan image as raw bytes (already resized by caller)
        mime_type:   MIME type of the image (e.g., "image/jpeg")

    Returns:
        A dictionary with "rooms" (list of room objects) and "total_rooms" (int).
        Each room has: id, label, type, x, y, width, depth, color.
        Falls back to FALLBACK if parsing fails.
    """
    # Encode image as base64 for the Claude API
    b64 = base64.standard_b64encode(image_bytes).decode()

    # Call Claude Vision — send the image alongside the analysis prompt
    message = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=2500,
        messages=[{
            "role": "user",
            "content": [
                # The image comes first so Claude can "see" it before reading instructions
                {"type": "image", "source": {
                    "type": "base64", "media_type": mime_type, "data": b64
                }},
                {"type": "text", "text": ANALYZE_PROMPT}
            ]
        }]
    )

    try:
        raw = message.content[0].text.strip()

        # Sometimes Claude wraps JSON in ```json ... ``` code fences despite
        # being asked not to — strip them if present
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[1].rsplit("```", 1)[0].strip()

        data = json.loads(raw)

        # Post-processing: clamp all coordinates to valid range [0.0, 1.0]
        # and ensure rooms don't extend beyond the floor plan boundaries
        for room in data.get("rooms", []):
            for k in ["x", "y", "width", "depth"]:
                room[k] = max(0.0, min(1.0, float(room[k])))
            # Ensure room doesn't overflow the right/bottom edge
            if room["x"] + room["width"] > 1.0:
                room["width"] = 1.0 - room["x"]
            if room["y"] + room["depth"] > 1.0:
                room["depth"] = 1.0 - room["y"]

        # Return fallback if no rooms were detected
        if not data.get("rooms"):
            return FALLBACK

        # Fix any overlapping rooms before returning
        data["rooms"] = fix_overlaps(data["rooms"])

        return data
    except (json.JSONDecodeError, KeyError, IndexError):
        # If anything goes wrong with parsing, return the safe fallback
        return FALLBACK
