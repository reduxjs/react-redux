/**
 * Interop between the signal hooks and the stock React-Redux API:
 * `connect()`, `useSelector`, custom contexts, and nested providers.
 *
 * These import `Provider`/`useSelector`/`connect` from their source
 * modules rather than `src/index`, so they are unaffected by the local
 * benchmark override in `src/exports.ts`.
 */
import { configureStore, createSlice } from '@reduxjs/toolkit'
import type { PayloadAction } from '@reduxjs/toolkit'
import * as rtl from '@testing-library/react'
import React, { createContext } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { connect } from '../../src/components/connect'
import type { ReactReduxContextValue } from '../../src/components/Context'
import Provider from '../../src/components/Provider'
import { createSelectorHook, useSelector } from '../../src/hooks/useSelector'
import { SignalProvider } from '../../src/signals/SignalProvider'
import {
  createSignalSelectorHook,
  useSignalSelector,
} from '../../src/signals/useSignalSelector'

interface CounterState {
  a: number
  b: number
}

const counterSlice = createSlice({
  name: 'counter',
  initialState: { a: 0, b: 0 } as CounterState,
  reducers: {
    incA(state) {
      state.a += 1
    },
    incB(state) {
      state.b += 1
    },
    setA(state, action: PayloadAction<number>) {
      state.a = action.payload
    },
  },
})

const { incA, incB } = counterSlice.actions

function makeStore() {
  return configureStore({
    reducer: counterSlice.reducer,
    // The tracking proxies hand frozen state to selectors already, and
    // the immutability check walks the whole tree on every dispatch.
    middleware: (getDefault) =>
      getDefault({ immutableCheck: false, serializableCheck: false }),
  })
}

type Store = ReturnType<typeof makeStore>

describe('connect() under SignalProvider', () => {
  it('renders and receives mapped state', () => {
    const store = makeStore()
    const mapState = (state: CounterState) => ({ a: state.a })
    const Display = connect(mapState)(({ a }: { a: number }) => (
      <div data-testid="a">{a}</div>
    ))

    rtl.render(
      <SignalProvider store={store}>
        <Display />
      </SignalProvider>,
    )

    expect(rtl.screen.getByTestId('a').textContent).toBe('0')
  })

  it('updates when its mapped slice changes', () => {
    const store = makeStore()
    const renders = vi.fn()
    const mapState = (state: CounterState) => ({ a: state.a })
    const Display = connect(mapState)(({ a }: { a: number }) => {
      renders()
      return <div data-testid="a">{a}</div>
    })

    rtl.render(
      <SignalProvider store={store}>
        <Display />
      </SignalProvider>,
    )

    rtl.act(() => {
      store.dispatch(incA())
    })

    expect(rtl.screen.getByTestId('a').textContent).toBe('1')
  })

  it('does not re-render when an unmapped slice changes', () => {
    const store = makeStore()
    const renders = vi.fn()
    const mapState = (state: CounterState) => ({ a: state.a })
    const Display = connect(mapState)(({ a }: { a: number }) => {
      renders()
      return <div data-testid="a">{a}</div>
    })

    rtl.render(
      <SignalProvider store={store}>
        <Display />
      </SignalProvider>,
    )
    const initial = renders.mock.calls.length

    rtl.act(() => {
      store.dispatch(incB())
    })

    expect(renders.mock.calls.length).toBe(initial)
  })

  it('sees raw state, not a tracking proxy, in mapStateToProps', () => {
    const store = makeStore()
    let seen: CounterState | undefined
    const mapState = (state: CounterState) => {
      seen = state
      return { a: state.a }
    }
    const Display = connect(mapState)(({ a }: { a: number }) => <div>{a}</div>)

    rtl.render(
      <SignalProvider store={store}>
        <Display />
      </SignalProvider>,
    )

    expect(seen).toBe(store.getState())
  })

  it('dispatches from a connected component and updates a sibling signal hook', () => {
    const store = makeStore()
    const Button = connect()(({ dispatch }: { dispatch: Store['dispatch'] }) => (
      <button onClick={() => dispatch(incA())}>inc</button>
    ))
    function SignalDisplay() {
      const a = useSignalSelector((state: CounterState) => state.a)
      return <div data-testid="a">{a}</div>
    }

    rtl.render(
      <SignalProvider store={store}>
        <Button />
        <SignalDisplay />
      </SignalProvider>,
    )

    rtl.act(() => {
      rtl.screen.getByText('inc').click()
    })

    expect(rtl.screen.getByTestId('a').textContent).toBe('1')
  })

  it('keeps a connected child and a signal-hook child in sync across many dispatches', () => {
    const store = makeStore()
    const Connected = connect((state: CounterState) => ({ a: state.a }))(
      ({ a }: { a: number }) => <div data-testid="connected">{a}</div>,
    )
    function Signal() {
      const a = useSignalSelector((state: CounterState) => state.a)
      return <div data-testid="signal">{a}</div>
    }

    rtl.render(
      <SignalProvider store={store}>
        <Connected />
        <Signal />
      </SignalProvider>,
    )

    for (let i = 0; i < 5; i++) {
      rtl.act(() => {
        store.dispatch(incA())
      })
      expect(rtl.screen.getByTestId('connected').textContent).toBe(String(i + 1))
      expect(rtl.screen.getByTestId('signal').textContent).toBe(String(i + 1))
    }
  })
})

