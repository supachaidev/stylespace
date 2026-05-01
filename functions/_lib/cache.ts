/**
 * cache.ts — KV-backed Render Cache
 * ==================================
 *
 * Replaces the Python file-based cache. Pages Functions are stateless and
 * ephemeral, so disk writes would be lost between requests. Cloudflare KV
 * is the natural fit: eventually-consistent, cheap, and edge-local reads.
 *
 * Key format: `{image_hash}_{prompt_hash}[_{materials_hash}]`
 *   - image_hash     = first 16 chars of SHA-256 of the (resized) image bytes
 *   - prompt_hash    = first 12 chars of SHA-256 of the style prompt string
 *   - materials_hash = first 12 chars of SHA-256 of the BOM material summary
 *                      (only present once a recommend BOM is in play, so a
 *                      product swap forces a re-render without invalidating
 *                      the no-BOM render)
 *
 * Values are raw base64 PNG strings (no `data:` prefix).
 *
 * KV value limit is 25 MB — far larger than any render we produce (~200 KB
 * as base64). Writes are eventually consistent, reads are fast at the edge.
 */

import { sha256Hex } from './hash';

async function cacheKey(imageHash: string, stylePrompt: string, materialSummary?: string): Promise<string> {
  const promptHash = await sha256Hex(stylePrompt, 12);
  const base = `${imageHash}_${promptHash}`;
  if (!materialSummary) return base;
  const materialsHash = await sha256Hex(materialSummary, 12);
  return `${base}_${materialsHash}`;
}

export async function getCached(
  kv: KVNamespace,
  imageHash: string,
  stylePrompt: string,
  materialSummary?: string,
): Promise<string | null> {
  const key = await cacheKey(imageHash, stylePrompt, materialSummary);
  return kv.get(key);
}

export async function setCached(
  kv: KVNamespace,
  imageHash: string,
  stylePrompt: string,
  b64Data: string,
  materialSummary?: string,
): Promise<void> {
  const key = await cacheKey(imageHash, stylePrompt, materialSummary);
  await kv.put(key, b64Data);
}
