/**
 * Swapping the `store` prop on a mounted SignalProvider must behave like
 * stock Provider: components immediately read from the new store, the old
 * store is fully disconnected, and the signal graph starts over — the
 * registry and the diff baseline are keyed to the store, so the first
 * dispatch on the new store diffs new-store state against new-store
 * state, never against the old store's.
 */
import { configureStore } from '@reduxjs/toolkit'
import * as rtl from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { SignalProvider, useSignalSelector } from '../../src/signals'

interface RootState {
  counter: { value: number }
  other: { name: string }
}

const makeStore = (initialValue = 0, name = 'stock') =>
  configureStore({
    reducer: {
      counter: (state = { value: initialValue }, action: any) =>
        action.type === 'increment' ? { value: state.value + 1 } : state,
      other: (state = { name }, action: any) =>
        action.type === 'rename' ? { name: action.payload } : state,
    },
  })

afterEach(() => {
  rtl.cleanup()
})

describe('SignalProvider store prop swap', () => {
  it('reads from the new store after a swap and disconnects the old one', () => {
    const storeA = makeStore(0)
    const storeB = makeStore(100)

    let renderCount = 0
    let selectorCalls = 0

    function Counter() {
      renderCount++
      const value = useSignalSelector((s: RootState) => {
        selectorCalls++
        return s.counter.value
      })
      return <div data-testid="value">{value}</div>
    }

    const ui = (store: ReturnType<typeof makeStore>) => (
      <SignalProvider store={store}>
        <Counter />
      </SignalProvider>
    )

    const { getByTestId, rerender } = rtl.render(ui(storeA))
    expect(getByTestId('value').textContent).toBe('0')
    expect(renderCount).toBe(1)

    rtl.act(() => {
      storeA.dispatch({ type: 'increment' })
    })
    expect(getByTestId('value').textContent).toBe('1')
    expect(renderCount).toBe(2)

    rerender(ui(storeB))
    expect(getByTestId('value').textContent).toBe('100')

    const rendersAfterSwap = renderCount

    // The old store is disconnected: dispatching on it does nothing.
    rtl.act(() => {
      storeA.dispatch({ type: 'increment' })
    })
    expect(getByTestId('value').textContent).toBe('100')
    expect(renderCount).toBe(rendersAfterSwap)

    // The new store is live.
    rtl.act(() => {
      storeB.dispatch({ type: 'increment' })
    })
    expect(getByTestId('value').textContent).toBe('101')
    expect(renderCount).toBe(rendersAfterSwap + 1)
  })

  it('selective execution still holds after a swap', () => {
    const storeA = makeStore(0, 'a')
    const storeB = makeStore(0, 'b')

    let nameRenders = 0

    function Name() {
      nameRenders++
      const name = useSignalSelector((s: RootState) => s.other.name)
      return <div data-testid="name">{name}</div>
    }
    function Counter() {
      const value = useSignalSelector((s: RootState) => s.counter.value)
      return <div data-testid="value">{value}</div>
    }

    const ui = (store: ReturnType<typeof makeStore>) => (
      <SignalProvider store={store}>
        <Name />
        <Counter />
      </SignalProvider>
    )

    const { getByTestId, rerender } = rtl.render(ui(storeA))
    expect(getByTestId('name').textContent).toBe('a')

    rerender(ui(storeB))
    expect(getByTestId('name').textContent).toBe('b')
    expect(getByTestId('value').textContent).toBe('0')

    const nameRendersAfterSwap = nameRenders

    // A counter-only dispatch on the new store must not re-render Name:
    // the fresh registry gates it on the `other` segment, not stale
    // footprints from the old store's graph.
    rtl.act(() => {
      storeB.dispatch({ type: 'increment' })
    })
    expect(getByTestId('value').textContent).toBe('1')
    expect(nameRenders).toBe(nameRendersAfterSwap)

    rtl.act(() => {
      storeB.dispatch({ type: 'rename', payload: 'c' })
    })
    expect(getByTestId('name').textContent).toBe('c')
    expect(nameRenders).toBe(nameRendersAfterSwap + 1)
  })

  it('first dispatch after a swap diffs against the new store state, not the old', () => {
    // Same shape, different values. If the provider kept the old diff
    // baseline, the swap-then-dispatch diff would report `other` as
    // changed (old 'a' vs new 'b') and wake the Name subscriber.
    const storeA = makeStore(0, 'a')
    const storeB = makeStore(50, 'b')

    let nameSelectorCalls = 0

    function Name() {
      const name = useSignalSelector((s: RootState) => {
        nameSelectorCalls++
        return s.other.name
      })
      return <div data-testid="name">{name}</div>
    }

    const ui = (store: ReturnType<typeof makeStore>) => (
      <SignalProvider store={store}>
        <Name />
      </SignalProvider>
    )

    const { getByTestId, rerender } = rtl.render(ui(storeA))
    rerender(ui(storeB))
    expect(getByTestId('name').textContent).toBe('b')

    const callsAfterSwap = nameSelectorCalls

    // `other` did not change within storeB, so the selector must not
    // re-run — a stale old-store baseline would make it re-run here.
    rtl.act(() => {
      storeB.dispatch({ type: 'increment' })
    })
    expect(getByTestId('name').textContent).toBe('b')
    expect(nameSelectorCalls).toBe(callsAfterSwap)
  })
})
