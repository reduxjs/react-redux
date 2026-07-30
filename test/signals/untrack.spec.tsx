/**
 * Tests for untrackResult — stripping tracking proxies from selector
 * results at the hook boundary.
 *
 * Tracking proxies are evaluation-scoped tools. Components, effects,
 * refs, DevTools, and dispatch payloads should only ever see raw
 * (Immer-frozen) state. These tests pin that boundary.
 */
import { configureStore, createSlice } from '@reduxjs/toolkit'
import * as rtl from '@testing-library/react'
import * as React from 'react'
import { describe, expect, it, afterEach } from 'vitest'

import { SignalProvider } from '../../src/signals/SignalProvider'
import { useSignalSelector } from '../../src/signals/useSignalSelector'
import { alienEngine } from '../../src/signals/engine'
import { createPathSignalRegistry } from '../../src/signals/pathSignalRegistry'
import { createTrackingProxy, getProxyPath } from '../../src/signals/trackingProxy'
import { untrackResult } from '../../src/signals/untrack'

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

describe('untrackResult unit behavior', () => {
  function setup() {
    const registry = createPathSignalRegistry(alienEngine)
    const state = {
      a: { x: 1 },
      list: [{ id: 1, v: 'one' }],
    }
    Object.freeze(state.a)
    Object.freeze(state.list[0])
    Object.freeze(state.list)
    Object.freeze(state)
    const proxy = createTrackingProxy(state, '', registry, registry.proxyCache)
    return { state, proxy }
  }

  it('returns primitives unchanged', () => {
    expect(untrackResult(42)).toBe(42)
    expect(untrackResult('x')).toBe('x')
    expect(untrackResult(null)).toBe(null)
    expect(untrackResult(undefined)).toBe(undefined)
  })

  it('swaps a bare proxy for its target', () => {
    const { state, proxy } = setup()
    expect(untrackResult(proxy.a)).toBe(state.a)
  })

  it('mutates derived containers in place, preserving container identity', () => {
    const { state, proxy } = setup()
    const container = { child: proxy.a, arr: [proxy.list[0]] }
    const result = untrackResult(container)
    expect(result).toBe(container)
    expect(result.child).toBe(state.a)
    expect(result.arr[0]).toBe(state.list[0])
  })

  it('is idempotent (second pass over a memoized container is a no-op)', () => {
    const { state, proxy } = setup()
    const container = { child: proxy.a }
    const once = untrackResult(container)
    const twice = untrackResult(once)
    expect(twice).toBe(container)
    expect(twice.child).toBe(state.a)
  })

  it('handles Map values', () => {
    const { state, proxy } = setup()
    const m = new Map([['a', proxy.a]])
    const result = untrackResult(m)
    expect(result).toBe(m)
    expect(result.get('a')).toBe(state.a)
  })

  it('handles Set values', () => {
    const { state, proxy } = setup()
    const s = new Set([proxy.a])
    const result = untrackResult(s)
    expect(result).toBe(s)
    expect(result.has(state.a)).toBe(true)
    expect(result.size).toBe(1)
  })

  it('handles self-referential containers without looping', () => {
    const { state, proxy } = setup()
    interface Cyclic {
      child: object
      self?: Cyclic
    }
    const container: Cyclic = { child: proxy.a }
    container.self = container
    const result = untrackResult(container)
    expect(result.child).toBe(state.a)
    expect(result.self).toBe(container)
  })

  it('documented limitation: frozen derived containers holding proxies are skipped', () => {
    const { proxy } = setup()
    const frozen = Object.freeze({ child: proxy.a })
    const result = untrackResult(frozen)
    // Can't repair in place — proxies survive. Frozen raw state subtrees
    // are skipped for the same check, which is the common (safe) case.
    expect(isTrackingProxy(result.child)).toBe(true)
  })

})

describe('untrackResult with derived arrays', () => {
  interface Row {
    id: number
    status: string
    score: number
  }

  function setupArrayState() {
    const registry = createPathSignalRegistry(alienEngine)
    const rows: Row[] = []
    for (let i = 0; i < 10; i++) {
      rows.push({ id: i, status: i % 2 === 0 ? 'even' : 'odd', score: i * 10 })
    }
    const state = { rows, extra: { x: 1 } }
    for (const r of rows) Object.freeze(r)
    Object.freeze(rows)
    Object.freeze(state.extra)
    Object.freeze(state)
    const proxy = createTrackingProxy(
      state,
      '',
      registry,
      registry.proxyCache,
    ) as typeof state
    return { state, proxy }
  }

  /** Mimic one hook evaluation: run the selector, untrack the result. */
  function evaluate<R>(
    proxy: ReturnType<typeof setupArrayState>['proxy'],
    selector: (s: ReturnType<typeof setupArrayState>['proxy']) => R,
  ): R {
    return untrackResult(selector(proxy))
  }

  it('untracks filter() results to raw elements', () => {
    const { state, proxy } = setupArrayState()
    const result = evaluate(proxy, (s) => s.rows.filter((r) => r.status === 'even'))
    expect(result).toHaveLength(5)
    for (let i = 0; i < result.length; i++) {
      expect(isTrackingProxy(result[i])).toBe(false)
    }
    expect(result[0]).toBe(state.rows[0])
    expect(result[4]).toBe(state.rows[8])
  })

  it('handles filter().sort() — user mutation of a library-built array', () => {
    const { state, proxy } = setupArrayState()
    const result = evaluate(proxy, (s) =>
      s.rows.filter((r) => r.status === 'even').sort((a, b) => b.score - a.score),
    )
    expect(result.map((r) => r.id)).toEqual([8, 6, 4, 2, 0])
    for (const r of result) {
      expect(isTrackingProxy(r)).toBe(false)
    }
    expect(result[0]).toBe(state.rows[8])
  })

  it('handles an element replaced with a user-built container', () => {
    const { state, proxy } = setupArrayState()
    const result = evaluate(proxy, (s) => {
      const matches: unknown[] = s.rows.filter((r) => r.status === 'even')
      matches[0] = { wrapped: s.extra }
      return matches
    })
    expect(isTrackingProxy((result[0] as { wrapped: object }).wrapped)).toBe(false)
    expect((result[0] as { wrapped: object }).wrapped).toBe(state.extra)
    expect(isTrackingProxy(result[1])).toBe(false)
  })

  it('untracks slice() results', () => {
    const { state, proxy } = setupArrayState()
    const result = evaluate(proxy, (s) => s.rows.slice(2, 5))
    expect(result).toHaveLength(3)
    for (const r of result) {
      expect(isTrackingProxy(r)).toBe(false)
    }
    expect(result[0]).toBe(state.rows[2])
  })

  it('untracks library-built arrays embedded in user containers', () => {
    const { state, proxy } = setupArrayState()
    const result = evaluate(proxy, (s) => ({
      matches: s.rows.filter((r) => r.score > 50),
      first: s.rows[0],
    }))
    for (const r of result.matches) {
      expect(isTrackingProxy(r)).toBe(false)
    }
    expect(isTrackingProxy(result.first)).toBe(false)
    expect(result.first).toBe(state.rows[0])
  })

})
