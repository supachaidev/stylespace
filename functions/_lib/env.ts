/**
 * env.ts — Shared Env Binding Type
 * =================================
 *
 * Pages Functions receive bindings via the `env` arg. This type mirrors
 * wrangler.toml and the secrets we set with `wrangler pages secret put`.
 */

export interface Env {
  ANTHROPIC_API_KEY: string;
  GOOGLE_API_KEY: string;
  STYLESPACE_RENDER_CACHE: KVNamespace;
}
