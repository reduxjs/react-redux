/**
 * Tests for createSignalSelectorHook — custom-context parity with stock
 * createSelectorHook. SignalProvider already accepts a `context` prop;
 * these tests verify the hook side binds to that context correctly.
 */
import { configureStore, createSlice } from '@reduxjs/toolkit'
import * as rtl from '@testing-library/react'
import { createContext } from 'react'
import { describe, expect, it, afterEach } from 'vitest'
import type { ReactReduxContextValue } from '../../src/components/Context'
// Import the stock Provider directly from source — the package root
// currently carries the bench override (Provider = SignalProvider).
import Provider from '../../src/components/Provider'
import {
  createSignalSelectorHook,
  SignalProvider,
  useSignalSelector,
} from '../../src/signals'

const makeStore = (initialValue = 0) => {
  const counterSlice = createSlice({
    name: 'counter',
    initialState: { value: initialValue },
    reducers: {
      increment: (state) => {
        state.value += 1
      },
      incrementBy: (state, action: { payload: number }) => {
        state.value += action.payload
      },
    },
  })

  const store = configureStore({
    reducer: { counter: counterSlice.reducer },
  })

  return {
    store,
    increment: counterSlice.actions.increment,
    incrementBy: counterSlice.actions.incrementBy,
  }
}

type RootState = { counter: { value: number } }

const customContext = createContext<ReactReduxContextValue<
  any,
  any
> | null>(null)

const useCustomSelector = createSignalSelectorHook(customContext)

afterEach(() => {
  rtl.cleanup()
})

describe('createSignalSelectorHook', () => {
  it('reads from the store provided through the custom context', () => {
    const { store } = makeStore(7)

    function Display() {
      const value = useCustomSelector((s: RootState) => s.counter.value)
      return <div data-testid="value">{value}</div>
    }

    const { getByTestId } = rtl.render(
      <SignalProvider store={store} context={customContext}>
        <Display />
      </SignalProvider>,
    )

    expect(getByTestId('value').textContent).toBe('7')
  })

  it('bound and default hooks read their own stores when providers nest', () => {
    const defaultStore = makeStore(1)
    const customStore = makeStore(100)

    function Display() {
      const defaultValue = useSignalSelector(
        (s: RootState) => s.counter.value,
      )
      const customValue = useCustomSelector((s: RootState) => s.counter.value)
      return (
        <div>
          <div data-testid="default">{defaultValue}</div>
          <div data-testid="custom">{customValue}</div>
        </div>
      )
    }

    const { getByTestId } = rtl.render(
      <SignalProvider store={defaultStore.store}>
        <SignalProvider store={customStore.store} context={customContext}>
          <Display />
        </SignalProvider>
      </SignalProvider>,
    )

    expect(getByTestId('default').textContent).toBe('1')
    expect(getByTestId('custom').textContent).toBe('100')

    rtl.act(() => {
      customStore.store.dispatch(customStore.increment())
    })
    expect(getByTestId('default').textContent).toBe('1')
    expect(getByTestId('custom').textContent).toBe('101')

    rtl.act(() => {
      defaultStore.store.dispatch(defaultStore.increment())
    })
    expect(getByTestId('default').textContent).toBe('2')
    expect(getByTestId('custom').textContent).toBe('101')
  })

  it('dispatches to the other store do not re-render a bound-hook component', () => {
    const defaultStore = makeStore(1)
    const customStore = makeStore(100)
    let renders = 0

    function CustomOnly() {
      renders++
      const value = useCustomSelector((s: RootState) => s.counter.value)
      return <div data-testid="custom-only">{value}</div>
    }

    rtl.render(
      <SignalProvider store={defaultStore.store}>
        <SignalProvider store={customStore.store} context={customContext}>
          <CustomOnly />
        </SignalProvider>
      </SignalProvider>,
    )

    expect(renders).toBe(1)

    rtl.act(() => {
      defaultStore.store.dispatch(defaultStore.increment())
    })
    expect(renders).toBe(1)

    rtl.act(() => {
      customStore.store.dispatch(customStore.increment())
    })
    expect(renders).toBe(2)
  })

  it('throws when the bound context has no provider', () => {
    const { store } = makeStore()

    function Display() {
      const value = useCustomSelector((s: RootState) => s.counter.value)
      return <div>{value}</div>
    }

    // Default SignalProvider present, but the custom context is empty
    expect(() =>
      rtl.render(
        <SignalProvider store={store}>
          <Display />
        </SignalProvider>,
      ),
    ).toThrow(/must be used within a <SignalProvider>/)
  })

  it('throws when the custom context was filled by a regular <Provider>', () => {
    const { store } = makeStore()

    function Display() {
      const value = useCustomSelector((s: RootState) => s.counter.value)
      return <div>{value}</div>
    }

    expect(() =>
      rtl.render(
        <Provider store={store} context={customContext}>
          <Display />
        </Provider>,
      ),
    ).toThrow(/not a regular <Provider>/)
  })

  it('factory with no arguments creates an independent hook bound to the default context', () => {
    const freshHook = createSignalSelectorHook()
    expect(freshHook).not.toBe(useSignalSelector)

    const { store } = makeStore(3)

    function Display() {
      const value = freshHook((s: RootState) => s.counter.value)
      return <div data-testid="value">{value}</div>
    }

    const { getByTestId } = rtl.render(
      <SignalProvider store={store}>
        <Display />
      </SignalProvider>,
    )

    expect(getByTestId('value').textContent).toBe('3')
  })

  it('withTypes on a bound hook returns the same hook', () => {
    const typed = useCustomSelector.withTypes<RootState>()
    expect(typed).toBe(useCustomSelector)
  })

  it('supports the options-object second argument on bound hooks', () => {
    const { store, increment, incrementBy } = makeStore(0)
    let renders = 0

    function Display() {
      renders++
      const parity = useCustomSelector(
        (s: RootState) => [s.counter.value % 2] as const,
        { equalityFn: (a, b) => a[0] === b[0] },
      )
      return <div data-testid="parity">{String(parity[0])}</div>
    }

    const { getByTestId } = rtl.render(
      <SignalProvider store={store} context={customContext}>
        <Display />
      </SignalProvider>,
    )

    expect(getByTestId('parity').textContent).toBe('0')
    expect(renders).toBe(1)

    rtl.act(() => {
      store.dispatch(increment())
    })
    expect(getByTestId('parity').textContent).toBe('1')
    expect(renders).toBe(2)

    rtl.act(() => {
      store.dispatch(incrementBy(2))
    })
    // 1 -> 3 in a single dispatch: parity unchanged, equalityFn
    // suppresses the re-render
    expect(getByTestId('parity').textContent).toBe('1')
    expect(renders).toBe(2)
  })
})
