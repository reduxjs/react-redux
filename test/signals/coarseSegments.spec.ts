import { describe, it, expect } from 'vitest'
import type { CoarseSub } from '../../src/signals/coarseSegments'
import {
  createProbeProxy,
  createSegmentIndex,
} from '../../src/signals/coarseSegments'
import { alienEngine } from '../../src/signals/engine'
import { createPathSignalRegistry } from '../../src/signals/pathSignalRegistry'
import { reconcileState } from '../../src/signals/diff'
import { unwrap } from '../../src/signals/trackingProxy'

function makeSub(segments: Set<string> | null): CoarseSub & { hits: number } {
  const sub: CoarseSub & { hits: number } = {
    segments,
    hits: 0,
    onCoarseHit() {
      sub.hits++
    },
  }
  return sub
}

describe('SegmentIndex', () => {
  it('collects subs whose segments intersect the changed root keys', () => {
    const index = createSegmentIndex()
    const subA = makeSub(new Set(['a']))
    const subB = makeSub(new Set(['b']))
    const subAB = makeSub(new Set(['a', 'b']))
    index.register(subA)
    index.register(subB)
    index.register(subAB)

    expect(index.collect(['a'])).toEqual(expect.arrayContaining([subA, subAB]))
    expect(index.collect(['a'])).toHaveLength(2)
    expect(index.collect(['c'])).toHaveLength(0)
  })

  it('dedupes a sub matched by multiple changed keys', () => {
    const index = createSegmentIndex()
    const subAB = makeSub(new Set(['a', 'b']))
    index.register(subAB)

    expect(index.collect(['a', 'b'])).toHaveLength(1)
  })

  it('collect(null) returns every registered sub (non-diffable root)', () => {
    const index = createSegmentIndex()
    const subA = makeSub(new Set(['a']))
    const wildcard = makeSub(null)
    index.register(subA)
    index.register(wildcard)

    expect(index.collect(null)).toHaveLength(2)
  })

  it('collect([]) returns only wildcard subs', () => {
    const index = createSegmentIndex()
    const subA = makeSub(new Set(['a']))
    const wildcard = makeSub(null)
    index.register(subA)
    index.register(wildcard)

    const hits = index.collect([])
    expect(hits).toHaveLength(1)
    expect(hits[0]).toBe(wildcard)
  })

  it('wildcard subs are collected for any changed key', () => {
    const index = createSegmentIndex()
    const wildcard = makeSub(null)
    index.register(wildcard)

    expect(index.collect(['whatever'])).toHaveLength(1)
  })

  it('unregister removes a sub and is idempotent', () => {
    const index = createSegmentIndex()
    const subA = makeSub(new Set(['a']))
    index.register(subA)
    expect(index.size()).toBe(1)

    index.unregister(subA)
    expect(index.size()).toBe(0)
    expect(index.collect(['a'])).toHaveLength(0)

    // Second unregister is a no-op, not an error.
    index.unregister(subA)
    expect(index.size()).toBe(0)
  })

  it('a sub can unregister itself during onCoarseHit without breaking iteration', () => {
    const index = createSegmentIndex()
    const order: string[] = []
    const subs: CoarseSub[] = []
    for (const name of ['one', 'two', 'three']) {
      const sub: CoarseSub = {
        segments: new Set(['a']),
        onCoarseHit() {
          order.push(name)
          index.unregister(sub)
        },
      }
      subs.push(sub)
      index.register(sub)
    }

    const hits = index.collect(['a'])
    for (const hit of hits) {
      hit.onCoarseHit()
    }

    expect(order).toEqual(['one', 'two', 'three'])
    expect(index.size()).toBe(0)
  })

  it('re-registering a sub with different segments replaces the old registration', () => {
    const index = createSegmentIndex()
    const sub = makeSub(new Set(['a']))
    index.register(sub)
    index.unregister(sub)

    const swapped = makeSub(new Set(['b']))
    index.register(swapped)

    expect(index.collect(['a'])).toHaveLength(0)
    expect(index.collect(['b'])).toHaveLength(1)
    expect(index.size()).toBe(1)
  })
})

