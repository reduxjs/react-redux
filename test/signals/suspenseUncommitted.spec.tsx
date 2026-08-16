/**
 * Suspense, transitions, and uncommitted components.
 *
 * React only calls a `useSyncExternalStore` subscribe function for
 * components that COMMIT. A component that renders but never commits —
 * it suspended, or its render was thrown away when a transition was
 * abandoned — never subscribes, so it never unsubscribes either.
 * Whatever the hook created during render must therefore be safe to
 * abandon: nothing render-phase may anchor itself in the provider-level
 * `PathSignalRegistry`, because no cleanup path will ever run for it.
 *
 * Today that invariant does not hold for UNGATEABLE hooks (selectors the
 * coarse probe can't gate: root enumeration, empty footprint, non-plain
 * root state). The mount-seeding path calls `selectorComputed.get()`
 * during render, which creates path signals in `registry.signals` and
 * links the computed to them. If the component never commits, those
 * entries stay in the registry until the state paths are pruned.
 *
 * These tests assert the DESIRED behavior: an uncommitted component
 * leaves the registry exactly as it found it. The ungateable cases fail
 * against the current implementation — that failure is the leak.
 *
 * Two of the failures go beyond the obvious suspend-forever case:
 * - StrictMode double-invokes useMemo factories in dev, so a plain
 *   StrictMode mount creates TWO bridges, each of which eagerly builds;
 *   the discarded one is orphaned. Every ungateable mount leaks in dev.
 * - A component that suspends and LATER commits still leaks: React
 *   retries with a fresh build after showing the fallback, and the
 *   first render attempt's bridge is orphaned.
 *
 * Modeled on mobx-react-lite's strictAndConcurrentMode tests
 * (mobx-react-lite PRs #121 and #332), but where MobX must force GC and
 * observe FinalizationRegistry callbacks, our leak is anchored in the
 * registry Map, so `registry.debugStats()` observes it deterministically.
 */
