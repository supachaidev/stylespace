import anthropic
import base64
import json
import os
from dotenv import load_dotenv

load_dotenv()
client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))

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

def fix_overlaps(rooms: list) -> list:
    """Shrink overlapping rooms so they don't intersect."""
    for i, a in enumerate(rooms):
        for b in rooms[i + 1:]:
            # Check overlap
            ax1, ay1 = a["x"], a["y"]
            ax2, ay2 = a["x"] + a["width"], a["y"] + a["depth"]
            bx1, by1 = b["x"], b["y"]
            bx2, by2 = b["x"] + b["width"], b["y"] + b["depth"]

            if ax1 < bx2 and ax2 > bx1 and ay1 < by2 and ay2 > by1:
                # They overlap — find the smallest adjustment
                overlap_x = min(ax2 - bx1, bx2 - ax1)
                overlap_y = min(ay2 - by1, by2 - ay1)

                if overlap_x < overlap_y:
                    # Push horizontally
                    if ax1 < bx1:
                        a["width"] = max(0.05, bx1 - ax1)
                    else:
                        b["width"] = max(0.05, ax1 - bx1)
                else:
                    # Push vertically
                    if ay1 < by1:
                        a["depth"] = max(0.05, by1 - ay1)
                    else:
                        b["depth"] = max(0.05, ay1 - by1)
    return rooms


FALLBACK = {
    "rooms": [{"id": "room_1", "label": "Room", "type": "other",
               "x": 0.1, "y": 0.1, "width": 0.8, "depth": 0.8,
               "color": "#E0E0E0"}],
    "total_rooms": 1
}


async def analyze_rooms(image_bytes: bytes, mime_type: str = "image/jpeg") -> dict:
    b64 = base64.standard_b64encode(image_bytes).decode()
    message = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=2500,
        messages=[{
            "role": "user",
            "content": [
                {"type": "image", "source": {
                    "type": "base64", "media_type": mime_type, "data": b64
                }},
                {"type": "text", "text": ANALYZE_PROMPT}
            ]
        }]
    )
    try:
        raw = message.content[0].text.strip()
        # Strip markdown code fences if present
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[1].rsplit("```", 1)[0].strip()
        data = json.loads(raw)
        for room in data.get("rooms", []):
            for k in ["x", "y", "width", "depth"]:
                room[k] = max(0.0, min(1.0, float(room[k])))
            # Clamp so rooms don't exceed bounds
            if room["x"] + room["width"] > 1.0:
                room["width"] = 1.0 - room["x"]
            if room["y"] + room["depth"] > 1.0:
                room["depth"] = 1.0 - room["y"]
        if not data.get("rooms"):
            return FALLBACK
        data["rooms"] = fix_overlaps(data["rooms"])
        return data
    except (json.JSONDecodeError, KeyError, IndexError):
        return FALLBACK
