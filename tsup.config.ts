import fs from 'node:fs/promises'
import path from 'node:path'
import type { Options } from 'tsup'
import { defineConfig } from 'tsup'

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

const tsconfig = 'tsconfig.build.json' satisfies Options['tsconfig']

export default defineConfig((options): Options[] => {
  const commonOptions: Options = {
    entry: {
      'react-redux': 'src/index.ts',
    },
    sourcemap: true,
    target: 'es2020',
    tsconfig,
    ...options,
  }

  return [
    // Standard ESM, embedded `process.env.NODE_ENV` checks
    {
      ...commonOptions,
      format: ['esm'],
      outExtension: () => ({ js: '.mjs' }),
      dts: true,
      clean: true,
    },
    // ESM for RSC
    {
      ...commonOptions,
      entry: {
        rsc: 'src/index-rsc.ts',
      },
      format: ['esm'],
      outExtension: () => ({ js: '.mjs' }),
      dts: false,
    },
    // Support Webpack 4 by pointing `"module"` to a file with a `.js` extension
    {
      ...commonOptions,
      entry: {
        'react-redux.legacy-esm': 'src/index.ts',
      },
      target: 'es2017',
      format: ['esm'],
      outExtension: () => ({ js: '.js' }),
    },
    // Browser-ready ESM, production + minified
    {
      ...commonOptions,
      entry: {
        'react-redux.browser': 'src/index.ts',
      },
      define: {
        'process.env.NODE_ENV': JSON.stringify('production'),
      },
      format: ['esm'],
      outExtension: () => ({ js: '.mjs' }),
      minify: true,
    },
    // CJS development
    {
      ...commonOptions,
      entry: {
        'react-redux.development': 'src/index.ts',
      },
      define: {
        'process.env.NODE_ENV': JSON.stringify('development'),
      },
      format: 'cjs',
      outDir: './dist/cjs/',
      outExtension: () => ({ js: '.cjs' }),
    },
    // CJS production
    {
      ...commonOptions,
      entry: {
        'react-redux.production.min': 'src/index.ts',
      },
      define: {
        'process.env.NODE_ENV': JSON.stringify('production'),
      },
      format: 'cjs',
      outDir: './dist/cjs/',
      outExtension: () => ({ js: '.cjs' }),
      minify: true,
      onSuccess: async () => {
        await writeCommonJSEntry()
      },
    },
  ]
})
