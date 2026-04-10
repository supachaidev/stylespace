"""Image utilities: resize for cost reduction, hashing for cache keys."""

import hashlib
import io
from PIL import Image


def resize_image(image_bytes: bytes, max_size: int = 512) -> bytes:
    """Resize image so its longest side is at most max_size pixels. Returns JPEG bytes."""
    img = Image.open(io.BytesIO(image_bytes))
    if img.mode == "RGBA":
        img = img.convert("RGB")

    w, h = img.size
    if max(w, h) <= max_size:
        # Already small enough — just convert to JPEG
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=85)
        return buf.getvalue()

    ratio = max_size / max(w, h)
    new_w, new_h = int(w * ratio), int(h * ratio)
    img = img.resize((new_w, new_h), Image.LANCZOS)

    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85)
    return buf.getvalue()


def image_hash(image_bytes: bytes) -> str:
    """Return a short SHA-256 hex digest of image bytes."""
    return hashlib.sha256(image_bytes).hexdigest()[:16]
