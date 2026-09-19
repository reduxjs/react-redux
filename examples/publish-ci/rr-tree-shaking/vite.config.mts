import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  build: {
    // The check script looks for function names in the output. Minification
    // would mangle them, so keep identifiers intact. Tree-shaking does not
    // depend on minification, so this still measures what an app would ship.
    minify: false,
    // React itself is not what this example is checking. Leaving it out keeps
    // the output small enough to inspect by hand when the check fails.
    rollupOptions: {
      external: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime'],
    },
  },
})