import { configureStore, createSlice } from '@reduxjs/toolkit'
import * as rtl from '@testing-library/react'
import React, { StrictMode, Suspense, startTransition, useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import type { RegistryStats } from '../../src/signals/pathSignalRegistry'
import type { PathSignalRegistry } from '../../src/signals'
import {
  SignalProvider,
  useSignalContext,
  useSignalSelector,
} from '../../src/signals'

const makeStore = () => {
  const aSlice = createSlice({
    name: 'a',
    initialState: { value: 0, nested: { n: 0 } },
    reducers: {
      bumpA(state) {
        state.value++
        state.nested.n += 10
      },
    },
  })
  const dynSlice = createSlice({
    name: 'dyn',
    initialState: {} as Record<string, { v: number }>,
    reducers: {
      addDyn(state, action: { payload: string }) {
        state[action.payload] = { v: 1 }
      },
      removeDyn(state, action: { payload: string }) {
        delete state[action.payload]
      },
    },
  })

  const store = configureStore({
    reducer: { a: aSlice.reducer, dyn: dynSlice.reducer },
  })

  return {
    store,
    bumpA: aSlice.actions.bumpA,
    addDyn: dynSlice.actions.addDyn,
    removeDyn: dynSlice.actions.removeDyn,
  }
}

type AppState = ReturnType<ReturnType<typeof makeStore>['store']['getState']>

const noStabilityCheck = {
  devModeChecks: { stabilityCheck: 'never' as const },
}

// Enumerating the root makes the probe mark the hook ungateable, so the
// mount path builds the deep graph eagerly, during render. The nested
// read guarantees real path signals get created by that build.
const ungateableSelector = (s: AppState) => {
  Object.keys(s)
  return s.a.nested.n
}

// Reads one root key without enumerating: stays in the coarse tier,
// creates no signals at mount.
const gateableSelector = (s: AppState) => s.a.nested.n

const EMPTY_STATS: RegistryStats = {
  signals: 0,
  prefixCounts: 0,
  prefixOnlyPaths: 0,
  childIndex: 0,
  arrayMetas: 0,
  columnsByArray: 0,
  structuresByArray: 0,
  segmentSubs: 0,
}

function makeRegistryCapture() {
  const captured: { registry: PathSignalRegistry | null } = { registry: null }
  function Capture() {
    captured.registry = useSignalContext().registry
    return null
  }
  const registry = () => {
    if (captured.registry === null) throw new Error('registry not captured')
    return captured.registry
  }
  return { registry, Capture }
}

/** A manually-controlled Suspense gate. */
function makeGate() {
  let resolve!: () => void
  let resolved = false
  const promise = new Promise<void>((r) => {
    resolve = r
  }).then(() => {
    resolved = true
  })
  return {
    isResolved: () => resolved,
    suspendIfPending() {
      if (!resolved) throw promise
    },
    async open() {
      resolve()
      await promise
    },
  }
}

afterEach(() => {
  rtl.cleanup()
})

describe('baseline: committed components already clean up', () => {
  it('ungateable hook builds path signals at mount and releases them all on unmount', () => {
    const { store } = makeStore()
    const { registry, Capture } = makeRegistryCapture()

    function Watcher() {
      const n = useSignalSelector(ungateableSelector, noStabilityCheck)
      return <div data-testid="n">{n}</div>
    }

    const { unmount, getByTestId } = rtl.render(
      <SignalProvider store={store}>
        <Capture />
        <Watcher />
      </SignalProvider>,
    )

    expect(getByTestId('n').textContent).toBe('0')
    // Eager render-phase build: the deep graph exists before any dispatch.
    expect(registry().debugStats().signals).toBeGreaterThan(0)

    unmount()
    expect(registry().debugStats()).toEqual(EMPTY_STATS)
  })
})

describe('component suspends before commit, promise never resolves', () => {
  it('gateable hook: registers nothing while suspended and nothing after unmount', () => {
    const { store } = makeStore()
    const { registry, Capture } = makeRegistryCapture()
    const gate = makeGate()

    function SuspendingWatcher() {
      const n = useSignalSelector(gateableSelector, noStabilityCheck)
      gate.suspendIfPending()
      return <div data-testid="n">{n}</div>
    }

    const { unmount, getByTestId } = rtl.render(
      <SignalProvider store={store}>
        <Capture />
        <Suspense fallback={<div data-testid="fallback">loading</div>}>
          <SuspendingWatcher />
        </Suspense>
      </SignalProvider>,
    )

    expect(getByTestId('fallback').textContent).toBe('loading')
    // The coarse sub is only registered inside subscribe, which never
    // ran; the probe itself creates no signals. Nothing to leak.
    expect(registry().debugStats()).toEqual(EMPTY_STATS)

    unmount()
    expect(registry().debugStats()).toEqual(EMPTY_STATS)
  })

  it('ungateable hook: leaves no path signals behind while suspended', () => {
    const { store } = makeStore()
    const { registry, Capture } = makeRegistryCapture()
    const gate = makeGate()

    function SuspendingWatcher() {
      const n = useSignalSelector(ungateableSelector, noStabilityCheck)
      gate.suspendIfPending()
      return <div data-testid="n">{n}</div>
    }

    const { getByTestId } = rtl.render(
      <SignalProvider store={store}>
        <Capture />
        <Suspense fallback={<div data-testid="fallback">loading</div>}>
          <SuspendingWatcher />
        </Suspense>
      </SignalProvider>,
    )

    expect(getByTestId('fallback').textContent).toBe('loading')
    // The component rendered but never committed: subscribe never ran,
    // no effect exists, and no cleanup path will ever fire for this
    // hook. Anything it left in the registry is unreachable garbage.
    expect(registry().debugStats().signals).toBe(0)
  })

  it('ungateable hook: registry is empty after the suspended tree unmounts', () => {
    const { store } = makeStore()
    const { registry, Capture } = makeRegistryCapture()
    const gate = makeGate()

    function SuspendingWatcher() {
      const n = useSignalSelector(ungateableSelector, noStabilityCheck)
      gate.suspendIfPending()
      return <div data-testid="n">{n}</div>
    }

    const { unmount } = rtl.render(
      <SignalProvider store={store}>
        <Capture />
        <Suspense fallback={<div>loading</div>}>
          <SuspendingWatcher />
        </Suspense>
      </SignalProvider>,
    )

    // Unmounting the whole tree cannot help: React never subscribed
    // this hook, so it has no unsubscribe to call during unmount.
    unmount()
    expect(registry().debugStats()).toEqual(EMPTY_STATS)
  })
})

describe('component suspends, then commits when the promise resolves', () => {
  it('recovers fully: subscribes on commit, updates on dispatch, releases on unmount', async () => {
    const { store, bumpA } = makeStore()
    const { registry, Capture } = makeRegistryCapture()
    const gate = makeGate()

    function SuspendingWatcher() {
      const n = useSignalSelector(ungateableSelector, noStabilityCheck)
      gate.suspendIfPending()
      return <div data-testid="n">{n}</div>
    }

    const { unmount, getByTestId, queryByTestId } = rtl.render(
      <SignalProvider store={store}>
        <Capture />
        <Suspense fallback={<div data-testid="fallback">loading</div>}>
          <SuspendingWatcher />
        </Suspense>
      </SignalProvider>,
    )

    expect(getByTestId('fallback').textContent).toBe('loading')

    await rtl.act(async () => {
      await gate.open()
    })

    // Committed: fallback gone, content up.
    expect(queryByTestId('fallback')).toBeNull()
    expect(getByTestId('n').textContent).toBe('0')

    // The subscription is live: dispatches flow through the deep graph.
    rtl.act(() => {
      store.dispatch(bumpA())
    })
    expect(getByTestId('n').textContent).toBe('10')

    // Commit gave the hook a real unsubscribe path; unmount uses it.
    unmount()
    expect(registry().debugStats()).toEqual(EMPTY_STATS)
  })
})

describe("today's only recovery path: pruning when state paths disappear", () => {
  it("a never-committed hook's leaked leaf signal is removed when its state key is deleted", async () => {
    // This test documents CURRENT behavior, not desired behavior: the
    // leaked path signal sits in the registry until the state key it
    // tracks is deleted, and prune() removes it as part of normal diff
    // processing. It passes today and should keep passing after the
    // fix (at which point there is simply nothing to prune).
    const { store, addDyn, removeDyn } = makeStore()
    const { registry, Capture } = makeRegistryCapture()
    const gate = makeGate()

    rtl.act(() => {
      store.dispatch(addDyn('x'))
    })

    const readsDynX = (s: AppState) => {
      Object.keys(s)
      return s.dyn.x?.v ?? -1
    }

    function SuspendingWatcher() {
      const v = useSignalSelector(readsDynX, noStabilityCheck)
      gate.suspendIfPending()
      return <div>{v}</div>
    }

    rtl.render(
      <SignalProvider store={store}>
        <Capture />
        <Suspense fallback={<div>loading</div>}>
          <SuspendingWatcher />
        </Suspense>
      </SignalProvider>,
    )

    // Today the eager render-phase build creates the leaf signal even
    // though the component never commits. Deleting the key must prune
    // it — the registry must not keep entries for paths that no longer
    // exist in state, regardless of who reads them. (Post-fix, nothing
    // leaks in the first place and this holds trivially.)
    rtl.act(() => {
      store.dispatch(removeDyn('x'))
    })

    expect(registry().debugPaths()).not.toContain('dyn.x.v')
  })
})

describe('transitions', () => {
  it('a suspended transition that never finishes leaves the registry empty after unmount', async () => {
    const { store } = makeStore()
    const { registry, Capture } = makeRegistryCapture()
    const gate = makeGate()
    let setShowOuter: ((show: boolean) => void) | null = null

    function SuspendingWatcher() {
      const n = useSignalSelector(ungateableSelector, noStabilityCheck)
      gate.suspendIfPending()
      return <div data-testid="n">{n}</div>
    }

    function App() {
      const [show, setShow] = useState(false)
      setShowOuter = setShow
      return (
        <SignalProvider store={store}>
          <Capture />
          <Suspense fallback={<div data-testid="fallback">loading</div>}>
            {show ? <SuspendingWatcher /> : <div data-testid="idle">idle</div>}
          </Suspense>
        </SignalProvider>
      )
    }

    const { unmount, getByTestId } = rtl.render(<App />)
    expect(getByTestId('idle').textContent).toBe('idle')

    // Mount the suspending component inside a transition. The transition
    // render runs the hook (and, today, the eager deep build), then
    // suspends; React holds the old UI, so nothing ever commits.
    rtl.act(() => {
      startTransition(() => {
        setShowOuter!(true)
      })
    })
    expect(getByTestId('idle').textContent).toBe('idle')

    unmount()
    expect(registry().debugStats()).toEqual(EMPTY_STATS)
  })

  it('an abandoned transition render leaves the registry empty while the app keeps running', () => {
    const { store } = makeStore()
    const { registry, Capture } = makeRegistryCapture()
    const gate = makeGate()
    let setShowOuter: ((show: boolean) => void) | null = null

    function SuspendingWatcher() {
      const n = useSignalSelector(ungateableSelector, noStabilityCheck)
      gate.suspendIfPending()
      return <div data-testid="n">{n}</div>
    }

    function App() {
      const [show, setShow] = useState(false)
      setShowOuter = setShow
      return (
        <SignalProvider store={store}>
          <Capture />
          <Suspense fallback={<div data-testid="fallback">loading</div>}>
            {show ? <SuspendingWatcher /> : <div data-testid="idle">idle</div>}
          </Suspense>
        </SignalProvider>
      )
    }

    const { getByTestId } = rtl.render(<App />)

    // Start showing the suspending component in a transition, then
    // change course before it resolves. React throws the transition
    // render away; the component never commits, and the tree it was
    // going to join is still mounted — so no unmount will ever come to
    // the rescue. The registry must not have grown.
    rtl.act(() => {
      startTransition(() => {
        setShowOuter!(true)
      })
    })
    rtl.act(() => {
      setShowOuter!(false)
    })

    expect(getByTestId('idle').textContent).toBe('idle')
    expect(registry().debugStats()).toEqual(EMPTY_STATS)
  })
})

describe('StrictMode', () => {
  it('double-invoked render of an ungateable hook does not double-count, and unmount is clean', () => {
    const { store, bumpA } = makeStore()
    const { registry, Capture } = makeRegistryCapture()

    function Watcher() {
      const n = useSignalSelector(ungateableSelector, noStabilityCheck)
      return <div data-testid="n">{n}</div>
    }

    const { unmount, getByTestId } = rtl.render(
      <StrictMode>
        <SignalProvider store={store}>
          <Capture />
          <Watcher />
        </SignalProvider>
      </StrictMode>,
    )

    expect(getByTestId('n').textContent).toBe('0')
    const mounted = registry().debugStats()

    // StrictMode double-invokes the useMemo factory in dev, so TWO
    // bridges were created at mount and each ran the eager deep build;
    // only one of them ever gets a subscribe/unsubscribe pair. The
    // committed one must keep working; the discarded one must not
    // leave anything in the registry (today it does — that is the
    // failure this test pins).
    rtl.act(() => {
      store.dispatch(bumpA())
    })
    expect(getByTestId('n').textContent).toBe('10')
    expect(registry().debugStats().segmentSubs).toBe(mounted.segmentSubs)

    unmount()
    expect(registry().debugStats()).toEqual(EMPTY_STATS)
  })

  it('StrictMode + suspended-forever ungateable hook leaves the registry empty after unmount', () => {
    const { store } = makeStore()
    const { registry, Capture } = makeRegistryCapture()
    const gate = makeGate()

    function SuspendingWatcher() {
      const n = useSignalSelector(ungateableSelector, noStabilityCheck)
      gate.suspendIfPending()
      return <div data-testid="n">{n}</div>
    }

    const { unmount, getByTestId } = rtl.render(
      <StrictMode>
        <SignalProvider store={store}>
          <Capture />
          <Suspense fallback={<div data-testid="fallback">loading</div>}>
            <SuspendingWatcher />
          </Suspense>
        </SignalProvider>
      </StrictMode>,
    )

    expect(getByTestId('fallback').textContent).toBe('loading')
    unmount()
    expect(registry().debugStats()).toEqual(EMPTY_STATS)
  })
})
