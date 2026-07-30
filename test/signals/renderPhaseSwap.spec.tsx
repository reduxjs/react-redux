/**
 * Tests for the render-phase selector swap in useSignalSelector.
 *
 * When a render presents a selector with a new function identity (the
 * common case: an inline selector), the hook swaps it in and re-evaluates
 * synchronously during render so closures over changed props/state are
 * applied in THAT render.
 *
 * Cost profile documented here: a store-driven update to a component with
 * an inline selector evaluates the selector TWICE — once in the signal
 * effect (old closure, decides whether to notify React) and once in the
 * render-phase swap (new closure). This matches stock useSelector's
 * evaluation count for inline selectors. Components that pass a stable
 * selector reference (module-level fn or useCallback) skip the swap
 * entirely and evaluate once.
 *
 * The batched-update test is the reason the swap CANNOT be skipped via
 * "this render was caused by our own notify" origin tracking: React
 * auto-batching merges a setState and a store dispatch from the same
 * event handler into ONE render, so a notify-triggered render can still
 * carry a changed closure.
 */
import { configureStore, createSlice, type PayloadAction } from '@reduxjs/toolkit'
import * as rtl from '@testing-library/react'
import React, { useCallback, useState } from 'react'
import { SignalProvider, useSignalSelector } from '../../src/signals'

interface Item {
  id: number
  name: string
}

const makeStore = () => {
  const itemsSlice = createSlice({
    name: 'items',
    initialState: {
      list: [
        { id: 1, name: 'one' },
        { id: 2, name: 'two' },
      ] as Item[],
    },
    reducers: {
      renameFirst(state, action: PayloadAction<string>) {
        state.list[0].name = action.payload
      },
      renameSecond(state, action: PayloadAction<string>) {
        state.list[1].name = action.payload
      },
    },
  })

  const store = configureStore({
    reducer: { items: itemsSlice.reducer },
  })

  return { store, actions: itemsSlice.actions }
}

type AppState = ReturnType<ReturnType<typeof makeStore>['store']['getState']>

afterEach(() => {
  rtl.cleanup()
})

describe('render-phase selector swap', () => {
  it('applies a closure over local state changed in the same batch as a dispatch', () => {
    // The origin-tracking counterexample. setIdx(1) and the dispatch are
    // auto-batched into a single render. The dispatch changes the OLD
    // closure's tracked dep (items[0].name), so the signal effect
    // notifies React. That notify-triggered render carries idx=1 — the
    // swap must re-evaluate with the new closure or the component shows
    // items[0]'s new name instead of items[1]'s.
    const { store, actions } = makeStore()

    function Watcher() {
      const [idx, setIdx] = useState(0)
      const name = useSignalSelector(
        (s: AppState) => s.items.list[idx].name,
        { devModeChecks: { stabilityCheck: 'never' } },
      )
      return (
        <div>
          <div data-testid="name">{name}</div>
          <button
            data-testid="both"
            onClick={() => {
              setIdx(1)
              store.dispatch(actions.renameFirst('changed'))
            }}
          >
            switch and rename
          </button>
        </div>
      )
    }

    const { getByTestId } = rtl.render(
      <SignalProvider store={store}>
        <Watcher />
      </SignalProvider>,
    )

    expect(getByTestId('name').textContent).toBe('one')

    rtl.fireEvent.click(getByTestId('both'))

    // Correct: the new closure (idx=1) selects items[1].name.
    // A swap skipped via notify-origin tracking would show 'changed'
    // (items[0]'s renamed value from the old closure's evaluation).
    expect(getByTestId('name').textContent).toBe('two')
  })

  it('evaluates an inline selector twice per store-driven update (documented cost)', () => {
    const { store, actions } = makeStore()
    let selectorCalls = 0

    function Watcher() {
      const name = useSignalSelector(
        (s: AppState) => {
          selectorCalls++
          return s.items.list[0].name
        },
        { devModeChecks: { stabilityCheck: 'never' } },
      )
      return <div data-testid="name">{name}</div>
    }

    const { getByTestId } = rtl.render(
      <SignalProvider store={store}>
        <Watcher />
      </SignalProvider>,
    )

    const mountCalls = selectorCalls

    for (let i = 1; i <= 5; i++) {
      rtl.act(() => {
        store.dispatch(actions.renameFirst(`rename-${i}`))
      })
    }

    expect(getByTestId('name').textContent).toBe('rename-5')
    // Two evaluations per update: effect (old closure, decides notify) +
    // render-phase swap (new inline closure).
    expect(selectorCalls - mountCalls).toBe(10)
  })

  it('evaluates a stable selector once per store-driven update', () => {
    const { store, actions } = makeStore()
    let selectorCalls = 0

    const selectFirstName = (s: AppState) => {
      selectorCalls++
      return s.items.list[0].name
    }

    function Watcher() {
      const name = useSignalSelector(selectFirstName, {
        devModeChecks: { stabilityCheck: 'never' },
      })
      return <div data-testid="name">{name}</div>
    }

    const { getByTestId } = rtl.render(
      <SignalProvider store={store}>
        <Watcher />
      </SignalProvider>,
    )

    const mountCalls = selectorCalls

    for (let i = 1; i <= 5; i++) {
      rtl.act(() => {
        store.dispatch(actions.renameFirst(`rename-${i}`))
      })
    }

    expect(getByTestId('name').textContent).toBe('rename-5')
    // Stable reference: no swap, one effect evaluation per update.
    expect(selectorCalls - mountCalls).toBe(5)
  })

  it('useCallback selector with closure deps evaluates once per update, twice when deps change', () => {
    const { store, actions } = makeStore()
    let selectorCalls = 0

    function Watcher() {
      const [idx, setIdx] = useState(0)
      const selectName = useCallback(
        (s: AppState) => {
          selectorCalls++
          return s.items.list[idx].name
        },
        [idx],
      )
      const name = useSignalSelector(selectName, {
        devModeChecks: { stabilityCheck: 'never' },
      })
      return (
        <div>
          <div data-testid="name">{name}</div>
          <button data-testid="switch" onClick={() => setIdx(1)}>
            switch
          </button>
        </div>
      )
    }

    const { getByTestId } = rtl.render(
      <SignalProvider store={store}>
        <Watcher />
      </SignalProvider>,
    )

    const mountCalls = selectorCalls

    // Store update with stable selector: one evaluation.
    rtl.act(() => {
      store.dispatch(actions.renameFirst('renamed'))
    })
    expect(selectorCalls - mountCalls).toBe(1)
    expect(getByTestId('name').textContent).toBe('renamed')

    // Dep change: new useCallback identity -> swap evaluates once.
    rtl.fireEvent.click(getByTestId('switch'))
    expect(selectorCalls - mountCalls).toBe(2)
    expect(getByTestId('name').textContent).toBe('two')
  })
})
