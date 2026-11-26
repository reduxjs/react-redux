import { describe, it, test, expect, vi } from 'vitest'
import { createSelector } from 'reselect'
import { alienEngine } from '../../../src/signals/engine'
import { createPathSignalRegistry } from '../../../src/signals/pathSignalRegistry'
import type { PathSignalRegistry } from '../../../src/signals/pathSignalRegistry'
import {
  createLeafTracker,
  createTrackingProxy,
  finalizeDependencies,
} from '../../../src/signals/trackingProxy'
import { getProxyPath, unwrap } from '../../../src/signals/proxyIdentity'
import { reconcileState } from '../../../src/signals/diff'
import { createRegistry, trackState } from '../helpers/registry'
import { deepFreeze } from '../helpers/state'

describe('Array method overrides on tracking proxy', () => {
  // Test data factory — mimics Immer test structure
  const createTestData = () =>
    deepFreeze({
      items: [
        { id: 1, value: 10, nested: { count: 1 } },
        { id: 2, value: 20, nested: { count: 2 } },
        { id: 3, value: 30, nested: { count: 3 } },
        { id: 4, value: 40, nested: { count: 4 } },
        { id: 5, value: 50, nested: { count: 5 } },
      ],
      other: { data: 'test' },
    })

  describe('find()', () => {
    test('returns the raw found item with an identity dependency', () => {
      const state = createTestData()
      const { proxy, registry } = trackState(state)
      const found = proxy.items.find((item) => item.id === 3)
      expect(found).toBe(state.items[2])
      expect(getProxyPath(found)).toBeUndefined()
      expect(registry.has('items.{id:3}')).toBe(true)
      expect(registry.has('items.{id:2}')).toBe(false)
    })

    test('returns undefined when not found', () => {
      const state = createTestData()
      const { proxy } = trackState(state)
      const found = proxy.items.find((item) => item.id === 999)
      expect(found).toBeUndefined()
    })

    test('callback receives scan recorder, unwrap resolves raw element', () => {
      const state = createTestData()
      const { proxy } = trackState(state)
      const unwrapped: unknown[] = []
      let callCount = 0
      proxy.items.find((item) => {
        callCount++
        // Not a tracking proxy (no path registered)
        expect(getProxyPath(item)).toBeUndefined()
        // unwrap resolves to the raw frozen element
        unwrapped.push(unwrap(item))
        return false // never match, scan all
      })
      expect(callCount).toBe(5)
      for (let i = 0; i < 5; i++) {
        expect(unwrapped[i]).toBe(state.items[i])
        expect(Object.isFrozen(unwrapped[i])).toBe(true)
      }
    })

    test('only registers signals for the found element, not all scanned elements', () => {
      const state = createTestData()
      const { proxy, registry } = trackState(state)

      // find item with id === 3 (index 2)
      const found = proxy.items.find((item) => item.id === 3)
      // Access a property to register a signal
      const _val = found!.value

      // Should have a signal for the found item's value, NOT for all items
      // With identity-based tracking, the path would be items.{id:3}.value
      expect(registry.size()).toBeGreaterThan(0)

      // The key assertion: we should NOT have signals for items that were
      // only scanned (not returned). Check that items 1, 2, 4, 5 don't
      // have signals registered.
      expect(registry.has('items.{id:1}.value')).toBe(false)
      expect(registry.has('items.{id:2}.value')).toBe(false)
      expect(registry.has('items.{id:4}.value')).toBe(false)
      expect(registry.has('items.{id:5}.value')).toBe(false)
    })

    test('callback receives correct index and array arguments', () => {
      const state = createTestData()
      const { proxy } = trackState(state)
      const indices: number[] = []
      let receivedArray: unknown

      proxy.items.find((item, index, arr) => {
        indices.push(index)
        receivedArray = arr
        return item.id === 2
      })

      expect(indices).toEqual([0, 1]) // stops after finding id:2
      // Array argument should be the raw frozen array
      expect(receivedArray).toBe(state.items)
    })

    test('found element properties are accessible through proxy', () => {
      const state = createTestData()
      const { proxy } = trackState(state)
      const found = proxy.items.find((item) => item.id === 2)!
      expect(found.id).toBe(2)
      expect(found.value).toBe(20)
      expect(found.nested.count).toBe(2)
    })

    test('works with primitive arrays', () => {
      const state = deepFreeze({ nums: [10, 20, 30, 40, 50] })
      const { proxy } = trackState(state)
      const found = proxy.nums.find((n) => n > 25)
      expect(found).toBe(30)
    })
  })

  describe('findLast()', () => {
    test('returns the raw last matching item with an identity dependency', () => {
      const state = deepFreeze({
        items: [
          { id: 1, type: 'A' },
          { id: 2, type: 'B' },
          { id: 3, type: 'A' },
        ],
      })
      const { proxy, registry } = trackState(state)
      const found = proxy.items.findLast((item) => item.type === 'A')
      expect(found).toBe(state.items[2])
      expect(registry.has('items.{id:3}')).toBe(true)
      expect(registry.has('items.{id:1}')).toBe(false)
    })

    test('returns undefined when not found', () => {
      const state = createTestData()
      const { proxy } = trackState(state)
      const found = proxy.items.findLast((item) => item.id === 999)
      expect(found).toBeUndefined()
    })

    test('searches from end', () => {
      const state = createTestData()
      const { proxy } = trackState(state)
      const indices: number[] = []
      proxy.items.findLast((item, index) => {
        indices.push(index)
        return item.id === 3
      })
      // Should search backwards: 4, 3, 2 — stops at index 2
      expect(indices).toEqual([4, 3, 2])
    })
  })

  describe('findIndex()', () => {
    test('returns index of found item', () => {
      const state = createTestData()
      const { proxy } = trackState(state)
      const index = proxy.items.findIndex((item) => item.id === 3)
      expect(index).toBe(2)
    })

    test('returns -1 when not found', () => {
      const state = createTestData()
      const { proxy } = trackState(state)
      const index = proxy.items.findIndex((item) => item.id === 999)
      expect(index).toBe(-1)
    })

    test('does not register any element signals', () => {
      const state = createTestData()
      const { proxy, registry } = trackState(state)
      proxy.items.findIndex((item) => item.id === 3)
      // findIndex returns a primitive — no element signals should be created
      expect(registry.has('items.{id:1}.value')).toBe(false)
      expect(registry.has('items.{id:3}.value')).toBe(false)
    })

    test('callback receives scan recorder, unwrap resolves raw element', () => {
      const state = createTestData()
      const { proxy } = trackState(state)
      let i = 0
      proxy.items.findIndex((item) => {
        expect(getProxyPath(item)).toBeUndefined()
        expect(unwrap(item)).toBe(state.items[i])
        i++
        return false
      })
      expect(i).toBe(5)
    })
  })

  describe('findLastIndex()', () => {
    test('returns last matching index', () => {
      const state = deepFreeze({
        items: [
          { id: 1, type: 'A' },
          { id: 2, type: 'B' },
          { id: 3, type: 'A' },
        ],
      })
      const { proxy } = trackState(state)
      const index = proxy.items.findLastIndex((item) => item.type === 'A')
      expect(index).toBe(2)
    })

    test('returns -1 when not found', () => {
      const state = createTestData()
      const { proxy } = trackState(state)
      const index = proxy.items.findLastIndex((item) => item.id === 999)
      expect(index).toBe(-1)
    })
  })

  describe('filter()', () => {
    test('returns the raw matching items', () => {
      const state = createTestData()
      const { proxy } = trackState(state)
      const filtered = proxy.items.filter((item) => item.value > 25)
      expect(filtered).toEqual([state.items[2], state.items[3], state.items[4]])
      expect(filtered[0]).toBe(state.items[2])
      expect(getProxyPath(filtered[0])).toBeUndefined()
    })

    test('callback receives scan recorder, not tracking proxies', () => {
      const state = createTestData()
      const { proxy } = trackState(state)
      const unwrapped: unknown[] = []
      proxy.items.filter((item) => {
        expect(getProxyPath(item)).toBeUndefined()
        unwrapped.push(unwrap(item))
        return false
      })
      expect(unwrapped).toEqual([...state.items])
    })

    test('registers identity signals for matching elements only', () => {
      const state = createTestData()
      const { proxy, registry } = trackState(state)
      const filtered = proxy.items.filter((item) => item.id === 3)
      // Reads on the raw result are not tracked; the element identity is
      expect(filtered[0].value).toBe(30)
      expect(registry.has('items.{id:3}')).toBe(true)
      expect(registry.has('items.{id:3}.value')).toBe(false)
      expect(registry.has('items.{id:1}')).toBe(false)
      expect(registry.has('items.{id:2}')).toBe(false)
    })

    test('filtered items give access to nested properties', () => {
      const state = createTestData()
      const { proxy } = trackState(state)
      const filtered = proxy.items.filter((item) => item.id > 3)
      expect(filtered[0].nested.count).toBe(4)
      expect(filtered[1].nested.count).toBe(5)
    })

    test('multiple filters on same array work correctly', () => {
      const state = createTestData()
      const { proxy } = trackState(state)
      const high = proxy.items.filter((item) => item.value > 30)
      const low = proxy.items.filter((item) => item.value < 30)
      expect(high).toHaveLength(2)
      expect(low).toHaveLength(2)
    })

    test('returns empty array when nothing matches', () => {
      const state = createTestData()
      const { proxy } = trackState(state)
      const filtered = proxy.items.filter((item) => item.id > 100)
      expect(filtered).toHaveLength(0)
    })

    test('callback receives correct index and array arguments', () => {
      const state = createTestData()
      const { proxy } = trackState(state)
      const seen: number[] = []
      proxy.items.filter((_item, index, arr) => {
        seen.push(index)
        expect(arr).toBe(state.items)
        return false
      })
      expect(seen).toEqual([0, 1, 2, 3, 4])
    })
  })

  describe('slice()', () => {
    test('returns the raw sliced items', () => {
      const state = createTestData()
      const { proxy } = trackState(state)
      const sliced = proxy.items.slice(1, 3)
      expect(sliced).toEqual([state.items[1], state.items[2]])
      expect(sliced[0]).toBe(state.items[1])
      expect(getProxyPath(sliced[0])).toBeUndefined()
    })

    test('slice with no arguments returns a raw copy of all items', () => {
      const state = createTestData()
      const { proxy } = trackState(state)
      const sliced = proxy.items.slice()
      expect(sliced).toEqual([...state.items])
      expect(sliced).not.toBe(state.items)
    })

    test('slice with negative indices', () => {
      const state = createTestData()
      const { proxy } = trackState(state)
      const sliced = proxy.items.slice(-2)
      expect(sliced).toHaveLength(2)
      expect(sliced[0].id).toBe(4)
      expect(sliced[1].id).toBe(5)
    })

    test('slice with negative start and end', () => {
      const state = createTestData()
      const { proxy } = trackState(state)
      const sliced = proxy.items.slice(-3, -1)
      expect(sliced).toHaveLength(2)
      expect(sliced[0].id).toBe(3)
      expect(sliced[1].id).toBe(4)
    })

    test('out-of-bounds indices are clamped', () => {
      const state = createTestData()
      const { proxy } = trackState(state)
      const sliced = proxy.items.slice(-100, 100)
      expect(sliced).toHaveLength(5)
    })

    test('depends on the whole array, not on each sliced element', () => {
      const state = createTestData()
      const { proxy, registry } = trackState(state)
      proxy.items.slice(2, 3)

      expect(registry.has('items')).toBe(true)
      expect(registry.has('items.{id:3}')).toBe(false)
    })

    test.each([
      [[Number.NaN]],
      [[0, null]],
      [[1, undefined]],
      [['1', '3']],
      [[1.5, 3.7]],
      [[-Infinity, Infinity]],
    ])('matches native slice for arguments %j', (args) => {
      const state = createTestData()
      const { proxy } = trackState(state)
      const slice = proxy.items.slice as (...a: unknown[]) => unknown[]
      const nativeSlice = state.items.slice as (...a: unknown[]) => unknown[]
      expect(slice.apply(proxy.items, args)).toEqual(
        nativeSlice.apply(state.items, args),
      )
    })
  })

  describe('thisArg', () => {
    const methods = [
      'find',
      'findLast',
      'findIndex',
      'findLastIndex',
      'filter',
      'map',
      'some',
      'every',
    ] as const

    test.each(methods)('%s() calls the callback with thisArg', (method) => {
      const state = createTestData()
      const { proxy } = trackState(state)
      const thisArg = { marker: true }
      const seen: unknown[] = []
      const callback = function (this: unknown) {
        seen.push(this)
        return false
      }
      const fn = proxy.items[method] as (
        cb: (...a: unknown[]) => unknown,
        thisArg: unknown,
      ) => unknown
      fn.call(proxy.items, callback, thisArg)
      expect(seen.length).toBeGreaterThan(0)
      for (const value of seen) expect(value).toBe(thisArg)
    })
  })

  describe('some()', () => {
    test('returns true when predicate matches', () => {
      const state = createTestData()
      const { proxy } = trackState(state)
      expect(proxy.items.some((item) => item.value > 40)).toBe(true)
    })

    test('returns false when no match', () => {
      const state = createTestData()
      const { proxy } = trackState(state)
      expect(proxy.items.some((item) => item.value > 100)).toBe(false)
    })

    test('short-circuits on first match', () => {
      const state = createTestData()
      const { proxy } = trackState(state)
      let callCount = 0
      proxy.items.some((item) => {
        callCount++
        return item.id === 2
      })
      expect(callCount).toBe(2) // stops after finding id:2 at index 1
    })

    test('callback receives raw values', () => {
      const state = createTestData()
      const { proxy } = trackState(state)
      proxy.items.some((item) => {
        expect(getProxyPath(item)).toBeUndefined()
        return false
      })
    })

    test('does not register element signals', () => {
      const state = createTestData()
      const { proxy, registry } = trackState(state)
      proxy.items.some((item) => item.id === 3)
      expect(registry.has('items.{id:1}.value')).toBe(false)
      expect(registry.has('items.{id:3}.value')).toBe(false)
    })
  })

  describe('every()', () => {
    test('returns true when all match', () => {
      const state = createTestData()
      const { proxy } = trackState(state)
      expect(proxy.items.every((item) => item.value > 0)).toBe(true)
    })

    test('returns false when some do not match', () => {
      const state = createTestData()
      const { proxy } = trackState(state)
      expect(proxy.items.every((item) => item.value > 25)).toBe(false)
    })

    test('short-circuits on first failure', () => {
      const state = createTestData()
      const { proxy } = trackState(state)
      let callCount = 0
      proxy.items.every((item) => {
        callCount++
        return item.value < 25
      })
      // items: 10, 20, 30 — fails at index 2 (value 30)
      expect(callCount).toBe(3)
    })
  })

  describe('includes()', () => {
    test('returns true for primitive values', () => {
      const state = deepFreeze({ nums: [10, 20, 30, 40, 50] })
      const { proxy } = trackState(state)
      expect(proxy.nums.includes(30)).toBe(true)
    })

    test('returns false for missing primitive', () => {
      const state = deepFreeze({ nums: [10, 20, 30, 40, 50] })
      const { proxy } = trackState(state)
      expect(proxy.nums.includes(99)).toBe(false)
    })

    test('works with fromIndex', () => {
      const state = deepFreeze({ nums: [10, 20, 30, 20, 50] })
      const { proxy } = trackState(state)
      expect(proxy.nums.includes(20, 2)).toBe(true) // finds the 20 at index 3
      expect(proxy.nums.includes(10, 1)).toBe(false) // 10 is before index 1
    })
  })

  describe('indexOf()', () => {
    test('returns index of primitive value', () => {
      const state = deepFreeze({ nums: [10, 20, 30, 40, 50] })
      const { proxy } = trackState(state)
      expect(proxy.nums.indexOf(30)).toBe(2)
    })

    test('returns -1 when not found', () => {
      const state = deepFreeze({ nums: [10, 20, 30] })
      const { proxy } = trackState(state)
      expect(proxy.nums.indexOf(99)).toBe(-1)
    })

    test('with fromIndex parameter', () => {
      const state = deepFreeze({ nums: [1, 2, 3, 2, 5] })
      const { proxy } = trackState(state)
      expect(proxy.nums.indexOf(2)).toBe(1)
      expect(proxy.nums.indexOf(2, 2)).toBe(3)
    })
  })

  describe('lastIndexOf()', () => {
    test('returns last index of primitive value', () => {
      const state = deepFreeze({ nums: [10, 20, 30, 20, 50] })
      const { proxy } = trackState(state)
      expect(proxy.nums.lastIndexOf(20)).toBe(3)
    })

    test('returns -1 when not found', () => {
      const state = deepFreeze({ nums: [10, 20, 30] })
      const { proxy } = trackState(state)
      expect(proxy.nums.lastIndexOf(99)).toBe(-1)
    })
  })

  describe('join()', () => {
    test('returns joined string with separator', () => {
      const state = deepFreeze({ items: [1, 2, 3, 4, 5] })
      const { proxy } = trackState(state)
      expect(proxy.items.join(',')).toBe('1,2,3,4,5')
    })

    test('join with custom separator', () => {
      const state = deepFreeze({ items: ['a', 'b', 'c'] })
      const { proxy } = trackState(state)
      expect(proxy.items.join(' - ')).toBe('a - b - c')
    })

    test('join with no separator uses comma', () => {
      const state = deepFreeze({ items: [1, 2, 3] })
      const { proxy } = trackState(state)
      expect(proxy.items.join()).toBe('1,2,3')
    })
  })

  describe('toString()', () => {
    test('returns string representation', () => {
      const state = deepFreeze({ items: [1, 2, 3] })
      const { proxy } = trackState(state)
      expect(proxy.items.toString()).toBe('1,2,3')
    })
  })

  describe('toLocaleString()', () => {
    test('returns locale string', () => {
      const state = deepFreeze({ items: [1, 2, 3] })
      const { proxy } = trackState(state)
      // Just verify it returns a string without error
      expect(typeof proxy.items.toLocaleString()).toBe('string')
    })
  })

  describe('concat()', () => {
    test('returns new array with concatenated items (raw values)', () => {
      const state = deepFreeze({ items: [1, 2, 3] })
      const { proxy } = trackState(state)
      const result = proxy.items.concat([4, 5])
      expect(result).toEqual([1, 2, 3, 4, 5])
    })

    test('concat with no arguments creates shallow copy', () => {
      const state = createTestData()
      const { proxy } = trackState(state)
      const copy = proxy.items.concat()
      expect(copy).toHaveLength(5)
      expect(copy[0].id).toBe(1)
      // Result elements are raw values, not proxies
      expect(getProxyPath(copy[0])).toBeUndefined()
    })

    test('concat with multiple arrays', () => {
      const state = deepFreeze({ items: [1, 2] })
      const { proxy } = trackState(state)
      const result = proxy.items.concat([3, 4], [5, 6])
      expect(result).toEqual([1, 2, 3, 4, 5, 6])
    })
  })

  describe('flat()', () => {
    test('flattens nested arrays', () => {
      const state = deepFreeze({ items: [[1, 2], [3, 4], [5]] })
      const { proxy } = trackState(state)
      const result = proxy.items.flat()
      expect(result).toEqual([1, 2, 3, 4, 5])
    })

    test('flat with depth', () => {
      const state = deepFreeze({ items: [[[1, 2]], [[3, 4]]] })
      const { proxy } = trackState(state)
      expect(proxy.items.flat(1)).toEqual([
        [1, 2],
        [3, 4],
      ])
      expect(proxy.items.flat(2)).toEqual([1, 2, 3, 4])
    })
  })

  describe('map()', () => {
    test('primitive results register a column signal, not element signals', () => {
      const state = createTestData()
      const { proxy, registry } = trackState(state)
      const mapped = proxy.items.map((item) => item.value * 2)
      expect(mapped).toEqual([20, 40, 60, 80, 100])
      expect(registry.has('items.{*}.value')).toBe(true)
      expect(registry.has('items.{id:1}.value')).toBe(false)
      expect(registry.has('items.{id:1}')).toBe(false)
    })

    test('identity mapping returns raw elements with identity dependencies', () => {
      const state = createTestData()
      const { proxy, registry } = trackState(state)
      const mapped = proxy.items.map((item) => item)
      expect(mapped).toEqual([...state.items])
      expect(mapped[0]).toBe(state.items[0])
      for (let id = 1; id <= 5; id++) {
        expect(registry.has(`items.{id:${id}}`)).toBe(true)
      }
    })

    test('tracking proxies returned from elsewhere come back raw with a dependency on their container', () => {
      const state = deepFreeze({
        ids: [2, 1],
        entities: {
          1: { id: 1, name: 'one' },
          2: { id: 2, name: 'two' },
        } as Record<number, { id: number; name: string }>,
      })
      const { proxy, registry } = trackState(state)
      const all = proxy.ids.map((id) => proxy.entities[id])
      expect(all).toEqual([state.entities[2], state.entities[1]])
      expect(all[0]).toBe(state.entities[2])
      expect(getProxyPath(all[0])).toBeUndefined()
      // Mapping the collection depends on the container as a whole, not on
      // each element: the container is replaced whenever any element is.
      expect(registry.has('entities')).toBe(true)
      expect(registry.has('entities.2')).toBe(false)
      expect(registry.has('entities.1')).toBe(false)
      // Primitive ids fall back to the coarse array signal
      expect(registry.has('ids')).toBe(true)
    })

    test('fresh objects that embed the element get the raw element, not the recorder', () => {
      const state = createTestData()
      const { proxy, registry } = trackState(state)
      const calls: number[] = []
      const mapped = proxy.items.map((item, i) => {
        calls.push(i)
        return { item, doubled: item.value * 2 }
      })
      expect(mapped.map((m) => m.item)).toEqual([...state.items])
      expect(mapped[0].item).toBe(state.items[0])
      expect(mapped[4].item).toBe(state.items[4])
      expect(mapped.map((m) => m.doubled)).toEqual([20, 40, 60, 80, 100])
      // The first element is scanned twice (recorder, then raw); the rest once
      expect(calls).toEqual([0, 0, 1, 2, 3, 4])
      // Embedded elements force the coarse array dependency
      expect(registry.has('items')).toBe(true)
    })

    test('nested object reads fall back to the coarse array signal', () => {
      const state = createTestData()
      const { proxy, registry } = trackState(state)
      const counts = proxy.items.map((item) => item.nested.count)
      expect(counts).toEqual([1, 2, 3, 4, 5])
      expect(registry.has('items')).toBe(true)
      expect(registry.has('items.{*}.nested')).toBe(false)
    })

    test('callback receives correct index and array arguments', () => {
      const state = createTestData()
      const { proxy } = trackState(state)
      const seen: number[] = []
      proxy.items.map((_item, index, arr) => {
        seen.push(index)
        expect(arr).toBe(state.items)
        return index
      })
      expect(seen).toEqual([0, 1, 2, 3, 4])
    })
  })

  describe('Non-overridden methods (pass-through)', () => {
    test('forEach() callbacks receive proxied values', () => {
      const state = createTestData()
      const { proxy } = trackState(state)
      const values: number[] = []
      proxy.items.forEach((item) => {
        values.push(item.value)
      })
      expect(values).toEqual([10, 20, 30, 40, 50])
    })

    test('reduce() callbacks receive proxied values', () => {
      const state = createTestData()
      const { proxy } = trackState(state)
      const sum = proxy.items.reduce((acc, item) => acc + item.value, 0)
      expect(sum).toBe(150)
    })

    test('reduceRight() callbacks receive proxied values', () => {
      const state = createTestData()
      const { proxy } = trackState(state)
      const ids = proxy.items.reduceRight((acc: number[], item) => {
        acc.push(item.id)
        return acc
      }, [])
      expect(ids).toEqual([5, 4, 3, 2, 1])
    })
  })

  describe('Signal tracking precision', () => {
    test('find() registers the column read by the callback plus the result identity', () => {
      const state = createTestData()
      const { proxy, registry } = trackState(state)

      // Simulate what a selector does: find + read properties
      const item = proxy.items.find((i) => i.id === 3)!
      expect(item.value).toBe(30)
      expect(item.nested.count).toBe(3)

      expect(registry.debugPaths().sort()).toEqual(
        ['items.{*}.id', 'items.{id:3}', 'items.@@insertOrReorder'].sort(),
      )
    })

    test('filter() registers the column read by the callback plus matching identities', () => {
      const state = createTestData()
      const { proxy, registry } = trackState(state)

      const highValue = proxy.items.filter((i) => i.value > 30)
      expect(highValue.map((i) => i.value)).toEqual([40, 50])

      expect(registry.debugPaths().sort()).toEqual(
        [
          'items.{*}.value',
          'items.{id:4}',
          'items.{id:5}',
          'items.@@append',
          'items.@@insertOrReorder',
          'items.@@remove',
        ].sort(),
      )
    })

    test('primitive-returning methods register no element signals', () => {
      const state = createTestData()
      const { proxy, registry } = trackState(state)

      // Call several primitive-returning methods
      proxy.items.some((i) => i.id === 3)
      proxy.items.every((i) => i.value > 0)
      proxy.items.findIndex((i) => i.id === 4)

      // No element-level signals should exist
      for (let id = 1; id <= 5; id++) {
        expect(registry.has(`items.{id:${id}}.value`)).toBe(false)
        expect(registry.has(`items.{id:${id}}.id`)).toBe(false)
      }
    })

    test('selectById pattern: find + read is efficient', () => {
      // This is the exact entity-list-array benchmark pattern
      const items = Array.from({ length: 100 }, (_, i) =>
        deepFreeze({
          id: i,
          value: i * 10,
          label: `Item ${i}`,
          category: 'A',
          updatedAt: Date.now(),
        }),
      )
      const state = deepFreeze(items)
      const registry = createPathSignalRegistry(alienEngine)
      const proxy = createTrackingProxy(state, 'items', registry)

      // selectById pattern
      const found = proxy.find((i) => i.id === 42)!
      expect(found.value).toBe(420)
      expect(found.label).toBe('Item 42')

      // One column signal for the scan, one identity signal for the match,
      // and nothing for the other 99 entities
      expect(registry.has('items.{*}.id')).toBe(true)
      expect(registry.has('items.{id:42}')).toBe(true)
      expect(registry.has('items.{id:42}.value')).toBe(false)
      expect(registry.has('items.{id:41}')).toBe(false)
      expect(registry.has('items.{id:43}')).toBe(false)
      expect(registry.size()).toBe(3)
    })
  })

  describe('Edge cases', () => {
    test('empty array', () => {
      const state = deepFreeze({ items: [] as { id: number }[] })
      const { proxy } = trackState(state)
      expect(proxy.items.find(() => true)).toBeUndefined()
      expect(proxy.items.filter(() => true)).toEqual([])
      expect(proxy.items.some(() => true)).toBe(false)
      expect(proxy.items.every(() => true)).toBe(true)
      expect(proxy.items.indexOf({ id: 1 })).toBe(-1)
      expect(proxy.items.join(',')).toBe('')
    })

    test('single-element array', () => {
      const state = deepFreeze({ items: [{ id: 1, value: 10 }] })
      const { proxy } = trackState(state)
      const found = proxy.items.find((i) => i.id === 1)
      expect(found).toBeDefined()
      expect(found!.value).toBe(10)
    })

    test('array of primitives (no identity detection)', () => {
      const state = deepFreeze({ nums: [5, 10, 15, 20, 25] })
      const { proxy } = trackState(state)
      expect(proxy.nums.find((n) => n > 12)).toBe(15)
      expect(proxy.nums.filter((n) => n > 12)).toEqual([15, 20, 25])
      expect(proxy.nums.some((n) => n > 20)).toBe(true)
      expect(proxy.nums.indexOf(15)).toBe(2)
    })

    test('nested array access', () => {
      const state = deepFreeze({
        groups: [
          {
            id: 1,
            items: [
              { id: 10, name: 'a' },
              { id: 11, name: 'b' },
            ],
          },
          { id: 2, items: [{ id: 20, name: 'c' }] },
        ],
      })
      const { proxy } = trackState(state)
      const group = proxy.groups.find((g) => g.id === 1)!
      const item = group.items.find((i) => i.id === 11)!
      expect(item.name).toBe('b')
    })

    test('chained array methods', () => {
      const state = createTestData()
      const { proxy } = trackState(state)
      // filter then find — both should work with overrides
      const highValue = proxy.items.filter((i) => i.value > 20)
      // highValue is a plain array of raw items (not a tracking proxy itself)
      // so .find on it will use normal Array.prototype.find
      const found = highValue.find((i) => i.id === 4)
      expect(found).toBeDefined()
      expect(found!.value).toBe(40)
    })

    test('array.length is not affected by overrides', () => {
      const state = createTestData()
      const { proxy } = trackState(state)
      expect(proxy.items.length).toBe(5)
    })

    test('for...of iteration still works (not overridden)', () => {
      const state = createTestData()
      const { proxy } = trackState(state)
      const ids: number[] = []
      for (const item of proxy.items) {
        ids.push(item.id)
      }
      expect(ids).toEqual([1, 2, 3, 4, 5])
    })

    test('spread still works', () => {
      const state = createTestData()
      const { proxy } = trackState(state)
      const copy = [...proxy.items]
      expect(copy).toHaveLength(5)
      expect(copy[0].id).toBe(1)
    })

    test('Array.isArray still works', () => {
      const state = createTestData()
      const { proxy } = trackState(state)
      expect(Array.isArray(proxy.items)).toBe(true)
    })

    test('array destructuring works', () => {
      const state = createTestData()
      const { proxy } = trackState(state)
      const [first, second] = proxy.items
      expect(first.id).toBe(1)
      expect(second.id).toBe(2)
    })
  })
})

