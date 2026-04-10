"""
image_utils.py — Image Preprocessing Utilities
================================================

This module provides two utility functions used across the backend:

  1. resize_image() — Shrinks images before sending them to AI APIs
  2. image_hash()   — Creates short SHA-256 fingerprints for cache keys

Why resize images?
  AI API costs scale with input size. A 4000×3000 floor plan photo from a
  phone costs significantly more to process than a 512×384 version. Since
  Gemini and Claude don't need pixel-perfect resolution to understand a
  floor plan layout, we resize to a sensible maximum (512px for renders,
  1024px for room analysis) before sending.

  Typical savings:
    - Original: ~3MB JPEG → 512px: ~40KB JPEG
    - That's roughly 75x smaller input, which directly reduces API costs

Why hash images?
  We use the SHA-256 hash of the (resized) image bytes as part of the
  cache key. Combined with a hash of the style prompt, this uniquely
  identifies a specific render request so we can serve cached results
  instead of calling Gemini again.
"""

import hashlib
import io
from PIL import Image


def resize_image(image_bytes: bytes, max_size: int = 512) -> bytes:
    """
    Resize an image so its longest side is at most `max_size` pixels.

    The aspect ratio is preserved. The output is always JPEG at 85% quality,
    regardless of the input format. RGBA images (e.g., PNGs with transparency)
    are converted to RGB first since JPEG doesn't support alpha channels.

    Args:
        image_bytes: Raw bytes of the input image (any format Pillow supports)
        max_size:    Maximum dimension in pixels for the longest side

    Returns:
        JPEG-encoded bytes of the resized image.

    Example:
        A 4000×3000 image with max_size=512 becomes 512×384.
        A 400×300 image with max_size=512 stays 400×300 (just re-encoded as JPEG).
    """
    img = Image.open(io.BytesIO(image_bytes))

    # Convert RGBA → RGB (JPEG doesn't support transparency)
    if img.mode == "RGBA":
        img = img.convert("RGB")

    w, h = img.size
    if max(w, h) <= max_size:
        # Image is already small enough — just re-encode as JPEG
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=85)
        return buf.getvalue()

    # Calculate new dimensions preserving aspect ratio
    ratio = max_size / max(w, h)
    new_w, new_h = int(w * ratio), int(h * ratio)

    # LANCZOS is the highest-quality downsampling filter in Pillow
    img = img.resize((new_w, new_h), Image.LANCZOS)

    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85)
    return buf.getvalue()


def image_hash(image_bytes: bytes) -> str:
    """
    Return a short SHA-256 hex digest of the given bytes.

    Uses the first 16 hex characters (64 bits) of the full hash. This is
    enough to avoid collisions in practice for our use case (hundreds of
    images, not billions).

    Args:
        image_bytes: Raw bytes to hash (typically a resized image)

    Returns:
        A 16-character hex string (e.g., "a1b2c3d4e5f67890")
    """
    return hashlib.sha256(image_bytes).hexdigest()[:16]
