/**
 * ratelimit.ts — Per-IP request limiter (isolate-local memory)
 * =============================================================
 *
 * WAF rate limiting rules can't be attached to *.pages.dev (the zone belongs
 * to Cloudflare), so the public demo URL needs its own guard. This is a
 * coarse fixed-window counter: N requests per IP per minute, shared across
 * all AI endpoints.
 *
 * Why plain module state, third time lucky (both verified empirically with
 * 36 back-to-back requests):
 *   - KV never trips — reads are edge-cached for up to 60s, so a
 *     read-modify-write counter never climbs under rapid fire.
 *   - The Cache API is a silent no-op on *.pages.dev domains — match()
 *     always misses; it only functions on custom domains.
 * Module-level state lives in the isolate, which persists across requests
 * on the same edge server. That matches the attack shape exactly: a script
 * hammering the API from one machine lands on the same isolate. The counter
 * resets when the isolate recycles and isn't shared across colos — fine;
 * the goal is stopping a curl loop from burning API credit, not building a
 * precise global quota system. A distributed attack calls for Durable
 * Objects or a custom domain + WAF rule instead.
 */

const WINDOW_SECONDS = 60;

/** Shared budget per IP per minute across all AI endpoints. A legitimate
 *  session (analyze + recommend + generate + restyle clicking) stays well
 *  under this; a script hammering /api/generate hits it in seconds. */
const LIMIT_PER_WINDOW = 30;

/** Guard against unbounded growth if the isolate lives long under wide
 *  traffic — prune stale windows once the map gets large. */
const MAX_TRACKED_IPS = 10_000;

const counters = new Map<string, { bucket: number; count: number }>();

/** Returns a 429 Response when the caller is over budget, or null to proceed. */
export function checkRateLimit(request: Request): Response | null {
  const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
  const bucket = Math.floor(Date.now() / (WINDOW_SECONDS * 1000));

  const entry = counters.get(ip);
  if (!entry || entry.bucket !== bucket) {
    if (counters.size >= MAX_TRACKED_IPS) {
      for (const [k, v] of counters) {
        if (v.bucket !== bucket) counters.delete(k);
      }
    }
    counters.set(ip, { bucket, count: 1 });
    return null;
  }

  entry.count++;
  if (entry.count > LIMIT_PER_WINDOW) {
    return Response.json(
      { error: 'Too many requests — please wait a minute and try again.' },
      { status: 429 },
    );
  }
  return null;
}
