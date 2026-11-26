/**
 * Minimal repros for mismatches found by the differential fuzzers
 * (differential.*.property.spec). Each case is marked `it.fails` while the
 * library bug is open; when a fix lands the test starts passing, vitest
 * reports it, and the marker should be removed.
 */
import * as rtl from '@testing-library/react'
import { legacy_createStore as createStore } from 'redux'
import { createSelector } from 'reselect'
import { afterEach, describe, expect, it } from 'vitest'
import { SignalProvider, useSignalSelector } from '../../../src/signals/index'
import {
  renderPromotedWithReplace as renderPromoted,
  replaceReducer as reducer,
} from '../helpers/react'

afterEach(() => {
  rtl.cleanup()
})

describe('keyed array elements that change position', () => {
  // An index read on a keyed array tracks the element's identity path
  // (todos.{id:2}) plus the array's reorder and removal signals.
  type S = { todos: { id: number }[] }
  it('reading the first element by index sees the new order', () => {
    const one = { id: 1 }
    const two = { id: 2 }
    const { replace, seen } = renderPromoted<S>(
      { todos: [two, one] },
      (s) => s.todos[0].id,
    )
    expect(seen.current).toBe(2)
    replace({ todos: [one, two] })
    expect(seen.current).toBe(1)
  })

  it('reading the first element by index sees a sorted copy', () => {
    const { replace, seen } = renderPromoted<S>(
      { todos: [{ id: 2 }, { id: 1 }] },
      (s) => s.todos[0].id,
    )
    expect(seen.current).toBe(2)
    replace({ todos: [{ id: 1 }, { id: 2 }] })
    expect(seen.current).toBe(1)
  })

  it('reading the first element by index sees an insert at the front', () => {
    const one = { id: 1 }
    const { replace, seen } = renderPromoted<S>(
      { todos: [one] },
      (s) => s.todos[0].id,
    )
    expect(seen.current).toBe(1)
    replace({ todos: [{ id: 2 }, one] })
    expect(seen.current).toBe(2)
  })
})

describe('object key order with an unchanged key set', () => {
  it('Object.keys on a nested object sees the new order', () => {
    const { replace, seen } = renderPromoted(
      { a: { x: 1, y: 2 } },
      (s: { a: Record<string, number> }) => Object.keys(s.a).join(),
    )
    expect(seen.current).toBe('x,y')
    replace({ a: { y: 2, x: 1 } })
    expect(seen.current).toBe('y,x')
  })

  it('spreading the root sees the new order', () => {
    const { replace, seen } = renderPromoted(
      { b: 1, c: 2 } as Record<string, number>,
      (s) => Object.keys({ ...s }).join(),
    )
    expect(seen.current).toBe('b,c')
    replace({ c: 2, b: 1 })
    expect(seen.current).toBe('c,b')
  })
})

describe('keyed array element whose key goes from missing to present', () => {
  type Todo = { id: number | null; text: string }
  type S = { todos: Todo[] }

  it('reading the element sees the new key', () => {
    const { replace, seen } = renderPromoted<S>(
      { todos: [{ id: null, text: 'draft' }] },
      (s) => s.todos[0],
    )
    const saved = { id: 1, text: 'draft' }
    replace({ todos: [saved] })
    expect(seen.current).toBe(saved)
  })

  it('reading the key field sees the new key', () => {
    const { replace, seen } = renderPromoted<S>(
      { todos: [{ id: null, text: 'draft' }] },
      (s) => s.todos[0].id,
    )
    replace({ todos: [{ id: 1, text: 'draft' }] })
    expect(seen.current).toBe(1)
  })

  it('an array whose only element had no key field sees it gain one', () => {
    const { replace, seen } = renderPromoted<{ a: object[] }>(
      { a: [{}] },
      (s) => s.a[0],
    )
    const keyed = { id: 1 }
    replace({ a: [keyed] })
    expect(seen.current).toBe(keyed)
  })

  it('a key that changes from one number to another is seen', () => {
    const { replace, seen } = renderPromoted<S>(
      { todos: [{ id: 2, text: 'a' }] },
      (s) => s.todos[0].id,
    )
    replace({ todos: [{ id: 1, text: 'a' }] })
    expect(seen.current).toBe(1)
  })
})

describe('keyed array with duplicate keys', () => {
  type S = { keys: { key: string }[] }

  it('replacing a later duplicate while the first is unchanged is seen', () => {
    const first = { key: 'a' }
    const { replace, seen } = renderPromoted<S>(
      { keys: [first, { key: 'a' }] },
      (s) => s.keys[1].key,
    )
    expect(seen.current).toBe('a')
    replace({ keys: [first, { key: 'b' }] })
    expect(seen.current).toBe('b')
  })

  it('mapping over the array sees a change to a later duplicate', () => {
    const first = { key: 'a', v: 1 }
    const { replace, seen } = renderPromoted<{
      keys: { key: string; v: number }[]
    }>({ keys: [first, { key: 'a', v: 1 }] }, (s) =>
      s.keys.map((k) => k.v).join(),
    )
    expect(seen.current).toBe('1,1')
    replace({ keys: [first, { key: 'a', v: 2 }] })
    expect(seen.current).toBe('1,2')
  })

  it('a direct read of a later duplicate sees an in-place change', () => {
    const first = { key: 'a', v: 1 }
    const { replace, seen } = renderPromoted<{
      keys: { key: string; v: number }[]
    }>({ keys: [first, { key: 'a', v: 1 }] }, (s) => s.keys[1].v)
    expect(seen.current).toBe(1)
    replace({ keys: [first, { key: 'a', v: 2 }] })
    expect(seen.current).toBe(2)
  })
})

