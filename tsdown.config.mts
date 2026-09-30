import fs from 'node:fs/promises'
import path from 'node:path'
import type { UserConfig } from 'tsdown'
import { defineConfig } from 'tsdown'

async function writeCommonJSEntry() {
  await fs.writeFile(
    path.join('dist/cjs/', 'index.js'),
    `'use strict'
if (process.env.NODE_ENV === 'production') {
  module.exports = require('./react-redux.production.min.cjs')
} else {
  module.exports = require('./react-redux.development.cjs')
}`,
  )
}

const tsconfig = 'tsconfig.build.json'

export default defineConfig((options): UserConfig[] => {
  const commonOptions = {
    entry: {
      'react-redux': 'src/index.ts',
    },
    sourcemap: true,
    // `pnpm clean` already removes `dist/`; letting each of the seven builds
    // clean would race them against each other.
    clean: false,
    hash: false,
    target: ['esnext'],
    tsconfig,
    dts: false,
    report: false,
    ...options,
  } satisfies UserConfig

  return [
    // Standard ESM, embedded `process.env.NODE_ENV` checks
    {
      ...commonOptions,
      name: 'Modern ESM',
      format: ['esm'],
      outExtensions: () => ({ js: '.mjs' }),
    },
    {
      ...commonOptions,
      name: 'ESM for RSC',
      entry: {
        rsc: 'src/index-rsc.ts',
      },
      format: ['esm'],
      outExtensions: () => ({ js: '.mjs' }),
    },

    // Support Webpack 4 by pointing `"module"` to a file with a `.js` extension
    // and optional chaining compiled away
    {
      ...commonOptions,
      name: 'Legacy ESM, Webpack 4',
      entry: {
        'react-redux.legacy-esm': 'src/index.ts',
      },
      target: ['es2017'],
      format: ['esm'],
      outExtensions: () => ({ js: '.js' }),
    },

    // Meant to be served up via CDNs like `unpkg`.
    {
      ...commonOptions,
      name: 'Browser-ready ESM',
      entry: {
        'react-redux.browser': 'src/index.ts',
      },
      platform: 'browser',
      env: {
        NODE_ENV: 'production',
      },
      format: ['esm'],
      outExtensions: () => ({ js: '.mjs' }),
      minify: true,
    },
    {
      ...commonOptions,
      name: 'CJS Development',
      entry: {
        'react-redux.development': 'src/index.ts',
      },
      env: {
        NODE_ENV: 'development',
      },
      format: ['cjs'],
      outDir: './dist/cjs/',
      outExtensions: () => ({ js: '.cjs' }),
    },
    {
      ...commonOptions,
      name: 'CJS production',
      entry: {
        'react-redux.production.min': 'src/index.ts',
      },
      env: {
        NODE_ENV: 'production',
      },
      format: ['cjs'],
      outDir: './dist/cjs/',
      outExtensions: () => ({ js: '.cjs' }),
      minify: true,
      onSuccess: async () => {
        await writeCommonJSEntry()
      },
    },
    {
      ...commonOptions,
      name: 'Type definitions',
      format: ['esm'],
      dts: { emitDtsOnly: true },
      outExtensions: () => ({ dts: '.d.ts' }),
    },
  ]
})
