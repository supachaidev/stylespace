/**
 * ratelimit.ts — Per-IP request limiter backed by the Cache API
 * ==============================================================
 *
 * WAF rate limiting rules can't be attached to *.pages.dev (the zone belongs
 * to Cloudflare), so the public demo URL needs its own guard. This is a
 * coarse fixed-window counter: N requests per IP per minute, shared across
 * all AI endpoints.
 *
 * Why the Cache API and not KV: KV caches reads at the edge for up to 60s,
 * so a read-modify-write counter never climbs under rapid fire (verified
 * empirically — 36 back-to-back requests never tripped a KV-based limit).
 * caches.default is colo-local and consistent for sequential requests, which
 * is exactly the attack shape (one machine hammering = one colo). Each colo
 * counts separately, so a distributed attacker gets N/min per colo — fine;
 * the goal is stopping a curl loop from burning API credit, not building a
 * precise global quota system.
 */

const WINDOW_SECONDS = 60;

/** Shared budget per IP per minute across all AI endpoints. A legitimate
 *  session (analyze + recommend + generate + restyle clicking) stays well
 *  under this; a script hammering /api/generate hits it in seconds. */
const LIMIT_PER_WINDOW = 30;

/**
 * Returns a 429 Response when the caller is over budget, or null to proceed.
 * Fails open: if the cache is unavailable, the request goes through — better
 * to serve the demo than to block it on a limiter hiccup.
 */
export async function checkRateLimit(request: Request): Promise<Response | null> {
  try {
    const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
    const bucket = Math.floor(Date.now() / (WINDOW_SECONDS * 1000));
    // Synthetic URL — never fetched, purely a cache key. Bucket in the path
    // gives each window a fresh counter; old ones age out via max-age.
    const key = new Request(`https://rate-limit.internal/${encodeURIComponent(ip)}/${bucket}`);

    const cache = caches.default;
    const hit = await cache.match(key);
    const current = hit ? Number(await hit.text()) || 0 : 0;

    if (current >= LIMIT_PER_WINDOW) {
      return Response.json(
        { error: 'Too many requests — please wait a minute and try again.' },
        { status: 429 },
      );
    }

    // Lost increments under true concurrency are acceptable (coarse limiter).
    await cache.put(key, new Response(String(current + 1), {
      headers: { 'Cache-Control': `max-age=${WINDOW_SECONDS * 2}` },
    }));
    return null;
  } catch {
    return null;
  }
}
