/**
 * A store enhancer may notify listeners some time after `dispatch`
 * returns (`autoBatchEnhancer` in RTK does this for every RTK Query
 * lifecycle action). Any render that happens inside that gap must still
 * read the CURRENT store state: `getSnapshot` is the source of truth for
 * React, not the notification. Runs against both implementations.
 */
import * as rtl from '@testing-library/react'
import * as React from 'react'
import type { StoreEnhancer } from 'redux'
import { createStore } from 'redux'
import { Provider, useSelector } from 'react-redux'
import { useSelector as useStockSelector } from '../../src/index'
import { afterEach, describe, expect, it } from 'vitest'

afterEach(() => {
  rtl.cleanup()
})

interface State {
  value: number
  other: string
}

const reducer = (
  state: State = { value: 0, other: 'x' },
  action: { type: string },
): State => {
  switch (action.type) {
    case 'inc':
      return { ...state, value: state.value + 1 }
    case 'other':
      return { ...state, other: state.other + '!' }
    default:
      return state
  }
}

// Notify store listeners on a later macrotask, like autoBatchEnhancer.
const deferNotifications: StoreEnhancer = (next) => (r, preloaded) => {
  const store = next(r, preloaded)
  const listeners = new Set<() => void>()
  let scheduled = false
  store.subscribe(() => {
    if (scheduled) return
    scheduled = true
    setTimeout(() => {
      scheduled = false
      for (const l of listeners) l()
    }, 0)
  })
  return {
    ...store,
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

const flushNotifications = () =>
  rtl.act(() => new Promise<void>((r) => setTimeout(r, 5)))

const selectValue = (s: State) => s.value

function makeStore() {
  return createStore(reducer, undefined, deferNotifications)
}

// A hook that has already re-rendered from a store change is fully
// subscribed (in the signal implementation: promoted out of the coarse
// tier). The freshness question only matters once it's in that state.
async function warmUp(store: ReturnType<typeof makeStore>) {
  rtl.act(() => {
    store.dispatch({ type: 'inc' })
  })
  await flushNotifications()
  expect(store.getState().value).toBe(1)
}

describe('snapshot freshness between dispatch and notification', () => {
  it('a re-render inside the gap reads the current store state', async () => {
    const store = makeStore()
    const seen: number[] = []
    let forceParent: () => void = () => {}

    function Child() {
      const value = useSelector(selectValue)
      seen.push(value)
      return <div data-testid="value">{value}</div>
    }
    function Parent() {
      const [, setN] = React.useState(0)
      forceParent = () => setN((n) => n + 1)
      return <Child />
    }

    rtl.render(
      <Provider store={store}>
        <Parent />
      </Provider>,
    )
    expect(rtl.screen.getByTestId('value').textContent).toBe('0')
    await warmUp(store)
    expect(rtl.screen.getByTestId('value').textContent).toBe('1')

    rtl.act(() => {
      store.dispatch({ type: 'inc' })
    })
    expect(store.getState().value).toBe(2)

    rtl.act(() => {
      forceParent()
    })
    expect(rtl.screen.getByTestId('value').textContent).toBe('2')

    await flushNotifications()
    expect(rtl.screen.getByTestId('value').textContent).toBe('2')
    expect(seen.at(-1)).toBe(2)
  })

  it('stock and signal hooks in one tree never disagree within a render pass', async () => {
    const store = makeStore()
    const passes: Array<{ parent: number; child: number }> = []
    let current: { parent: number; child: number } | null = null
    let forceParent: () => void = () => {}

    function Child() {
      const child = useSelector(selectValue)
      current = { parent: current?.parent ?? -1, child }
      passes.push(current)
      return null
    }
    function Parent() {
      const [, setN] = React.useState(0)
      forceParent = () => setN((n) => n + 1)
      const parent = useStockSelector(selectValue)
      current = { parent, child: -1 }
      return <Child />
    }

    rtl.render(
      <Provider store={store}>
        <Parent />
      </Provider>,
    )

    await warmUp(store)

    rtl.act(() => {
      store.dispatch({ type: 'inc' })
    })
    rtl.act(() => {
      forceParent()
    })
    await flushNotifications()

    for (const p of passes) {
      expect(p.child).toBe(p.parent)
    }
    expect(passes.at(-1)).toEqual({ parent: 2, child: 2 })
  })

  it('a dispatch from a layout effect is visible to the post-commit snapshot check', async () => {
    const store = makeStore()
    const seen: number[] = []

    function Comp({ fire }: { fire: boolean }) {
      // Inline selector on purpose: a new selector identity each render
      // is what makes React run its post-commit getSnapshot consistency
      // check (RTK Query's hooks have this shape).
      const value = useSelector((s: State) => s.value)
      seen.push(value)
      React.useLayoutEffect(() => {
        if (fire) store.dispatch({ type: 'inc' })
      }, [fire])
      return null
    }

    const { rerender } = rtl.render(
      <Provider store={store}>
        <Comp fire={false} />
      </Provider>,
    )
    await warmUp(store)

    rerender(
      <Provider store={store}>
        <Comp fire />
      </Provider>,
    )
    // React re-checks getSnapshot after commit and re-renders
    // synchronously if it moved; the value must not wait for the
    // deferred notification.
    expect(store.getState().value).toBe(2)
    expect(seen.at(-1)).toBe(2)

    const before = seen.length
    await flushNotifications()
    expect(seen.length).toBe(before)
  })
})
