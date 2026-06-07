import { describe, test, expect, vi } from 'vitest'
import { alienEngine } from '@internal/signals/engine'
import { createPathSignalRegistry } from '@internal/signals/pathSignalRegistry'
import { createTrackingProxy, type ProxyCache } from '@internal/signals/trackingProxy'
import { getProxyPath } from '@internal/signals/trackingProxy'

function deepFreeze<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') return obj
  Object.freeze(obj)
  for (const val of Object.values(obj as Record<string, unknown>)) {
    if (val !== null && typeof val === 'object') deepFreeze(val)
  }
  return obj
}

function setup(state: object) {
  const registry = createPathSignalRegistry(alienEngine)
  const cache: ProxyCache = new WeakMap()
  const proxy = createTrackingProxy(state, '', registry, cache)
  return { registry, cache, proxy }
}

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
    test('returns found item as proxy', () => {
      const state = createTestData()
      const { proxy } = setup(state)
      const found = proxy.items.find((item) => item.id === 3)
      expect(found).toBeDefined()
      expect(found!.value).toBe(30)
      // Verify it's a proxy (has a path)
      expect(getProxyPath(found)).toBeDefined()
    })

    test('returns undefined when not found', () => {
      const state = createTestData()
      const { proxy } = setup(state)
      const found = proxy.items.find((item) => item.id === 999)
      expect(found).toBeUndefined()
    })

    test('callback receives raw values, not proxies', () => {
      const state = createTestData()
      const { proxy } = setup(state)
      const receivedValues: unknown[] = []
      proxy.items.find((item) => {
        receivedValues.push(item)
        return false // never match, scan all
      })
      // Callbacks should receive raw frozen objects, not proxies
      for (const val of receivedValues) {
        expect(getProxyPath(val)).toBeUndefined()
        expect(Object.isFrozen(val)).toBe(true)
      }
      expect(receivedValues).toHaveLength(5)
    })

    test('only registers signals for the found element, not all scanned elements', () => {
      const state = createTestData()
      const { proxy, registry } = setup(state)

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
      const { proxy } = setup(state)
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
      const { proxy } = setup(state)
      const found = proxy.items.find((item) => item.id === 2)!
      expect(found.id).toBe(2)
      expect(found.value).toBe(20)
      expect(found.nested.count).toBe(2)
    })

    test('works with primitive arrays', () => {
      const state = deepFreeze({ nums: [10, 20, 30, 40, 50] })
      const { proxy } = setup(state)
      const found = proxy.nums.find((n) => n > 25)
      expect(found).toBe(30)
    })
  })

  describe('findLast()', () => {
    test('returns last matching item as proxy', () => {
      const state = deepFreeze({
        items: [
          { id: 1, type: 'A' },
          { id: 2, type: 'B' },
          { id: 3, type: 'A' },
        ],
      })
      const { proxy } = setup(state)
      const found = proxy.items.findLast((item) => item.type === 'A')
      expect(found).toBeDefined()
      expect(found!.id).toBe(3)
      expect(getProxyPath(found)).toBeDefined()
    })

    test('returns undefined when not found', () => {
      const state = createTestData()
      const { proxy } = setup(state)
      const found = proxy.items.findLast((item) => item.id === 999)
      expect(found).toBeUndefined()
    })

    test('searches from end', () => {
      const state = createTestData()
      const { proxy } = setup(state)
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
      const { proxy } = setup(state)
      const index = proxy.items.findIndex((item) => item.id === 3)
      expect(index).toBe(2)
    })

    test('returns -1 when not found', () => {
      const state = createTestData()
      const { proxy } = setup(state)
      const index = proxy.items.findIndex((item) => item.id === 999)
      expect(index).toBe(-1)
    })

    test('does not register any element signals', () => {
      const state = createTestData()
      const { proxy, registry } = setup(state)
      proxy.items.findIndex((item) => item.id === 3)
      // findIndex returns a primitive — no element signals should be created
      expect(registry.has('items.{id:1}.value')).toBe(false)
      expect(registry.has('items.{id:3}.value')).toBe(false)
    })

    test('callback receives raw values', () => {
      const state = createTestData()
      const { proxy } = setup(state)
      proxy.items.findIndex((item) => {
        expect(getProxyPath(item)).toBeUndefined()
        expect(Object.isFrozen(item)).toBe(true)
        return false
      })
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
      const { proxy } = setup(state)
      const index = proxy.items.findLastIndex((item) => item.type === 'A')
      expect(index).toBe(2)
    })

    test('returns -1 when not found', () => {
      const state = createTestData()
      const { proxy } = setup(state)
      const index = proxy.items.findLastIndex((item) => item.id === 999)
      expect(index).toBe(-1)
    })
  })

  describe('filter()', () => {
    test('returns filtered items as proxies', () => {
      const state = createTestData()
      const { proxy } = setup(state)
      const filtered = proxy.items.filter((item) => item.value > 25)
      expect(filtered).toHaveLength(3)
      expect(filtered[0].id).toBe(3)
      expect(filtered[1].id).toBe(4)
      expect(filtered[2].id).toBe(5)
      // Each result should be a proxy
      for (const item of filtered) {
        expect(getProxyPath(item)).toBeDefined()
      }
    })

    test('callback receives raw values, not proxies', () => {
      const state = createTestData()
      const { proxy } = setup(state)
      const receivedValues: unknown[] = []
      proxy.items.filter((item) => {
        receivedValues.push(item)
        return false
      })
      for (const val of receivedValues) {
        expect(getProxyPath(val)).toBeUndefined()
        expect(Object.isFrozen(val)).toBe(true)
      }
    })

    test('only registers signals for matching elements', () => {
      const state = createTestData()
      const { proxy, registry } = setup(state)
      const filtered = proxy.items.filter((item) => item.id === 3)
      // Access a property on the result
      const _val = filtered[0].value

      // Should have signal for the matching item, not others
      expect(registry.has('items.{id:3}.value')).toBe(true)
      expect(registry.has('items.{id:1}.value')).toBe(false)
      expect(registry.has('items.{id:2}.value')).toBe(false)
    })

    test('filtered items give access to nested properties', () => {
      const state = createTestData()
      const { proxy } = setup(state)
      const filtered = proxy.items.filter((item) => item.id > 3)
      expect(filtered[0].nested.count).toBe(4)
      expect(filtered[1].nested.count).toBe(5)
    })

    test('multiple filters on same array work correctly', () => {
      const state = createTestData()
      const { proxy } = setup(state)
      const high = proxy.items.filter((item) => item.value > 30)
      const low = proxy.items.filter((item) => item.value < 30)
      expect(high).toHaveLength(2)
      expect(low).toHaveLength(2)
    })

    test('returns empty array when nothing matches', () => {
      const state = createTestData()
      const { proxy } = setup(state)
      const filtered = proxy.items.filter((item) => item.id > 100)
      expect(filtered).toHaveLength(0)
    })

    test('callback receives correct index and array arguments', () => {
      const state = createTestData()
      const { proxy } = setup(state)
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
    test('returns sliced items as proxies', () => {
      const state = createTestData()
      const { proxy } = setup(state)
      const sliced = proxy.items.slice(1, 3)
      expect(sliced).toHaveLength(2)
      expect(sliced[0].id).toBe(2)
      expect(sliced[1].id).toBe(3)
      for (const item of sliced) {
        expect(getProxyPath(item)).toBeDefined()
      }
    })

    test('slice with no arguments returns all as proxies', () => {
      const state = createTestData()
      const { proxy } = setup(state)
      const sliced = proxy.items.slice()
      expect(sliced).toHaveLength(5)
      for (const item of sliced) {
        expect(getProxyPath(item)).toBeDefined()
      }
    })

    test('slice with negative indices', () => {
      const state = createTestData()
      const { proxy } = setup(state)
      const sliced = proxy.items.slice(-2)
      expect(sliced).toHaveLength(2)
      expect(sliced[0].id).toBe(4)
      expect(sliced[1].id).toBe(5)
    })

    test('slice with negative start and end', () => {
      const state = createTestData()
      const { proxy } = setup(state)
      const sliced = proxy.items.slice(-3, -1)
      expect(sliced).toHaveLength(2)
      expect(sliced[0].id).toBe(3)
      expect(sliced[1].id).toBe(4)
    })

    test('out-of-bounds indices are clamped', () => {
      const state = createTestData()
      const { proxy } = setup(state)
      const sliced = proxy.items.slice(-100, 100)
      expect(sliced).toHaveLength(5)
    })

    test('only registers signals for sliced elements', () => {
      const state = createTestData()
      const { proxy, registry } = setup(state)
      const sliced = proxy.items.slice(2, 3) // just item at index 2 (id: 3)
      const _val = sliced[0].value

      expect(registry.has('items.{id:3}.value')).toBe(true)
      expect(registry.has('items.{id:1}.value')).toBe(false)
    })
  })

  describe('some()', () => {
    test('returns true when predicate matches', () => {
      const state = createTestData()
      const { proxy } = setup(state)
      expect(proxy.items.some((item) => item.value > 40)).toBe(true)
    })

    test('returns false when no match', () => {
      const state = createTestData()
      const { proxy } = setup(state)
      expect(proxy.items.some((item) => item.value > 100)).toBe(false)
    })

    test('short-circuits on first match', () => {
      const state = createTestData()
      const { proxy } = setup(state)
      let callCount = 0
      proxy.items.some((item) => {
        callCount++
        return item.id === 2
      })
      expect(callCount).toBe(2) // stops after finding id:2 at index 1
    })

    test('callback receives raw values', () => {
      const state = createTestData()
      const { proxy } = setup(state)
      proxy.items.some((item) => {
        expect(getProxyPath(item)).toBeUndefined()
        return false
      })
    })

    test('does not register element signals', () => {
      const state = createTestData()
      const { proxy, registry } = setup(state)
      proxy.items.some((item) => item.id === 3)
      expect(registry.has('items.{id:1}.value')).toBe(false)
      expect(registry.has('items.{id:3}.value')).toBe(false)
    })
  })

  describe('every()', () => {
    test('returns true when all match', () => {
      const state = createTestData()
      const { proxy } = setup(state)
      expect(proxy.items.every((item) => item.value > 0)).toBe(true)
    })

    test('returns false when some do not match', () => {
      const state = createTestData()
      const { proxy } = setup(state)
      expect(proxy.items.every((item) => item.value > 25)).toBe(false)
    })

    test('short-circuits on first failure', () => {
      const state = createTestData()
      const { proxy } = setup(state)
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
      const { proxy } = setup(state)
      expect(proxy.nums.includes(30)).toBe(true)
    })

    test('returns false for missing primitive', () => {
      const state = deepFreeze({ nums: [10, 20, 30, 40, 50] })
      const { proxy } = setup(state)
      expect(proxy.nums.includes(99)).toBe(false)
    })

    test('works with fromIndex', () => {
      const state = deepFreeze({ nums: [10, 20, 30, 20, 50] })
      const { proxy } = setup(state)
      expect(proxy.nums.includes(20, 2)).toBe(true) // finds the 20 at index 3
      expect(proxy.nums.includes(10, 1)).toBe(false) // 10 is before index 1
    })
  })

  describe('indexOf()', () => {
    test('returns index of primitive value', () => {
      const state = deepFreeze({ nums: [10, 20, 30, 40, 50] })
      const { proxy } = setup(state)
      expect(proxy.nums.indexOf(30)).toBe(2)
    })

    test('returns -1 when not found', () => {
      const state = deepFreeze({ nums: [10, 20, 30] })
      const { proxy } = setup(state)
      expect(proxy.nums.indexOf(99)).toBe(-1)
    })

    test('with fromIndex parameter', () => {
      const state = deepFreeze({ nums: [1, 2, 3, 2, 5] })
      const { proxy } = setup(state)
      expect(proxy.nums.indexOf(2)).toBe(1)
      expect(proxy.nums.indexOf(2, 2)).toBe(3)
    })
  })

  describe('lastIndexOf()', () => {
    test('returns last index of primitive value', () => {
      const state = deepFreeze({ nums: [10, 20, 30, 20, 50] })
      const { proxy } = setup(state)
      expect(proxy.nums.lastIndexOf(20)).toBe(3)
    })

    test('returns -1 when not found', () => {
      const state = deepFreeze({ nums: [10, 20, 30] })
      const { proxy } = setup(state)
      expect(proxy.nums.lastIndexOf(99)).toBe(-1)
    })
  })

  describe('join()', () => {
    test('returns joined string with separator', () => {
      const state = deepFreeze({ items: [1, 2, 3, 4, 5] })
      const { proxy } = setup(state)
      expect(proxy.items.join(',')).toBe('1,2,3,4,5')
    })

    test('join with custom separator', () => {
      const state = deepFreeze({ items: ['a', 'b', 'c'] })
      const { proxy } = setup(state)
      expect(proxy.items.join(' - ')).toBe('a - b - c')
    })

    test('join with no separator uses comma', () => {
      const state = deepFreeze({ items: [1, 2, 3] })
      const { proxy } = setup(state)
      expect(proxy.items.join()).toBe('1,2,3')
    })
  })

  describe('toString()', () => {
    test('returns string representation', () => {
      const state = deepFreeze({ items: [1, 2, 3] })
      const { proxy } = setup(state)
      expect(proxy.items.toString()).toBe('1,2,3')
    })
  })

  describe('toLocaleString()', () => {
    test('returns locale string', () => {
      const state = deepFreeze({ items: [1, 2, 3] })
      const { proxy } = setup(state)
      // Just verify it returns a string without error
      expect(typeof proxy.items.toLocaleString()).toBe('string')
    })
  })

  describe('concat()', () => {
    test('returns new array with concatenated items (raw values)', () => {
      const state = deepFreeze({ items: [1, 2, 3] })
      const { proxy } = setup(state)
      const result = proxy.items.concat([4, 5])
      expect(result).toEqual([1, 2, 3, 4, 5])
    })

    test('concat with no arguments creates shallow copy', () => {
      const state = createTestData()
      const { proxy } = setup(state)
      const copy = proxy.items.concat()
      expect(copy).toHaveLength(5)
      expect(copy[0].id).toBe(1)
      // Result elements are raw values, not proxies
      expect(getProxyPath(copy[0])).toBeUndefined()
    })

    test('concat with multiple arrays', () => {
      const state = deepFreeze({ items: [1, 2] })
      const { proxy } = setup(state)
      const result = proxy.items.concat([3, 4], [5, 6])
      expect(result).toEqual([1, 2, 3, 4, 5, 6])
    })
  })

  describe('flat()', () => {
    test('flattens nested arrays', () => {
      const state = deepFreeze({ items: [[1, 2], [3, 4], [5]] })
      const { proxy } = setup(state)
      const result = proxy.items.flat()
      expect(result).toEqual([1, 2, 3, 4, 5])
    })

    test('flat with depth', () => {
      const state = deepFreeze({ items: [[[1, 2]], [[3, 4]]] })
      const { proxy } = setup(state)
      expect(proxy.items.flat(1)).toEqual([[1, 2], [3, 4]])
      expect(proxy.items.flat(2)).toEqual([1, 2, 3, 4])
    })
  })

  describe('Non-overridden methods (pass-through)', () => {
    test('map() callbacks receive proxied values', () => {
      const state = createTestData()
      const { proxy } = setup(state)
      const mapped = proxy.items.map((item) => {
        // map is NOT overridden — callback should receive proxy
        return item.value * 2
      })
      expect(mapped).toEqual([20, 40, 60, 80, 100])
    })

    test('forEach() callbacks receive proxied values', () => {
      const state = createTestData()
      const { proxy } = setup(state)
      const values: number[] = []
      proxy.items.forEach((item) => {
        values.push(item.value)
      })
      expect(values).toEqual([10, 20, 30, 40, 50])
    })

    test('reduce() callbacks receive proxied values', () => {
      const state = createTestData()
      const { proxy } = setup(state)
      const sum = proxy.items.reduce((acc, item) => acc + item.value, 0)
      expect(sum).toBe(150)
    })

    test('reduceRight() callbacks receive proxied values', () => {
      const state = createTestData()
      const { proxy } = setup(state)
      const ids = proxy.items.reduceRight((acc: number[], item) => {
        acc.push(item.id)
        return acc
      }, [])
      expect(ids).toEqual([5, 4, 3, 2, 1])
    })
  })

  describe('Signal tracking precision', () => {
    test('find() registers signals only for the result element', () => {
      const state = createTestData()
      const { proxy, registry } = setup(state)

      // Simulate what a selector does: find + read properties
      const item = proxy.items.find((i) => i.id === 3)!
      const _label = item.value
      const _nested = item.nested.count

      // The found item (id:3) should have signals
      expect(registry.has('items.{id:3}.value')).toBe(true)
      expect(registry.has('items.{id:3}.nested.count')).toBe(true)

      // Other items should NOT have signals
      expect(registry.has('items.{id:1}.value')).toBe(false)
      expect(registry.has('items.{id:2}.nested.count')).toBe(false)
      expect(registry.has('items.{id:4}.value')).toBe(false)
      expect(registry.has('items.{id:5}.value')).toBe(false)
    })

    test('filter() registers signals only for matching elements', () => {
      const state = createTestData()
      const { proxy, registry } = setup(state)

      const highValue = proxy.items.filter((i) => i.value > 30)
      // Read properties to register
      for (const item of highValue) {
        const _v = item.value
      }

      // Items 4 and 5 (value > 30) should have signals
      expect(registry.has('items.{id:4}.value')).toBe(true)
      expect(registry.has('items.{id:5}.value')).toBe(true)

      // Items 1, 2, 3 should NOT
      expect(registry.has('items.{id:1}.value')).toBe(false)
      expect(registry.has('items.{id:2}.value')).toBe(false)
      expect(registry.has('items.{id:3}.value')).toBe(false)
    })

    test('primitive-returning methods register no element signals', () => {
      const state = createTestData()
      const { proxy, registry } = setup(state)

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
      const cache: ProxyCache = new WeakMap()
      const proxy = createTrackingProxy(state, 'items', registry, cache)

      // selectById pattern
      const found = proxy.find((i) => i.id === 42)!
      const _value = found.value
      const _label = found.label

      // Only 1 entity's signals should be registered
      expect(registry.has('items.{id:42}.value')).toBe(true)
      expect(registry.has('items.{id:42}.label')).toBe(true)

      // Spot-check other items are NOT registered
      expect(registry.has('items.{id:0}.value')).toBe(false)
      expect(registry.has('items.{id:41}.value')).toBe(false)
      expect(registry.has('items.{id:43}.value')).toBe(false)
      expect(registry.has('items.{id:99}.value')).toBe(false)
    })
  })

  describe('Edge cases', () => {
    test('empty array', () => {
      const state = deepFreeze({ items: [] as { id: number }[] })
      const { proxy } = setup(state)
      expect(proxy.items.find(() => true)).toBeUndefined()
      expect(proxy.items.filter(() => true)).toEqual([])
      expect(proxy.items.some(() => true)).toBe(false)
      expect(proxy.items.every(() => true)).toBe(true)
      expect(proxy.items.indexOf(1)).toBe(-1)
      expect(proxy.items.join(',')).toBe('')
    })

    test('single-element array', () => {
      const state = deepFreeze({ items: [{ id: 1, value: 10 }] })
      const { proxy } = setup(state)
      const found = proxy.items.find((i) => i.id === 1)
      expect(found).toBeDefined()
      expect(found!.value).toBe(10)
    })

    test('array of primitives (no identity detection)', () => {
      const state = deepFreeze({ nums: [5, 10, 15, 20, 25] })
      const { proxy } = setup(state)
      expect(proxy.nums.find((n) => n > 12)).toBe(15)
      expect(proxy.nums.filter((n) => n > 12)).toEqual([15, 20, 25])
      expect(proxy.nums.some((n) => n > 20)).toBe(true)
      expect(proxy.nums.indexOf(15)).toBe(2)
    })

    test('nested array access', () => {
      const state = deepFreeze({
        groups: [
          { id: 1, items: [{ id: 10, name: 'a' }, { id: 11, name: 'b' }] },
          { id: 2, items: [{ id: 20, name: 'c' }] },
        ],
      })
      const { proxy } = setup(state)
      const group = proxy.groups.find((g) => g.id === 1)!
      const item = group.items.find((i) => i.id === 11)!
      expect(item.name).toBe('b')
    })

    test('chained array methods', () => {
      const state = createTestData()
      const { proxy } = setup(state)
      // filter then find — both should work with overrides
      const highValue = proxy.items.filter((i) => i.value > 20)
      // highValue is a plain array of proxied items (not a tracking proxy itself)
      // so .find on it will use normal Array.prototype.find
      const found = highValue.find((i) => i.id === 4)
      expect(found).toBeDefined()
      expect(found!.value).toBe(40)
    })

    test('array.length is not affected by overrides', () => {
      const state = createTestData()
      const { proxy } = setup(state)
      expect(proxy.items.length).toBe(5)
    })

    test('for...of iteration still works (not overridden)', () => {
      const state = createTestData()
      const { proxy } = setup(state)
      const ids: number[] = []
      for (const item of proxy.items) {
        ids.push(item.id)
      }
      expect(ids).toEqual([1, 2, 3, 4, 5])
    })

    test('spread still works', () => {
      const state = createTestData()
      const { proxy } = setup(state)
      const copy = [...proxy.items]
      expect(copy).toHaveLength(5)
      expect(copy[0].id).toBe(1)
    })

    test('Array.isArray still works', () => {
      const state = createTestData()
      const { proxy } = setup(state)
      expect(Array.isArray(proxy.items)).toBe(true)
    })

    test('array destructuring works', () => {
      const state = createTestData()
      const { proxy } = setup(state)
      const [first, second] = proxy.items
      expect(first.id).toBe(1)
      expect(second.id).toBe(2)
    })
  })
})
