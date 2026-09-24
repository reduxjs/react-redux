// Scans the Vite build output and fails if any of the signals implementation
// survived tree-shaking in an app that only uses the stock React-Redux API.
//
// The signals code lives on the main entry point next to the stock exports, so
// every consumer relies on the bundler dropping it. That only works while the
// signals modules have no module-level side effects. A refactor that adds one
// (for example, destructuring the result of a top-level call) breaks it
// silently, and this check is what catches that.

import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

const distDir = path.resolve(import.meta.dirname, '..', 'dist', 'assets')

// Identifiers that exist only in the signals implementation. The build runs
// unminified, so function and class names survive into the output.
const forbidden = [
  'createReactiveSystem',
  'createPathSignalRegistry',
  'createTrackingProxy',
  'reconcileState',
  'SignalProvider',
  'useSignalSelector',
  'alien-signals',
]

// Something the stock implementation always ships. If this is missing the
// build did not include react-redux at all and the forbidden check proves
// nothing.
const required = ['useSyncExternalStoreWithSelector', 'ReactReduxContext']

const files = (await readdir(distDir)).filter((f) => f.endsWith('.js'))
if (files.length === 0) {
  console.error(`No JS output found in ${distDir}. Did \`vite build\` run?`)
  process.exit(1)
}

const output = (
  await Promise.all(files.map((f) => readFile(path.join(distDir, f), 'utf8')))
).join('\n')

const missing = required.filter((marker) => !output.includes(marker))
if (missing.length > 0) {
  console.error(
    'Build output does not look like a react-redux app. Missing markers:',
  )
  for (const marker of missing) console.error(`  - ${marker}`)
  process.exit(1)
}

const leaked = forbidden.filter((marker) => output.includes(marker))
if (leaked.length > 0) {
  console.error('Signals code leaked into a stock-only build. Found:')
  for (const marker of leaked) console.error(`  - ${marker}`)
  console.error(
    '\nSomething in src/signals now has a module-level side effect that bundlers cannot drop.',
  )
  process.exit(1)
}

const bytes = Buffer.byteLength(output)
console.log(
  `Tree-shaking OK: ${files.length} file(s), ${bytes} bytes, no signals code present.`,
)
