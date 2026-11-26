/**
 * Tests for untrackResult — stripping tracking proxies from selector
 * results at the hook boundary.
 *
 * Tracking proxies are evaluation-scoped tools. Components, effects,
 * refs, DevTools, and dispatch payloads should only ever see raw
 * (Immer-frozen) state. These tests pin that boundary, and check that
 * reads through a proxy kept past its evaluation record nothing.
 *
 * Unit tests for untrackResult itself live in
 * internals/untrackResult.spec.ts.
 */
import { configureStore, createSlice } from '@reduxjs/toolkit'
import * as rtl from '@testing-library/react'
import * as React from 'react'
import { createStore } from 'redux'
import { describe, expect, it, afterEach } from 'vitest'

import { useSignalContext } from '../../../src/signals/context'
import type { PathSignalRegistry } from '../../../src/signals/pathSignalRegistry'
import { SignalProvider } from '../../../src/signals/SignalProvider'
import type { LeafObjectTracker } from '../../../src/signals/trackingProxy'
import { useSignalSelector } from '../../../src/signals/useSignalSelector'
import { getProxyPath } from '../../../src/signals/proxyIdentity'

const isTrackingProxy = (v: unknown) =>
  v !== null && typeof v === 'object' && getProxyPath(v) !== undefined

afterEach(() => {
  rtl.cleanup()
})

interface Todo {
  id: number
  text: string
  done: boolean
}

function makeStore() {
  const todosSlice = createSlice({
    name: 'todos',
    initialState: {
      items: [
        { id: 1, text: 'one', done: false },
        { id: 2, text: 'two', done: true },
      ] as Todo[],
      meta: { count: 2 },
    },
    reducers: {
      toggle(state, action: { payload: number }) {
        const t = state.items.find((t) => t.id === action.payload)
        if (t) t.done = !t.done
      },
      replaceAll(state, action: { payload: Todo[] }) {
        state.items = action.payload
      },
    },
  })
  const store = configureStore({ reducer: { todos: todosSlice.reducer } })
  return { store, actions: todosSlice.actions }
}

type AppState = ReturnType<ReturnType<typeof makeStore>['store']['getState']>

function renderWithCapture<R>(
  store: ReturnType<typeof makeStore>['store'],
  selector: (s: AppState) => R,
) {
  const captured: R[] = []
  function Comp() {
    const value = useSignalSelector(selector)
    captured.push(value)
    return null
  }
  rtl.render(
    <SignalProvider store={store}>
      <Comp />
    </SignalProvider>,
  )
  return captured
}

describe('untrack at the hook boundary', () => {
  it('a selector returning a state object yields the raw object, === to store state', () => {
    const { store } = makeStore()
    const captured = renderWithCapture(store, (s) => s.todos.items[0])

    expect(captured.length).toBeGreaterThan(0)
    const result = captured[captured.length - 1]
    expect(isTrackingProxy(result)).toBe(false)
    expect(result).toBe(store.getState().todos.items[0])
  })

  it('a derived container has all proxy values swapped for raw state, in place', () => {
    const { store } = makeStore()
    const captured = renderWithCapture(store, (s) => ({
      first: s.todos.items[0],
      all: s.todos.items,
      nested: { meta: s.todos.meta },
      count: s.todos.meta.count,
    }))

    const result = captured[captured.length - 1]
    expect(isTrackingProxy(result.first)).toBe(false)
    expect(isTrackingProxy(result.all)).toBe(false)
    expect(isTrackingProxy(result.nested.meta)).toBe(false)
    expect(result.first).toBe(store.getState().todos.items[0])
    expect(result.all).toBe(store.getState().todos.items)
    expect(result.nested.meta).toBe(store.getState().todos.meta)
  })

  it('derived arrays (filter/slice results) contain raw elements', () => {
    const { store } = makeStore()
    const captured = renderWithCapture(store, (s) =>
      s.todos.items.filter((t) => t.done),
    )

    const result = captured[captured.length - 1]
    expect(result).toHaveLength(1)
    expect(isTrackingProxy(result[0])).toBe(false)
    expect(result[0]).toBe(store.getState().todos.items[1])
  })

  it('re-dispatching a selected value stores raw state, not proxies', () => {
    const { store, actions } = makeStore()
    const captured = renderWithCapture(store, (s) => s.todos.items)

    const selected = captured[captured.length - 1]
    // Simulate the footgun: spread selected data back into an action
    rtl.act(() => {
      store.dispatch(actions.replaceAll(selected.map((t) => ({ ...t }))))
    })

    for (const item of store.getState().todos.items) {
      expect(isTrackingProxy(item)).toBe(false)
      for (const v of Object.values(item)) {
        expect(isTrackingProxy(v)).toBe(false)
      }
    }
  })

  it('results stay raw across store-driven re-evaluations', () => {
    const { store, actions } = makeStore()
    const captured = renderWithCapture(store, (s) => s.todos.items[0])

    rtl.act(() => {
      store.dispatch(actions.toggle(1))
    })

    const result = captured[captured.length - 1]
    expect(isTrackingProxy(result)).toBe(false)
    expect(result).toBe(store.getState().todos.items[0])
    expect(result.done).toBe(true)
  })
})

interface State {
  n: number
  x: { y: number; z: { w: number } }
}

function reducer(
  state: State = { n: 0, x: { y: 1, z: { w: 2 } } },
  action: { type: string },
): State {
  return action.type === 'tick' ? { ...state, n: state.n + 1 } : state
}

describe('evaluation tracker lifecycle', () => {
  it('reads through a proxy kept past its evaluation do not record into the finished tracker', () => {
    const store = createStore(reducer)
    let registry: PathSignalRegistry | null = null
    let kept: State['x'] | null = null
    let seen: LeafObjectTracker | undefined

    function CaptureRegistry() {
      registry = useSignalContext<State>().registry
      return null
    }

    function Reader() {
      const n = useSignalSelector((s: State) => {
        kept = s.x
        seen = registry?.evaluation.tracker ?? undefined
        return s.n
      })
      return <div data-testid="n">{n}</div>
    }

    const { getByTestId } = rtl.render(
      <SignalProvider store={store}>
        <CaptureRegistry />
        <Reader />
      </SignalProvider>,
    )

    // Promote the selector past the coarse probe tier so it runs through
    // tracking proxies.
    rtl.act(() => {
      store.dispatch({ type: 'tick' })
    })
    rtl.act(() => {
      store.dispatch({ type: 'tick' })
    })
    expect(getByTestId('n').textContent).toBe('2')

    const tracker = seen
    expect(tracker).toBeDefined()
    const accessed = new Map(tracker!.accessedObjects)
    const traversed = new Set(tracker!.traversedPaths)

    expect(kept!.y).toBe(1)
    expect(kept!.z.w).toBe(2)
    void Object.keys(kept!)

    expect(tracker!.traversedPaths).toEqual(traversed)
    expect(tracker!.accessedObjects).toEqual(accessed)
    expect(tracker!.enumerated.size).toBe(0)
    expect(registry!.evaluation.tracker).toBeNull()
  })
})
