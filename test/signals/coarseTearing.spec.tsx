import { describe, expect, it } from 'vitest'
import * as rtl from '@testing-library/react'
import React from 'react'
import { flushSync } from 'react-dom'
import { configureStore, createSlice, type PayloadAction } from '@reduxjs/toolkit'
import { SignalProvider, useSignalSelector } from '../../src/signals'

// The coarse tier time-slices the first-touch burst: when many hooks depend on
// the one segment that just changed, their deep-graph build + notify is
// deferred across macrotasks instead of running synchronously. This must NOT
// let a hook render a stale value while sibling hooks render the new one — the
// desync-with-different-store-values bug. These tests force exactly that
// window (N >= the slice threshold, so the dispatch defers) and assert
// consistency.

const N = 80 // above COARSE_SLICE_THRESHOLD (64) so a full-segment change slices

function makeStore() {
  const slice = createSlice({
    name: 's',
    initialState: {
      list: Array.from({ length: N }, () => ({ v: 0 })),
      other: 0,
    },
    reducers: {
      setAll: (state, action: PayloadAction<number>) => {
        state.list = state.list.map(() => ({ v: action.payload }))
      },
    },
  })
  const store = configureStore({ reducer: slice.reducer })
  return { store, setAll: slice.actions.setAll }
}

type RootState = ReturnType<ReturnType<typeof makeStore>['store']['getState']>

let forceRerender: () => void = () => {}

// Stable (hoisted) selector per index. This matters: an inline selector is a
// new function each render, which triggers the hook's render-phase
// setSelector → a deep recompute that refreshes the value anyway, masking the
// getSnapshot path under test. Stable selectors are the common case and the
// one where getSnapshot alone must keep an unbuilt hook consistent.
const selectors = Array.from(
  { length: N },
  (_, i) => (s: RootState) => s.list[i].v,
)

function Leaf({ i }: { i: number }) {
  const v = useSignalSelector(selectors[i])
  return <span data-testid={`leaf-${i}`}>{v}</span>
}

function Parent() {
  const [, setTick] = React.useState(0)
  forceRerender = () => setTick((t) => t + 1)
  return (
    <>
      {Array.from({ length: N }, (_, i) => (
        <Leaf key={i} i={i} />
      ))}
    </>
  )
}

const flushMacrotasks = () =>
  rtl.act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })

describe('coarse tier — no desync during the sliced first-touch window', () => {
  it('a hook force-rendered before its deferred build shows the latest value, not a stale one', () => {
    const { store, setAll } = makeStore()
    rtl.render(
      <SignalProvider store={store}>
        <Parent />
      </SignalProvider>,
    )

    // Everyone starts at 0.
    expect(rtl.screen.getByTestId('leaf-0').textContent).toBe('0')
    expect(rtl.screen.getByTestId(`leaf-${N - 1}`).textContent).toBe('0')

    // Change the whole `list` segment. All N hooks are candidates, which is
    // above the slice threshold — so the build+notify is deferred, and no
    // hook re-renders synchronously (still showing 0).
    rtl.act(() => {
      store.dispatch(setAll(5))
    })
    expect(rtl.screen.getByTestId('leaf-0').textContent).toBe('0')

    // Now an ancestor re-renders synchronously (flushSync commits it before
    // the sliced drain macrotask can run), forcing every leaf to re-render
    // WHILE their builds are still queued. We assert immediately, inside the
    // tearing window: each leaf must read the latest committed state, not the
    // stale seed — otherwise built/synchronous siblings and these deferred
    // ones would show different store values at the same time.
    flushSync(() => {
      forceRerender()
    })
    for (let i = 0; i < N; i++) {
      expect(rtl.screen.getByTestId(`leaf-${i}`).textContent).toBe('5')
    }
  })

  it('deferred hooks converge to the latest value once the drain flushes (liveness)', async () => {
    const { store, setAll } = makeStore()
    rtl.render(
      <SignalProvider store={store}>
        <Parent />
      </SignalProvider>,
    )

    rtl.act(() => {
      store.dispatch(setAll(7))
    })

    // Without any forced re-render, the sliced drain must still eventually
    // build + notify every hook so it reflects the new value.
    await flushMacrotasks()

    for (let i = 0; i < N; i++) {
      expect(rtl.screen.getByTestId(`leaf-${i}`).textContent).toBe('7')
    }
  })

  it('a queued hook still reflects a later change to its segment when it builds', async () => {
    const { store, setAll } = makeStore()
    rtl.render(
      <SignalProvider store={store}>
        <Parent />
      </SignalProvider>,
    )

    // First change queues all N hooks for the sliced drain (and drops them
    // from the segment index so a mid-drain dispatch doesn't re-collect them).
    rtl.act(() => {
      store.dispatch(setAll(5))
    })
    // A second change to the same segment arrives before the drain runs.
    // The queued builds must pick up this latest value, not the queued-time 5.
    rtl.act(() => {
      store.dispatch(setAll(7))
    })

    await flushMacrotasks()

    for (let i = 0; i < N; i++) {
      expect(rtl.screen.getByTestId(`leaf-${i}`).textContent).toBe('7')
    }
  })

  it('sliceThreshold=Infinity runs the first-touch burst inline (atomic)', () => {
    const { store, setAll } = makeStore()
    rtl.render(
      <SignalProvider store={store} sliceThreshold={Infinity}>
        <Parent />
      </SignalProvider>,
    )

    // With slicing disabled, the whole first-touch burst runs synchronously in
    // the dispatch — every leaf reflects the new value at once, no drain flush
    // and no forced re-render needed.
    rtl.act(() => {
      store.dispatch(setAll(9))
    })
    for (let i = 0; i < N; i++) {
      expect(rtl.screen.getByTestId(`leaf-${i}`).textContent).toBe('9')
    }
  })

  it('stays consistent across a second change after warmup (now built, synchronous)', async () => {
    const { store, setAll } = makeStore()
    rtl.render(
      <SignalProvider store={store}>
        <Parent />
      </SignalProvider>,
    )

    // First change + flush warms up (builds) every hook.
    rtl.act(() => {
      store.dispatch(setAll(1))
    })
    await flushMacrotasks()

    // A second change now goes through the deep graph synchronously; all
    // hooks update together to the same latest value.
    rtl.act(() => {
      store.dispatch(setAll(2))
    })
    await flushMacrotasks()

    for (let i = 0; i < N; i++) {
      expect(rtl.screen.getByTestId(`leaf-${i}`).textContent).toBe('2')
    }
  })
})
