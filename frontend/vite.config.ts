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
      '/api/render-all': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        // Disable buffering for SSE
        configure: (proxy) => {
          proxy.on('proxyRes', (proxyRes) => {
            // Force chunked transfer so the proxy doesn't buffer
            proxyRes.headers['cache-control'] = 'no-cache';
            proxyRes.headers['x-accel-buffering'] = 'no';
          });
        },
      },
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    }
  }
})
