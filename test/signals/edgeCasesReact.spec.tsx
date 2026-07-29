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
    // selectorRef is updated in a layout effect, but nothing invalidates
    // the computed when the selector function changes. The hook keeps
    // returning the previous selector's cached result until some store
    // change happens to fire one of the OLD selector's signals.
    it.fails('re-selects when a prop used by the selector changes', () => {
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

    // Cached proxies close over the leafTracker of the evaluation that
    // created them. When component A mounts first and traverses the state,
    // component B's identity-only reads are recorded into A's tracker —
    // B's computed ends up with no dependencies and never re-runs.
    it.fails('a second component still tracks identity changes when another component traversed the same slice first', () => {
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

  describe('server-side rendering', () => {
    // useSyncExternalStore is called without a getServerSnapshot argument,
    // so any server render (Next.js etc.) throws.
    it.fails('supports renderToString', () => {
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
