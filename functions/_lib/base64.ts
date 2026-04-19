/**
 * base64.ts — Base64 ↔ Bytes helpers
 * ====================================
 *
 * Workers support `btoa`/`atob`, but passing a large image through
 * `String.fromCharCode(...bytes)` blows the argument-count stack. We chunk
 * instead. `nodejs_compat` also exposes `Buffer`, but keeping this
 * dependency-free avoids a compat flag for the browser-style functions.
 */

const CHUNK = 0x8000; // 32 KiB — safely under the spread-args limit

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const slice = bytes.subarray(i, i + CHUNK);
    binary += String.fromCharCode.apply(null, slice as unknown as number[]);
  }
  return btoa(binary);
}

export function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

/** Strip a `data:image/png;base64,` prefix if present. */
export function stripDataUrlPrefix(dataUrlOrB64: string): string {
  const comma = dataUrlOrB64.indexOf(',');
  return comma >= 0 && dataUrlOrB64.startsWith('data:') ? dataUrlOrB64.slice(comma + 1) : dataUrlOrB64;
}
