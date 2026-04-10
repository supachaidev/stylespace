"""
cache.py — File-Based Cache for Gemini Render Results
======================================================

This module implements a simple disk-based cache that stores Gemini's
generated renders as base64-encoded text files. This avoids redundant
(and expensive) API calls when the same floor plan + style combination
is requested multiple times.

How it works:
  - Each cached render is stored as a .b64 file in the backend/.cache/ directory
  - The filename is derived from: SHA-256(image) + SHA-256(style_prompt)
  - On a cache hit, we return the stored base64 string directly
  - On a cache miss, the caller generates a new render and stores it here

Cache key structure:
  {image_hash}_{prompt_hash}.b64

  Where:
  - image_hash  = first 16 chars of SHA-256 of the resized image bytes
  - prompt_hash = first 12 chars of SHA-256 of the style prompt string

Why file-based instead of Redis/Memcached?
  - This is a demo/competition project — simplicity over scalability
  - No extra infrastructure to set up or manage
  - Cache persists across server restarts (unlike in-memory)
  - Each render is ~200KB as base64 text, which is fine for disk

The .cache/ directory is created automatically on first write and is
excluded from git via .gitignore.
"""

import hashlib
import os

# Cache directory lives alongside the backend code
CACHE_DIR = os.path.join(os.path.dirname(__file__), ".cache")


def _ensure_dir() -> None:
    """Create the cache directory if it doesn't exist yet."""
    os.makedirs(CACHE_DIR, exist_ok=True)


def _cache_key(image_hash: str, style_prompt: str) -> str:
    """
    Build a unique cache key from an image hash and style prompt.

    The style prompt is hashed separately so that the same floor plan
    with different styles gets different cache entries.

    Args:
        image_hash:   A short hex digest of the image (from image_utils.image_hash)
        style_prompt: The full style description text

    Returns:
        A string like "a1b2c3d4e5f67890_1a2b3c4d5e6f" suitable as a filename.
    """
    prompt_hash = hashlib.sha256(style_prompt.encode()).hexdigest()[:12]
    return f"{image_hash}_{prompt_hash}"


def get_cached(image_hash: str, style_prompt: str) -> str | None:
    """
    Look up a cached render result.

    Args:
        image_hash:   Short hex digest identifying the input image
        style_prompt: The style description used for this render

    Returns:
        The base64-encoded render string if found, or None if not cached.
    """
    key = _cache_key(image_hash, style_prompt)
    path = os.path.join(CACHE_DIR, f"{key}.b64")
    if os.path.exists(path):
        with open(path, "r") as f:
            return f.read()
    return None


def set_cached(image_hash: str, style_prompt: str, b64_data: str) -> None:
    """
    Store a render result in the cache.

    Args:
        image_hash:   Short hex digest identifying the input image
        style_prompt: The style description used for this render
        b64_data:     The base64-encoded PNG string to cache
    """
    _ensure_dir()
    key = _cache_key(image_hash, style_prompt)
    path = os.path.join(CACHE_DIR, f"{key}.b64")
    with open(path, "w") as f:
        f.write(b64_data)