// ─── Array method dependency tracking ───
// These tests verify which signals are registered when using array methods
// through the tracking proxy, and whether state changes trigger re-evaluation.
// The pattern simulates what useSignalSelector does: computed → proxy → selector → diff → re-eval.

describe('array method dependency tracking', () => {
  type TodoItem = { id: number; text: string; done: boolean }
  type TodoState = { items: TodoItem[] }

  /**
   * Create a frozen state. For structural sharing, pass existing items unchanged.
   * @param items - Array of todo items
   * @returns Deeply frozen TodoState
   */
  function makeFrozenState(items: TodoItem[]): TodoState {
    return Object.freeze({
      items: Object.freeze(items.map((i) => Object.freeze(i))),
    }) as TodoState
  }

  /**
   * Simulate Immer-style structural sharing: only replace the item that changed.
   * @param state - Current state
   * @param id - ID of item to update
   * @param patch - Partial fields to merge
   * @returns New frozen state with structural sharing
   */
  function updateItem(
    state: TodoState,
    id: number,
    patch: Partial<TodoItem>,
  ): TodoState {
    return Object.freeze({
      items: Object.freeze(
        state.items.map((item) =>
          item.id === id ? Object.freeze({ ...item, ...patch }) : item,
        ),
      ),
    }) as TodoState
  }

  /**
   * Simulate what useSignalSelector does: run selector in a computed with leaf tracking.
   * @param getState - Returns current state
   * @param selector - Selector function to run through tracking proxy
   * @param registry - Signal registry for dependency tracking
   * @returns Object with computed, call count getter, and stop function
   */
  function createSelectorComputed<S extends object, R>(
    getState: () => S,
    selector: (state: S) => R,
    registry: PathSignalRegistry,
  ) {
    let callCount = 0
    const scope = alienEngine.createScope()

    const computed = scope.run(() =>
      alienEngine.computed(() => {
        callCount++
        const state = getState()

        const leafTracker = createLeafTracker()
        registry.evaluation.tracker = leafTracker

        const proxy = createTrackingProxy(state, '', registry)
        const result = selector(proxy as S)

        // Terminal object dependency (same as useSignalSelector)
        const proxyPath = getProxyPath(result)
        if (proxyPath !== undefined) {
          registry.getOrCreate(proxyPath, result).get()
        }

        // Deferred enumeration + leaf object tracking (same as useSignalSelector)
        finalizeDependencies(leafTracker, registry)
        registry.evaluation.tracker = null

        return result
      }),
    )

    return {
      computed,
      getCallCount: () => callCount,
      stop: () => scope.stop(),
    }
  }

  // ─── find() with property predicate ───

  it('find(x => x.done) — re-runs when matched element changes', () => {
    let state = makeFrozenState([
      { id: 1, text: 'a', done: false },
      { id: 2, text: 'b', done: true },
      { id: 3, text: 'c', done: false },
    ])
    const registry = createRegistry()

    const {
      computed: c,
      getCallCount,
      stop,
    } = createSelectorComputed(
      () => state,
      (s: TodoState) => s.items.find((x) => x.done)?.text,
      registry,
    )

    expect(c.get()).toBe('b')
    expect(getCallCount()).toBe(1)

    // Change the matched element's text — should re-run (structural sharing)
    const prevState = state
    state = updateItem(state, 2, { text: 'b-updated' })
    reconcileState(prevState, state, registry, alienEngine)
    expect(c.get()).toBe('b-updated')
    expect(getCallCount()).toBe(2)

    stop()
  })

  it('find(x => x.done) re-runs when a non-matching element becomes done', () => {
    let state = makeFrozenState([
      { id: 1, text: 'a', done: false },
      { id: 2, text: 'b', done: true },
      { id: 3, text: 'c', done: false },
    ])
    const registry = createRegistry()

    const {
      computed: c,
      getCallCount,
      stop,
    } = createSelectorComputed(
      () => state,
      (s: TodoState) => s.items.find((x) => x.done)?.text,
      registry,
    )

    expect(c.get()).toBe('b')
    expect(getCallCount()).toBe(1)

    // Item 1 becomes done — it should now be the first match.
    // Use structural sharing: only item 1 is a new object.
    const prevState = state
    state = updateItem(state, 1, { done: true })
    reconcileState(prevState, state, registry, alienEngine)
    expect(c.get()).toBe('a') // should be 'a' now
    expect(getCallCount()).toBe(2)

    stop()
  })

  it('find(x => x.done) re-runs when a new element is added', () => {
    let state = makeFrozenState([{ id: 1, text: 'a', done: false }])
    const registry = createRegistry()

    const {
      computed: c,
      getCallCount,
      stop,
    } = createSelectorComputed(
      () => state,
      (s: TodoState) => s.items.find((x) => x.done)?.text ?? 'none',
      registry,
    )

    expect(c.get()).toBe('none')
    expect(getCallCount()).toBe(1)

    // Add a done item
    const prevState = state
    state = makeFrozenState([
      { id: 1, text: 'a', done: false },
      { id: 2, text: 'b', done: true }, // new, done
    ])
    reconcileState(prevState, state, registry, alienEngine)
    expect(c.get()).toBe('b')
    expect(getCallCount()).toBe(2)

    stop()
  })

  // ─── filter() with property predicate ───

  it('filter(x => x.done) — re-runs when matched element changes', () => {
    let state = makeFrozenState([
      { id: 1, text: 'a', done: true },
      { id: 2, text: 'b', done: false },
      { id: 3, text: 'c', done: true },
    ])
    const registry = createRegistry()

    const {
      computed: c,
      getCallCount,
      stop,
    } = createSelectorComputed(
      () => state,
      (s: TodoState) =>
        s.items
          .filter((x) => x.done)
          .map((x) => x.text)
          .join(','),
      registry,
    )

    expect(c.get()).toBe('a,c')
    expect(getCallCount()).toBe(1)

    // Change text of matched element (structural sharing)
    const prevState = state
    state = updateItem(state, 1, { text: 'a-updated' })
    reconcileState(prevState, state, registry, alienEngine)
    expect(c.get()).toBe('a-updated,c')
    expect(getCallCount()).toBe(2)

    stop()
  })

  it('filter(x => x.done) re-runs when a non-matching element becomes done', () => {
    let state = makeFrozenState([
      { id: 1, text: 'a', done: true },
      { id: 2, text: 'b', done: false },
      { id: 3, text: 'c', done: true },
    ])
    const registry = createRegistry()

    const {
      computed: c,
      getCallCount,
      stop,
    } = createSelectorComputed(
      () => state,
      (s: TodoState) =>
        s.items
          .filter((x) => x.done)
          .map((x) => x.text)
          .join(','),
      registry,
    )

    expect(c.get()).toBe('a,c')
    expect(getCallCount()).toBe(1)

    // Item 2 becomes done (structural sharing — only item 2 changes)
    const prevState = state
    state = updateItem(state, 2, { done: true })
    reconcileState(prevState, state, registry, alienEngine)
    expect(c.get()).toBe('a,b,c')
    expect(getCallCount()).toBe(2)

    stop()
  })

  // ─── some() / every() with property predicate ───

  it('some(x => x.done) re-runs when result changes from true to false', () => {
    let state = makeFrozenState([
      { id: 1, text: 'a', done: false },
      { id: 2, text: 'b', done: true },
    ])
    const registry = createRegistry()

    const {
      computed: c,
      getCallCount,
      stop,
    } = createSelectorComputed(
      () => state,
      (s: TodoState) => s.items.some((x) => x.done),
      registry,
    )

    expect(c.get()).toBe(true)
    expect(getCallCount()).toBe(1)

    // Item 2 becomes not done (structural sharing)
    const prevState = state
    state = updateItem(state, 2, { done: false })
    reconcileState(prevState, state, registry, alienEngine)
    expect(c.get()).toBe(false)
    expect(getCallCount()).toBe(2)

    stop()
  })

  it('every(x => x.done) re-runs when one element becomes not done', () => {
    let state = makeFrozenState([
      { id: 1, text: 'a', done: true },
      { id: 2, text: 'b', done: true },
    ])
    const registry = createRegistry()

    const {
      computed: c,
      getCallCount,
      stop,
    } = createSelectorComputed(
      () => state,
      (s: TodoState) => s.items.every((x) => x.done),
      registry,
    )

    expect(c.get()).toBe(true)
    expect(getCallCount()).toBe(1)

    // Item 1 becomes not done (structural sharing)
    const prevState = state
    state = updateItem(state, 1, { done: false })
    reconcileState(prevState, state, registry, alienEngine)
    expect(c.get()).toBe(false)
    expect(getCallCount()).toBe(2)

    stop()
  })

  // ─── map() (NOT overridden — should track all element properties) ───

  it('map(x => x.text) — tracks all elements, re-runs when any element text changes', () => {
    let state = makeFrozenState([
      { id: 1, text: 'a', done: false },
      { id: 2, text: 'b', done: false },
      { id: 3, text: 'c', done: false },
    ])
    const registry = createRegistry()

    const {
      computed: c,
      getCallCount,
      stop,
    } = createSelectorComputed(
      () => state,
      (s: TodoState) => s.items.map((x) => x.text).join(','),
      registry,
    )

    expect(c.get()).toBe('a,b,c')
    expect(getCallCount()).toBe(1)

    // Change item 3's text (structural sharing)
    const prevState = state
    state = updateItem(state, 3, { text: 'c-updated' })
    reconcileState(prevState, state, registry, alienEngine)
    expect(c.get()).toBe('a,b,c-updated')
    expect(getCallCount()).toBe(2)

    stop()
  })

  it('map(x => x.text) does not re-run when unrelated property (done) changes', () => {
    let state = makeFrozenState([
      { id: 1, text: 'a', done: false },
      { id: 2, text: 'b', done: false },
    ])
    const registry = createRegistry()

    const {
      computed: c,
      getCallCount,
      stop,
    } = createSelectorComputed(
      () => state,
      (s: TodoState) => s.items.map((x) => x.text).join(','),
      registry,
    )

    expect(c.get()).toBe('a,b')
    expect(getCallCount()).toBe(1)

    // Change done but not text (structural sharing)
    const prevState = state
    state = updateItem(state, 1, { done: true })
    reconcileState(prevState, state, registry, alienEngine)
    expect(c.get()).toBe('a,b')
    // Only `text` was read via the column signal, so changing `done` fires
    // no tracked dependency and the selector does not re-run at all.
    expect(getCallCount()).toBe(1)

    stop()
  })

  // ─── includes/indexOf — identity methods ───

  it('includes() re-runs when array structure changes', () => {
    let state = makeFrozenState([
      { id: 1, text: 'a', done: false },
      { id: 2, text: 'b', done: false },
    ])
    const registry = createRegistry()
    const targetItem = state.items[0] // raw ref

    const {
      computed: c,
      getCallCount,
      stop,
    } = createSelectorComputed(
      () => state,
      (s: TodoState) => s.items.includes(targetItem as TodoItem),
      registry,
    )

    expect(c.get()).toBe(true)
    expect(getCallCount()).toBe(1)

    // Remove item 1 from array (structural sharing: item 2 is same ref)
    const prevState = state
    state = Object.freeze({
      items: Object.freeze([Object.freeze({ id: 2, text: 'b', done: false })]),
    }) as TodoState
    reconcileState(prevState, state, registry, alienEngine)
    expect(c.get()).toBe(false)
    expect(getCallCount()).toBe(2)

    stop()
  })

  // ─── slice — structural ───

  it('slice(0, 2) re-runs when array gains elements', () => {
    let state = makeFrozenState([{ id: 1, text: 'a', done: false }])
    const registry = createRegistry()

    const {
      computed: c,
      getCallCount,
      stop,
    } = createSelectorComputed(
      () => state,
      (s: TodoState) =>
        s.items
          .slice(0, 2)
          .map((x) => x.text)
          .join(','),
      registry,
    )

    expect(c.get()).toBe('a')
    expect(getCallCount()).toBe(1)

    // Add element
    const prevState = state
    state = makeFrozenState([
      { id: 1, text: 'a', done: false },
      { id: 2, text: 'b', done: false },
    ])
    reconcileState(prevState, state, registry, alienEngine)
    expect(c.get()).toBe('a,b')
    expect(getCallCount()).toBe(2)

    stop()
  })

  it('slice(1, 2) re-runs when a sliced element changes', () => {
    let state = makeFrozenState([
      { id: 1, text: 'a', done: false },
      { id: 2, text: 'b', done: false },
    ])
    const registry = createRegistry()

    const { computed: c, stop } = createSelectorComputed(
      () => state,
      (s: TodoState) => s.items.slice(1, 2)[0].text,
      registry,
    )

    expect(c.get()).toBe('b')

    const prevState = state
    state = makeFrozenState([
      prevState.items[0],
      { id: 2, text: 'B', done: false },
    ])
    reconcileState(prevState, state, registry, alienEngine)
    expect(c.get()).toBe('B')

    stop()
  })

  // ─── findIndex — predicate, returns primitive ───

  it('findIndex(x => x.done) re-runs when a different element becomes done', () => {
    let state = makeFrozenState([
      { id: 1, text: 'a', done: false },
      { id: 2, text: 'b', done: true },
    ])
    const registry = createRegistry()

    const {
      computed: c,
      getCallCount,
      stop,
    } = createSelectorComputed(
      () => state,
      (s: TodoState) => s.items.findIndex((x) => x.done),
      registry,
    )

    expect(c.get()).toBe(1)
    expect(getCallCount()).toBe(1)

    // Item 1 becomes done (structural sharing — item 2 unchanged)
    const prevState = state
    state = updateItem(state, 1, { done: true })
    reconcileState(prevState, state, registry, alienEngine)
    // findIndex should now return 0 since item 1 is now done (first match)
    expect(c.get()).toBe(0)
    expect(getCallCount()).toBe(2)

    stop()
  })

  // ─── Structural signal matrix (append / insertOrReorder / remove) ───
  // Each scan method subscribes to a specific subset of structural signals
  // depending on whether it matched. These tests verify both the "should
  // re-run" and "should NOT re-run" cells of the matrix.

  describe('structural signal matrix', () => {
    /**
     * Append an item with structural sharing (existing item refs reused).
     * @param state - Current state
     * @param item - New item to append
     * @returns New frozen state
     */
    function appendItem(state: TodoState, item: TodoItem): TodoState {
      return Object.freeze({
        items: Object.freeze([...state.items, Object.freeze(item)]),
      }) as TodoState
    }

    /**
     * Remove an item by id with structural sharing.
     * @param state - Current state
     * @param id - ID of item to remove
     * @returns New frozen state
     */
    function removeItem(state: TodoState, id: number): TodoState {
      return Object.freeze({
        items: Object.freeze(state.items.filter((i) => i.id !== id)),
      }) as TodoState
    }

    /**
     * Insert an item at an index with structural sharing.
     * @param state - Current state
     * @param index - Position to insert at
     * @param item - New item
     * @returns New frozen state
     */
    function insertItem(
      state: TodoState,
      index: number,
      item: TodoItem,
    ): TodoState {
      const items = [...state.items]
      items.splice(index, 0, Object.freeze(item) as TodoItem)
      return Object.freeze({ items: Object.freeze(items) }) as TodoState
    }

    it('find (matched) does not re-run on append', () => {
      let state = makeFrozenState([
        { id: 1, text: 'a', done: false },
        { id: 2, text: 'b', done: true },
      ])
      const registry = createRegistry()

      const {
        computed: c,
        getCallCount,
        stop,
      } = createSelectorComputed(
        () => state,
        (s: TodoState) => s.items.find((x) => x.done)?.text,
        registry,
      )

      expect(c.get()).toBe('b')
      expect(getCallCount()).toBe(1)

      // Append can never change the FIRST match — no re-run
      const prevState = state
      state = appendItem(state, { id: 3, text: 'c', done: true })
      reconcileState(prevState, state, registry, alienEngine)
      expect(c.get()).toBe('b')
      expect(getCallCount()).toBe(1)

      stop()
    })

    it('find (matched) does not re-run when a later element is removed', () => {
      let state = makeFrozenState([
        { id: 1, text: 'a', done: false },
        { id: 2, text: 'b', done: true },
        { id: 3, text: 'c', done: false },
      ])
      const registry = createRegistry()

      const {
        computed: c,
        getCallCount,
        stop,
      } = createSelectorComputed(
        () => state,
        (s: TodoState) => s.items.find((x) => x.done)?.text,
        registry,
      )

      expect(c.get()).toBe('b')
      expect(getCallCount()).toBe(1)

      // Removing a later (never-matching, never-returned) element can't
      // change the first match — no re-run
      const prevState = state
      state = removeItem(state, 3)
      reconcileState(prevState, state, registry, alienEngine)
      expect(c.get()).toBe('b')
      expect(getCallCount()).toBe(1)

      stop()
    })

    it('find (matched) re-runs when a matching element is inserted before the match', () => {
      let state = makeFrozenState([
        { id: 1, text: 'a', done: false },
        { id: 3, text: 'c', done: true },
      ])
      const registry = createRegistry()

      const {
        computed: c,
        getCallCount,
        stop,
      } = createSelectorComputed(
        () => state,
        (s: TodoState) => s.items.find((x) => x.done)?.text,
        registry,
      )

      expect(c.get()).toBe('c')
      expect(getCallCount()).toBe(1)

      // Insert a done item BEFORE the current match — new first match
      const prevState = state
      state = insertItem(state, 1, { id: 2, text: 'b', done: true })
      reconcileState(prevState, state, registry, alienEngine)
      expect(c.get()).toBe('b')
      expect(getCallCount()).toBe(2)

      stop()
    })

    it('find (matched) does not re-run when an untracked prop of a non-matched element changes', () => {
      let state = makeFrozenState([
        { id: 1, text: 'a', done: false },
        { id: 2, text: 'b', done: true },
      ])
      const registry = createRegistry()

      const {
        computed: c,
        getCallCount,
        stop,
      } = createSelectorComputed(
        () => state,
        (s: TodoState) => s.items.find((x) => x.done)?.text,
        registry,
      )

      expect(c.get()).toBe('b')
      expect(getCallCount()).toBe(1)

      // Only `done` is a tracked column; `text` of a non-matched element
      // isn't read anywhere — no re-run
      const prevState = state
      state = updateItem(state, 1, { text: 'a-changed' })
      reconcileState(prevState, state, registry, alienEngine)
      expect(c.get()).toBe('b')
      expect(getCallCount()).toBe(1)

      stop()
    })

    it('findIndex (matched) re-runs when an earlier element is removed (index shifts)', () => {
      let state = makeFrozenState([
        { id: 1, text: 'a', done: false },
        { id: 2, text: 'b', done: true },
        { id: 3, text: 'c', done: false },
      ])
      const registry = createRegistry()

      const {
        computed: c,
        getCallCount,
        stop,
      } = createSelectorComputed(
        () => state,
        (s: TodoState) => s.items.findIndex((x) => x.done),
        registry,
      )

      expect(c.get()).toBe(1)
      expect(getCallCount()).toBe(1)

      // Removing an earlier element shifts the matched index from 1 → 0
      const prevState = state
      state = removeItem(state, 1)
      reconcileState(prevState, state, registry, alienEngine)
      expect(c.get()).toBe(0)
      expect(getCallCount()).toBe(2)

      stop()
    })

    it('some (true) re-runs when the witness element is removed', () => {
      let state = makeFrozenState([
        { id: 1, text: 'a', done: false },
        { id: 2, text: 'b', done: true },
      ])
      const registry = createRegistry()

      const {
        computed: c,
        getCallCount,
        stop,
      } = createSelectorComputed(
        () => state,
        (s: TodoState) => s.items.some((x) => x.done),
        registry,
      )

      expect(c.get()).toBe(true)
      expect(getCallCount()).toBe(1)

      // Removing the only done element flips some() to false
      const prevState = state
      state = removeItem(state, 2)
      reconcileState(prevState, state, registry, alienEngine)
      expect(c.get()).toBe(false)
      expect(getCallCount()).toBe(2)

      stop()
    })

    it('some (true) does not re-run on append', () => {
      let state = makeFrozenState([{ id: 1, text: 'a', done: true }])
      const registry = createRegistry()

      const {
        computed: c,
        getCallCount,
        stop,
      } = createSelectorComputed(
        () => state,
        (s: TodoState) => s.items.some((x) => x.done),
        registry,
      )

      expect(c.get()).toBe(true)
      expect(getCallCount()).toBe(1)

      // Appends can never flip some() from true to false — no re-run
      const prevState = state
      state = appendItem(state, { id: 2, text: 'b', done: false })
      reconcileState(prevState, state, registry, alienEngine)
      expect(c.get()).toBe(true)
      expect(getCallCount()).toBe(1)

      stop()
    })

    it('every (true) re-runs on append (new element might fail predicate)', () => {
      let state = makeFrozenState([{ id: 1, text: 'a', done: true }])
      const registry = createRegistry()

      const {
        computed: c,
        getCallCount,
        stop,
      } = createSelectorComputed(
        () => state,
        (s: TodoState) => s.items.every((x) => x.done),
        registry,
      )

      expect(c.get()).toBe(true)
      expect(getCallCount()).toBe(1)

      const prevState = state
      state = appendItem(state, { id: 2, text: 'b', done: false })
      reconcileState(prevState, state, registry, alienEngine)
      expect(c.get()).toBe(false)
      expect(getCallCount()).toBe(2)

      stop()
    })

    it('every (true) does not re-run when an element is removed', () => {
      let state = makeFrozenState([
        { id: 1, text: 'a', done: true },
        { id: 2, text: 'b', done: true },
      ])
      const registry = createRegistry()

      const {
        computed: c,
        getCallCount,
        stop,
      } = createSelectorComputed(
        () => state,
        (s: TodoState) => s.items.every((x) => x.done),
        registry,
      )

      expect(c.get()).toBe(true)
      expect(getCallCount()).toBe(1)

      // Removing an element can't flip every() from true to false — no re-run
      const prevState = state
      state = removeItem(state, 2)
      reconcileState(prevState, state, registry, alienEngine)
      expect(c.get()).toBe(true)
      expect(getCallCount()).toBe(1)

      stop()
    })

    it('every (false) re-runs when the counterexample is removed', () => {
      let state = makeFrozenState([
        { id: 1, text: 'a', done: true },
        { id: 2, text: 'b', done: false },
      ])
      const registry = createRegistry()

      const {
        computed: c,
        getCallCount,
        stop,
      } = createSelectorComputed(
        () => state,
        (s: TodoState) => s.items.every((x) => x.done),
        registry,
      )

      expect(c.get()).toBe(false)
      expect(getCallCount()).toBe(1)

      // Removing the only not-done element flips every() to true
      const prevState = state
      state = removeItem(state, 2)
      reconcileState(prevState, state, registry, alienEngine)
      expect(c.get()).toBe(true)
      expect(getCallCount()).toBe(2)

      stop()
    })

    it('filter re-runs when a matching element is removed', () => {
      let state = makeFrozenState([
        { id: 1, text: 'a', done: true },
        { id: 2, text: 'b', done: false },
        { id: 3, text: 'c', done: true },
      ])
      const registry = createRegistry()

      const {
        computed: c,
        getCallCount,
        stop,
      } = createSelectorComputed(
        () => state,
        (s: TodoState) =>
          s.items
            .filter((x) => x.done)
            .map((x) => x.text)
            .join(','),
        registry,
      )

      expect(c.get()).toBe('a,c')
      expect(getCallCount()).toBe(1)

      const prevState = state
      state = removeItem(state, 3)
      reconcileState(prevState, state, registry, alienEngine)
      expect(c.get()).toBe('a')
      expect(getCallCount()).toBe(2)

      stop()
    })

    it('filter re-runs on append', () => {
      let state = makeFrozenState([{ id: 1, text: 'a', done: true }])
      const registry = createRegistry()

      const {
        computed: c,
        getCallCount,
        stop,
      } = createSelectorComputed(
        () => state,
        (s: TodoState) =>
          s.items
            .filter((x) => x.done)
            .map((x) => x.text)
            .join(','),
        registry,
      )

      expect(c.get()).toBe('a')
      expect(getCallCount()).toBe(1)

      const prevState = state
      state = appendItem(state, { id: 2, text: 'b', done: true })
      reconcileState(prevState, state, registry, alienEngine)
      expect(c.get()).toBe('a,b')
      expect(getCallCount()).toBe(2)

      stop()
    })

    it('find (missed) re-runs on append', () => {
      let state = makeFrozenState([{ id: 1, text: 'a', done: false }])
      const registry = createRegistry()

      const {
        computed: c,
        getCallCount,
        stop,
      } = createSelectorComputed(
        () => state,
        (s: TodoState) => s.items.find((x) => x.done)?.text ?? 'none',
        registry,
      )

      expect(c.get()).toBe('none')
      expect(getCallCount()).toBe(1)

      const prevState = state
      state = appendItem(state, { id: 2, text: 'b', done: true })
      reconcileState(prevState, state, registry, alienEngine)
      expect(c.get()).toBe('b')
      expect(getCallCount()).toBe(2)

      stop()
    })

    it('primitive elements fall back to coarse array signal (any change re-runs)', () => {
      type NumState = { nums: number[] }
      let state = Object.freeze({
        nums: Object.freeze([1, 2, 3]),
      }) as NumState
      const registry = createRegistry()

      const {
        computed: c,
        getCallCount,
        stop,
      } = createSelectorComputed(
        () => state,
        (s: NumState) => s.nums.find((x) => x > 2),
        registry,
      )

      expect(c.get()).toBe(3)
      expect(getCallCount()).toBe(1)

      // Primitive scans use the coarse array signal — any array change re-runs
      const prevState = state
      state = Object.freeze({ nums: Object.freeze([1, 2, 3, 4]) }) as NumState
      reconcileState(prevState, state, registry, alienEngine)
      expect(c.get()).toBe(3)
      expect(getCallCount()).toBe(2)

      stop()
    })
  })
})