describe('mixed useSelector / useSignalSelector under SignalProvider', () => {
  it('both hooks read the same value in the same component', () => {
    const store = makeStore()
    function Both() {
      const stock = useSelector((state: CounterState) => state.a)
      const signal = useSignalSelector((state: CounterState) => state.a)
      return (
        <div>
          <span data-testid="stock">{stock}</span>
          <span data-testid="signal">{signal}</span>
        </div>
      )
    }

    rtl.render(
      <SignalProvider store={store}>
        <Both />
      </SignalProvider>,
    )

    rtl.act(() => {
      store.dispatch(incA())
    })

    expect(rtl.screen.getByTestId('stock').textContent).toBe('1')
    expect(rtl.screen.getByTestId('signal').textContent).toBe('1')
  })

  it('stock useSelector gets raw state under SignalProvider', () => {
    const store = makeStore()
    let seen: CounterState | undefined
    function Reader() {
      const a = useSelector((state: CounterState) => {
        seen = state
        return state.a
      })
      return <div>{a}</div>
    }

    rtl.render(
      <SignalProvider store={store}>
        <Reader />
      </SignalProvider>,
    )

    expect(seen).toBe(store.getState())
  })

  it('sibling components using different hooks both update', () => {
    const store = makeStore()
    function Stock() {
      const b = useSelector((state: CounterState) => state.b)
      return <div data-testid="stock">{b}</div>
    }
    function Signal() {
      const b = useSignalSelector((state: CounterState) => state.b)
      return <div data-testid="signal">{b}</div>
    }

    rtl.render(
      <SignalProvider store={store}>
        <Stock />
        <Signal />
      </SignalProvider>,
    )

    rtl.act(() => {
      store.dispatch(incB())
    })

    expect(rtl.screen.getByTestId('stock').textContent).toBe('1')
    expect(rtl.screen.getByTestId('signal').textContent).toBe('1')
  })
})

describe('useSignalSelector outside a SignalProvider', () => {
  it('throws a SignalProvider-specific message under a regular Provider', () => {
    const store = makeStore()
    function Reader() {
      const a = useSignalSelector((state: CounterState) => state.a)
      return <div>{a}</div>
    }

    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      expect(() =>
        rtl.render(
          <Provider store={store}>
            <Reader />
          </Provider>,
        ),
      ).toThrow(
        'useSignalSelector must be used within a <SignalProvider>, not a regular <Provider>',
      )
    } finally {
      spy.mockRestore()
    }
  })

  it('throws when there is no provider at all', () => {
    function Reader() {
      const a = useSignalSelector((state: CounterState) => state.a)
      return <div>{a}</div>
    }

    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      expect(() => rtl.render(<Reader />)).toThrow(
        'useSignalSelector must be used within a <SignalProvider>',
      )
    } finally {
      spy.mockRestore()
    }
  })

  it('throws when a bound hook reads a custom context filled by a regular Provider', () => {
    const store = makeStore()
    const CustomContext = createContext<ReactReduxContextValue | null>(null)
    const useCustomSignalSelector = createSignalSelectorHook(CustomContext)
    function Reader() {
      const a = useCustomSignalSelector((state: CounterState) => state.a)
      return <div>{a}</div>
    }

    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      expect(() =>
        rtl.render(
          <Provider store={store} context={CustomContext}>
            <Reader />
          </Provider>,
        ),
      ).toThrow('not a regular <Provider>')
    } finally {
      spy.mockRestore()
    }
  })
})

