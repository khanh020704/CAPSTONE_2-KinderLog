import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // In dev the FE calls same-origin /api and /uploads; Vite forwards them to the NestJS backend (no CORS needed).
  const target = env.VITE_BACKEND_URL || 'http://localhost:3000'
  return {
    plugins: [react()],
    build: {
      // Video and chart libraries are only needed on some screens; keep them out of the main bundle.
      rollupOptions: { output: { manualChunks: { charts: ['recharts'] } } },
      // recharts is one vendor chunk (~150 kB gzip) loaded alongside the app; 600 kB is above it on purpose.
      chunkSizeWarningLimit: 600,
    },
    server: {
      proxy: {
        '/api': { target, changeOrigin: true },
        '/uploads': { target, changeOrigin: true },
        '/health': { target, changeOrigin: true },
      },
    },
  }
})
