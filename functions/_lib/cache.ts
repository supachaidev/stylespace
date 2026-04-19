/**
 * cache.ts — KV-backed Render Cache
 * ==================================
 *
 * Replaces the Python file-based cache. Pages Functions are stateless and
 * ephemeral, so disk writes would be lost between requests. Cloudflare KV
 * is the natural fit: eventually-consistent, cheap, and edge-local reads.
 *
 * Key format: `{image_hash}_{prompt_hash}`
 *   - image_hash  = first 16 chars of SHA-256 of the (resized) image bytes
 *   - prompt_hash = first 12 chars of SHA-256 of the style prompt string
 *
 * Values are raw base64 PNG strings (no `data:` prefix).
 *
 * KV value limit is 25 MB — far larger than any render we produce (~200 KB
 * as base64). Writes are eventually consistent, reads are fast at the edge.
 */

import { sha256Hex } from './hash';

async function cacheKey(imageHash: string, stylePrompt: string): Promise<string> {
  const promptHash = await sha256Hex(stylePrompt, 12);
  return `${imageHash}_${promptHash}`;
}

export async function getCached(
  kv: KVNamespace,
  imageHash: string,
  stylePrompt: string
): Promise<string | null> {
  const key = await cacheKey(imageHash, stylePrompt);
  return kv.get(key);
}

export async function setCached(
  kv: KVNamespace,
  imageHash: string,
  stylePrompt: string,
  b64Data: string
): Promise<void> {
  const key = await cacheKey(imageHash, stylePrompt);
  await kv.put(key, b64Data);
}