describe('nested providers', () => {
  it('SignalProvider inside Provider on a custom context: each hook uses its own', () => {
    const outerStore = makeStore()
    const innerStore = makeStore()
    innerStore.dispatch(incA())

    const SignalContext = createContext<ReactReduxContextValue | null>(null)
    const useInnerSignalSelector = createSignalSelectorHook(SignalContext)

    function Reader() {
      const outer = useSelector((state: CounterState) => state.a)
      const inner = useInnerSignalSelector((state: CounterState) => state.a)
      return (
        <div>
          <span data-testid="outer">{outer}</span>
          <span data-testid="inner">{inner}</span>
        </div>
      )
    }

    rtl.render(
      <Provider store={outerStore}>
        <SignalProvider store={innerStore} context={SignalContext}>
          <Reader />
        </SignalProvider>
      </Provider>,
    )

    expect(rtl.screen.getByTestId('outer').textContent).toBe('0')
    expect(rtl.screen.getByTestId('inner').textContent).toBe('1')

    rtl.act(() => {
      outerStore.dispatch(incA())
    })
    expect(rtl.screen.getByTestId('outer').textContent).toBe('1')
    expect(rtl.screen.getByTestId('inner').textContent).toBe('1')

    rtl.act(() => {
      innerStore.dispatch(incA())
    })
    expect(rtl.screen.getByTestId('outer').textContent).toBe('1')
    expect(rtl.screen.getByTestId('inner').textContent).toBe('2')
  })

  it('Provider inside SignalProvider on a custom context: each hook uses its own', () => {
    const outerStore = makeStore()
    const innerStore = makeStore()
    innerStore.dispatch(incB())

    const StockContext = createContext<ReactReduxContextValue | null>(null)
    const useInnerSelector = createSelectorHook(StockContext)

    function Reader() {
      const outer = useSignalSelector((state: CounterState) => state.b)
      const inner = useInnerSelector((state: CounterState) => state.b)
      return (
        <div>
          <span data-testid="outer">{outer}</span>
          <span data-testid="inner">{inner}</span>
        </div>
      )
    }

    rtl.render(
      <SignalProvider store={outerStore}>
        <Provider store={innerStore} context={StockContext}>
          <Reader />
        </Provider>
      </SignalProvider>,
    )

    expect(rtl.screen.getByTestId('outer').textContent).toBe('0')
    expect(rtl.screen.getByTestId('inner').textContent).toBe('1')

    rtl.act(() => {
      outerStore.dispatch(incB())
    })
    expect(rtl.screen.getByTestId('outer').textContent).toBe('1')
    expect(rtl.screen.getByTestId('inner').textContent).toBe('1')

    rtl.act(() => {
      innerStore.dispatch(incB())
    })
    expect(rtl.screen.getByTestId('outer').textContent).toBe('1')
    expect(rtl.screen.getByTestId('inner').textContent).toBe('2')
  })

  it('an inner SignalProvider on the default context shadows an outer one', () => {
    const outerStore = makeStore()
    const innerStore = makeStore()
    innerStore.dispatch(incA())
    innerStore.dispatch(incA())

    function Reader() {
      const a = useSignalSelector((state: CounterState) => state.a)
      return <div data-testid="a">{a}</div>
    }

    rtl.render(
      <SignalProvider store={outerStore}>
        <SignalProvider store={innerStore}>
          <Reader />
        </SignalProvider>
      </SignalProvider>,
    )

    expect(rtl.screen.getByTestId('a').textContent).toBe('2')

    rtl.act(() => {
      outerStore.dispatch(incA())
    })
    expect(rtl.screen.getByTestId('a').textContent).toBe('2')

    rtl.act(() => {
      innerStore.dispatch(incA())
    })
    expect(rtl.screen.getByTestId('a').textContent).toBe('3')
  })

  it('connect() reads a custom context supplied by SignalProvider', () => {
    const store = makeStore()
    const SignalContext = createContext<ReactReduxContextValue | null>(null)
    const Display = connect((state: CounterState) => ({ a: state.a }), null, null, {
      context: SignalContext,
    })(({ a }: { a: number }) => <div data-testid="a">{a}</div>)

    rtl.render(
      <SignalProvider store={store} context={SignalContext}>
        <Display />
      </SignalProvider>,
    )

    expect(rtl.screen.getByTestId('a').textContent).toBe('0')

    rtl.act(() => {
      store.dispatch(incA())
    })
    expect(rtl.screen.getByTestId('a').textContent).toBe('1')
  })

  it('two SignalProviders over different stores keep independent registries', () => {
    const storeOne = makeStore()
    const storeTwo = makeStore()
    const SecondContext = createContext<ReactReduxContextValue | null>(null)
    const useSecondSignalSelector = createSignalSelectorHook(SecondContext)

    function First() {
      const a = useSignalSelector((state: CounterState) => state.a)
      return <div data-testid="first">{a}</div>
    }
    function Second() {
      const a = useSecondSignalSelector((state: CounterState) => state.a)
      return <div data-testid="second">{a}</div>
    }

    rtl.render(
      <SignalProvider store={storeOne}>
        <SignalProvider store={storeTwo} context={SecondContext}>
          <First />
          <Second />
        </SignalProvider>
      </SignalProvider>,
    )

    rtl.act(() => {
      storeTwo.dispatch(incA())
      storeTwo.dispatch(incA())
    })

    expect(rtl.screen.getByTestId('first').textContent).toBe('0')
    expect(rtl.screen.getByTestId('second').textContent).toBe('2')
  })
})
