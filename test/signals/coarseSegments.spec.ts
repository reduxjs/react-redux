import { describe, expect, it } from 'vitest'
import {
  changedSegments,
  recordSegments,
  SegmentIndex,
  type CoarseSub,
} from '../../src/signals/coarseSegments'

describe('recordSegments', () => {
  const state = {
    a: { deep: { value: 1 } },
    b: [10, 20, 30],
    c: 'hi',
  }

  it('records only the top-level segments a selector reads', () => {
    expect(recordSegments(state, (s: typeof state) => s.a.deep.value)).toEqual(
      new Set(['a']),
    )
    expect(recordSegments(state, (s: typeof state) => s.b[1])).toEqual(
      new Set(['b']),
    )
    expect(
      recordSegments(state, (s: typeof state) => `${s.a.deep.value}-${s.c}`),
    ).toEqual(new Set(['a', 'c']))
  })

  it('does not record nested property access as a segment', () => {
    const segments = recordSegments(state, (s: typeof state) => s.a.deep.value)
    expect(segments.has('deep')).toBe(false)
    expect(segments.has('value')).toBe(false)
  })

  it('keeps the segments touched before a selector throws', () => {
    const segments = recordSegments(state, (s: any) => {
      void s.a
      throw new Error('boom')
    })
    expect(segments.has('a')).toBe(true)
  })
})

describe('SegmentIndex', () => {
  const sub = (...segments: string[]): CoarseSub => ({
    segments: new Set(segments),
    onCoarseHit() {},
  })

  it('collects subscribers of changed segments (union, deduped)', () => {
    const index = new SegmentIndex<CoarseSub>()
    const s1 = sub('a', 'b')
    const s2 = sub('b')
    const s3 = sub('c')
    index.register(s1)
    index.register(s2)
    index.register(s3)

    const out = new Set<CoarseSub>()
    index.collect(['b'], out)
    expect(out).toEqual(new Set([s1, s2]))

    out.clear()
    index.collect(['a', 'c'], out)
    expect(out).toEqual(new Set([s1, s3]))
  })

  it('ignores changed segments with no subscribers', () => {
    const index = new SegmentIndex<CoarseSub>()
    index.register(sub('a'))
    const out = new Set<CoarseSub>()
    index.collect(['zzz'], out)
    expect(out.size).toBe(0)
  })

  it('unregister removes a subscriber and prunes empty segments', () => {
    const index = new SegmentIndex<CoarseSub>()
    const s1 = sub('a')
    index.register(s1)
    expect(index.segmentCount()).toBe(1)
    index.unregister(s1)
    expect(index.segmentCount()).toBe(0)
    const out = new Set<CoarseSub>()
    index.collect(['a'], out)
    expect(out.size).toBe(0)
  })

})

describe('changedSegments', () => {
  it('returns top-level keys whose reference changed', () => {
    const a = { x: 1 }
    const b = { y: 2 }
    const prev = { a, b, n: 1 }
    const next = { a, b: { y: 3 }, n: 1 }
    expect(changedSegments(prev, next)).toEqual(['b'])
  })

  it('returns [] for the same reference', () => {
    const s = { a: 1 }
    expect(changedSegments(s, s)).toEqual([])
  })

  it('detects added and removed top-level keys', () => {
    expect(changedSegments({ a: 1 }, { a: 1, b: 2 })).toEqual(['b'])
    expect(changedSegments({ a: 1, b: 2 }, { a: 1 })).toEqual(['b'])
  })

  it('detects changed primitive segments', () => {
    expect(changedSegments({ a: 1, b: 2 }, { a: 1, b: 5 })).toEqual(['b'])
  })
})
