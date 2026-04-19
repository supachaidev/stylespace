/**
 * hash.ts — SHA-256 helpers via WebCrypto
 * ========================================
 *
 * Workers have no `crypto.createHash` (Node) but they do have WebCrypto's
 * `crypto.subtle.digest`, which is async. We use it to fingerprint images
 * and style prompts for the KV render cache.
 */

function bytesToHex(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, '0');
  }
  return out;
}

export async function sha256Hex(data: ArrayBuffer | Uint8Array | string, slice?: number): Promise<string> {
  const buf = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const hash = await crypto.subtle.digest('SHA-256', buf);
  const hex = bytesToHex(new Uint8Array(hash));
  return slice ? hex.slice(0, slice) : hex;
}
