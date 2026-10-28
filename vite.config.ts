import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Dev: vite serves the client on 5173 and proxies API/WS to the local backend.
export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:4310',
      '/ws': { target: 'ws://127.0.0.1:4310', ws: true }
    }
  },
  build: { target: 'es2022', chunkSizeWarningLimit: 1600 }
})
