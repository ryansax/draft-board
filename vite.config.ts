import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Vite does not read PORT on its own. Honouring it lets the harness assign a free
// port instead of colliding with whatever already holds 5173.
const assignedPort = Number(process.env.PORT) || undefined

export default defineConfig({
  // Relative asset URLs, so the build runs from a domain root or a sub-path
  // (GitHub Pages serves projects from /<repo>/) without rebuilding.
  base: './',
  plugins: [react(), tailwindcss()],
  server: { port: assignedPort },
  // pdf.js ships its worker as a separate chunk; keep it out of optimizeDeps rewriting
  worker: { format: 'es' },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
} as any)
