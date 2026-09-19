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
  await fs.writeFile(
    path.join('dist/cjs/', 'signals.js'),
    `'use strict'
if (process.env.NODE_ENV === 'production') {
  module.exports = require('./react-redux-signals.production.min.cjs')
} else {
  module.exports = require('./react-redux-signals.development.cjs')
}`,
  )
}

const tsconfig = 'tsconfig.build.json'

// The main entry and the `react-redux/signals` entry share almost all of their
// code. Building them in the same config makes Rolldown hoist that code into a
// shared `src.*` chunk and leaves `react-redux.mjs` as a re-export shim, which
// changes the published main artifact and breaks the publish-ci snapshot of
// which file each bundler resolves. Each entry therefore gets its own build of
// every variant, at the cost of duplicating the shared code into the signals
// bundles.
const entries = {
  'react-redux': 'src/index.ts',
  'react-redux-signals': 'src/index-signals.ts',
}

type Variant = {
  name: string
  suffix: string
  options: Partial<UserConfig>
}

const variants: Variant[] = [
  // Standard ESM, embedded `process.env.NODE_ENV` checks
  {
    name: 'Modern ESM',
    suffix: '',
    options: {
      format: ['esm'],
      outExtensions: () => ({ js: '.mjs' }),
    },
  },

  // Support Webpack 4 by pointing `"module"` to a file with a `.js` extension
  // and optional chaining compiled away
  {
    name: 'Legacy ESM, Webpack 4',
    suffix: '.legacy-esm',
    options: {
      target: ['es2017'],
      format: ['esm'],
      outExtensions: () => ({ js: '.js' }),
    },
  },

  // Meant to be served up via CDNs like `unpkg`.
  {
    name: 'Browser-ready ESM',
    suffix: '.browser',
    options: {
      platform: 'browser',
      env: {
        NODE_ENV: 'production',
      },
      format: ['esm'],
      outExtensions: () => ({ js: '.mjs' }),
      minify: true,
    },
  },
  {
    name: 'CJS Development',
    suffix: '.development',
    options: {
      env: {
        NODE_ENV: 'development',
      },
      format: ['cjs'],
      outDir: './dist/cjs/',
      outExtensions: () => ({ js: '.cjs' }),
    },
  },
  {
    name: 'CJS production',
    suffix: '.production.min',
    options: {
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
  },
  {
    name: 'Type definitions',
    suffix: '',
    options: {
      format: ['esm'],
      dts: { emitDtsOnly: true },
      outExtensions: () => ({ dts: '.d.ts' }),
    },
  },
]

export default defineConfig((options): UserConfig[] => {
  const commonOptions = {
    sourcemap: true,
    // `pnpm clean` already removes `dist/`; letting each of the builds
    // clean would race them against each other.
    clean: false,
    hash: false,
    target: ['esnext'],
    tsconfig,
    dts: false,
    report: false,
    ...options,
  } satisfies UserConfig

  const entryBuilds = Object.entries(entries).flatMap(([outName, source]) =>
    variants.map(
      ({ name, suffix, options: variantOptions }): UserConfig => ({
        ...commonOptions,
        name: `${name} (${outName})`,
        entry: { [outName + suffix]: source },
        ...variantOptions,
      }),
    ),
  )

  return [
    ...entryBuilds,
    {
      ...commonOptions,
      name: 'ESM for RSC',
      entry: {
        rsc: 'src/index-rsc.ts',
      },
      format: ['esm'],
      outExtensions: () => ({ js: '.mjs' }),
    },
  ]
})
