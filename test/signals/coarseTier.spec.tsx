/**
 * Integration tests for the coarse tier: hooks defer building their deep
 * signal graph at mount. The initial render runs the selector once through
 * a cheap top-level probe proxy, registers the touched root segments in
 * the registry's SegmentIndex, and only builds the full tracking-proxy
 * graph when a dispatch actually changes one of those segments.
 *
 * Key invariants under test:
 * - No signals are materialized for a deferred hook (registry.size() === 0)
 * - Irrelevant dispatches neither re-render nor promote a deferred hook
 * - A relevant dispatch promotes exactly the affected hooks, which then
 *   behave identically to eagerly-built hooks
 * - Swapping the selector while unbuilt re-probes and re-registers (the
 *   missed-update bug in react-redux PR #2355's version of this design)
 * - Selectors the probe can't gate (root enumeration, empty footprint,
 *   non-plain-object root state) build eagerly at mount
 */
import type { UnknownAction } from '@reduxjs/toolkit'
import { configureStore, createSlice } from '@reduxjs/toolkit'
import * as rtl from '@testing-library/react'
import React, { useCallback, useState } from 'react'
import { legacy_createStore as createStore } from 'redux'
import type { PathSignalRegistry } from '../../src/signals'
import {
  SignalProvider,
  useSignalContext,
  useSignalSelector,
} from '../../src/signals'

const makeStore = () => {
  const aSlice = createSlice({
    name: 'a',
    initialState: { value: 0 },
    reducers: {
      bumpA(state) {
        state.value++
      },
    },
  })
  const bSlice = createSlice({
    name: 'b',
    initialState: { value: 0 },
    reducers: {
      bumpB(state) {
        state.value++
      },
    },
  })

  const store = configureStore({
    reducer: { a: aSlice.reducer, b: bSlice.reducer },
  })

  return {
    store,
    bumpA: aSlice.actions.bumpA,
    bumpB: bSlice.actions.bumpB,
  }
}

type AppState = ReturnType<ReturnType<typeof makeStore>['store']['getState']>

const noStabilityCheck = {
  devModeChecks: { stabilityCheck: 'never' as const },
}

function makeRegistryCapture() {
  const captured: { registry: PathSignalRegistry | null } = { registry: null }
  function Capture() {
    captured.registry = useSignalContext().registry
    return null
  }
  return { captured, Capture }
}

afterEach(() => {
  rtl.cleanup()
})