// Regression guard for dependency churn with memoized collection selectors.
//
// Several hooks share `selectAllComments` (RTK entity-adapter `selectAll`
// shape: `ids.map(id => entities[id])`). Whichever hook happens to run the
// map on a Reselect cache miss is the only one that reads the elements. If
// that read registered one signal per element, the next time that hook
// re-ran for an unrelated reason it would get a cache hit, read no elements,
// and alien-signals would drop every element dependency — releasing all of
// them from the registry — only for the next comments change to recreate
// them all. With 1000 comments and a dispatch every 25 ms that teardown and
// rebuild dominated the derived-selectors benchmark.
//
// A mapped collection is a read of the whole container, so the dependency
// belongs on the container (`comments.entities`), which every hook holds
// stably.

interface Comment {
  id: number
  postId: number
  text: string
}
interface Post {
  id: number
  score: number
}
interface State {
  posts: { ids: number[]; entities: Record<number, Post> }
  comments: { ids: number[]; entities: Record<number, Comment> }
}

const NUM_POSTS = 5
const NUM_COMMENTS = 50
const NUM_HOOKS = 6

function makeState(): State {
  const posts: State['posts'] = { ids: [], entities: {} }
  const comments: State['comments'] = { ids: [], entities: {} }
  for (let i = 1; i <= NUM_POSTS; i++) {
    posts.ids.push(i)
    posts.entities[i] = { id: i, score: 0 }
  }
  for (let i = 1; i <= NUM_COMMENTS; i++) {
    comments.ids.push(i)
    comments.entities[i] = { id: i, postId: (i % NUM_POSTS) + 1, text: 'c' + i }
  }
  return { posts, comments }
}

