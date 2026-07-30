/**
 * Tests for useSignalSelector's stock-useSelector API parity:
 *
 * - second argument as equalityFn OR options object ({ equalityFn,
 *   devModeChecks })
 * - dev-mode argument validation
 * - identityFunctionCheck (state => state) — for the signal hook this is
 *   a CORRECTNESS warning: the root path is never updated by the diff,
 *   so an identity selector never re-renders at all
 * - stabilityCheck (selector returns a new reference for the same state)
 * - Provider-level defaults + per-hook overrides
 * - useSignalSelector.withTypes<RootState>()
 *
 * "once" frequency is literally once per hook instance, on the first
 * evaluation — matching stock useSelector.
 */
import { configureStore, createSlice } from '@reduxjs/toolkit'
import * as rtl from '@testing-library/react'
import React from 'react'
import type { MockInstance } from 'vitest'
import { SignalProvider, useSignalSelector } from '../../src/signals'

const makeStore = () => {
  const counterSlice = createSlice({
    name: 'counter',
    initialState: { value: 0 },
    reducers: {
      increment: (state) => {
        state.value += 1
      },
    },
  })

  const todosSlice = createSlice({
    name: 'todos',
    initialState: {
      list: [
        { id: 1, text: 'buy milk', done: false },
        { id: 2, text: 'walk dog', done: true },
      ],
    },
    reducers: {
      addTodo: (state) => {
        state.list.push({
          id: state.list.length + 1,
          text: 'new todo',
          done: false,
        })
      },
    },
  })

  const store = configureStore({
    reducer: {
      counter: counterSlice.reducer,
      todos: todosSlice.reducer,
    },
  })

  return {
    store,
    increment: counterSlice.actions.increment,
    addTodo: todosSlice.actions.addTodo,
  }
}

type AppStore = ReturnType<typeof makeStore>['store']
type RootState = ReturnType<AppStore['getState']>

let warnSpy: MockInstance<(message?: any, ...optionalParams: any[]) => void>

beforeEach(() => {
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  warnSpy.mockRestore()
  rtl.cleanup()
})

const identityWarnings = () =>
  warnSpy.mock.calls.filter((call) =>
    String(call[0]).includes('returned the root state'),
  )

const stabilityWarnings = () =>
  warnSpy.mock.calls.filter((call) =>
    String(call[0]).includes('returned a different result'),
  )

describe('equalityFn argument forms', () => {
  const firstElementEqual = (a: boolean[], b: boolean[]) => a[0] === b[0]

  const renderCounter = (
    store: AppStore,
    useSelectorArgs: (state: RootState) => boolean[],
    second?: any,
  ) => {
    let renders = 0
    function Comp() {
      renders++
      const flags = useSignalSelector(useSelectorArgs, second)
      return <div data-testid="flag">{String(flags[0])}</div>
    }
    const utils = rtl.render(
      <SignalProvider store={store}>
        <Comp />
      </SignalProvider>,
    )
    return { utils, getRenders: () => renders }
  }

  it('accepts a positional equality function', () => {
    const { store, increment } = makeStore()
    const { utils, getRenders } = renderCounter(
      store,
      (s) => [s.counter.value > 0],
      firstElementEqual,
    )

    expect(utils.getByTestId('flag').textContent).toBe('false')
    const initialRenders = getRenders()

    // 0 -> 1 crosses the threshold: new result, re-render
    rtl.act(() => {
      store.dispatch(increment())
    })
    expect(utils.getByTestId('flag').textContent).toBe('true')
    expect(getRenders()).toBe(initialRenders + 1)

    // 1 -> 2: selector re-runs (fresh array) but equalityFn says equal
    rtl.act(() => {
      store.dispatch(increment())
    })
    expect(getRenders()).toBe(initialRenders + 1)
  })

  it('accepts an options object with equalityFn', () => {
    const { store, increment } = makeStore()
    const { utils, getRenders } = renderCounter(
      store,
      (s) => [s.counter.value > 0],
      { equalityFn: firstElementEqual },
    )

    expect(utils.getByTestId('flag').textContent).toBe('false')
    const initialRenders = getRenders()

    rtl.act(() => {
      store.dispatch(increment())
    })
    expect(utils.getByTestId('flag').textContent).toBe('true')
    expect(getRenders()).toBe(initialRenders + 1)

    rtl.act(() => {
      store.dispatch(increment())
    })
    expect(getRenders()).toBe(initialRenders + 1)
  })

  it('defaults to Object.is without a second argument', () => {
    const { store, increment } = makeStore()
    let renders = 0
    function Comp() {
      renders++
      const value = useSignalSelector((s: RootState) => s.counter.value)
      return <div data-testid="value">{value}</div>
    }
    const utils = rtl.render(
      <SignalProvider store={store}>
        <Comp />
      </SignalProvider>,
    )
    expect(utils.getByTestId('value').textContent).toBe('0')
    rtl.act(() => {
      store.dispatch(increment())
    })
    expect(utils.getByTestId('value').textContent).toBe('1')
    expect(renders).toBe(2)
  })
})

