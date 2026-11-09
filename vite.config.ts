import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin } from 'vite'

// Strict CSP for production builds (dev needs inline scripts for HMR).
// 'wasm-unsafe-eval' lets the Draco decoder (GLB models) compile; it does not allow JS eval.
// frame-ancestors is ignored in a <meta> CSP: the host must send it as a header to restrict embedding.
const cspFor = (api: string) => [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: blob: https://fonts.gstatic.com",
  `img-src 'self' data: blob: ${api}`,
  `connect-src 'self' blob: data: https://www.gstatic.com ${api}`,
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
].join('; ')

const csp = (api: string): Plugin => ({
  name: 'csp',
  apply: 'build',
  transformIndexHtml: (html) => html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${cspFor(api)}" />`),
})

export default defineConfig(({ mode }) => ({
  // Supabase origin (from .env.<mode>[.local]) must be allowed for RPCs, add-to-cart and signed upload URLs.
  plugins: [react(), csp(loadEnv(mode, process.cwd()).VITE_SUPABASE_URL ?? '')],
  build: {
    target: 'es2022',
    rollupOptions: {
      output: {
        manualChunks: (id: string) => {
          if (id.includes('node_modules/three') || id.includes('@react-three')) return 'three'
          if (id.includes('node_modules/fabric')) return 'fabric'
        },
      },
    },
  },
  test: { environment: 'node', exclude: ['e2e/**', 'node_modules/**', 'supabase/**'] },
} as any))