function addComment(state: State, postId: number): State {
  const id = state.comments.ids.length + 1
  return {
    ...state,
    comments: {
      ids: [...state.comments.ids, id],
      entities: {
        ...state.comments.entities,
        [id]: { id, postId, text: 'c' + id },
      },
    },
  }
}

function updateScore(state: State, postId: number, score: number): State {
  return {
    ...state,
    posts: {
      ...state.posts,
      entities: {
        ...state.posts.entities,
        [postId]: { ...state.posts.entities[postId], score },
      },
    },
  }
}

function expectedCommentCount(state: State, postId: number): number {
  return Object.values(state.comments.entities).filter(
    (c) => c.postId === postId,
  ).length
}

const selectAllComments = createSelector(
  [(s: State) => s.comments.ids, (s: State) => s.comments.entities],
  (ids, entities) => ids.map((id) => entities[id]),
)
const selectPostById = (s: State, postId: number) => s.posts.entities[postId]

const selectPostWithComments = createSelector(
  [(s: State, postId: number) => selectPostById(s, postId), selectAllComments],
  (post, comments) => ({
    ...post,
    commentCount: comments.filter((c) => c.postId === post.id).length,
  }),
)

// Mirrors useSignalSelector's deep tier: a computed with leaf-object tracking
// plus an effect subscribed to it, so that dropping the last subscriber of a
// path signal releases it from the registry.
function mountHook<R>(
  getState: () => State,
  selector: (s: State) => R,
  registry: PathSignalRegistry,
) {
  let evals = 0
  let last: R | undefined
  const scope = alienEngine.createScope()
  scope.run(() => {
    const computed = alienEngine.computed(() => {
      evals++
      const leafTracker = createLeafTracker()
      registry.evaluation.tracker = leafTracker
      const proxy = createTrackingProxy(getState(), '', registry)
      const result = selector(proxy as State)
      const proxyPath = getProxyPath(result)
      if (proxyPath !== undefined) registry.getOrCreate(proxyPath, result).get()
      finalizeDependencies(leafTracker, registry)
      registry.evaluation.tracker = null
      return result
    })
    alienEngine.effect(() => {
      last = computed.get()
    })
  })
  return {
    getEvals: () => evals,
    getLast: () => last,
    stop: () => scope.stop(),
  }
}

