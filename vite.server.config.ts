// Bundles the pure domain modules for Deno edge functions: `npm run build:server`.
import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    lib: { entry: 'src/server/domain.ts', formats: ['es'], fileName: () => 'domain.js' },
    outDir: 'supabase/functions/_shared',
    emptyOutDir: false,
    minify: false,
    target: 'es2022',
  },
})