describe('dev-mode argument validation', () => {
  const renderWith = (hookCall: () => unknown) => {
    const { store } = makeStore()
    function Comp() {
      hookCall()
      return null
    }
    rtl.render(
      <SignalProvider store={store}>
        <Comp />
      </SignalProvider>,
    )
  }

  it('throws if no selector is passed', () => {
    expect(() =>
      renderWith(() => (useSignalSelector as any)()),
    ).toThrow(/You must pass a selector to useSignalSelector/)
  })

  it('throws if the selector is not a function', () => {
    expect(() =>
      renderWith(() => (useSignalSelector as any)('counter')),
    ).toThrow(/You must pass a function as a selector/)
  })

  it('throws if the equality function is not a function', () => {
    expect(() =>
      renderWith(() =>
        (useSignalSelector as any)((s: RootState) => s.counter.value, {
          equalityFn: 'nope',
        }),
      ),
    ).toThrow(/You must pass a function as an equality function/)
  })
})

describe('identityFunctionCheck', () => {
  it('warns once on mount for an identity selector', () => {
    const { store } = makeStore()
    function Comp() {
      useSignalSelector((s: RootState) => s)
      return null
    }
    rtl.render(
      <SignalProvider store={store}>
        <Comp />
      </SignalProvider>,
    )
    expect(identityWarnings()).toHaveLength(1)
    expect(String(warnSpy.mock.calls[0][0])).toContain('NEVER re-render')
  })

  it('does not warn for a selector that reads specific paths', () => {
    const { store } = makeStore()
    function Comp() {
      useSignalSelector((s: RootState) => s.counter.value)
      return null
    }
    rtl.render(
      <SignalProvider store={store}>
        <Comp />
      </SignalProvider>,
    )
    expect(identityWarnings()).toHaveLength(0)
  })

  it('is silenced by devModeChecks: { identityFunctionCheck: "never" }', () => {
    const { store } = makeStore()
    function Comp() {
      useSignalSelector((s: RootState) => s, {
        devModeChecks: { identityFunctionCheck: 'never' },
      })
      return null
    }
    rtl.render(
      <SignalProvider store={store}>
        <Comp />
      </SignalProvider>,
    )
    expect(identityWarnings()).toHaveLength(0)
  })

  it('respects the Provider-level default', () => {
    const { store } = makeStore()
    function Comp() {
      useSignalSelector((s: RootState) => s)
      return null
    }
    rtl.render(
      <SignalProvider store={store} identityFunctionCheck="never">
        <Comp />
      </SignalProvider>,
    )
    expect(identityWarnings()).toHaveLength(0)
  })

  it('per-hook override beats the Provider-level default', () => {
    const { store } = makeStore()
    function Comp() {
      useSignalSelector((s: RootState) => s, {
        devModeChecks: { identityFunctionCheck: 'once' },
      })
      return null
    }
    rtl.render(
      <SignalProvider store={store} identityFunctionCheck="never">
        <Comp />
      </SignalProvider>,
    )
    expect(identityWarnings()).toHaveLength(1)
  })
})

