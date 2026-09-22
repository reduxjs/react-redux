// Builds the example app three ways with Vite (minified) and reports the size
// of the react-redux + redux portion of the output. React itself is external.
//
//   stock    - Provider + useSelector + useDispatch + connect
//   signals  - SignalProvider + useSignalSelector + useDispatch + connect
//   alias    - same source as `stock`, with 'react-redux' aliased to
//              'react-redux/signals'
//
// Run after installing the tarball under test: `pnpm measure`

import { gzipSync } from 'node:zlib'
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { build } from 'vite'
import react from '@vitejs/plugin-react'

const here = path.resolve(import.meta.dirname, '..')

const installed = await import('react-redux')
if (!('useSignalSelector' in installed)) {
  console.error(
    'The installed react-redux has no signals exports. Install a build from the signals branch first:\n' +
      '  pnpm remove react-redux && pnpm add ./package.tgz',
  )
  process.exit(1)
}

const stockSource = await readFile(path.join(here, 'src/main.tsx'), 'utf8')
const signalsSource = stockSource
  .replace(
    'Provider, connect, useDispatch, useSelector',
    'SignalProvider, connect, useDispatch, useSignalSelector',
  )
  .replaceAll('useSelector(', 'useSignalSelector(')
  .replaceAll('<Provider ', '<SignalProvider ')
  .replaceAll('</Provider>', '</SignalProvider>')

const variants = [
  { name: 'stock', source: stockSource, alias: {} },
  { name: 'signals', source: signalsSource, alias: {} },
  {
    name: 'alias',
    source: stockSource,
    alias: { 'react-redux': 'react-redux/signals' },
  },
]

const results = []
for (const variant of variants) {
  // Entries must live inside the project so bare imports resolve to its
  // node_modules.
  const work = path.join(here, '.size', variant.name)
  await mkdir(work, { recursive: true })
  await writeFile(path.join(work, 'main.tsx'), variant.source)
  const outDir = path.join(work, 'dist')

  await build({
    root: here,
    logLevel: 'silent',
    configFile: false,
    plugins: [react()],
    resolve: { alias: variant.alias },
    build: {
      outDir,
      emptyOutDir: true,
      minify: true,
      rollupOptions: {
        input: path.join(work, 'main.tsx'),
        external: [
          'react',
          'react-dom',
          'react-dom/client',
          'react/jsx-runtime',
        ],
      },
    },
  })

  const assets = path.join(outDir, 'assets')
  const files = (await readdir(assets)).filter((f) => f.endsWith('.js'))
  const code = (
    await Promise.all(files.map((f) => readFile(path.join(assets, f))))
  ).join('')
  results.push({
    variant: variant.name,
    'min (bytes)': Buffer.byteLength(code),
    'min+gz (bytes)': gzipSync(code).byteLength,
  })
}

await rm(path.join(here, '.size'), { recursive: true, force: true })
console.table(results)
