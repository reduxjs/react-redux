/**
 * Single-scenario runner for profiling with pprof-it or --prof.
 * Runs one scenario in a tight loop with no table formatting overhead.
 *
 * Usage:
 *   npx tsx test/benchmarks/reconcile/run-single.ts entity-shift
 *   npx pprof-it npx tsx test/benchmarks/reconcile/run-single.ts entity-shift
 *   npx tsx test/benchmarks/reconcile/run-single.ts entity-shift --iterations 100000
 */
import { diffAndUpdateSignals } from '../../../src/signals/diff'
import { resetUpdateCount, getUpdateCount } from './benchEngine'
import { createScenarios } from './scenarios'

const WARMUP = 2000
const DEFAULT_ITERATIONS = 50000

function main() {
  const args = process.argv.slice(2)
  let scenarioName: string | undefined
  let iterations = DEFAULT_ITERATIONS

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--iterations' || args[i] === '-n') {
      iterations = parseInt(args[i + 1], 10)
      i++
    } else if (!args[i].startsWith('-')) {
      scenarioName = args[i]
    }
  }

  if (!scenarioName) {
    const all = createScenarios()
    console.error('Usage: run-single.ts <scenario-name>')
    console.error(`Available: ${all.map((s) => s.name).join(', ')}`)
    process.exit(1)
  }

  const scenarios = createScenarios()
  const scenario = scenarios.find((s) => s.name === scenarioName)
  if (!scenario) {
    console.error(`Unknown scenario: ${scenarioName}`)
    console.error(`Available: ${scenarios.map((s) => s.name).join(', ')}`)
    process.exit(1)
  }

  const { forward, reverse, registry } = scenario

  console.log(`Scenario: ${scenario.name}`)
  console.log(`Tracked paths: ${scenario.trackedPaths}`)
  console.log(`Warmup: ${WARMUP} | Iterations: ${iterations}`)

  // Warmup
  for (let i = 0; i < WARMUP; i++) {
    resetUpdateCount()
    diffAndUpdateSignals(forward.prev, forward.next, '', registry)
    diffAndUpdateSignals(reverse.prev, reverse.next, '', registry)
  }

  // Count signal updates
  resetUpdateCount()
  diffAndUpdateSignals(forward.prev, forward.next, '', registry)
  const fwdUpdates = getUpdateCount()
  resetUpdateCount()
  diffAndUpdateSignals(reverse.prev, reverse.next, '', registry)
  const revUpdates = getUpdateCount()
  console.log(`Signal updates: ${fwdUpdates} fwd, ${revUpdates} rev`)

  // Timed run
  console.log(`\nStarting ${iterations} iterations...`)
  const start = performance.now()
  for (let i = 0; i < iterations; i++) {
    diffAndUpdateSignals(forward.prev, forward.next, '', registry)
    diffAndUpdateSignals(reverse.prev, reverse.next, '', registry)
  }
  const elapsed = performance.now() - start

  console.log(`Total: ${elapsed.toFixed(1)} ms`)
  console.log(`Per iteration: ${(elapsed / iterations).toFixed(4)} ms`)
  console.log(`Iterations/sec: ${Math.round(1000 / (elapsed / iterations)).toLocaleString()}`)
}

main()
