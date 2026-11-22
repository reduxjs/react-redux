/**
 * Randomized differential test of useSignalSelector against the stock
 * useSelector, both rendered by React.
 *
 * Each run renders two sibling trees on the same store: a stock Provider
 * with useSelector hooks and a SignalProvider with useSignalSelector hooks.
 * Every hook slot has the same random selector (compiled separately for each
 * tree) and the same equality function. A random program then dispatches
 * transitions (one or two per act), mounts and unmounts slots, swaps a
 * slot's selector, or swaps the store. Runs may use StrictMode.
 *
 * After every step each signal hook must return what its stock twin
 * returns; state objects in the result must be the identical raw object.
 * Stock hooks using Object.is are also checked against the selector run on
 * raw state, to catch harness mistakes. A signal component that rendered
 * when its stock twin did not is counted as an extra render (not a failure).
 * After the tree unmounts every registry should be empty; leaks are counted
 * and only fail with SIGNALS_FUZZ_LEAKS=fail.
 *
 * Known bugs are kept out of the generators unless SIGNALS_FUZZ_KNOWN_BUGS=1
 * (see differential/model.ts and differentialRepros.spec.tsx).
 */
import * as rtl from '@testing-library/react'
import fc from 'fast-check'
import { StrictMode, useMemo } from 'react'
import type { ReactNode } from 'react'
import { legacy_createStore as createStore } from 'redux'
import { afterAll, afterEach, describe, expect, it } from 'vitest'
import Provider from '../../src/components/Provider'
import { useSelector } from '../../src/hooks/useSelector'
import { SignalProvider, useSignalSelector } from '../../src/signals'
import { useSignalContext } from '../../src/signals/context'
import type { PathSignalRegistry } from '../../src/signals/pathSignalRegistry'
import shallowEqual from '../../src/utils/shallowEqual'
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
  knownKeyedArrayBug,
  knownMoveOrRootBug,
  reusesOldRoot,
  selectorSpecArb,
  showSpec,
  stateArb,
} from './differential/model'
import type { Action, SelectorSpec, State } from './differential/model'

type Eq = 'is' | 'shallow'
const eqFns = { is: Object.is, shallow: shallowEqual }

type Step =
  | { t: 'dispatch'; actions: Action[] }
  | { t: 'mount'; spec: SelectorSpec; eq: Eq }
  | { t: 'unmount'; pick: number }
  | { t: 'swapSelector'; pick: number; spec: SelectorSpec }
  | { t: 'swapStore'; action: Action }

const eqArb = fc.constantFrom<Eq>('is', 'is', 'shallow')

const stepArb: fc.Arbitrary<Step> = fc.oneof(
  {
    arbitrary: fc.record({
      t: fc.constant('dispatch' as const),
      // Two dispatches in one act: React batches the renders.
      actions: fc.array(actionArb, { minLength: 1, maxLength: 2 }),
    }),
    weight: 6,
  },
  {
    arbitrary: fc.record({ t: fc.constant('mount' as const), spec: selectorSpecArb, eq: eqArb }),
    weight: 2,
  },
  { arbitrary: fc.record({ t: fc.constant('unmount' as const), pick: fc.nat({ max: 7 }) }), weight: 1 },
  {
    arbitrary: fc.record({
      t: fc.constant('swapSelector' as const),
      pick: fc.nat({ max: 7 }),
      spec: selectorSpecArb,
    }),
    weight: 1,
  },
  { arbitrary: fc.record({ t: fc.constant('swapStore' as const), action: actionArb }), weight: 1 },
)

const programArb = fc.record({
  initial: stateArb,
  strict: fc.boolean(),
  first: fc.record({ spec: selectorSpecArb, eq: eqArb }),
  steps: fc.array(stepArb, { maxLength: 10 }),
})

type Replace = { type: 'replace'; payload: State }
const reducer = (s: State = {}, a: Replace | { type: string }) =>
  a.type === 'replace' ? (a as Replace).payload : s
const makeStore = (state: State) => createStore(reducer, state)
type Store = ReturnType<typeof makeStore>

interface Slot {
  id: number
  spec: SelectorSpec
  eq: Eq
}

/** What the components saw during their latest render. */
interface Recorder {
  stock: Map<number, unknown>
  signals: Map<number, unknown>
  stockRenders: Map<number, number>
  signalsRenders: Map<number, number>
  registries: Set<PathSignalRegistry>
}

const bump = (m: Map<number, number>, id: number) => m.set(id, (m.get(id) ?? 0) + 1)

