/**
 * Column signals (`items.some(i => i.done)`) and structure signals
 * (append/remove/reorder) are tracked per array. Another subscriber
 * releasing the array's own signal must not stop those from firing.
 */
import * as rtl from '@testing-library/react'
import React from 'react'
import { createStore } from 'redux'
import type { Store } from 'redux'
import { describe, expect, it } from 'vitest'
import { useSignalContext } from '../../src/signals/context'
import type { PathSignalRegistry } from '../../src/signals/pathSignalRegistry'
import { SignalProvider } from '../../src/signals/SignalProvider'
import { useSignalSelector } from '../../src/signals/useSignalSelector'

interface Item {
  id: number
  done: boolean
}

interface AppState {
  items: Item[]
  other: number
}

type Action =
  | { type: 'toggle'; id: number }
  | { type: 'append'; done: boolean }
  | { type: 'touchItems' }
  | { type: 'other' }

function reducer(
  state: AppState = {
    items: [
      { id: 0, done: false },
      { id: 1, done: false },
      { id: 2, done: false },
    ],
    other: 0,
  },
  action: Action,
): AppState {
  switch (action.type) {
    case 'toggle':
      return {
        ...state,
        items: state.items.map((i) =>
          i.id === action.id ? { ...i, done: !i.done } : i,
        ),
      }
    case 'append':
      return {
        ...state,
        items: [...state.items, { id: state.items.length, done: action.done }],
      }
    case 'touchItems':
      return { ...state, items: [...state.items] }
    case 'other':
      return { ...state, other: state.other + 1 }
    default:
      return state
  }
}

const makeStore = (): Store<AppState, Action> => createStore(reducer)

let captured: PathSignalRegistry | null = null
function CaptureRegistry() {
  captured = useSignalContext<AppState>().registry
  return null
}

function WholeArray() {
  useSignalSelector((s: AppState) => s.items)
  return null
}

let anyDone: boolean | undefined
function AnyDone() {
  anyDone = useSignalSelector((s: AppState) => s.items.some((i) => i.done))
  return null
}

let doneCount: number | undefined
function DoneCount() {
  doneCount = useSignalSelector(
    (s: AppState) => s.items.filter((i) => i.done).length,
  )
  return null
}

function Tree({
  store,
  whole,
  children,
}: {
  store: Store<AppState, Action>
  whole: boolean
  children?: React.ReactNode
}) {
  return (
    <SignalProvider store={store}>
      <CaptureRegistry />
      {whole ? <WholeArray /> : null}
      {children}
    </SignalProvider>
  )
}

describe('array column and structure tracking after the array signal is released', () => {
  it('a column read keeps updating after another hook on the whole array unmounts', () => {
    const store = makeStore()
    const ui = (whole: boolean) => (
      <Tree store={store} whole={whole}>
        <AnyDone />
        <DoneCount />
      </Tree>
    )
    const { rerender, unmount } = rtl.render(ui(true))

    // Promote every hook to the deep tier.
    rtl.act(() => {
      store.dispatch({ type: 'touchItems' })
    })
    expect(anyDone).toBe(false)
    expect(doneCount).toBe(0)

    rerender(ui(false))

    rtl.act(() => {
      store.dispatch({ type: 'toggle', id: 1 })
    })
    expect(anyDone).toBe(true)
    expect(doneCount).toBe(1)

    unmount()
  })

  it('an append keeps updating after another hook on the whole array unmounts', () => {
    const store = makeStore()
    const ui = (whole: boolean) => (
      <Tree store={store} whole={whole}>
        <AnyDone />
        <DoneCount />
      </Tree>
    )
    const { rerender, unmount } = rtl.render(ui(true))
    rtl.act(() => {
      store.dispatch({ type: 'touchItems' })
    })

    rerender(ui(false))

    rtl.act(() => {
      store.dispatch({ type: 'append', done: true })
    })
    expect(anyDone).toBe(true)
    expect(doneCount).toBe(1)

    unmount()
  })

  it('a selector that switches from reading the whole array to a column read keeps updating', () => {
    const store = makeStore()
    let result: string | boolean | undefined

    function Switching({ mode }: { mode: 'join' | 'some' }) {
      result = useSignalSelector((s: AppState) =>
        mode === 'join' ? s.items.join(',') : s.items.some((i) => i.done),
      )
      return null
    }

    const ui = (mode: 'join' | 'some') => (
      <Tree store={store} whole={false}>
        <Switching mode={mode} />
      </Tree>
    )
    const { rerender, unmount } = rtl.render(ui('join'))
    rtl.act(() => {
      store.dispatch({ type: 'touchItems' })
    })
    expect(result).toBe(store.getState().items.join(','))

    rerender(ui('some'))
    expect(result).toBe(false)
    rtl.act(() => {
      store.dispatch({ type: 'other' })
    })

    rtl.act(() => {
      store.dispatch({ type: 'toggle', id: 2 })
    })
    expect(result).toBe(true)

    unmount()
  })

  it('leaves no array tracking behind once every hook unmounts', () => {
    const store = makeStore()
    const ui = (mounted: boolean) => (
      <Tree store={store} whole={mounted}>
        {mounted ? (
          <>
            <AnyDone />
            <DoneCount />
          </>
        ) : null}
      </Tree>
    )
    const { rerender, unmount } = rtl.render(ui(true))
    rtl.act(() => {
      store.dispatch({ type: 'toggle', id: 0 })
    })
    rtl.act(() => {
      store.dispatch({ type: 'append', done: false })
    })

    rerender(ui(false))
    rtl.act(() => {
      store.dispatch({ type: 'other' })
    })

    const stats = captured!.debugStats()
    expect(stats.signals).toBe(0)
    expect(stats.arrays).toBe(0)
    expect(stats.columns).toBe(0)
    expect(stats.structures).toBe(0)
    expect(stats.childIndex).toBe(0)

    unmount()
  })
})
