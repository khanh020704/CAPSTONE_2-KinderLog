import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // In dev the FE calls same-origin /api and /uploads; Vite forwards them to the NestJS backend (no CORS needed).
  const target = env.VITE_BACKEND_URL || 'http://localhost:3000'
  // While the API is down or restarting (watch mode), answer 503 with a JSON message instead of Vite's empty 500.
  const configure = (proxy) =>
    proxy.on('error', (_err, _req, res) => {
      if (!res.headersSent && typeof res.writeHead === 'function') {
        res.writeHead(503, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ statusCode: 503, message: 'The server is not reachable. Please try again in a moment.' }))
      }
    })
  return {
    plugins: [react()],
    server: {
      proxy: {
        '/api': { target, changeOrigin: true, configure },
        '/uploads': { target, changeOrigin: true, configure },
        '/health': { target, changeOrigin: true }, // a 503 here means "database down": keep Vite's own error
      },
    },
  }
})
