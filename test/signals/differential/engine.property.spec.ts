/**
 * Randomized differential test of the signal tier without React.
 *
 * Each run builds a random state, then plays a random program of steps:
 * mount a hook with a random selector, unmount one, or dispatch a random
 * immutable state transition. Each hook mirrors useSignalSelector's deep
 * tier: a computed that runs the selector through a tracking proxy, and an
 * effect that keeps its latest value. After every dispatch each hook's
 * value must equal the selector run directly on the new raw state. A hook
 * whose value is stale missed an update; that fails the run. A hook that
 * re-ran although its expected result did not change is counted as an
 * extra re-run and reported, but does not fail.
 *
 * Two program shapes run. Short programs cover many states and selectors
 * quickly. Long programs give the sweep policy enough dispatches to sweep
 * paths released while other hooks still track paths below them.
 *
 * After every hook is stopped, a few idle dispatches run and the registry
 * and its sweep policy must empty under the policy's own conditions. Entries
 * that only go away when every held path is swept at once are a stuck sweep
 * (`stuckRuns`); entries that stay even then are a leak (`leakyRuns`). Both
 * only fail with SIGNALS_FUZZ_LEAKS=fail.
 */
import { describe, it, expect, afterAll } from 'vitest'
import fc from 'fast-check'
import { alienEngine } from '../../../src/signals/engine'
import { createPathSignalRegistry } from '../../../src/signals/pathSignalRegistry'
import type { PathSignalRegistry } from '../../../src/signals/pathSignalRegistry'
import { reconcileState } from '../../../src/signals/diff'
import { delayedSweepPolicy } from '../../../src/signals/sweepPolicy'
import type { DelayedSweepOptions } from '../../../src/signals/sweepPolicy'
import { mountEngineHook, THREW } from './engineHook'
import type { EngineHook } from './engineHook'
import { settleBound, settleRegistry } from './settle'
import {
  actionArb,
  applyAction,
  collectStateNodes,
  compareResults,
  compile,
  containsRoot,
  expected,
  fuzzParams,
  FUZZ_TIMEOUT,
  selectorSpecArb,
  showSpec,
  stateArb,
} from './model'
import type { Action, SelectorSpec, State } from './model'

type Step =
  | { t: 'mount'; spec: SelectorSpec }
  | { t: 'unmount'; pick: number }
  | { t: 'dispatch'; action: Action }

export const stepArb: fc.Arbitrary<Step> = fc.oneof(
  {
    arbitrary: fc.record({
      t: fc.constant('mount' as const),
      spec: selectorSpecArb,
    }),
    weight: 2,
  },
  {
    arbitrary: fc.record({
      t: fc.constant('unmount' as const),
      pick: fc.nat({ max: 7 }),
    }),
    weight: 1,
  },
  {
    arbitrary: fc.record({
      t: fc.constant('dispatch' as const),
      action: actionArb,
    }),
    weight: 6,
  },
)

const MS_PER_DISPATCH = 40

// Programs are too short for the default sweep delay. With these policies,
// the time floor holds a release back on the second dispatch after it, and
// the sweep runs on the third. The backoff policy also lengthens the delay
// of a path that is read again after its sweep.
const sweepOptions = {
  fixed: { dispatches: 2, ms: 100 },
  backoff: { dispatches: 2, ms: 100, growth: 2, maxDispatches: 8 },
} satisfies Record<string, DelayedSweepOptions>
type PolicyName = keyof typeof sweepOptions

const programArb = (
  maxSteps: number,
  size: fc.SizeForArbitrary,
  policies: readonly PolicyName[],
) =>
  fc.record({
    initial: stateArb,
    // Every program starts with at least one hook.
    first: selectorSpecArb,
    steps: fc.array(stepArb, { maxLength: maxSteps, size }),
    policy: fc.constantFrom(...policies),
  })

interface Program {
  initial: State
  first: SelectorSpec
  steps: Step[]
  policy: PolicyName
}

interface Hook extends EngineHook {
  spec: SelectorSpec
}

function mountHook(
  getState: () => State,
  spec: SelectorSpec,
  registry: PathSignalRegistry,
): Hook {
  return Object.assign(mountEngineHook(getState, compile(spec), registry), {
    spec,
  })
}

const makeTotals = () => ({
  runs: 0,
  dispatches: 0,
  checks: 0,
  skippedRootResults: 0,
  extraReruns: 0,
  leakyRuns: 0,
  stuckRuns: 0,
  /** Releases the policy held because paths below were still tracked. */
  holds: 0,
  /** Sweeps during the program, while hooks were mounted. */
  sweeps: 0,
  /** Of those, sweeps of a path that still had tracked paths below it. */
  liveSweeps: 0,
  /** Sweeps during the idle dispatches after every hook stopped. */
  settleSweeps: 0,
  ms: 0,
})
type Totals = ReturnType<typeof makeTotals>

let current: { registry: PathSignalRegistry; totals: Totals; settling: boolean }

const countingSweepPolicy = (options: DelayedSweepOptions) => () => {
  const policy = delayedSweepPolicy(options)()
  return {
    ...policy,
    released(path: string, weight: number, now: number) {
      current.totals.holds++
      policy.released(path, weight, now)
    },
    tick(now: number) {
      const due = policy.tick(now)
      const { registry, totals, settling } = current
      if (settling) {
        totals.settleSweeps += due.length
        return due
      }
      totals.sweeps += due.length
      for (const path of due) {
        if (!registry.has(path) && registry.hasPrefix(path)) totals.liveSweeps++
      }
      return due
    },
  }
}

