import { describe, expect, it } from 'vitest'
import { createTrackingProxy } from '../../../src/signals/trackingProxy'
import { getProxyPath } from '../../../src/signals/proxyIdentity'
import { untrackResult } from '../../../src/signals/untrack'
import { createRegistry } from '../helpers/registry'

const isTrackingProxy = (v: unknown) =>
  v !== null && typeof v === 'object' && getProxyPath(v) !== undefined

describe('untrackResult unit behavior', () => {
  function setup() {
    const registry = createRegistry()
    const state = {
      a: { x: 1 },
      list: [{ id: 1, v: 'one' }],
    }
    Object.freeze(state.a)
    Object.freeze(state.list[0])
    Object.freeze(state.list)
    Object.freeze(state)
    const proxy = createTrackingProxy(state, '', registry)
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
})

describe('untrackResult with derived arrays', () => {
  interface Row {
    id: number
    status: string
    score: number
  }

  function setupArrayState() {
    const registry = createRegistry()
    const rows: Row[] = []
    for (let i = 0; i < 10; i++) {
      rows.push({ id: i, status: i % 2 === 0 ? 'even' : 'odd', score: i * 10 })
    }
    const state = { rows, extra: { x: 1 } }
    for (const r of rows) Object.freeze(r)
    Object.freeze(rows)
    Object.freeze(state.extra)
    Object.freeze(state)
    const proxy = createTrackingProxy(state, '', registry) as typeof state
    return { state, proxy }
  }

  // Mimic one hook evaluation: run the selector, untrack the result.
  function evaluate<R>(
    proxy: ReturnType<typeof setupArrayState>['proxy'],
    selector: (s: ReturnType<typeof setupArrayState>['proxy']) => R,
  ): R {
    return untrackResult(selector(proxy))
  }

  it('untracks filter() results to raw elements', () => {
    const { state, proxy } = setupArrayState()
    const result = evaluate(proxy, (s) =>
      s.rows.filter((r) => r.status === 'even'),
    )
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
      s.rows
        .filter((r) => r.status === 'even')
        .sort((a, b) => b.score - a.score),
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
    expect(isTrackingProxy((result[0] as { wrapped: object }).wrapped)).toBe(
      false,
    )
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
