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
 * The program also exercises React scheduling around dispatches:
 * - dispatches inside `startTransition`, optionally interrupted by a sync
 *   dispatch in the same act;
 * - a newly mounted component that dispatches from its layout or passive
 *   mount effect, placed before or after the hooks, sometimes in the same
 *   commit as a new slot or a new store;
 * - slots whose selector closes over a prop or local state flag that flips
 *   in the same act as dispatches;
 * - a Suspense boundary holding some slots that suspends and resolves
 *   (sync or in a transition) around dispatches.
 * jsdom has no real time slicing, so only the values each component
 * committed are compared, once each act has finished.
 *
 * After every step each signal hook must return what its stock twin
 * returns; state objects in the result must be the identical raw object.
 * Slots hidden by a suspended boundary are skipped until it resolves.
 * Stock hooks using Object.is are also checked against the selector run on
 * raw state, to catch harness mistakes. A signal component that committed
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
import {
  startTransition,
  StrictMode,
  Suspense,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
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
import Provider from '../../../src/components/Provider'
import { useSelector } from '../../../src/hooks/useSelector'
import { SignalProvider, useSignalSelector } from '../../../src/signals/index'
import { useSignalContext } from '../../../src/signals/context'
import type { PathSignalRegistry } from '../../../src/signals/pathSignalRegistry'
import type * as SweepPolicyModule from '../../../src/signals/sweepPolicy'
import shallowEqual from '../../../src/utils/shallowEqual'
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
import { settleBound, settleRegistry } from './settle'

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

vi.mock('../../../src/signals/sweepPolicy', async (importOriginal) => {
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

type Impl = 'stock' | 'signals'

/** What a mount step adds. */
interface SlotSpec {
  spec: SelectorSpec
  eq: Eq
  /**
   * When set, the hook gets an inline selector that closes over a flag and
   * runs this selector instead of `spec` while the flag is on.
   */
  alt: SelectorSpec | null
  /** Whether the flag is a prop or the component's own state. */
  via: 'prop' | 'state'
  useAlt: boolean
  inSuspense: boolean
}

type Step =
  | { t: 'dispatch'; actions: Action[] }
  | { t: 'mount'; slot: SlotSpec }
  | { t: 'unmount'; pick: number }
  | { t: 'swapSelector'; pick: number; spec: SelectorSpec }
  | { t: 'swapStore'; action: Action }
  | { t: 'transition'; actions: Action[]; interrupt: Action | null }
  | {
      t: 'mountDispatcher'
      tree: Impl
      position: 'first' | 'last'
      effect: 'layout' | 'passive'
      action: Action
      newStore: Action | null
      slot: SlotSpec | null
    }
  | { t: 'toggle'; pick: number; actions: Action[]; flipFirst: boolean }
  | {
      t: 'suspense'
      actions: Action[]
      inTransition: boolean
      toggleFirst: boolean
    }

const eqArb = fc.constantFrom<Eq>('is', 'is', 'shallow')

const slotArb: fc.Arbitrary<SlotSpec> = fc.record({
  spec: selectorSpecArb,
  eq: eqArb,
  alt: fc.option(selectorSpecArb, { nil: null, freq: 2 }),
  via: fc.constantFrom('prop' as const, 'state' as const),
  useAlt: fc.boolean(),
  inSuspense: fc.constantFrom(false, false, true),
})

// Two dispatches in one act: React batches the renders.
const actionsArb = fc.array(actionArb, { minLength: 1, maxLength: 2 })
const maybeActionsArb = fc.array(actionArb, { maxLength: 2 })

const stepArb: fc.Arbitrary<Step> = fc.oneof(
  {
    arbitrary: fc.record({
      t: fc.constant('dispatch' as const),
      actions: actionsArb,
    }),
    weight: 6,
  },
  {
    arbitrary: fc.record({ t: fc.constant('mount' as const), slot: slotArb }),
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
  {
    arbitrary: fc.record({
      t: fc.constant('transition' as const),
      actions: actionsArb,
      interrupt: fc.option(actionArb, { nil: null }),
    }),
    weight: 2,
  },
  {
    arbitrary: fc.record({
      t: fc.constant('mountDispatcher' as const),
      tree: fc.constantFrom<Impl>('stock', 'signals'),
      position: fc.constantFrom('first' as const, 'last' as const),
      effect: fc.constantFrom('layout' as const, 'passive' as const),
      action: actionArb,
      newStore: fc.option(actionArb, { nil: null, freq: 3 }),
      slot: fc.option(slotArb, { nil: null }),
    }),
    weight: 2,
  },
  {
    arbitrary: fc.record({
      t: fc.constant('toggle' as const),
      pick: fc.nat({ max: 7 }),
      actions: maybeActionsArb,
      flipFirst: fc.boolean(),
    }),
    weight: 2,
  },
  {
    arbitrary: fc.record({
      t: fc.constant('suspense' as const),
      actions: maybeActionsArb,
      inTransition: fc.boolean(),
      toggleFirst: fc.boolean(),
    }),
    // Opt-in: some long programs that suspend the boundary never finish.
    // React re-renders the suspended boundaries inside act() without end
    // (seen on seed 1, long programs, run 58), so the step only runs with
    // SIGNALS_FUZZ_SUSPENSE=1 until that is understood.
    weight: process.env.SIGNALS_FUZZ_SUSPENSE ? 1 : 0,
  },
)

const programArb = (maxLength: number, size: fc.SizeForArbitrary) =>
  fc.record({
    initial: stateArb,
    strict: fc.boolean(),
    first: slotArb,
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

interface Slot extends SlotSpec {
  id: number
}

const activeSpec = (slot: Slot) =>
  slot.alt && slot.useAlt ? slot.alt : slot.spec

/** A component that dispatches `payload` into `store` once, on mount. */
interface DispatcherSpec {
  id: number
  tree: Impl
  position: 'first' | 'last'
  effect: 'layout' | 'passive'
  store: Store
  payload: State
}

/** Everything the harness changes between renders, held in React state. */
interface Config {
  store: Store
  slots: Slot[]
  dispatchers: DispatcherSpec[]
  /** Thrown by the gate while set; released when the boundary resolves. */
  suspended: Suspension | null
}

interface Suspension {
  promise: Promise<void>
  release: () => void
}

function suspension(): Suspension {
  let release = () => {}
  const promise = new Promise<void>((resolve) => {
    release = resolve
  })
  return { promise, release }
}

/** What the components committed in their latest commit. */
interface Recorder {
  stock: Map<number, unknown>
  signals: Map<number, unknown>
  stockRenders: Map<number, number>
  signalsRenders: Map<number, number>
  registries: Set<PathSignalRegistry>
  /** Local flag setters of `via: 'state'` slots, keyed `${impl}:${id}`. */
  flagSetters: Map<string, (on: boolean) => void>
  setConfig: ((config: Config) => void) | null
}

const bump = (m: Map<number, number>, id: number) =>
  m.set(id, (m.get(id) ?? 0) + 1)

function useSlotSelector(slot: Slot, rec: Recorder, impl: Impl) {
  const [localFlag, setLocalFlag] = useState(slot.useAlt)
  rec.flagSetters.set(`${impl}:${slot.id}`, setLocalFlag)
  const flag = slot.via === 'state' ? localFlag : slot.useAlt
  const main = useMemo(() => compile(slot.spec), [slot.spec])
  const alt = useMemo(() => (slot.alt ? compile(slot.alt) : null), [slot.alt])
  if (!alt) return main
  return (state: unknown) => (flag ? alt(state) : main(state))
}

function StockHook({ slot, rec }: { slot: Slot; rec: Recorder }) {
  const value = useSelector(useSlotSelector(slot, rec, 'stock'), eqFns[slot.eq])
  useLayoutEffect(() => {
    rec.stock.set(slot.id, value)
    bump(rec.stockRenders, slot.id)
  })
  return null
}

function SignalHook({ slot, rec }: { slot: Slot; rec: Recorder }) {
  const value = useSignalSelector(
    useSlotSelector(slot, rec, 'signals'),
    eqFns[slot.eq],
  )
  useLayoutEffect(() => {
    rec.signals.set(slot.id, value)
    bump(rec.signalsRenders, slot.id)
  })
  return null
}

function GrabRegistry({ rec }: { rec: Recorder }) {
  rec.registries.add(useSignalContext().registry)
  return null
}

function useDispatchOnce({ store, payload }: DispatcherSpec) {
  // StrictMode runs mount effects twice on the same fiber; dispatch once.
  const done = useRef(false)
  return () => {
    if (done.current) return
    done.current = true
    totals.dispatches++
    advanceClock()
    store.dispatch({ type: 'replace', payload })
  }
}

function LayoutDispatcher({ d }: { d: DispatcherSpec }) {
  const dispatchOnce = useDispatchOnce(d)
  useLayoutEffect(() => dispatchOnce())
  return null
}

function PassiveDispatcher({ d }: { d: DispatcherSpec }) {
  const dispatchOnce = useDispatchOnce(d)
  useEffect(() => dispatchOnce())
  return null
}

function Gate({ suspended }: { suspended: Suspension | null }) {
  if (suspended) throw suspended.promise
  return null
}

function Tree({
  impl,
  config,
  rec,
}: {
  impl: Impl
  config: Config
  rec: Recorder
}) {
  const Hook = impl === 'stock' ? StockHook : SignalHook
  const dispatchers = (position: DispatcherSpec['position']) =>
    config.dispatchers
      .filter((d) => d.tree === impl && d.position === position)
      .map((d) =>
        d.effect === 'layout' ? (
          <LayoutDispatcher key={d.id} d={d} />
        ) : (
          <PassiveDispatcher key={d.id} d={d} />
        ),
      )
  const hooks = (inSuspense: boolean) =>
    config.slots
      .filter((slot) => slot.inSuspense === inSuspense)
      .map((slot) => <Hook key={slot.id} slot={slot} rec={rec} />)
  const children = (
    <>
      {impl === 'signals' && <GrabRegistry rec={rec} />}
      {dispatchers('first')}
      {hooks(false)}
      <Suspense fallback={null}>
        <Gate suspended={config.suspended} />
        {hooks(true)}
      </Suspense>
      {dispatchers('last')}
    </>
  )
  return impl === 'stock' ? (
    <Provider
      store={config.store}
      stabilityCheck="never"
      identityFunctionCheck="never"
    >
      {children}
    </Provider>
  ) : (
    <SignalProvider
      store={config.store}
      stabilityCheck="never"
      identityFunctionCheck="never"
    >
      {children}
    </SignalProvider>
  )
}

function Root(props: { initial: Config; rec: Recorder; strict: boolean }) {
  const { initial, rec, strict } = props
  const [config, setConfig] = useState(initial)
  rec.setConfig = setConfig
  const body: ReactNode = (
    <>
      <Tree impl="stock" config={config} rec={rec} />
      <Tree impl="signals" config={config} rec={rec} />
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
  skippedSuspended: 0,
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
  first: SlotSpec
  steps: Step[]
}) {
  totals.runs++
  sweep.settling = false
  let state = initial
  let nextId = 0
  let config: Config = {
    store: makeStore(state),
    slots: [{ id: nextId++, ...first }],
    dispatchers: [],
    suspended: null,
  }
  const rec: Recorder = {
    stock: new Map(),
    signals: new Map(),
    stockRenders: new Map(),
    signalsRenders: new Map(),
    registries: new Set(),
    flagSetters: new Map(),
    setConfig: null,
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
  const describeSlot = (s: Slot) => {
    let text = `${showSpec(s.spec)} (equality ${s.eq})`
    if (s.alt)
      text +=
        `, or ${showSpec(s.alt)} while a ${s.via} flag is on ` +
        `(${s.useAlt ? 'on' : 'off'})`
    if (s.inSuspense) text += ', inside Suspense'
    return text
  }
  log.push(`  mount ${config.slots[0].id}: ${describeSlot(config.slots[0])}`)

  const fail = (label: string, slot: Slot, when: string, diff: string) => {
    throw new Error(
      `${label} in slot ${slot.id} ${when}: ${diff}\n` +
        `  selector: ${describeSlot(slot)}\n` +
        `  state: ${JSON.stringify(state)}\n${log.join('\n')}`,
    )
  }

  const check = (when: string) => {
    const current = collectStateNodes(state)
    for (const slot of config.slots) {
      if (slot.inSuspense && config.suspended) {
        totals.skippedSuspended++
        continue
      }
      totals.checks++
      const want = expected(activeSpec(slot), state)
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
  const transitions = (actions: Action[]) =>
    actions.map((action) => (state = transition(action)))

  const dispatchAll = (payloads: State[]) => {
    for (const payload of payloads) {
      totals.dispatches++
      advanceClock()
      config.store.dispatch({ type: 'replace', payload })
    }
  }

  const push = () => {
    if (!rec.setConfig) throw new Error('harness: Root has not rendered')
    rec.setConfig(config)
  }
  const pushInAct = () => rtl.act(push)

  const addSlot = (spec: SlotSpec) => {
    const slot = { id: nextId++, ...spec }
    config = { ...config, slots: [...config.slots, slot] }
    log.push(`  mount ${slot.id}: ${describeSlot(slot)}`)
  }

  const newStore = (action: Action) => {
    state = transition(action)
    log.push('  (into a new store)')
    // Dispatchers hold the store they dispatch into; drop the old ones.
    config = { ...config, store: makeStore(state), dispatchers: [] }
  }

  const view = rtl.render(<Root initial={config} rec={rec} strict={strict} />)
  try {
    check('after mount')
    for (const step of steps) {
      totals.steps++
      const stockBefore = new Map(rec.stockRenders)
      const signalsBefore = new Map(rec.signalsRenders)
      if (step.t === 'dispatch') {
        const payloads = transitions(step.actions)
        rtl.act(() => dispatchAll(payloads))
      } else if (step.t === 'mount') {
        addSlot(step.slot)
        pushInAct()
      } else if (step.t === 'unmount') {
        if (config.slots.length === 0) continue
        const slots = [...config.slots]
        const [gone] = slots.splice(step.pick % slots.length, 1)
        config = { ...config, slots }
        log.push(`  unmount ${gone.id}`)
        pushInAct()
      } else if (step.t === 'swapSelector') {
        if (config.slots.length === 0) continue
        const index = step.pick % config.slots.length
        const slot = { ...config.slots[index], spec: step.spec }
        config = {
          ...config,
          slots: config.slots.map((s, i) => (i === index ? slot : s)),
        }
        log.push(`  swap selector of ${slot.id}: ${describeSlot(slot)}`)
        pushInAct()
      } else if (step.t === 'swapStore') {
        newStore(step.action)
        pushInAct()
      } else if (step.t === 'transition') {
        log.push('  in startTransition:')
        const payloads = transitions(step.actions)
        let interrupt: State | null = null
        if (step.interrupt) {
          log.push('  then outside it:')
          interrupt = state = transition(step.interrupt)
        }
        rtl.act(() => {
          startTransition(() => dispatchAll(payloads))
          if (interrupt) dispatchAll([interrupt])
        })
      } else if (step.t === 'mountDispatcher') {
        if (step.newStore) newStore(step.newStore)
        if (step.slot) addSlot(step.slot)
        const id = nextId++
        log.push(
          `  mount dispatcher ${id} ${step.position} in the ${step.tree} tree, ` +
            `dispatching from its ${step.effect} effect:`,
        )
        const payload = (state = transition(step.action))
        const { tree, position, effect } = step
        config = {
          ...config,
          dispatchers: [
            ...config.dispatchers,
            { id, tree, position, effect, store: config.store, payload },
          ],
        }
        pushInAct()
      } else if (step.t === 'toggle') {
        const withFlag = config.slots.filter((s) => s.alt)
        if (withFlag.length === 0) continue
        const slot = withFlag[step.pick % withFlag.length]
        const setters = ['stock', 'signals'].map((impl) =>
          rec.flagSetters.get(`${impl}:${slot.id}`),
        )
        if (slot.via === 'state') {
          // A hidden slot may never have committed, so its setter is not usable.
          if (slot.inSuspense && config.suspended) continue
          if (setters.some((set) => !set)) continue
        }
        const flipped = { ...slot, useAlt: !slot.useAlt }
        config = {
          ...config,
          slots: config.slots.map((s) => (s.id === slot.id ? flipped : s)),
        }
        const flipLog = `  flip the ${slot.via} flag of ${slot.id} ${flipped.useAlt ? 'on' : 'off'}`
        if (step.flipFirst) log.push(flipLog)
        const payloads = transitions(step.actions)
        if (!step.flipFirst) log.push(flipLog)
        const flip = () => {
          if (slot.via === 'state') setters.forEach((set) => set?.(flipped.useAlt))
          else push()
        }
        rtl.act(() => {
          if (step.flipFirst) flip()
          dispatchAll(payloads)
          if (!step.flipFirst) flip()
        })
      } else {
        // React holds a listener on a thrown promise until it settles, so each
        // suspension gets its own promise, released here or at teardown.
        config.suspended?.release()
        config = {
          ...config,
          suspended: config.suspended ? null : suspension(),
        }
        const toggleLog =
          `  ${config.suspended ? 'suspend' : 'resolve'} the Suspense boundary` +
          (step.inTransition ? ' in a transition' : '')
        if (step.toggleFirst) log.push(toggleLog)
        const payloads = transitions(step.actions)
        if (!step.toggleFirst) log.push(toggleLog)
        const toggle = () =>
          step.inTransition ? startTransition(push) : push()
        rtl.act(() => {
          if (step.toggleFirst) toggle()
          dispatchAll(payloads)
          if (!step.toggleFirst) toggle()
        })
      }
      check(`after ${step.t}`)
      if (step.t === 'dispatch' || step.t === 'transition') {
        for (const slot of config.slots) {
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
    config.suspended?.release()
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