describe('coarse tier: deferred deep-graph build', () => {
  it('defers building the deep graph until a dispatch touches a probed segment', () => {
    const { store, bumpA, bumpB } = makeStore()
    const { captured, Capture } = makeRegistryCapture()
    let selectorCalls = 0
    let renders = 0

    const selectAValue = (s: AppState) => {
      selectorCalls++
      return s.a.value
    }

    function Watcher() {
      renders++
      const value = useSignalSelector(selectAValue, noStabilityCheck)
      return <div data-testid="value">{value}</div>
    }

    const { getByTestId } = rtl.render(
      <SignalProvider store={store}>
        <Watcher />
        <Capture />
      </SignalProvider>,
    )

    const registry = captured.registry!
    expect(getByTestId('value').textContent).toBe('0')
    expect(selectorCalls).toBe(1) // one probe run, nothing else
    expect(renders).toBe(1)
    expect(registry.size()).toBe(0) // no signals materialized
    expect(registry.segmentIndex.size()).toBe(1)

    // Irrelevant dispatch: doesn't re-render, doesn't run the selector,
    // doesn't promote.
    rtl.act(() => {
      store.dispatch(bumpB())
    })
    expect(renders).toBe(1)
    expect(selectorCalls).toBe(1)
    expect(registry.size()).toBe(0)
    expect(registry.segmentIndex.size()).toBe(1)

    // Relevant dispatch: promotes, builds the deep graph, re-renders.
    rtl.act(() => {
      store.dispatch(bumpA())
    })
    expect(getByTestId('value').textContent).toBe('1')
    expect(registry.segmentIndex.size()).toBe(0)
    expect(registry.size()).toBeGreaterThan(0)

    // Post-promotion precision: the deep graph ignores b-only dispatches.
    const rendersAfterPromotion = renders
    rtl.act(() => {
      store.dispatch(bumpB())
    })
    expect(renders).toBe(rendersAfterPromotion)

    // And keeps tracking a.
    rtl.act(() => {
      store.dispatch(bumpA())
    })
    expect(getByTestId('value').textContent).toBe('2')
  })

  it('re-probes when the selector is swapped while unbuilt (missed-update bug in PR #2355)', () => {
    const { store, bumpA, bumpB } = makeStore()
    let renders = 0

    function Watcher() {
      renders++
      const [useB, setUseB] = useState(false)
      const value = useSignalSelector(
        useCallback(
          (s: AppState) => (useB ? s.b.value : s.a.value),
          [useB],
        ),
        noStabilityCheck,
      )
      return (
        <div>
          <div data-testid="value">{value}</div>
          <button data-testid="toggle" onClick={() => setUseB(true)}>
            toggle
          </button>
        </div>
      )
    }

    const { getByTestId } = rtl.render(
      <SignalProvider store={store}>
        <Watcher />
      </SignalProvider>,
    )
    expect(getByTestId('value').textContent).toBe('0')

    // Swap the selector's footprint from {a} to {b} while still unbuilt.
    rtl.fireEvent.click(getByTestId('toggle'))
    expect(getByTestId('value').textContent).toBe('0') // b.value is still 0

    // A dispatch that changes b MUST reach this hook. A stale {a}
    // registration (the #2355 bug) would miss this update forever.
    rtl.act(() => {
      store.dispatch(bumpB())
    })
    expect(getByTestId('value').textContent).toBe('1')

    // After promotion the deep graph tracks only b.
    const rendersAfter = renders
    rtl.act(() => {
      store.dispatch(bumpA())
    })
    expect(renders).toBe(rendersAfter)
  })

  it("gates on segments probed via 'in' checks and promotes when the key appears", () => {
    interface RootState {
      a: { v: number }
      dynamicKey?: number
    }
    const reducer = (
      state: RootState = { a: { v: 0 } },
      action: UnknownAction,
    ): RootState => {
      switch (action.type) {
        case 'addKey':
          return { ...state, dynamicKey: 1 }
        case 'bumpA':
          return { ...state, a: { v: state.a.v + 1 } }
        default:
          return state
      }
    }
    const store = configureStore({ reducer })
    let renders = 0

    const selectHasKey = (s: RootState) => 'dynamicKey' in s

    function Watcher() {
      renders++
      const has = useSignalSelector(selectHasKey, noStabilityCheck)
      return <div data-testid="has">{String(has)}</div>
    }

    const { getByTestId } = rtl.render(
      <SignalProvider store={store}>
        <Watcher />
      </SignalProvider>,
    )
    expect(getByTestId('has').textContent).toBe('false')

    // Changing an unrelated segment doesn't wake the hook.
    rtl.act(() => {
      store.dispatch({ type: 'bumpA' })
    })
    expect(renders).toBe(1)

    // Adding the probed key does.
    rtl.act(() => {
      store.dispatch({ type: 'addKey' })
    })
    expect(getByTestId('has').textContent).toBe('true')
  })

  it('builds eagerly when the selector enumerates the root (Object.keys)', () => {
    interface RootState {
      a: { v: number }
      dynamicKey?: number
    }
    const reducer = (
      state: RootState = { a: { v: 0 } },
      action: UnknownAction,
    ): RootState => {
      switch (action.type) {
        case 'addKey':
          return { ...state, dynamicKey: 1 }
        default:
          return state
      }
    }
    const store = configureStore({ reducer })
    const { captured, Capture } = makeRegistryCapture()

    const selectKeyCount = (s: RootState) => Object.keys(s).length

    function Watcher() {
      const count = useSignalSelector(selectKeyCount, noStabilityCheck)
      return <div data-testid="count">{count}</div>
    }

    const { getByTestId } = rtl.render(
      <SignalProvider store={store}>
        <Watcher />
        <Capture />
      </SignalProvider>,
    )

    const registry = captured.registry!
    expect(getByTestId('count').textContent).toBe('1')
    // Enumeration can't be gated by top-level segments — built at mount.
    expect(registry.segmentIndex.size()).toBe(0)
    expect(registry.size()).toBeGreaterThan(0)

    rtl.act(() => {
      store.dispatch({ type: 'addKey' })
    })
    expect(getByTestId('count').textContent).toBe('2')
  })

  it('builds eagerly for an identity selector and returns the raw state', () => {
    const { store, bumpA } = makeStore()
    const { captured, Capture } = makeRegistryCapture()
    let selected: AppState | null = null

    const identity = (s: AppState) => s

    function Watcher() {
      selected = useSignalSelector(identity, {
        devModeChecks: {
          stabilityCheck: 'never',
          identityFunctionCheck: 'never',
        },
      })
      return null
    }

    rtl.render(
      <SignalProvider store={store}>
        <Watcher />
        <Capture />
      </SignalProvider>,
    )

    const registry = captured.registry!
    // Empty probe footprint (returned the root without reading keys):
    // can't be gated, so the deep graph builds at mount.
    expect(registry.segmentIndex.size()).toBe(0)
    // The hook hands back the RAW state object, not a proxy.
    expect(selected).toBe(store.getState())

    // NOTE: `s => s` does NOT re-render on dispatch — the reconcile pass
    // never bumps a signal for the root path, so an identity selector has
    // no dependencies. This is a PRE-EXISTING limitation of the deep
    // tracking system (verified against the pre-coarse-tier
    // implementation), not a coarse-tier behavior, so it is not asserted
    // here. Dev mode already warns about identity selectors.
  })

  it('serves a fresh snapshot when a dispatch lands between render and subscribe', () => {
    const { store, bumpA } = makeStore()
    const { captured, Capture } = makeRegistryCapture()

    const selectAValue = (s: AppState) => s.a.value

    function Watcher() {
      const value = useSignalSelector(selectAValue, noStabilityCheck)
      return <div data-testid="value">{value}</div>
    }

    // Layout effects run before useSyncExternalStore's passive subscribe
    // effect, so this dispatch lands in the render->subscribe gap.
    function LayoutDispatcher() {
      React.useLayoutEffect(() => {
        store.dispatch(bumpA())
      }, [])
      return null
    }

    const { getByTestId } = rtl.render(
      <SignalProvider store={store}>
        <Watcher />
        <LayoutDispatcher />
        <Capture />
      </SignalProvider>,
    )

    // The probe saw a.value === 0; the snapshot must reflect the dispatch.
    expect(getByTestId('value').textContent).toBe('1')

    // And the hook keeps working afterward.
    rtl.act(() => {
      store.dispatch(bumpA())
    })
    expect(getByTestId('value').textContent).toBe('2')
  })

  it('registers exactly one coarse sub under StrictMode double-subscribe', () => {
    const { store, bumpA, bumpB } = makeStore()
    const { captured, Capture } = makeRegistryCapture()

    const selectAValue = (s: AppState) => s.a.value

    function Watcher() {
      const value = useSignalSelector(selectAValue, noStabilityCheck)
      return <div data-testid="value">{value}</div>
    }

    const { getByTestId } = rtl.render(
      <React.StrictMode>
        <SignalProvider store={store}>
          <Watcher />
          <Capture />
        </SignalProvider>
      </React.StrictMode>,
    )

    const registry = captured.registry!
    expect(getByTestId('value').textContent).toBe('0')
    // subscribe -> cleanup -> resubscribe must not leak a registration.
    expect(registry.segmentIndex.size()).toBe(1)
    expect(registry.size()).toBe(0)

    rtl.act(() => {
      store.dispatch(bumpB())
    })
    expect(registry.segmentIndex.size()).toBe(1)

    rtl.act(() => {
      store.dispatch(bumpA())
    })
    expect(getByTestId('value').textContent).toBe('1')
    expect(registry.segmentIndex.size()).toBe(0)
  })

  it('cleans up the coarse registration when unmounted while unbuilt', () => {
    const { store, bumpA } = makeStore()
    const { captured, Capture } = makeRegistryCapture()

    const selectAValue = (s: AppState) => s.a.value

    function Watcher() {
      const value = useSignalSelector(selectAValue, noStabilityCheck)
      return <div data-testid="value">{value}</div>
    }

    function App() {
      const [show, setShow] = useState(true)
      return (
        <SignalProvider store={store}>
          {show ? <Watcher /> : null}
          <Capture />
          <button data-testid="hide" onClick={() => setShow(false)}>
            hide
          </button>
        </SignalProvider>
      )
    }

    const { getByTestId } = rtl.render(<App />)
    const registry = captured.registry!
    expect(registry.segmentIndex.size()).toBe(1)

    rtl.fireEvent.click(getByTestId('hide'))
    expect(registry.segmentIndex.size()).toBe(0)
    expect(registry.size()).toBe(0)

    // A now-relevant dispatch finds no subscriber and breaks nothing.
    expect(() => {
      rtl.act(() => {
        store.dispatch(bumpA())
      })
    }).not.toThrow()
    expect(registry.size()).toBe(0)
  })

  it('promotes hooks independently: only the hook whose segment changed wakes up', () => {
    const { store, bumpA, bumpB } = makeStore()
    const { captured, Capture } = makeRegistryCapture()
    let rendersA = 0
    let rendersB = 0

    const selectAValue = (s: AppState) => s.a.value
    const selectBValue = (s: AppState) => s.b.value

    function WatcherA() {
      rendersA++
      const value = useSignalSelector(selectAValue, noStabilityCheck)
      return <div data-testid="a">{value}</div>
    }
    function WatcherB() {
      rendersB++
      const value = useSignalSelector(selectBValue, noStabilityCheck)
      return <div data-testid="b">{value}</div>
    }

    const { getByTestId } = rtl.render(
      <SignalProvider store={store}>
        <WatcherA />
        <WatcherB />
        <Capture />
      </SignalProvider>,
    )

    const registry = captured.registry!
    expect(registry.segmentIndex.size()).toBe(2)
    expect(registry.size()).toBe(0)

    rtl.act(() => {
      store.dispatch(bumpA())
    })
    expect(getByTestId('a').textContent).toBe('1')
    expect(rendersB).toBe(1) // B never re-rendered
    expect(registry.segmentIndex.size()).toBe(1) // B is still deferred
    expect(registry.size()).toBeGreaterThan(0) // A's graph exists

    rtl.act(() => {
      store.dispatch(bumpB())
    })
    expect(getByTestId('b').textContent).toBe('1')
    expect(registry.segmentIndex.size()).toBe(0)
  })

  it('propagates a selector throw during the mount probe', () => {
    const { store } = makeStore()

    const throwing = (s: AppState) =>
      (s.a as unknown as { missing: { value: number } }).missing.value

    function Watcher() {
      const value = useSignalSelector(throwing, noStabilityCheck)
      return <div>{value}</div>
    }

    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      expect(() => {
        rtl.render(
          <SignalProvider store={store}>
            <Watcher />
          </SignalProvider>,
        )
      }).toThrow()
    } finally {
      spy.mockRestore()
    }
  })

  it('declines to probe a non-plain root (Map roots are unsupported, pre-existing)', () => {
    // The deep tracking system does not support Map root state: the
    // tracking proxy's shell breaks Map method receivers, so mount throws
    // "Method Map.prototype.get called on incompatible receiver". That
    // failure predates the coarse tier (verified against the
    // pre-coarse-tier implementation). What the coarse tier guarantees is
    // that a non-plain root is never PROBED — the hook goes straight to
    // the eager-build path and fails the same way it always did, instead
    // of failing differently inside the probe proxy.
    const store = createStore(
      (state: Map<string, number> = new Map([['v', 0]]), action) =>
        action.type === 'bump'
          ? new Map([['v', (state.get('v') ?? 0) + 1]])
          : state,
    )

    const selectV = (s: Map<string, number>) => s.get('v')

    function Watcher() {
      const value = useSignalSelector(selectV, noStabilityCheck)
      return <div data-testid="value">{value}</div>
    }

    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      expect(() => {
        rtl.render(
          <SignalProvider store={store}>
            <Watcher />
          </SignalProvider>,
        )
      }).toThrow(/incompatible receiver/)
    } finally {
      spy.mockRestore()
    }
  })
})
