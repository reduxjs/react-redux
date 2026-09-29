import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['test/setup.ts'],
    globals: true,
    server: {
      deps: {
        // RTK's `query/react` entry imports `react-redux` at runtime.
        // Externalized deps are loaded by Node, which never applies the
        // alias below: the import fails (this repo IS react-redux, so it
        // isn't installed), and any copy Node did find would be a second
        // module instance with its own context, ignoring TEST_IMPL.
        // Inlining runs RTK through Vite so it shares the aliased instance
        // the tests use.
        inline: [/@reduxjs\/toolkit/],
      },
    },
    alias: {
      // Which implementation the shared spec files run against.
      // TEST_DIST=1     -> the built package
      // TEST_IMPL=signals -> useSignalSelector / SignalProvider
      // default         -> stock hooks
      // The signal and stock entries live in test/entries and present
      // their implementation under the stock public names, so one spec
      // file validates both without being copied.
      'react-redux': new URL(
        process.env.TEST_DIST
          ? 'node_modules/react-redux'
          : process.env.TEST_IMPL === 'signals'
            ? 'test/entries/signals.ts'
            : 'test/entries/stock.ts',
        import.meta.url,
      ).pathname,
      // this mapping is disabled as we want `dist` imports in the tests only to be used for "type-only" imports which don't play a role for jest
      '@internal': new URL('src', import.meta.url).pathname,
    },
  },
})