describe('a previous root object stored inside the new state', () => {
  it('changing one of two copies of the old root is seen', () => {
    const store = createStore(reducer, { a: 'x', b: [] } as object)
    const old = store.getState()
    const seen: { current: unknown } = { current: undefined }
    function Comp() {
      seen.current = useSignalSelector((s: object) => JSON.stringify(s))
      return null
    }
    rtl.render(
      <SignalProvider store={store}>
        <Comp />
      </SignalProvider>,
    )
    const replace = (payload: object) =>
      rtl.act(() => {
        store.dispatch({ type: 'replace', payload })
      })
    replace({ a: old, b: old })
    replace({ a: old, b: {} })
    expect(seen.current).toBe(JSON.stringify({ a: old, b: {} }))
  })
})

describe('a memoized result that embeds a state object', () => {
  // The input selector reads todo.done, so the only dependency on the todo
  // object itself comes from unwrapping the proxy in the result. A later
  // result-function cache hit hands back the already unwrapped result, so
  // the proxies stripped from it the first time are replayed.
  type Todo = { id: number; done: boolean; text: string }
  type S = { todos: Todo[]; other: number }
  it('a cache hit keeps the embedded object tracked', () => {
    const selectFirstDone = createSelector(
      [
        (s: S) => (s.todos[0].done ? s.todos[0] : undefined),
        (s: S) => s.other > 5,
      ],
      (todo, big) => ({ todo, big }),
    )
    const first = { id: 1, done: true, text: 'a' }
    const { replace, seen } = renderPromoted<S>(
      { todos: [first], other: 0 },
      selectFirstDone,
    )
    // Re-runs the selector; both inputs are unchanged, so Reselect returns
    // its cached result.
    replace({ todos: [first], other: 1 })
    // Same done flag, new text: the input selector still finds this todo.
    const todo = { id: 1, done: true, text: 'b' }
    replace({ todos: [todo], other: 1 })
    expect((seen.current as { todo: Todo }).todo).toBe(todo)
  })
})

describe('array elements inside array-method callbacks', () => {
  type S = { rows: number[][] }
  const initial: S = { rows: [[1], [2]] }

  it('Array.isArray is true for an array element in map', () => {
    const { seen } = renderPromoted(initial, (s) =>
      s.rows.map((r) => Array.isArray(r)),
    )
    expect(seen.current).toEqual([true, true])
  })

  it('Array.isArray is true for an array element in filter', () => {
    const { seen } = renderPromoted(
      initial,
      (s) => s.rows.filter((r) => Array.isArray(r)).length,
    )
    expect(seen.current).toBe(2)
  })

  it('JSON.stringify serializes an array element as an array', () => {
    const { seen } = renderPromoted(initial, (s) =>
      s.rows.map((r) => JSON.stringify(r)),
    )
    expect(seen.current).toEqual(['[1]', '[2]'])
  })

  it('JSON.stringify of an array element sees a change to it', () => {
    const { replace, seen } = renderPromoted(initial, (s) =>
      s.rows.map((r) => JSON.stringify(r)),
    )
    replace({ rows: [[1], [3, 4]] })
    expect(seen.current).toEqual(['[1]', '[3,4]'])
  })

  it('finding an array element returns the raw element', () => {
    const { replace, seen } = renderPromoted(initial, (s) =>
      s.rows.find((r) => r[0] === 2),
    )
    expect(seen.current).toBe(initial.rows[1])
    const row = [2, 5]
    replace({ rows: [[1], row] })
    expect(seen.current).toBe(row)
  })

  it('a map callback that returns a fresh array sees a real array', () => {
    const { seen } = renderPromoted(initial, (s) =>
      s.rows.map((r) => [Array.isArray(r)]),
    )
    expect(seen.current).toEqual([[true], [true]])
  })
})

describe('an inner array that moves to a new index', () => {
  // Child proxies are cached by target. Primitive reads on an array
  // subscribe to the array's own path, so the cached proxy has to follow
  // the array from a.0 to a.1.
  it('JSON.stringify sees a change to the moved array', () => {
    const moved = [1]
    const head = {}
    const tail: number[] = []
    const { replace, seen } = renderPromoted({ a: [moved, tail] }, (s) =>
      JSON.stringify(s.a),
    )
    replace({ a: [head, moved, tail] })
    expect(seen.current).toBe('[{},[1],[]]')
    replace({ a: [head, [2], tail] })
    expect(seen.current).toBe('[{},[2],[]]')
  })
})

describe('the in operator on the root', () => {
  // The value at `a` stays undefined, so only the root key signal fires.
  // combineReducers rejects undefined slices, so this needs a hand-written
  // root reducer.
  it('sees a root key added with an undefined value', () => {
    const { replace, seen } = renderPromoted(
      { a: 1 } as Record<string, unknown>,
      (s) => 'a' in s,
    )
    // Removing `a` changes a root key the hook read, which moves it to the
    // deep tier.
    replace({})
    expect(seen.current).toBe(false)
    replace({ a: undefined })
    expect(seen.current).toBe(true)
  })
})