describe('createProbeProxy', () => {
  const state = Object.freeze({
    a: Object.freeze({ value: 1 }),
    b: Object.freeze({ value: 2 }),
    list: Object.freeze([1, 2, 3]),
  })

  it('records top-level keys read through the proxy and returns raw values', () => {
    const { proxy, record } = createProbeProxy(state)

    const a = proxy.a
    expect(a).toBe(state.a) // raw value, not a nested proxy
    expect(a.value).toBe(1)

    expect(record.segments).toEqual(new Set(['a']))
    expect(record.enumerated).toBe(false)
  })

  it('records only the keys actually read', () => {
    const { proxy, record } = createProbeProxy(state)

    void proxy.a
    void proxy.list

    expect(record.segments).toEqual(new Set(['a', 'list']))
  })

  it("records segments for 'in' checks", () => {
    const { proxy, record } = createProbeProxy(state)

    expect('a' in proxy).toBe(true)
    expect('missing' in proxy).toBe(false)

    expect(record.segments).toEqual(new Set(['a', 'missing']))
  })

  it('records segments for hasOwnProperty checks', () => {
    const { proxy, record } = createProbeProxy(state)

    expect(Object.prototype.hasOwnProperty.call(proxy, 'b')).toBe(true)

    expect(record.segments.has('b')).toBe(true)
  })

  it('flags enumeration (Object.keys)', () => {
    const { proxy, record } = createProbeProxy(state)

    expect(Object.keys(proxy)).toEqual(['a', 'b', 'list'])
    expect(record.enumerated).toBe(true)
  })

  it('flags enumeration (spread)', () => {
    const { proxy, record } = createProbeProxy(state)

    const copy = { ...proxy }
    expect(copy.a).toBe(state.a)
    expect(record.enumerated).toBe(true)
  })

  it('does not record symbol reads', () => {
    const { proxy, record } = createProbeProxy(state)

    void (proxy as any)[Symbol.toStringTag]

    expect(record.segments.size).toBe(0)
  })

  it('captures the partial footprint when the selector throws', () => {
    const { proxy, record } = createProbeProxy(state)

    expect(() => {
      void proxy.a
      throw new Error('selector blew up')
    }).toThrow('selector blew up')

    // Anything read before the throw is in the footprint — this is what
    // makes gating on a partial footprint sound: the segment whose value
    // controls the throwing path was read before the throw.
    expect(record.segments).toEqual(new Set(['a']))
  })

  it('unwrap() resolves the probe proxy back to the raw state', () => {
    const { proxy } = createProbeProxy(state)

    expect(unwrap(proxy)).toBe(state)
  })

  it('rejects writes', () => {
    const { proxy } = createProbeProxy(state)

    expect(() => {
      (proxy as any).a = 42
    }).toThrow(TypeError)
    expect(() => {
      delete (proxy as any).a
    }).toThrow(TypeError)
  })
})

describe('reconcileState changed-root-keys return value', () => {
  function makeRegistry() {
    return createPathSignalRegistry(alienEngine)
  }

  it('returns [] when prev === next', () => {
    const registry = makeRegistry()
    const state = { a: 1 }

    expect(reconcileState(state, state, registry, alienEngine)).toEqual([])
  })

  it('returns the top-level keys whose references changed', () => {
    const registry = makeRegistry()
    const prev = { a: { v: 1 }, b: { v: 2 }, c: { v: 3 } }
    const next = { a: { v: 9 }, b: prev.b, c: prev.c }

    expect(reconcileState(prev, next, registry, alienEngine)).toEqual(['a'])
  })

  it('includes added keys', () => {
    const registry = makeRegistry()
    const prev: Record<string, unknown> = { a: 1 }
    const next = { a: 1, added: 2 }

    expect(reconcileState(prev, next, registry, alienEngine)).toEqual(['added'])
  })

  it('includes keys added with an undefined value', () => {
    const registry = makeRegistry()
    const prev: Record<string, unknown> = { a: 1 }
    const next = { a: 1, added: undefined }

    expect(reconcileState(prev, next, registry, alienEngine)).toEqual(['added'])
  })

  it('includes removed keys', () => {
    const registry = makeRegistry()
    const prev = { a: 1, removed: 2 }
    const next = { a: 1 }

    expect(reconcileState(prev, next, registry, alienEngine)).toEqual([
      'removed',
    ])
  })

  it('returns null when the root is not a plain object', () => {
    const registry = makeRegistry()
    const prev = new Map([['v', 1]])
    const next = new Map([['v', 2]])

    expect(reconcileState(prev, next, registry, alienEngine)).toBeNull()
  })
})
