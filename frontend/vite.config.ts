import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const backendPackageJson = require('../backend/package.json')

// https://vite.dev/config/
export default defineConfig({
  base: './',
  define: {
    // Seenary releases are versioned exclusively by the desktop/backend package.
    __APP_VERSION__: JSON.stringify(backendPackageJson.version),
  },
  plugins: [react()],
})
