import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..', '..')

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react({
      // Explicitly use automatic JSX runtime for React 19
      jsxRuntime: 'automatic',
    }),
  ],
  resolve: {
    // Consume the TS workspace packages from SOURCE so HMR works without a
    // prebuild. esbuild transpiles the .ts on the fly.
    alias: {
      '@finrep/engine': path.resolve(repoRoot, 'packages/engine/src/index.ts'),
      '@finrep/analytics': path.resolve(repoRoot, 'packages/analytics/src/index.ts'),
      '@finrep/compliance': path.resolve(repoRoot, 'packages/compliance/src/index.ts'),
      '@finrep/ingestion': path.resolve(repoRoot, 'packages/ingestion/src/index.ts'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    // Allow access through a Cloudflare quick tunnel (*.trycloudflare.com) and
    // other dev tunnels. Localhost/LAN IPs are always allowed by Vite.
    allowedHosts: ['.trycloudflare.com', '.cfargotunnel.com'],
    fs: {
      // Allow Vite to read package sources outside the app root.
      allow: [repoRoot],
    },
    // Proxy the API so the axios client's default '/api' base works in dev
    // without CORS. The api listens on :8000 and has no global prefix, so we
    // strip the /api prefix before forwarding.
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ''),
      },
    },
  },
  build: {
    target: 'esnext',
    minify: 'esbuild',
    sourcemap: false,
    // Vendor libs (xlsx ~936KB, recharts ~424KB) are intentionally isolated
    // into their own manual chunks below and lazy-loaded at their use sites
    // (xlsx on export, recharts inside the metric drawer/trend), so their size
    // never blocks first paint. Raise the warning above those known vendor
    // chunks so the build output stays signal — app code regressions still warn.
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
          framer: ['framer-motion'],
          recharts: ['recharts'],
          xlsx: ['xlsx'],
        },
      },
    },
  },
})