describe('stabilityCheck', () => {
  it('warns once on mount for an unstable selector', () => {
    const { store } = makeStore()
    function Comp() {
      useSignalSelector((s: RootState) => s.todos.list.map((t) => t.id))
      return null
    }
    rtl.render(
      <SignalProvider store={store}>
        <Comp />
      </SignalProvider>,
    )
    expect(stabilityWarnings()).toHaveLength(1)
  })

  it('does not warn for a stable selector', () => {
    const { store } = makeStore()
    function Comp() {
      useSignalSelector((s: RootState) => s.todos.list)
      return null
    }
    rtl.render(
      <SignalProvider store={store}>
        <Comp />
      </SignalProvider>,
    )
    expect(stabilityWarnings()).toHaveLength(0)
  })

  it('uses the provided equalityFn for the comparison', () => {
    const { store } = makeStore()
    const shallowArrayEqual = (a: number[], b: number[]) =>
      a.length === b.length && a.every((v, i) => v === b[i])
    function Comp() {
      useSignalSelector((s: RootState) => s.todos.list.map((t) => t.id), {
        equalityFn: shallowArrayEqual,
      })
      return null
    }
    rtl.render(
      <SignalProvider store={store}>
        <Comp />
      </SignalProvider>,
    )
    expect(stabilityWarnings()).toHaveLength(0)
  })

  it('is silenced by devModeChecks: { stabilityCheck: "never" }', () => {
    const { store } = makeStore()
    function Comp() {
      useSignalSelector((s: RootState) => s.todos.list.map((t) => t.id), {
        devModeChecks: { stabilityCheck: 'never' },
      })
      return null
    }
    rtl.render(
      <SignalProvider store={store}>
        <Comp />
      </SignalProvider>,
    )
    expect(stabilityWarnings()).toHaveLength(0)
  })

  it('is silenced by a Provider-level stabilityCheck="never"', () => {
    const { store } = makeStore()
    function Comp() {
      useSignalSelector((s: RootState) => s.todos.list.map((t) => t.id))
      return null
    }
    rtl.render(
      <SignalProvider store={store} stabilityCheck="never">
        <Comp />
      </SignalProvider>,
    )
    expect(stabilityWarnings()).toHaveLength(0)
  })

  it('"always" re-checks on store-driven re-evaluations', () => {
    const { store, addTodo } = makeStore()
    function Comp() {
      useSignalSelector((s: RootState) => s.todos.list.map((t) => t.id), {
        devModeChecks: { stabilityCheck: 'always' },
      })
      return null
    }
    rtl.render(
      <SignalProvider store={store}>
        <Comp />
      </SignalProvider>,
    )
    expect(stabilityWarnings()).toHaveLength(1)

    rtl.act(() => {
      store.dispatch(addTodo())
    })
    expect(stabilityWarnings().length).toBeGreaterThanOrEqual(2)
  })

  it('"once" does not re-check on later evaluations', () => {
    const { store, addTodo } = makeStore()
    function Comp() {
      useSignalSelector((s: RootState) => s.todos.list.map((t) => t.id))
      return null
    }
    rtl.render(
      <SignalProvider store={store}>
        <Comp />
      </SignalProvider>,
    )
    expect(stabilityWarnings()).toHaveLength(1)

    rtl.act(() => {
      store.dispatch(addTodo())
    })
    expect(stabilityWarnings()).toHaveLength(1)
  })
})

describe('withTypes', () => {
  it('returns the same hook, pre-typed', () => {
    const useAppSignalSelector = useSignalSelector.withTypes<RootState>()
    expect(useAppSignalSelector).toBe(useSignalSelector)

    const { store, increment } = makeStore()
    function Comp() {
      // No explicit state type needed — inferred from withTypes
      const value = useAppSignalSelector((s) => s.counter.value)
      return <div data-testid="value">{value}</div>
    }
    const utils = rtl.render(
      <SignalProvider store={store}>
        <Comp />
      </SignalProvider>,
    )
    expect(utils.getByTestId('value').textContent).toBe('0')
    rtl.act(() => {
      store.dispatch(increment())
    })
    expect(utils.getByTestId('value').textContent).toBe('1')
  })
})