// Records which path signals the registry creates and releases.
function instrument(registry: PathSignalRegistry) {
  let created: string[] = []
  let released: string[] = []
  const origGetOrCreate = registry.getOrCreate
  const origRelease = registry.release
  registry.getOrCreate = (path, value) => {
    if (!registry.has(path)) created.push(path)
    return origGetOrCreate(path, value)
  }
  registry.release = (path, node) => {
    released.push(path)
    return origRelease(path, node)
  }
  return {
    drain() {
      const snapshot = { created, released }
      created = []
      released = []
      return snapshot
    },
  }
}

const isElementPath = (p: string) => /^comments\.entities\.\d+/.test(p)

describe('dependency churn with memoized collection selectors', () => {
  it('keeps element signals stable when a shared selectAll is memoized', () => {
    const registry = createPathSignalRegistry(alienEngine)
    const recorder = instrument(registry)
    let state = makeState()
    const getState = () => state

    const hookPostIds = Array.from(
      { length: NUM_HOOKS },
      (_, i) => (i % NUM_POSTS) + 1,
    )
    const hooks = hookPostIds.map((postId) =>
      mountHook(
        getState,
        (s) => selectPostWithComments(s, postId).commentCount,
        registry,
      ),
    )

    const mount = recorder.drain()
    expect(mount.created.filter(isElementPath)).toEqual([])
    expect(registry.has('comments.entities')).toBe(true)
    expect(registry.has('comments.ids')).toBe(true)

    const dispatch = (next: State) => {
      const prev = state
      state = next
      const before = hooks.map((h) => h.getEvals())
      reconcileState(prev, next, registry, alienEngine)
      const evalDeltas = hooks.map((h, i) => h.getEvals() - before[i])
      const { created, released } = recorder.drain()
      hooks.forEach((h, i) => {
        expect(h.getLast()).toBe(expectedCommentCount(state, hookPostIds[i]))
      })
      return { evalDeltas, created, released }
    }

    const commentsChanged = () => hooks.map(() => 1)
    const onlyPost = (postId: number) =>
      hookPostIds.map((id) => (id === postId ? 1 : 0))

    const steps = [
      { next: () => addComment(state, 1), evals: commentsChanged() },
      { next: () => addComment(state, 2), evals: commentsChanged() },
      { next: () => updateScore(state, 3, 10), evals: onlyPost(3) },
      { next: () => addComment(state, 3), evals: commentsChanged() },
      { next: () => updateScore(state, 1, 20), evals: onlyPost(1) },
      { next: () => addComment(state, 4), evals: commentsChanged() },
      { next: () => addComment(state, 5), evals: commentsChanged() },
    ]

    for (const step of steps) {
      const { evalDeltas, created, released } = dispatch(step.next())
      expect(evalDeltas).toEqual(step.evals)
      expect(created.filter(isElementPath)).toEqual([])
      expect(released.filter(isElementPath)).toEqual([])
    }

    hooks.forEach((h) => h.stop())
  })
})