function StockHook({ slot, rec }: { slot: Slot; rec: Recorder }) {
  const selector = useMemo(() => compile(slot.spec), [slot.spec])
  const value = useSelector(selector, eqFns[slot.eq])
  rec.stock.set(slot.id, value)
  bump(rec.stockRenders, slot.id)
  return null
}

function SignalHook({ slot, rec }: { slot: Slot; rec: Recorder }) {
  const selector = useMemo(() => compile(slot.spec), [slot.spec])
  const value = useSignalSelector(selector, eqFns[slot.eq])
  rec.signals.set(slot.id, value)
  bump(rec.signalsRenders, slot.id)
  return null
}

function GrabRegistry({ rec }: { rec: Recorder }) {
  rec.registries.add(useSignalContext().registry)
  return null
}

function App(props: { store: Store; slots: Slot[]; rec: Recorder; strict: boolean }) {
  const { store, slots, rec, strict } = props
  const body: ReactNode = (
    <>
      <Provider store={store} stabilityCheck="never" identityFunctionCheck="never">
        {slots.map((slot) => (
          <StockHook key={slot.id} slot={slot} rec={rec} />
        ))}
      </Provider>
      <SignalProvider store={store} stabilityCheck="never" identityFunctionCheck="never">
        <GrabRegistry rec={rec} />
        {slots.map((slot) => (
          <SignalHook key={slot.id} slot={slot} rec={rec} />
        ))}
      </SignalProvider>
    </>
  )
  return strict ? <StrictMode>{body}</StrictMode> : body
}

const totals = {
  runs: 0,
  steps: 0,
  dispatches: 0,
  checks: 0,
  skippedRootResults: 0,
  extraRenders: 0,
  leakyRuns: 0,
  // Programs stopped early because the next state hits a known bug.
  gated: {} as Record<string, number>,
  ms: 0,
}

/** Name of the known bug the transition would hit, if any. */
function knownBug(
  prev: State,
  next: State,
  previousRoots: WeakSet<object>,
  keyFields: Map<string, string>,
): string | undefined {
  if (hasDuplicateKeys(next)) return 'duplicateKeys'
  if (reusesOldRoot(next, previousRoots)) return 'oldRoot'
  const keyed = knownKeyedArrayBug(prev, next, keyFields)
  if (keyed) return 'keylessElement'
  const other = knownMoveOrRootBug(prev, next)
  if (other) return other
  previousRoots.add(prev)
  return undefined
}

class StopProgram extends Error {}

