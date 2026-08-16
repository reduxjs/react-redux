/**
 * Edge case audit tests (React integration level).
 *
 * Tests marked `it.fails` assert the DESIRED behavior for confirmed bugs —
 * they pass while the bug exists and will flip to failing once the bug is
 * fixed (at which point remove the `.fails` marker).
 *
 * See dev-plans research doc: 2026-07-28-edge-case-audit.md
 */
import * as rtl from '@testing-library/react'
import React, { StrictMode, useLayoutEffect, useState } from 'react'
import { renderToString } from 'react-dom/server'
import {
  configureStore,
  createSlice,
  type PayloadAction,
} from '@reduxjs/toolkit'
import { SignalProvider, useSignalSelector, unwrap } from '../../src/signals'

interface Counter {
  id: string
  label: string
  value: number
}

const countersSlice = createSlice({
  name: 'counters',
  initialState: {
    counter1: { id: 'counter1', label: 'Clicks', value: 0 } as Counter,
    counter2: { id: 'counter2', label: 'Views', value: 42 } as Counter,
  },
  reducers: {
    increment(state, action: PayloadAction<'counter1' | 'counter2'>) {
      state[action.payload].value += 1
    },
  },
})

const filterSlice = createSlice({
  name: 'filter',
  initialState: 'all' as 'all' | 'active' | 'completed',
  reducers: {
    set(_state, action: PayloadAction<'all' | 'active' | 'completed'>) {
      return action.payload
    },
  },
})

const settingsSlice = createSlice({
  name: 'settings',
  initialState: { theme: 'dark', fontSize: 12 },
  reducers: {
    setFontSize(state, action: PayloadAction<number>) {
      state.fontSize = action.payload
    },
    setTheme(state, action: PayloadAction<string>) {
      state.theme = action.payload
    },
  },
})

function createTestStore() {
  return configureStore({
    reducer: {
      counters: countersSlice.reducer,
      filter: filterSlice.reducer,
      settings: settingsSlice.reducer,
    },
  })
}

type TestStore = ReturnType<typeof createTestStore>
type TestState = ReturnType<TestStore['getState']>

