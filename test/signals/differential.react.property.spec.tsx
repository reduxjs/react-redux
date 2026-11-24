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
 *
 * Only `Date` is faked, and it moves forward a fixed step before every
 * dispatch, so the registry's default sweep policy (replaced here by a
 * short counting one) sees both its dispatch delay and its time floor pass
 * during a program. After the tree unmounts, each registry gets idle
 * dispatches until its policy has swept and forgotten everything. A
 * registry still holding entries then is a stuck sweep if sweeping every
 * held path empties it, and a leak otherwise. Both are counted and only
 * fail with SIGNALS_FUZZ_LEAKS=fail.
 */
import * as rtl from '@testing-library/react'
import fc from 'fast-check'
import { StrictMode, useMemo } from 'react'
import type { ReactNode } from 'react'
import { legacy_createStore as createStore } from 'redux'
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import Provider from '../../src/components/Provider'
import { useSelector } from '../../src/hooks/useSelector'
import { SignalProvider, useSignalSelector } from '../../src/signals'
import { useSignalContext } from '../../src/signals/context'
import type { PathSignalRegistry } from '../../src/signals/pathSignalRegistry'
import type * as SweepPolicyModule from '../../src/signals/sweepPolicy'
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
  selectorSpecArb,
  showSpec,
  stateArb,
} from './differential/model'
import type { Action, SelectorSpec, State } from './differential/model'
import { settleBound, settleRegistry } from './differential/settle'

const MS_PER_DISPATCH = 40

const sweep = vi.hoisted(() => ({
  // Holds a released path for two dispatches and 100 ms, so with 40 ms per
  // dispatch the floor decides and the sweep comes on the third dispatch.
  options: { dispatches: 2, ms: 100 },
  holds: 0,
  sweeps: 0,
  settleSweeps: 0,
  settling: false,
}))

vi.mock('../../src/signals/sweepPolicy', async (importOriginal) => {
  const actual = await importOriginal<typeof SweepPolicyModule>()
  const create = actual.delayedSweepPolicy(sweep.options)
  return {
    ...actual,
    defaultSweepPolicy: () => {
      const policy = create()
      return {
        ...policy,
        released(path: string, weight: number, now: number) {
          sweep.holds++
          policy.released(path, weight, now)
        },
        tick(now: number) {
          const due = policy.tick(now)
          if (sweep.settling) sweep.settleSweeps += due.length
          else sweep.sweeps += due.length
          return due
        },
      }
    },
  }
})

const advanceClock = () => vi.setSystemTime(Date.now() + MS_PER_DISPATCH)

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
    arbitrary: fc.record({
      t: fc.constant('mount' as const),
      spec: selectorSpecArb,
      eq: eqArb,
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
      t: fc.constant('swapSelector' as const),
      pick: fc.nat({ max: 7 }),
      spec: selectorSpecArb,
    }),
    weight: 1,
  },
  {
    arbitrary: fc.record({
      t: fc.constant('swapStore' as const),
      action: actionArb,
    }),
    weight: 1,
  },
)

const programArb = (maxLength: number, size: fc.SizeForArbitrary) =>
  fc.record({
    initial: stateArb,
    strict: fc.boolean(),
    first: fc.record({ spec: selectorSpecArb, eq: eqArb }),
    steps: fc.array(stepArb, { maxLength, size }),
  })

/**
 * Short programs cover many small cases. A path held by the sweep policy
 * needs three more dispatches before it is swept, which short programs
 * rarely reach, so long ones cover sweeps while components are mounted.
 */
const programs = {
  short: { arb: programArb(10, 'small'), defaultRuns: 30 },
  long: { arb: programArb(30, 'max'), defaultRuns: 10 },
}

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

const bump = (m: Map<number, number>, id: number) =>
  m.set(id, (m.get(id) ?? 0) + 1)

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

function App(props: {
  store: Store
  slots: Slot[]
  rec: Recorder
  strict: boolean
}) {
  const { store, slots, rec, strict } = props
  const body: ReactNode = (
    <>
      <Provider
        store={store}
        stabilityCheck="never"
        identityFunctionCheck="never"
      >
        {slots.map((slot) => (
          <StockHook key={slot.id} slot={slot} rec={rec} />
        ))}
      </Provider>
      <SignalProvider
        store={store}
        stabilityCheck="never"
        identityFunctionCheck="never"
      >
        <GrabRegistry rec={rec} />
        {slots.map((slot) => (
          <SignalHook key={slot.id} slot={slot} rec={rec} />
        ))}
      </SignalProvider>
    </>
  )
  return strict ? <StrictMode>{body}</StrictMode> : body
}