function runProgram(
  totals: Totals,
  { initial, first, steps, policy }: Program,
) {
  totals.runs++
  let state = initial
  let time = 0
  const registry = createPathSignalRegistry(alienEngine, {
    sweepPolicy: countingSweepPolicy(sweepOptions[policy]),
    now: () => time,
  })
  current = { registry, totals, settling: false }
  const hooks: Hook[] = []
  const log: string[] = [`  sweep policy: ${policy}`]

  const check = (when: string) => {
    const nodes = collectStateNodes(state)
    for (const [i, hook] of hooks.entries()) {
      totals.checks++
      const value = hook.last
      if (typeof value === 'object' && value !== null && THREW in value) {
        throw new Error(
          `hook ${i} threw ${when}: ${String((value as Record<symbol, unknown>)[THREW])}\n` +
            `  selector: ${showSpec(hook.spec)}\n${log.join('\n')}`,
        )
      }
      const want = expected(hook.spec, state)
      if (containsRoot(want, state)) {
        totals.skippedRootResults++
        continue
      }
      const diff = compareResults(want, value, nodes)
      if (diff) {
        throw new Error(
          `MISSED UPDATE in hook ${i} ${when}: ${diff}\n` +
            `  selector: ${showSpec(hook.spec)}\n` +
            `  state: ${JSON.stringify(state)}\n${log.join('\n')}`,
        )
      }
    }
  }

  const mount = (spec: SelectorSpec) => {
    hooks.push(mountHook(() => state, spec, registry))
    log.push(`  mount ${hooks.length - 1}: ${showSpec(spec)}`)
  }

  try {
    log.push(`  initial: ${JSON.stringify(initial)}`)
    mount(first)
    check('after mount')
    for (const step of steps) {
      if (step.t === 'mount') {
        mount(step.spec)
        check('after mount')
      } else if (step.t === 'unmount') {
        if (hooks.length === 0) continue
        const index = step.pick % hooks.length
        const [hook] = hooks.splice(index, 1)
        hook.stop()
        log.push(`  unmount ${index}`)
      } else {
        const prev = state
        const before = hooks.map((h) => ({
          evals: h.evals,
          want: expected(h.spec, prev),
        }))
        state = applyAction(prev, step.action)
        log.push(
          `  dispatch ${JSON.stringify(step.action)} -> ${JSON.stringify(state)}`,
        )
        totals.dispatches++
        time += MS_PER_DISPATCH
        reconcileState(prev, state, registry, alienEngine)
        check(`after dispatch ${JSON.stringify(step.action)}`)
        const nodes = collectStateNodes(state)
        for (const [i, hook] of hooks.entries()) {
          const reran = hook.evals > before[i].evals
          const changed =
            compareResults(
              before[i].want,
              expected(hook.spec, state),
              nodes,
            ) !== null
          if (reran && !changed) totals.extraReruns++
        }
      }
    }
  } finally {
    for (const hook of hooks) hook.stop()
  }

  current.settling = true
  const outcome = settleRegistry(
    registry,
    () => {
      time += MS_PER_DISPATCH
    },
    settleBound(
      { maxDispatches: 2, ...sweepOptions[policy] },
      MS_PER_DISPATCH,
    ),
  )
  if (outcome.kind === 'empty') return
  if (outcome.kind === 'stuck') totals.stuckRuns++
  else totals.leakyRuns++
  // Set SIGNALS_FUZZ_LEAKS=fail to stop on (and shrink) the first one.
  if (process.env.SIGNALS_FUZZ_LEAKS !== 'fail') return
  const what =
    outcome.kind === 'stuck'
      ? `STUCK SWEEP: entries left after ${outcome.reconciles} idle dispatches, cleared only by sweeping every held path`
      : `REGISTRY LEAK: entries left even after sweeping every held path: ${JSON.stringify(outcome.drained)} paths=${JSON.stringify(registry.debugPaths())}`
  throw new Error(
    `${what}\n  before sweeping: ${JSON.stringify(outcome.held)}\n${log.join('\n')}`,
  )
}

const programs = {
  short: {
    arb: programArb(12, 'small', ['fixed']),
    defaultRuns: 200,
  },
  long: {
    arb: programArb(40, 'max', ['fixed', 'backoff']),
    defaultRuns: 50,
  },
}

describe('signal engine differential (property)', () => {
  const totalsByShape = {
    short: makeTotals(),
    long: makeTotals(),
  }

  afterAll(() => {
    // Written to stdout directly: vitest hides console output of passing tests.
    if (process.env.SIGNALS_FUZZ_RUNS) {
      for (const [shape, totals] of Object.entries(totalsByShape)) {
        if (totals.runs === 0) continue
        process.stdout.write(
          `[engine differential, ${shape} programs] ${JSON.stringify(totals)} ` +
            `${((totals.runs / totals.ms) * 1000).toFixed(0)} runs/s\n`,
        )
      }
    }
  })

  it.each(Object.keys(programs) as (keyof typeof programs)[])(
    'every hook matches the selector run on raw state after every dispatch (%s programs)',
    (shape) => {
      const { arb, defaultRuns } = programs[shape]
      const totals = totalsByShape[shape]
      const start = performance.now()
      try {
        fc.assert(
          fc.property(arb, (program) => runProgram(totals, program)),
          fuzzParams(defaultRuns),
        )
      } finally {
        totals.ms += performance.now() - start
      }
      expect(totals.runs).toBeGreaterThan(0)
    },
    FUZZ_TIMEOUT,
  )
})
