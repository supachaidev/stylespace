/**
 * vite.config.ts — Vite Development & Build Configuration
 * =========================================================
 *
 * Vite handles the frontend (TypeScript → bundle). API routes live in
 * `functions/` and run on Cloudflare Workers via `wrangler pages dev`.
 *
 * Development setup (two processes started together by `npm run dev`):
 *   - Vite dev server on port 3000 serves the frontend with HMR and
 *     proxies /api/* to wrangler on 8788.
 *   - `wrangler pages dev` on port 8788 runs the Pages Functions in
 *     `functions/api/*.ts` locally via Miniflare.
 *   - Open http://localhost:3000 in the browser.
 *
 * Production (Cloudflare Pages):
 *   - `npm run build` → outputs to `dist/`
 *   - Pages serves `dist/` statically and invokes `functions/api/*` as
 *     Workers for /api/* routes. Single origin, no CORS needed.
 */

import { defineConfig } from 'vite'

export default defineConfig({
  root: '.',

  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },

  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:8788',
        changeOrigin: true,
      },
    },
  },
})
