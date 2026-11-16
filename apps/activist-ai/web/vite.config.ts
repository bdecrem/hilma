import { defineConfig } from 'vite'
import solid from 'vite-plugin-solid'

// One bundle, no source maps shipped, no inline scripts (the page's CSP is script-src 'self').
export default defineConfig({
  plugins: [solid()],
  build: { target: 'es2022', sourcemap: false, assetsInlineLimit: 0, modulePreload: { polyfill: false } },
})