function runProgram({
  initial,
  strict,
  first,
  steps,
}: {
  initial: State
  strict: boolean
  first: { spec: SelectorSpec; eq: Eq }
  steps: Step[]
}) {
  totals.runs++
  if (hasDuplicateKeys(initial)) {
    totals.gated.duplicateKeys = (totals.gated.duplicateKeys ?? 0) + 1
    return
  }

  let state = initial
  let store = makeStore(state)
  let nextId = 0
  let slots: Slot[] = [{ id: nextId++, ...first }]
  const rec: Recorder = {
    stock: new Map(),
    signals: new Map(),
    stockRenders: new Map(),
    signalsRenders: new Map(),
    registries: new Set(),
  }
  const allNodes = new WeakSet<object>()
  const addNodes = (s: State) => {
    const visit = (v: unknown) => {
      if (v === null || typeof v !== 'object' || allNodes.has(v)) return
      allNodes.add(v)
      Object.values(v).forEach(visit)
    }
    visit(s)
  }
  addNodes(state)
  const previousRoots = new WeakSet<object>([initial])
  const keyFields = new Map<string, string>()
  const log: string[] = [`  strict: ${strict}`, `  initial: ${JSON.stringify(initial)}`]
  const describeSlot = (s: Slot) => `${showSpec(s.spec)} (equality ${s.eq})`
  log.push(`  mount ${slots[0].id}: ${describeSlot(slots[0])}`)

  const fail = (label: string, slot: Slot, when: string, diff: string) => {
    throw new Error(
      `${label} in slot ${slot.id} ${when}: ${diff}\n` +
        `  selector: ${describeSlot(slot)}\n` +
        `  state: ${JSON.stringify(state)}\n${log.join('\n')}`,
    )
  }

  const check = (when: string) => {
    const current = collectStateNodes(state)
    for (const slot of slots) {
      totals.checks++
      const want = expected(slot.spec, state)
      if (containsRoot(want, state)) {
        totals.skippedRootResults++
        continue
      }
      const stockValue = rec.stock.get(slot.id)
      if (slot.eq === 'is') {
        const harness = compareResults(want, stockValue, current)
        if (harness) fail('HARNESS (stock hook disagrees with model)', slot, when, harness)
      }
      const signalsValue = rec.signals.get(slot.id)
      // Under shallowEqual, which of two equal results a hook keeps depends
      // on when it last ran the selector, so equal results are a match.
      if (slot.eq === 'shallow' && shallowEqual(stockValue, signalsValue)) continue
      const diff = compareResults(stockValue, signalsValue, allNodes)
      if (diff) fail('MISMATCH', slot, when, diff)
    }
  }

  /** Next state, or StopProgram when it would hit a known bug. */
  const transition = (action: Action) => {
    const next = applyAction(state, action)
    log.push(`  dispatch ${JSON.stringify(action)} -> ${JSON.stringify(next)}`)
    const bug = knownBug(state, next, previousRoots, keyFields)
    if (bug) {
      totals.gated[bug] = (totals.gated[bug] ?? 0) + 1
      throw new StopProgram()
    }
    addNodes(next)
    return next
  }

  const view = rtl.render(<App store={store} slots={slots} rec={rec} strict={strict} />)
  const rerender = () =>
    view.rerender(<App store={store} slots={slots} rec={rec} strict={strict} />)
  try {
    check('after mount')
    for (const step of steps) {
      totals.steps++
      const stockBefore = new Map(rec.stockRenders)
      const signalsBefore = new Map(rec.signalsRenders)
      if (step.t === 'dispatch') {
        const states = step.actions.map((action) => (state = transition(action)))
        rtl.act(() => {
          for (const payload of states) {
            totals.dispatches++
            store.dispatch({ type: 'replace', payload })
          }
        })
      } else if (step.t === 'mount') {
        const slot = { id: nextId++, spec: step.spec, eq: step.eq }
        slots = [...slots, slot]
        log.push(`  mount ${slot.id}: ${describeSlot(slot)}`)
        rerender()
      } else if (step.t === 'unmount') {
        if (slots.length === 0) continue
        const [gone] = slots.splice(step.pick % slots.length, 1)
        slots = [...slots]
        log.push(`  unmount ${gone.id}`)
        rerender()
      } else if (step.t === 'swapSelector') {
        if (slots.length === 0) continue
        const index = step.pick % slots.length
        const slot = { ...slots[index], spec: step.spec }
        slots = slots.map((s, i) => (i === index ? slot : s))
        log.push(`  swap selector of ${slot.id}: ${describeSlot(slot)}`)
        rerender()
      } else {
        state = transition(step.action)
        log.push('  (into a new store)')
        store = makeStore(state)
        rerender()
      }
      check(`after ${step.t}`)
      if (step.t === 'dispatch') {
        for (const slot of slots) {
          const stockRendered =
            (rec.stockRenders.get(slot.id) ?? 0) > (stockBefore.get(slot.id) ?? 0)
          const signalsRendered =
            (rec.signalsRenders.get(slot.id) ?? 0) > (signalsBefore.get(slot.id) ?? 0)
          if (signalsRendered && !stockRendered) totals.extraRenders++
        }
      }
    }
  } catch (e) {
    if (!(e instanceof StopProgram)) throw e
  } finally {
    view.unmount()
  }

  for (const registry of rec.registries) {
    const stats = registry.debugStats()
    if (Object.values(stats).every((n) => n === 0)) continue
    totals.leakyRuns++
    if (process.env.SIGNALS_FUZZ_LEAKS !== 'fail') break
    throw new Error(
      `REGISTRY LEAK after unmount: ${JSON.stringify(stats)} ` +
        `paths=${JSON.stringify(registry.debugPaths())}\n${log.join('\n')}`,
    )
  }
}

afterEach(() => {
  rtl.cleanup()
})

describe('useSignalSelector vs useSelector differential (property)', () => {
  afterAll(() => {
    // Written to stdout directly: vitest hides console output of passing tests.
    if (process.env.SIGNALS_FUZZ_RUNS) {
      process.stdout.write(
        `[react differential] ${JSON.stringify(totals)} ` +
          `${((totals.runs / totals.ms) * 1000).toFixed(0)} runs/s\n`,
      )
    }
  })

  it(
    'every signal hook returns what its stock twin returns after every step',
    () => {
      const start = performance.now()
      try {
        fc.assert(fc.property(programArb, runProgram), fuzzParams(30))
      } finally {
        totals.ms += performance.now() - start
      }
      expect(totals.runs).toBeGreaterThan(0)
    },
    FUZZ_TIMEOUT,
  )
})
