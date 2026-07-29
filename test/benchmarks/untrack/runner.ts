/**
 * Untrack-boundary micro-benchmark.
 *
 * Measures the cost of stripping tracking proxies from selector results
 * (untrackResult) across result shapes, by running each selector through
 * a tracking proxy with the untrack strategy toggled:
 *
 *   overhead = (recursive) - (none)
 *
 * Usage:
 *   npx tsx test/benchmarks/untrack/runner.ts
 *   npx tsx test/benchmarks/untrack/runner.ts --iterations 5000
 */
import { alienEngine } from '../../../src/signals/engine'
import { createPathSignalRegistry } from '../../../src/signals/pathSignalRegistry'
import { createTrackingProxy } from '../../../src/signals/trackingProxy'
import {
  setUntrackStrategy,
  untrackResult,
  type UntrackStrategy,
} from '../../../src/signals/untrack'
import { deepFreeze } from '../reconcile/stateBuilders'

const WARMUP = 500
const DEFAULT_ITERATIONS = 5000

interface Entity {
  id: number
  name: string
  email: string
  status: string
  score: number
}

function makeEntity(i: number): Entity {
  return {
    id: i,
    name: `User ${i}`,
    email: `user${i}@example.com`,
    status: i % 3 === 0 ? 'active' : 'inactive',
    score: i * 10,
  }
}

function buildState(entityCount: number) {
  const entities: Entity[] = []
  for (let i = 0; i < entityCount; i++) entities.push(makeEntity(i))
  return deepFreeze({
    entities,
    meta: { count: entityCount, updatedAt: 12345 },
    settings: { theme: 'dark', fontSize: 12 },
  })
}

type State = ReturnType<typeof buildState>

interface UntrackScenario {
  name: string
  description: string
  entityCount: number
  selector: (s: State) => unknown
}

const scenarios: UntrackScenario[] = [
  {
    name: 'return-primitive',
    description: 'Selector returns a number (untrack floor: typeof check)',
    entityCount: 1000,
    selector: (s) => s.meta.count,
  },
  {
    name: 'return-one-proxy',
    description: 'Selector returns one state object (untrack: 1 WeakMap hit)',
    entityCount: 1000,
    selector: (s) => s.settings,
  },
  {
    name: 'return-big-subtree',
    description: 'Selector returns the 10k-entity array proxy (walk stops at proxy)',
    entityCount: 10000,
    selector: (s) => s.entities,
  },
  {
    name: 'filter-half-1k',
    description: 'filter() over 1k entities, ~500 proxies in result array',
    entityCount: 1000,
    selector: (s) => s.entities.filter((e) => e.status === 'inactive'),
  },
  {
    name: 'map-identity-1k',
    description: 'map(e => e) over 1k entities: 1k proxies in a fresh array',
    entityCount: 1000,
    selector: (s) => s.entities.map((e) => e),
  },
  {
    name: 'map-identity-10k',
    description: 'map(e => e) over 10k entities: 10k proxies in a fresh array',
    entityCount: 10000,
    selector: (s) => s.entities.map((e) => e),
  },
  {
    name: 'map-containers-1k',
    description: 'map to fresh {id, entity} wrappers: 1k containers each holding a proxy',
    entityCount: 1000,
    selector: (s) => s.entities.map((e) => ({ id: e.id, entity: e })),
  },
  {
    name: 'deep-container',
    description: 'Nested derived object embedding proxies at several depths',
    entityCount: 1000,
    selector: (s) => ({
      top: s.entities[0],
      group: {
        settings: s.settings,
        inner: { meta: s.meta, first: s.entities[1] },
      },
      list: [s.entities[2], s.entities[3], s.entities[4]],
    }),
  },
]

interface BenchRow {
  name: string
  noneMs: number
  recursiveMs: number
  overheadMs: number
  overheadPct: number
}

function timeStrategy(
  scenario: UntrackScenario,
  strategy: UntrackStrategy,
  state: State,
  iterations: number,
): number {
  const registry = createPathSignalRegistry(alienEngine)
  setUntrackStrategy(strategy)

  const run = () => {
    const proxy = createTrackingProxy(state, '', registry, registry.proxyCache)
    const result = scenario.selector(proxy as State)
    return untrackResult(result)
  }

  for (let i = 0; i < WARMUP; i++) run()

  const start = performance.now()
  for (let i = 0; i < iterations; i++) run()
  return performance.now() - start
}

function main() {
  const args = process.argv.slice(2)
  let iterations = DEFAULT_ITERATIONS
  let filterName: string | undefined
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--iterations' || args[i] === '-n') {
      iterations = parseInt(args[i + 1], 10)
      i++
    } else if (!args[i].startsWith('-')) {
      filterName = args[i]
    }
  }

  let selected = scenarios
  if (filterName) {
    selected = scenarios.filter((s) => s.name === filterName)
    if (selected.length === 0) {
      console.error(`Unknown scenario: ${filterName}`)
      console.error(`Available: ${scenarios.map((s) => s.name).join(', ')}`)
      process.exit(1)
    }
  }

  console.log(`\nUntrack Boundary Benchmark`)
  console.log(`Warmup: ${WARMUP} | Iterations: ${iterations} (full eval: proxy + selector + untrack)\n`)

  const rows: BenchRow[] = []
  for (const scenario of selected) {
    process.stdout.write(`  Running ${scenario.name}...`)
    const state = buildState(scenario.entityCount)
    const noneMs = timeStrategy(scenario, 'none', state, iterations)
    const recursiveMs = timeStrategy(scenario, 'recursive', state, iterations)
    const overheadMs = recursiveMs - noneMs
    rows.push({
      name: scenario.name,
      noneMs,
      recursiveMs,
      overheadMs,
      overheadPct: (overheadMs / noneMs) * 100,
    })
    console.log(
      ` none=${(noneMs / iterations).toFixed(4)} recursive=${(recursiveMs / iterations).toFixed(4)} ms/iter`,
    )
  }
  setUntrackStrategy('recursive')

  console.log(
    `\n${'Scenario'.padEnd(20)} | ${'none µs/it'.padStart(11)} | ${'rec µs/it'.padStart(11)} | ${'ovh µs/it'.padStart(11)} | ${'overhead %'.padStart(10)}`,
  )
  console.log(`${'-'.repeat(20)}-+-${'-'.repeat(11)}-+-${'-'.repeat(11)}-+-${'-'.repeat(11)}-+-${'-'.repeat(10)}`)
  for (const r of rows) {
    const us = (ms: number) => ((ms / iterations) * 1000).toFixed(2).padStart(11)
    console.log(
      `${r.name.padEnd(20)} | ${us(r.noneMs)} | ${us(r.recursiveMs)} | ${us(r.overheadMs)} | ${r.overheadPct.toFixed(1).padStart(9)}%`,
    )
  }

  console.log('\nScenario descriptions:')
  for (const s of selected) console.log(`  ${s.name}: ${s.description}`)
  console.log()
}

main()