const makeTotals = () => ({
  runs: 0,
  steps: 0,
  dispatches: 0,
  checks: 0,
  skippedRootResults: 0,
  extraRenders: 0,
  leakyRuns: 0,
  stuckRuns: 0,
  ms: 0,
})
let totals = makeTotals()

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
  sweep.settling = false
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
  const log: string[] = [
    `  strict: ${strict}`,
    `  initial: ${JSON.stringify(initial)}`,
  ]
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
        if (harness)
          fail('HARNESS (stock hook disagrees with model)', slot, when, harness)
      }
      const signalsValue = rec.signals.get(slot.id)
      // Under shallowEqual, which of two equal results a hook keeps depends
      // on when it last ran the selector, so equal results are a match.
      if (slot.eq === 'shallow' && shallowEqual(stockValue, signalsValue))
        continue
      const diff = compareResults(stockValue, signalsValue, allNodes)
      if (diff) fail('MISMATCH', slot, when, diff)
    }
  }

  const transition = (action: Action) => {
    const next = applyAction(state, action)
    log.push(`  dispatch ${JSON.stringify(action)} -> ${JSON.stringify(next)}`)
    addNodes(next)
    return next
  }

  const view = rtl.render(
    <App store={store} slots={slots} rec={rec} strict={strict} />,
  )
  const rerender = () =>
    view.rerender(<App store={store} slots={slots} rec={rec} strict={strict} />)
  try {
    check('after mount')
    for (const step of steps) {
      totals.steps++
      const stockBefore = new Map(rec.stockRenders)
      const signalsBefore = new Map(rec.signalsRenders)
      if (step.t === 'dispatch') {
        const states = step.actions.map(
          (action) => (state = transition(action)),
        )
        rtl.act(() => {
          for (const payload of states) {
            totals.dispatches++
            advanceClock()
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
            (rec.stockRenders.get(slot.id) ?? 0) >
            (stockBefore.get(slot.id) ?? 0)
          const signalsRendered =
            (rec.signalsRenders.get(slot.id) ?? 0) >
            (signalsBefore.get(slot.id) ?? 0)
          if (signalsRendered && !stockRendered) totals.extraRenders++
        }
      }
    }
  } finally {
    view.unmount()
  }

  sweep.settling = true
  const bound = settleBound(
    { maxDispatches: sweep.options.dispatches, ms: sweep.options.ms },
    MS_PER_DISPATCH,
  )
  for (const registry of rec.registries) {
    const outcome = settleRegistry(registry, advanceClock, bound)
    if (outcome.kind === 'empty') continue
    if (outcome.kind === 'stuck') totals.stuckRuns++
    else totals.leakyRuns++
    if (process.env.SIGNALS_FUZZ_LEAKS !== 'fail') break
    const problem =
      outcome.kind === 'stuck'
        ? `STUCK SWEEP: entries left after ${bound} idle dispatches, ` +
          'cleared only by sweeping every held path'
        : `REGISTRY LEAK after unmount: ${JSON.stringify(outcome.drained)} ` +
          `paths=${JSON.stringify(registry.debugPaths())}`
    throw new Error(
      `${problem}\n  before sweeping: ${JSON.stringify(outcome.held)}\n` +
        log.join('\n'),
    )
  }
}

beforeAll(() => {
  // Installed before any render: the registry reads `Date.now` when created.
  vi.useFakeTimers({ toFake: ['Date'] })
})

afterEach(() => {
  rtl.cleanup()
})

afterAll(() => {
  vi.useRealTimers()
})

describe('useSignalSelector vs useSelector differential (property)', () => {
  it.each(Object.keys(programs) as (keyof typeof programs)[])(
    'every signal hook returns what its stock twin returns after every step (%s programs)',
    (shape) => {
      const { arb, defaultRuns } = programs[shape]
      totals = makeTotals()
      Object.assign(sweep, { holds: 0, sweeps: 0, settleSweeps: 0 })
      const start = performance.now()
      try {
        fc.assert(fc.property(arb, runProgram), fuzzParams(defaultRuns))
      } finally {
        totals.ms += performance.now() - start
        // Written to stdout directly: vitest hides console output of passing tests.
        if (process.env.SIGNALS_FUZZ_RUNS) {
          const { holds, sweeps, settleSweeps } = sweep
          process.stdout.write(
            `[react differential, ${shape} programs] ` +
              `${JSON.stringify({ ...totals, holds, sweeps, settleSweeps })} ` +
              `${((totals.runs / totals.ms) * 1000).toFixed(0)} runs/s\n`,
          )
        }
      }
      expect(totals.runs).toBeGreaterThan(0)
    },
    FUZZ_TIMEOUT,
  )
})
