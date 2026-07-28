import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const backendPackageJson = require('../backend/package.json')
const frontendPackageJson = require('./package.json')

// https://vite.dev/config/
export default defineConfig(({ command }) => {
  const displayedVersion =
    command === 'serve' ? backendPackageJson.version : frontendPackageJson.version

  return {
    base: './',
    define: {
      __APP_VERSION__: JSON.stringify(displayedVersion),
    },
    plugins: [react()],
  }
})
