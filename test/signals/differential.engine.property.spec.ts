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
 * After every hook is stopped the registry should be empty. Leaks are
 * counted (`leakyRuns`) and only fail with SIGNALS_FUZZ_LEAKS=fail.
 *
 * Known bugs are kept out of the generators unless SIGNALS_FUZZ_KNOWN_BUGS=1
 * (see differential/model.ts and differentialRepros.spec.tsx).
 */
import { describe, it, expect, afterAll } from 'vitest'
import fc from 'fast-check'
import { alienEngine } from '../../src/signals/engine'
import { createPathSignalRegistry } from '../../src/signals/pathSignalRegistry'
import type { PathSignalRegistry } from '../../src/signals/pathSignalRegistry'
import { reconcileState } from '../../src/signals/diff'
import { mountEngineHook, THREW } from './differential/engineHook'
import type { EngineHook } from './differential/engineHook'
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
  hasDuplicateKeys,
  selectorSpecArb,
  showSpec,
  stateArb,
} from './differential/model'
import type { Action, SelectorSpec, State } from './differential/model'

type Step =
  | { t: 'mount'; spec: SelectorSpec }
  | { t: 'unmount'; pick: number }
  | { t: 'dispatch'; action: Action }

export const stepArb: fc.Arbitrary<Step> = fc.oneof(
  { arbitrary: fc.record({ t: fc.constant('mount' as const), spec: selectorSpecArb }), weight: 2 },
  { arbitrary: fc.record({ t: fc.constant('unmount' as const), pick: fc.nat({ max: 7 }) }), weight: 1 },
  { arbitrary: fc.record({ t: fc.constant('dispatch' as const), action: actionArb }), weight: 6 },
)

const programArb = fc.record({
  initial: stateArb,
  // Every program starts with at least one hook.
  first: selectorSpecArb,
  steps: fc.array(stepArb, { maxLength: 12 }),
})

interface Hook extends EngineHook {
  spec: SelectorSpec
}

function mountHook(
  getState: () => State,
  spec: SelectorSpec,
  registry: PathSignalRegistry,
): Hook {
  return Object.assign(mountEngineHook(getState, compile(spec), registry), { spec })
}


const totals = {
  runs: 0,
  dispatches: 0,
  checks: 0,
  skippedRootResults: 0,
  extraReruns: 0,
  leakyRuns: 0,
  duplicateKeyRuns: 0,
  ms: 0,
}

function runProgram({
  initial,
  first,
  steps,
}: {
  initial: State
  first: SelectorSpec
  steps: Step[]
}) {
  totals.runs++
  let state = initial
  const registry = createPathSignalRegistry(alienEngine)
  const hooks: Hook[] = []
  const log: string[] = []

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

  if (hasDuplicateKeys(initial)) {
    totals.duplicateKeyRuns++
    return
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
        const before = hooks.map((h) => ({ evals: h.evals, want: expected(h.spec, prev) }))
        state = applyAction(prev, step.action)
        log.push(`  dispatch ${JSON.stringify(step.action)} -> ${JSON.stringify(state)}`)
        if (hasDuplicateKeys(state)) {
          totals.duplicateKeyRuns++
          break
        }
        totals.dispatches++
        reconcileState(prev, state, registry, alienEngine)
        check(`after dispatch ${JSON.stringify(step.action)}`)
        const nodes = collectStateNodes(state)
        for (const [i, hook] of hooks.entries()) {
          const reran = hook.evals > before[i].evals
          const changed =
            compareResults(before[i].want, expected(hook.spec, state), nodes) !== null
          if (reran && !changed) totals.extraReruns++
        }
      }
    }
  } finally {
    for (const hook of hooks) hook.stop()
  }

  const stats = registry.debugStats()
  const leaked = Object.entries(stats).filter(([, n]) => n !== 0)
  if (leaked.length > 0) {
    totals.leakyRuns++
    // Known leak cases are listed in differentialRepros.spec.tsx; set
    // SIGNALS_FUZZ_LEAKS=fail to stop on (and shrink) the first leak.
    if (process.env.SIGNALS_FUZZ_LEAKS !== 'fail') return
    throw new Error(
      `REGISTRY LEAK after all hooks stopped: ${JSON.stringify(stats)} ` +
        `paths=${JSON.stringify(registry.debugPaths())}\n${log.join('\n')}`,
    )
  }
}

describe('signal engine differential (property)', () => {
  afterAll(() => {
    // Written to stdout directly: vitest hides console output of passing tests.
    if (process.env.SIGNALS_FUZZ_RUNS) {
      process.stdout.write(
        `[engine differential] ${JSON.stringify(totals)} ` +
          `${((totals.runs / totals.ms) * 1000).toFixed(0)} runs/s\n`,
      )
    }
  })

  it(
    'every hook matches the selector run on raw state after every dispatch',
    () => {
      const start = performance.now()
      try {
        fc.assert(fc.property(programArb, runProgram), fuzzParams(200))
      } finally {
        totals.ms += performance.now() - start
      }
      expect(totals.runs).toBeGreaterThan(0)
    },
    FUZZ_TIMEOUT,
  )
})