describe('edge cases: React integration', () => {
  let store: TestStore

  beforeEach(() => {
    store = createTestStore()
  })

  afterEach(() => {
    rtl.cleanup()
  })

  describe('selector closing over props', () => {
    // A render that brings a different selector function triggers a
    // render-phase swap: the computed is invalidated and re-evaluated in
    // place, so getSnapshot returns the new closure's value in the same
    // render (same approach as useSyncExternalStoreWithSelector).
    it('re-selects when a prop used by the selector changes', () => {
      function CounterValue({ which }: { which: 'counter1' | 'counter2' }) {
        const value = useSignalSelector(
          (s: TestState) => s.counters[which].value,
        )
        return <div data-testid="value">{value}</div>
      }

      let setWhich: (w: 'counter1' | 'counter2') => void = () => {}
      function Parent() {
        const [which, set] = useState<'counter1' | 'counter2'>('counter1')
        setWhich = set
        return <CounterValue which={which} />
      }

      const { getByTestId } = rtl.render(
        <SignalProvider store={store}>
          <Parent />
        </SignalProvider>,
      )

      expect(getByTestId('value').textContent).toBe('0')

      rtl.act(() => {
        setWhich('counter2')
      })

      // counter2's value is 42 — the stale closure keeps showing counter1's 0
      expect(getByTestId('value').textContent).toBe('42')
    })
  })

  describe('root identity selector', () => {
    // The root proxy's path is '' and the diff never updates the '' path,
    // so `s => s` establishes no firing dependency.
    it.fails('state => state re-renders on dispatch', () => {
      function WholeState() {
        const state = useSignalSelector((s: TestState) => s)
        return <div data-testid="filter">{state.filter}</div>
      }

      const { getByTestId } = rtl.render(
        <SignalProvider store={store}>
          <WholeState />
        </SignalProvider>,
      )

      expect(getByTestId('filter').textContent).toBe('all')

      rtl.act(() => {
        store.dispatch(filterSlice.actions.set('active'))
      })

      expect(getByTestId('filter').textContent).toBe('active')
    })
  })

  describe('identity comparison across multiple components', () => {
    it('control: a lone component tracks identity changes of a leaf object', () => {
      const originalSettings = store.getState().settings

      function IdentityWatcher() {
        const result = useSignalSelector((s: TestState) =>
          unwrap(s.settings) === originalSettings ? 'same' : 'changed',
        )
        return <div data-testid="identity">{result}</div>
      }

      const { getByTestId } = rtl.render(
        <SignalProvider store={store}>
          <IdentityWatcher />
        </SignalProvider>,
      )

      expect(getByTestId('identity').textContent).toBe('same')

      rtl.act(() => {
        store.dispatch(settingsSlice.actions.setFontSize(99))
      })

      expect(getByTestId('identity').textContent).toBe('changed')
    })

    // The active leafTracker lives in registry.leafTrackerHolder and is
    // swapped in per evaluation, so component B's identity-only reads land
    // in B's own tracker even when component A's earlier traversal already
    // populated the proxy cache.
    it('a second component still tracks identity changes when another component traversed the same slice first', () => {
      const originalSettings = store.getState().settings

      function ThemeReader() {
        const theme = useSignalSelector((s: TestState) => s.settings.theme)
        return <div data-testid="theme">{theme}</div>
      }

      function IdentityWatcher() {
        const result = useSignalSelector((s: TestState) =>
          unwrap(s.settings) === originalSettings ? 'same' : 'changed',
        )
        return <div data-testid="identity">{result}</div>
      }

      const { getByTestId } = rtl.render(
        <SignalProvider store={store}>
          {/* A mounts first, creating + caching the proxies with its tracker */}
          <ThemeReader />
          <IdentityWatcher />
        </SignalProvider>,
      )

      expect(getByTestId('identity').textContent).toBe('same')

      // Changes fontSize only — theme untouched, settings ref replaced
      rtl.act(() => {
        store.dispatch(settingsSlice.actions.setFontSize(99))
      })

      expect(getByTestId('identity').textContent).toBe('changed')
    })
  })

  describe('StrictMode', () => {
    it('renders and updates correctly under StrictMode', () => {
      function FilterReader() {
        const filter = useSignalSelector((s: TestState) => s.filter)
        return <div data-testid="filter">{filter}</div>
      }

      const { getByTestId } = rtl.render(
        <StrictMode>
          <SignalProvider store={store}>
            <FilterReader />
          </SignalProvider>
        </StrictMode>,
      )

      expect(getByTestId('filter').textContent).toBe('all')

      rtl.act(() => {
        store.dispatch(filterSlice.actions.set('active'))
      })

      expect(getByTestId('filter').textContent).toBe('active')
    })
  })

  describe('re-entrant dispatch', () => {
    it('handles a component dispatching from a layout effect in response to a change', () => {
      function ChainedDispatcher() {
        const value = useSignalSelector(
          (s: TestState) => s.counters.counter1.value,
        )
        useLayoutEffect(() => {
          if (value === 1) {
            store.dispatch(countersSlice.actions.increment('counter1'))
          }
        }, [value])
        return <div data-testid="chained">{value}</div>
      }

      const { getByTestId } = rtl.render(
        <SignalProvider store={store}>
          <ChainedDispatcher />
        </SignalProvider>,
      )

      expect(getByTestId('chained').textContent).toBe('0')

      rtl.act(() => {
        store.dispatch(countersSlice.actions.increment('counter1'))
      })

      // The layout effect chains a second increment: 0 → 1 → 2
      expect(getByTestId('chained').textContent).toBe('2')
    })

    it('handles a store subscriber dispatching during notification', () => {
      function FilterReader() {
        const filter = useSignalSelector((s: TestState) => s.filter)
        return <div data-testid="filter">{filter}</div>
      }

      const { getByTestId } = rtl.render(
        <SignalProvider store={store}>
          <FilterReader />
        </SignalProvider>,
      )

      const unsubscribe = store.subscribe(() => {
        if (store.getState().filter === 'active') {
          store.dispatch(filterSlice.actions.set('completed'))
        }
      })

      rtl.act(() => {
        store.dispatch(filterSlice.actions.set('active'))
      })

      expect(getByTestId('filter').textContent).toBe('completed')
      unsubscribe()
    })
  })

  describe('selector errors', () => {
    class ErrorBoundary extends React.Component<
      { children: React.ReactNode },
      { error: Error | null }
    > {
      state = { error: null as Error | null }
      static getDerivedStateFromError(error: Error) {
        return { error }
      }
      render() {
        if (this.state.error) {
          return <div data-testid="boundary">{this.state.error.message}</div>
        }
        return this.props.children
      }
    }

    it('recovers when a throwing evaluation is superseded before React renders', () => {
      // Two dispatches in one act: the first makes the selector throw
      // during the effect's re-evaluation, the second fixes the state.
      // The successful re-run must clear the pending error so the
      // render that follows never sees it.
      let throwCount = 0
      function FilterReader() {
        const filter = useSignalSelector((s: TestState) => {
          if (s.filter === 'active') {
            throwCount++
            throw new Error('transient selector failure')
          }
          return s.filter
        })
        return <div data-testid="filter">{filter}</div>
      }

      const { getByTestId, queryByTestId } = rtl.render(
        <SignalProvider store={store}>
          <ErrorBoundary>
            <FilterReader />
          </ErrorBoundary>
        </SignalProvider>,
      )
      expect(getByTestId('filter').textContent).toBe('all')

      rtl.act(() => {
        store.dispatch(filterSlice.actions.set('active'))
        store.dispatch(filterSlice.actions.set('completed'))
      })

      // The throw really happened — recovery is what is being tested,
      // not a selector that never saw the bad state.
      expect(throwCount).toBeGreaterThan(0)
      expect(queryByTestId('boundary')).toBeNull()
      expect(getByTestId('filter').textContent).toBe('completed')
    })

    it('recovers when a store subscriber corrects the throwing state during notification', () => {
      // Same retry leg, driven re-entrantly: the subscriber sees the
      // bad state mid-notification and dispatches the fix before React
      // gets to render.
      let throwCount = 0
      function FilterReader() {
        const filter = useSignalSelector((s: TestState) => {
          if (s.filter === 'active') {
            throwCount++
            throw new Error('transient selector failure')
          }
          return s.filter
        })
        return <div data-testid="filter">{filter}</div>
      }

      const { getByTestId, queryByTestId } = rtl.render(
        <SignalProvider store={store}>
          <ErrorBoundary>
            <FilterReader />
          </ErrorBoundary>
        </SignalProvider>,
      )

      // Promote out of the coarse tier first so the deep effect
      // re-evaluates the selector synchronously on each dispatch —
      // otherwise the hook never observes the intermediate state.
      rtl.act(() => {
        store.dispatch(filterSlice.actions.set('completed'))
      })
      expect(getByTestId('filter').textContent).toBe('completed')

      const unsubscribe = store.subscribe(() => {
        if (store.getState().filter === 'active') {
          store.dispatch(filterSlice.actions.set('all'))
        }
      })

      rtl.act(() => {
        store.dispatch(filterSlice.actions.set('active'))
      })

      expect(throwCount).toBeGreaterThan(0)
      expect(queryByTestId('boundary')).toBeNull()
      expect(getByTestId('filter').textContent).toBe('all')
      unsubscribe()
    })
  })

  describe('dispatch during a selector', () => {
    it('a selector that dispatches once during evaluation settles on the final state', () => {
      // Dispatching from a selector is an application bug, but it must
      // not corrupt the graph or loop forever — the guarded dispatch
      // lands and every hook settles on the post-dispatch state.
      let dispatched = false

      function GreedyReader() {
        const value = useSignalSelector((s: TestState) => {
          if (!dispatched && s.counters.counter1.value === 1) {
            dispatched = true
            store.dispatch(countersSlice.actions.increment('counter1'))
          }
          return s.counters.counter1.value
        })
        return <div data-testid="greedy">{value}</div>
      }

      function OtherReader() {
        const value = useSignalSelector(
          (s: TestState) => s.counters.counter1.value,
        )
        return <div data-testid="other">{value}</div>
      }

      const { getByTestId } = rtl.render(
        <SignalProvider store={store}>
          <GreedyReader />
          <OtherReader />
        </SignalProvider>,
      )
      expect(getByTestId('greedy').textContent).toBe('0')

      rtl.act(() => {
        store.dispatch(countersSlice.actions.increment('counter1'))
      })

      expect(getByTestId('greedy').textContent).toBe('2')
      expect(getByTestId('other').textContent).toBe('2')
    })
  })

  describe('server-side rendering', () => {
    // useSyncExternalStore is called without a getServerSnapshot argument,
    // so any server render (Next.js etc.) throws.
    it('supports renderToString', () => {
      function FilterReader() {
        const filter = useSignalSelector((s: TestState) => s.filter)
        return <div>{filter}</div>
      }

      const html = renderToString(
        <SignalProvider store={store}>
          <FilterReader />
        </SignalProvider>,
      )

      expect(html).toContain('all')
    })
  })
})
