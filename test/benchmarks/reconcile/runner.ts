/**
 * Reconcile diff micro-benchmark runner.
 * Runs all scenarios (or a specific one) and outputs a results table.
 *
 * Usage:
 *   npx tsx test/benchmarks/reconcile/runner.ts
 *   npx tsx test/benchmarks/reconcile/runner.ts entity-shift
 *   npx tsx test/benchmarks/reconcile/runner.ts --iterations 50000
 */
import { diffAndUpdateSignals } from '../../../src/signals/diff'
import { resetUpdateCount, getUpdateCount } from './benchEngine'
import { createScenarios, type BenchmarkScenario } from './scenarios'

const WARMUP = 1000
const DEFAULT_ITERATIONS = 10000

interface BenchResult {
  name: string
  description: string
  trackedPaths: number
  signalUpdatesForward: number
  signalUpdatesReverse: number
  warmupMs: number
  totalMs: number
  msPerIter: number
  itersPerSec: number
}

function runScenario(scenario: BenchmarkScenario, iterations: number): BenchResult {
  const { forward, reverse, registry } = scenario

  // Warmup
  const warmupStart = performance.now()
  for (let i = 0; i < WARMUP; i++) {
    resetUpdateCount()
    diffAndUpdateSignals(forward.prev, forward.next, '', registry)
    diffAndUpdateSignals(reverse.prev, reverse.next, '', registry)
  }
  const warmupMs = performance.now() - warmupStart

  // Measure signal updates for one forward+reverse cycle
  resetUpdateCount()
  diffAndUpdateSignals(forward.prev, forward.next, '', registry)
  const signalUpdatesForward = getUpdateCount()
  resetUpdateCount()
  diffAndUpdateSignals(reverse.prev, reverse.next, '', registry)
  const signalUpdatesReverse = getUpdateCount()

  // Timed run
  const start = performance.now()
  for (let i = 0; i < iterations; i++) {
    diffAndUpdateSignals(forward.prev, forward.next, '', registry)
    diffAndUpdateSignals(reverse.prev, reverse.next, '', registry)
  }
  const totalMs = performance.now() - start
  const msPerIter = totalMs / iterations

  return {
    name: scenario.name,
    description: scenario.description,
    trackedPaths: scenario.trackedPaths,
    signalUpdatesForward,
    signalUpdatesReverse,
    warmupMs,
    totalMs,
    msPerIter,
    itersPerSec: 1000 / msPerIter,
  }
}

function formatTable(results: BenchResult[]): string {
  const cols = [
    { key: 'name' as const, header: 'Scenario', width: 24 },
    { key: 'trackedPaths' as const, header: 'Tracked', width: 8, align: 'right' as const },
    { key: 'signalUpdatesForward' as const, header: 'Fwd Upd', width: 9, align: 'right' as const },
    { key: 'signalUpdatesReverse' as const, header: 'Rev Upd', width: 9, align: 'right' as const },
    { key: 'msPerIter' as const, header: 'ms/iter', width: 10, align: 'right' as const },
    { key: 'itersPerSec' as const, header: 'iter/s', width: 10, align: 'right' as const },
    { key: 'totalMs' as const, header: 'Total ms', width: 10, align: 'right' as const },
  ]

  function pad(s: string, w: number, align: 'left' | 'right' = 'left'): string {
    if (s.length >= w) return s.slice(0, w)
    return align === 'right' ? s.padStart(w) : s.padEnd(w)
  }

  function formatVal(key: string, val: unknown): string {
    if (typeof val === 'number') {
      if (key === 'msPerIter') return val.toFixed(4)
      if (key === 'itersPerSec') return Math.round(val).toLocaleString()
      if (key === 'totalMs') return val.toFixed(1)
      return String(val)
    }
    return String(val)
  }

  const lines: string[] = []
  // Header
  const header = cols.map((c) => pad(c.header, c.width, c.align)).join(' | ')
  lines.push(header)
  lines.push(cols.map((c) => '-'.repeat(c.width)).join('-+-'))

  // Rows
  for (const r of results) {
    const row = cols
      .map((c) => pad(formatVal(c.key, r[c.key]), c.width, c.align))
      .join(' | ')
    lines.push(row)
  }

  return lines.join('\n')
}

// ---- Main ----
function main() {
  const args = process.argv.slice(2)
  let filterName: string | undefined
  let iterations = DEFAULT_ITERATIONS

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--iterations' || args[i] === '-n') {
      iterations = parseInt(args[i + 1], 10)
      i++
    } else if (!args[i].startsWith('-')) {
      filterName = args[i]
    }
  }

  console.log(`\nReconcile Diff Benchmark`)
  console.log(`Warmup: ${WARMUP} | Iterations: ${iterations} (forward+reverse per iter)\n`)

  let scenarios = createScenarios()
  if (filterName) {
    scenarios = scenarios.filter((s) => s.name === filterName)
    if (scenarios.length === 0) {
      console.error(`Unknown scenario: ${filterName}`)
      console.error(`Available: ${createScenarios().map((s) => s.name).join(', ')}`)
      process.exit(1)
    }
  }

  const results: BenchResult[] = []
  for (const scenario of scenarios) {
    process.stdout.write(`  Running ${scenario.name}...`)
    const result = runScenario(scenario, iterations)
    results.push(result)
    console.log(` ${result.msPerIter.toFixed(4)} ms/iter`)
  }

  console.log(`\n${formatTable(results)}\n`)

  // Descriptions
  console.log('Scenario descriptions:')
  for (const r of results) {
    console.log(`  ${r.name}: ${r.description}`)
  }
  console.log()
}

main()
