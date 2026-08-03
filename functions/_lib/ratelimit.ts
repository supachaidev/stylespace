/**
 * ratelimit.ts — Per-IP request limiter backed by KV
 * ====================================================
 *
 * WAF rate limiting rules can't be attached to *.pages.dev (the zone belongs
 * to Cloudflare), so the public demo URL needs its own guard. This is a
 * coarse fixed-window counter: N requests per IP per minute, shared across
 * all AI endpoints, stored in the existing render-cache KV namespace.
 *
 * KV is eventually consistent, so a determined attacker rotating through
 * colos can exceed the limit somewhat — that's fine. The goal is to stop a
 * curl loop from burning API credit, not to be a precise quota system.
 * Counter keys expire automatically (TTL), so there is no cleanup to do.
 */

const WINDOW_SECONDS = 60;

/** Shared budget per IP per minute across all AI endpoints. A legitimate
 *  session (analyze + recommend + generate + restyle clicking) stays well
 *  under this; a script hammering /api/generate hits it in seconds. */
const LIMIT_PER_WINDOW = 30;

/**
 * Returns a 429 Response when the caller is over budget, or null to proceed.
 * Fails open: if KV is unavailable, the request goes through — better to
 * serve the demo than to block it on a limiter hiccup.
 */
export async function checkRateLimit(
  kv: KVNamespace,
  request: Request,
): Promise<Response | null> {
  try {
    const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
    const bucket = Math.floor(Date.now() / (WINDOW_SECONDS * 1000));
    const key = `rl_${ip}_${bucket}`;

    const current = Number(await kv.get(key)) || 0;
    if (current >= LIMIT_PER_WINDOW) {
      return Response.json(
        { error: 'Too many requests — please wait a minute and try again.' },
        { status: 429 },
      );
    }

    // Lost increments under concurrency are acceptable (coarse limiter).
    // TTL of 2 windows keeps expired buckets from accumulating.
    await kv.put(key, String(current + 1), { expirationTtl: WINDOW_SECONDS * 2 });
    return null;
  } catch {
    return null;
  }
}
