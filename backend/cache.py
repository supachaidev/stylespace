"""Simple file-based cache for Gemini render results."""

import hashlib
import os

CACHE_DIR = os.path.join(os.path.dirname(__file__), ".cache")


def _ensure_dir() -> None:
    os.makedirs(CACHE_DIR, exist_ok=True)


def _cache_key(image_hash: str, style_prompt: str) -> str:
    prompt_hash = hashlib.sha256(style_prompt.encode()).hexdigest()[:12]
    return f"{image_hash}_{prompt_hash}"


def get_cached(image_hash: str, style_prompt: str) -> str | None:
    """Return cached base64 render string, or None if not cached."""
    key = _cache_key(image_hash, style_prompt)
    path = os.path.join(CACHE_DIR, f"{key}.b64")
    if os.path.exists(path):
        with open(path, "r") as f:
            return f.read()
    return None


def set_cached(image_hash: str, style_prompt: str, b64_data: str) -> None:
    """Store a base64 render string in cache."""
    _ensure_dir()
    key = _cache_key(image_hash, style_prompt)
    path = os.path.join(CACHE_DIR, f"{key}.b64")
    with open(path, "w") as f:
        f.write(b64_data)
