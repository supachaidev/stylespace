/**
 * vite.config.ts — Vite Development & Build Configuration
 * =========================================================
 *
 * Vite is the frontend build tool for this project. It provides:
 *   - Instant HMR (Hot Module Replacement) during development
 *   - TypeScript compilation (via esbuild, no tsc needed for dev)
 *   - Production bundling with tree-shaking and minification
 *
 * Development setup:
 *   - Frontend dev server runs on port 3000
 *   - API requests (/api/*) are proxied to FastAPI on port 8000
 *   - This means the frontend can call fetch('/api/analyze') and
 *     Vite transparently forwards it to http://localhost:8000/api/analyze
 *
 * Production:
 *   - `npm run build` outputs to frontend/dist/
 *   - FastAPI serves dist/ as static files (see backend/main.py)
 *   - No proxy needed because everything runs on the same origin
 */

import { defineConfig } from 'vite'

export default defineConfig({
  // Use the current directory as the root (where index.html lives)
  root: '.',

  build: {
    outDir: 'dist',       // Output directory for production build
    emptyOutDir: true,     // Clean the output directory before building
  },

  server: {
    port: 3000,  // Frontend dev server port

    proxy: {
      // Special proxy config for the render-all SSE endpoint (if used)
      // Disables response buffering so Server-Sent Events stream correctly
      '/api/render-all': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('proxyRes', (proxyRes) => {
            proxyRes.headers['cache-control'] = 'no-cache';
            proxyRes.headers['x-accel-buffering'] = 'no';
          });
        },
      },

      // Default proxy: forward all /api/* requests to FastAPI
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    }
  }
})
