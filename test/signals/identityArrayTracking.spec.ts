import { describe, it, expect } from 'vitest'
import { alienEngine } from '../../src/signals/engine'
import { createPathSignalRegistry } from '../../src/signals/pathSignalRegistry'
import { createTrackingProxy } from '../../src/signals/trackingProxy'
import { diffAndUpdateSignals, reconcileState } from '../../src/signals/diff'
import {
  findKeyField,
  buildIdentityPath,
  getKeyValue,
} from '../../src/signals/arrayKeys'

// Helper: create a registry with signals pre-populated by running a selector through a tracking proxy
function setupRegistry(state: object, selectorFn: (s: any) => void) {
  const registry = createPathSignalRegistry(alienEngine)
  const proxy = createTrackingProxy(state, '', registry, registry.proxyCache)
  selectorFn(proxy)
  return registry
}

function deepFreeze<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') return obj
  Object.freeze(obj)
  for (const val of Object.values(obj as Record<string, unknown>)) {
    if (val !== null && typeof val === 'object' && !Object.isFrozen(val)) {
      deepFreeze(val)
    }
  }
  return obj
}

describe('findKeyField', () => {
  it('detects "id" field', () => {
    expect(findKeyField({ id: 1, name: 'Alice' })).toBe('id')
  })

  it('detects "key" field', () => {
    expect(findKeyField({ key: 'abc', value: 42 })).toBe('key')
  })

  it('detects "_id" field (MongoDB-style)', () => {
    expect(findKeyField({ _id: 'abc123', name: 'test' })).toBe('_id')
  })

  it('detects "__id" field', () => {
    expect(findKeyField({ __id: 99, data: 'x' })).toBe('__id')
  })

  it('prefers "id" over "key"', () => {
    expect(findKeyField({ id: 1, key: 'abc' })).toBe('id')
  })

  it('prefers "key" over "_id"', () => {
    expect(findKeyField({ key: 'abc', _id: 'xyz' })).toBe('key')
  })

  it('accepts string key values', () => {
    expect(findKeyField({ id: 'uuid-123' })).toBe('id')
  })

  it('accepts number key values', () => {
    expect(findKeyField({ id: 42 })).toBe('id')
  })

  it('rejects object key values', () => {
    expect(findKeyField({ id: { nested: true }, name: 'x' })).toBe(undefined)
  })

  it('rejects boolean key values', () => {
    expect(findKeyField({ id: true })).toBe(undefined)
  })

  it('rejects null key values', () => {
    expect(findKeyField({ id: null })).toBe(undefined)
  })

  it('rejects undefined key values', () => {
    expect(findKeyField({ id: undefined })).toBe(undefined)
  })

  it('returns undefined for arrays', () => {
    expect(findKeyField([1, 2, 3])).toBe(undefined)
  })

  it('returns undefined for null', () => {
    expect(findKeyField(null)).toBe(undefined)
  })

  it('returns undefined for primitives', () => {
    expect(findKeyField(42)).toBe(undefined)
    expect(findKeyField('str')).toBe(undefined)
  })

  it('returns undefined for objects without ID fields', () => {
    expect(findKeyField({ name: 'Alice', age: 30 })).toBe(undefined)
  })
})

describe('buildIdentityPath', () => {
  it('builds path with numeric id', () => {
    expect(buildIdentityPath('items', 'id', 42)).toBe('items.{id:42}')
  })

  it('builds path with string id', () => {
    expect(buildIdentityPath('items', 'id', 'abc')).toBe('items.{id:abc}')
  })

  it('builds path with custom key field', () => {
    expect(buildIdentityPath('data', '_id', 'mongo123')).toBe(
      'data.{_id:mongo123}',
    )
  })

  it('handles empty parent path', () => {
    expect(buildIdentityPath('', 'id', 1)).toBe('{id:1}')
  })

  it('handles nested parent path', () => {
    expect(buildIdentityPath('state.users.list', 'id', 5)).toBe(
      'state.users.list.{id:5}',
    )
  })
})

describe('getKeyValue', () => {
  it('extracts string key', () => {
    expect(getKeyValue({ id: 'abc' }, 'id')).toBe('abc')
  })

  it('extracts number key', () => {
    expect(getKeyValue({ id: 42 }, 'id')).toBe(42)
  })

  it('returns undefined for missing field', () => {
    expect(getKeyValue({ name: 'x' }, 'id')).toBe(undefined)
  })

  it('returns undefined for non-primitive key value', () => {
    expect(getKeyValue({ id: { x: 1 } }, 'id')).toBe(undefined)
  })

  it('returns undefined for null input', () => {
    expect(getKeyValue(null, 'id')).toBe(undefined)
  })

  it('returns undefined for array input', () => {
    expect(getKeyValue([1, 2], 'id')).toBe(undefined)
  })

  it('returns undefined for primitive input', () => {
    expect(getKeyValue(42, 'id')).toBe(undefined)
  })
})

describe('identity-based array tracking: proxy', () => {
  it('uses identity path for array elements with id field', () => {
    const state = deepFreeze({
      items: [
        { id: 1, name: 'Alice' },
        { id: 2, name: 'Bob' },
      ],
    })
    const registry = setupRegistry(state, (s) => {
      s.items[0].name
      s.items[1].name
    })

    expect(registry.has('items.{id:1}.name')).toBe(true)
    expect(registry.has('items.{id:2}.name')).toBe(true)
    // Should NOT have index-based paths
    expect(registry.has('items.0.name')).toBe(false)
    expect(registry.has('items.1.name')).toBe(false)
  })

  it('uses identity path for "key" field', () => {
    const state = deepFreeze({
      items: [
        { key: 'a', value: 1 },
        { key: 'b', value: 2 },
      ],
    })
    const registry = setupRegistry(state, (s) => {
      s.items[0].value
      s.items[1].value
    })

    expect(registry.has('items.{key:a}.value')).toBe(true)
    expect(registry.has('items.{key:b}.value')).toBe(true)
  })

  it('uses identity path for "_id" field', () => {
    const state = deepFreeze({
      docs: [{ _id: 'abc', title: 'Doc1' }],
    })
    const registry = setupRegistry(state, (s) => {
      s.docs[0].title
    })

    expect(registry.has('docs.{_id:abc}.title')).toBe(true)
  })

  it('falls back to index path for arrays without key fields', () => {
    const state = deepFreeze({
      items: [
        { name: 'Alice', age: 30 },
        { name: 'Bob', age: 25 },
      ],
    })
    const registry = setupRegistry(state, (s) => {
      s.items[0].name
      s.items[1].name
    })

    // No id/key field — should use index-based paths
    expect(registry.has('items.0.name')).toBe(true)
    expect(registry.has('items.1.name')).toBe(true)
  })

  it('uses a coarse array signal for primitive arrays', () => {
    const state = deepFreeze({ tags: ['a', 'b', 'c'] })
    const registry = setupRegistry(state, (s) => {
      s.tags[0]
      s.tags[1]
    })

    // Primitive elements don't get per-index signals — one coarse
    // signal on the array covers all element reads.
    expect(registry.has('tags')).toBe(true)
    expect(registry.has('tags.0')).toBe(false)
    expect(registry.has('tags.1')).toBe(false)
  })

  it('creates ArrayMeta on first element access', () => {
    const state = deepFreeze({
      items: [{ id: 1, name: 'Alice' }],
    })
    const registry = createPathSignalRegistry(alienEngine)
    const proxy = createTrackingProxy(state, '', registry, registry.proxyCache)

    // Before access — no meta
    expect(registry.getArrayMeta('items')).toBeUndefined()

    // Access an element
    ;(proxy as any).items[0].name

    // Now meta should exist
    const meta = registry.getArrayMeta('items')
    expect(meta).toBeDefined()
    expect(meta!.keyField).toBe('id')
  })

  it('reuses ArrayMeta on subsequent accesses', () => {
    const state = deepFreeze({
      items: [
        { id: 1, name: 'Alice' },
        { id: 2, name: 'Bob' },
      ],
    })
    const registry = createPathSignalRegistry(alienEngine)
    const proxy = createTrackingProxy(state, '', registry, registry.proxyCache)

    ;(proxy as any).items[0].name
    const meta1 = registry.getArrayMeta('items')

    ;(proxy as any).items[1].name
    const meta2 = registry.getArrayMeta('items')

    // Same meta object — not recreated
    expect(meta1).toBe(meta2)
  })

  it('handles nested arrays with identity paths', () => {
    const state = deepFreeze({
      data: {
        users: [
          { id: 'u1', name: 'Alice' },
          { id: 'u2', name: 'Bob' },
        ],
      },
    })
    const registry = setupRegistry(state, (s) => {
      s.data.users[0].name
      s.data.users[1].name
    })

    expect(registry.has('data.users.{id:u1}.name')).toBe(true)
    expect(registry.has('data.users.{id:u2}.name')).toBe(true)
  })

  it('uses index path for array-of-arrays', () => {
    const state = deepFreeze({
      matrix: [
        [1, 2],
        [3, 4],
      ],
    })
    const registry = setupRegistry(state, (s) => {
      s.matrix[0][0]
      s.matrix[1][1]
    })

    // Inner arrays use index paths (matrix.0, matrix.1); their primitive
    // elements share a coarse signal on each inner array.
    expect(registry.has('matrix.0')).toBe(true)
    expect(registry.has('matrix.1')).toBe(true)
    expect(registry.has('matrix.0.0')).toBe(false)
    expect(registry.has('matrix.1.1')).toBe(false)
  })
})

describe('identity-based array tracking: diff', () => {
  describe('entity update (no reorder)', () => {
    it('updates only changed entity fields', () => {
      const prev = deepFreeze({
        items: [
          { id: 1, name: 'Alice', score: 100 },
          { id: 2, name: 'Bob', score: 200 },
          { id: 3, name: 'Carol', score: 300 },
        ],
      })
      const next = deepFreeze({
        items: [
          { id: 1, name: 'Alice', score: 100 },
          { id: 2, name: 'Bob', score: 250 }, // changed
          { id: 3, name: 'Carol', score: 300 },
        ],
      })

      const registry = setupRegistry(prev, (s) => {
        s.items[0].score
        s.items[1].score
        s.items[2].score
      })

      const sig1 = registry.getOrCreate('items.{id:1}.score', 100)
      const sig2 = registry.getOrCreate('items.{id:2}.score', 200)
      const sig3 = registry.getOrCreate('items.{id:3}.score', 300)

      diffAndUpdateSignals(prev, next, '', registry)

      expect(sig1.get()).toBe(100) // unchanged
      expect(sig2.get()).toBe(250) // updated
      expect(sig3.get()).toBe(300) // unchanged
    })

    it('skips entity entirely when structurally shared', () => {
      const sharedEntity = deepFreeze({ id: 1, name: 'Alice', score: 100 })
      const prev = deepFreeze({
        items: [sharedEntity, { id: 2, name: 'Bob', score: 200 }],
      })
      // Immer-style: share entity reference, change another
      const next = deepFreeze({
        items: [sharedEntity, { id: 2, name: 'Bob', score: 250 }],
      })

      const registry = setupRegistry(prev, (s) => {
        s.items[0].name
        s.items[0].score
        s.items[1].score
      })

      const nameSig = registry.getOrCreate('items.{id:1}.name', 'Alice')
      const score1Sig = registry.getOrCreate('items.{id:1}.score', 100)
      const score2Sig = registry.getOrCreate('items.{id:2}.score', 200)

      const initialName = nameSig.get()
      const initialScore1 = score1Sig.get()

      diffAndUpdateSignals(prev, next, '', registry)

      // Shared entity skipped entirely (prevItem === nextItem)
      expect(nameSig.get()).toBe(initialName)
      expect(score1Sig.get()).toBe(initialScore1)
      // Other entity updated
      expect(score2Sig.get()).toBe(250)
    })
  })

  describe('entity addition', () => {
    it('handles new entity appended', () => {
      const shared = deepFreeze([
        { id: 1, name: 'Alice' },
        { id: 2, name: 'Bob' },
      ])
      const prev = deepFreeze({ items: shared })
      const next = deepFreeze({
        items: [...shared, { id: 3, name: 'Carol' }],
      })

      const registry = setupRegistry(prev, (s) => {
        s.items[0].name
        s.items[1].name
      })

      const keysSignal = registry.getOrCreate('items.@@keys', 2)
      const initialVersion = keysSignal.get()

      diffAndUpdateSignals(prev, next, '', registry)

      // @@keys should update for length change
      expect(keysSignal.get()).not.toBe(initialVersion)
      // Existing entities unchanged (structurally shared)
      expect(registry.getOrCreate('items.{id:1}.name', 'Alice').get()).toBe(
        'Alice',
      )
    })

    it('handles new entity prepended', () => {
      const prev = deepFreeze({
        items: [
          { id: 2, name: 'Bob' },
          { id: 3, name: 'Carol' },
        ],
      })
      const next = deepFreeze({
        items: [
          { id: 1, name: 'Alice' },
          { id: 2, name: 'Bob' },
          { id: 3, name: 'Carol' },
        ],
      })

      const registry = setupRegistry(prev, (s) => {
        s.items[0].name
        s.items[1].name
      })

      // Existing entities are tracked by identity, not index
      const bobSig = registry.getOrCreate('items.{id:2}.name', 'Bob')
      const carolSig = registry.getOrCreate('items.{id:3}.name', 'Carol')

      diffAndUpdateSignals(prev, next, '', registry)

      // Bob and Carol's signals are stable — same identity path regardless of index
      expect(bobSig.get()).toBe('Bob')
      expect(carolSig.get()).toBe('Carol')
    })
  })

  describe('entity removal', () => {
    it('prunes signals for removed entity', () => {
      const prev = deepFreeze({
        items: [
          { id: 1, name: 'Alice', score: 100 },
          { id: 2, name: 'Bob', score: 200 },
          { id: 3, name: 'Carol', score: 300 },
        ],
      })
      const next = deepFreeze({
        items: [
          { id: 1, name: 'Alice', score: 100 },
          { id: 3, name: 'Carol', score: 300 },
        ],
      })

      const registry = setupRegistry(prev, (s) => {
        s.items[0].name
        s.items[0].score
        s.items[1].name
        s.items[1].score
        s.items[2].name
        s.items[2].score
      })

      expect(registry.has('items.{id:2}.name')).toBe(true)
      expect(registry.has('items.{id:2}.score')).toBe(true)
      expect(registry.hasPrefix('items.{id:2}')).toBe(true)

      diffAndUpdateSignals(prev, next, '', registry)

      // Entity 2 removed — all its signals pruned
      expect(registry.has('items.{id:2}.name')).toBe(false)
      expect(registry.has('items.{id:2}.score')).toBe(false)
      expect(registry.hasPrefix('items.{id:2}')).toBe(false)
      // Remaining entities intact
      expect(registry.has('items.{id:1}.name')).toBe(true)
      expect(registry.has('items.{id:3}.name')).toBe(true)
    })

    it('prunes signals when removing from beginning (shift)', () => {
      const prev = deepFreeze({
        items: [
          { id: 1, name: 'Alice' },
          { id: 2, name: 'Bob' },
          { id: 3, name: 'Carol' },
        ],
      })
      const next = deepFreeze({
        items: [
          { id: 2, name: 'Bob' },
          { id: 3, name: 'Carol' },
        ],
      })

      const registry = setupRegistry(prev, (s) => {
        s.items[0].name
        s.items[1].name
        s.items[2].name
      })

      diffAndUpdateSignals(prev, next, '', registry)

      // Entity 1 removed
      expect(registry.has('items.{id:1}.name')).toBe(false)
      // Entities 2 and 3 still exist at their identity paths
      expect(registry.has('items.{id:2}.name')).toBe(true)
      expect(registry.has('items.{id:3}.name')).toBe(true)
    })

    it('handles removing all entities', () => {
      const prev = deepFreeze({
        items: [
          { id: 1, name: 'Alice' },
          { id: 2, name: 'Bob' },
        ],
      })
      const next = deepFreeze({ items: [] as any[] })

      const registry = setupRegistry(prev, (s) => {
        s.items[0].name
        s.items[1].name
      })

      expect(registry.has('items.{id:1}.name')).toBe(true)
      expect(registry.has('items.{id:2}.name')).toBe(true)

      diffAndUpdateSignals(prev, next, '', registry)

      expect(registry.has('items.{id:1}.name')).toBe(false)
      expect(registry.has('items.{id:2}.name')).toBe(false)
    })
  })

  describe('entity reorder', () => {
    it('does not update signals when entities just swap positions', () => {
      const entityA = deepFreeze({ id: 1, name: 'Alice', score: 100 })
      const entityB = deepFreeze({ id: 2, name: 'Bob', score: 200 })
      const prev = deepFreeze({ items: [entityA, entityB] })
      // Swap positions but share refs (Immer structural sharing)
      const next = deepFreeze({ items: [entityB, entityA] })

      const registry = setupRegistry(prev, (s) => {
        s.items[0].name
        s.items[0].score
        s.items[1].name
        s.items[1].score
      })

      const aliceNameSig = registry.getOrCreate('items.{id:1}.name', 'Alice')
      const aliceScoreSig = registry.getOrCreate('items.{id:1}.score', 100)
      const bobNameSig = registry.getOrCreate('items.{id:2}.name', 'Bob')
      const bobScoreSig = registry.getOrCreate('items.{id:2}.score', 200)

      const initialAliceName = aliceNameSig.get()
      const initialAliceScore = aliceScoreSig.get()
      const initialBobName = bobNameSig.get()
      const initialBobScore = bobScoreSig.get()

      diffAndUpdateSignals(prev, next, '', registry)

      // With identity-based tracking, reorder with shared refs → zero updates
      expect(aliceNameSig.get()).toBe(initialAliceName)
      expect(aliceScoreSig.get()).toBe(initialAliceScore)
      expect(bobNameSig.get()).toBe(initialBobName)
      expect(bobScoreSig.get()).toBe(initialBobScore)
    })

    it('handles reorder with content change', () => {
      const prev = deepFreeze({
        items: [
          { id: 1, name: 'Alice', score: 100 },
          { id: 2, name: 'Bob', score: 200 },
        ],
      })
      const next = deepFreeze({
        items: [
          { id: 2, name: 'Bob', score: 250 }, // moved AND changed
          { id: 1, name: 'Alice', score: 100 }, // just moved
        ],
      })

      const registry = setupRegistry(prev, (s) => {
        s.items[0].score
        s.items[1].score
      })

      diffAndUpdateSignals(prev, next, '', registry)

      // Alice unchanged (even though she moved)
      expect(registry.getOrCreate('items.{id:1}.score', 100).get()).toBe(100)
      // Bob changed
      expect(registry.getOrCreate('items.{id:2}.score', 250).get()).toBe(250)
    })

    it('handles complete reversal', () => {
      const e1 = deepFreeze({ id: 1, v: 'a' })
      const e2 = deepFreeze({ id: 2, v: 'b' })
      const e3 = deepFreeze({ id: 3, v: 'c' })
      const prev = deepFreeze({ items: [e1, e2, e3] })
      const next = deepFreeze({ items: [e3, e2, e1] })

      const registry = setupRegistry(prev, (s) => {
        s.items[0].v
        s.items[1].v
        s.items[2].v
      })

      const sig1 = registry.getOrCreate('items.{id:1}.v', 'a')
      const sig2 = registry.getOrCreate('items.{id:2}.v', 'b')
      const sig3 = registry.getOrCreate('items.{id:3}.v', 'c')

      const init1 = sig1.get()
      const init2 = sig2.get()
      const init3 = sig3.get()

      diffAndUpdateSignals(prev, next, '', registry)

      // All shared refs — zero updates
      expect(sig1.get()).toBe(init1)
      expect(sig2.get()).toBe(init2)
      expect(sig3.get()).toBe(init3)
    })
  })

  describe('entityMap lifecycle', () => {
    it('populates entityMap from prev on first diff', () => {
      const prev = deepFreeze({
        items: [
          { id: 1, name: 'Alice' },
          { id: 2, name: 'Bob' },
        ],
      })
      const next = deepFreeze({
        items: [
          { id: 1, name: 'Alice' },
          { id: 2, name: 'Bobby' },
        ],
      })

      const registry = setupRegistry(prev, (s) => {
        s.items[0].name
        s.items[1].name
      })

      // Meta exists (created by proxy) but entityMap is empty
      const meta = registry.getArrayMeta('items')
      expect(meta).toBeDefined()
      expect(meta!.entityMap.size).toBe(0)

      diffAndUpdateSignals(prev, next, '', registry)

      // After diff, entityMap is populated with next array's entities
      expect(meta!.entityMap.size).toBe(2)
      expect(meta!.entityMap.get(1)).toBe(next.items[0])
      expect(meta!.entityMap.get(2)).toBe(next.items[1])
    })

    it('updates entityMap after each diff', () => {
      const state1 = deepFreeze({
        items: [
          { id: 1, name: 'Alice' },
          { id: 2, name: 'Bob' },
        ],
      })
      const state2 = deepFreeze({
        items: [
          { id: 1, name: 'Alice' },
          { id: 2, name: 'Bobby' },
          { id: 3, name: 'Carol' },
        ],
      })
      const state3 = deepFreeze({
        items: [{ id: 1, name: 'Alice' }],
      })

      const registry = setupRegistry(state1, (s) => {
        s.items[0].name
        s.items[1].name
      })

      // First diff
      diffAndUpdateSignals(state1, state2, '', registry)
      const meta = registry.getArrayMeta('items')!
      expect(meta.entityMap.size).toBe(3)

      // Second diff
      diffAndUpdateSignals(state2, state3, '', registry)
      expect(meta.entityMap.size).toBe(1)
      expect(meta.entityMap.has(2)).toBe(false)
      expect(meta.entityMap.has(3)).toBe(false)
    })
  })

  describe('edge cases', () => {
    it('handles empty array → entities', () => {
      const prev = deepFreeze({ items: [] as any[] })
      const next = deepFreeze({
        items: [
          { id: 1, name: 'Alice' },
          { id: 2, name: 'Bob' },
        ],
      })

      const registry = setupRegistry(prev, (s) => {
        s.items.length
      })

      diffAndUpdateSignals(prev, next, '', registry)

      // No crash, @@keys updated
      const keysSignal = registry.getOrCreate('items.@@keys', 2)
      expect(typeof keysSignal.get()).toBe('number')
    })

    it('handles entities → empty array', () => {
      const prev = deepFreeze({
        items: [
          { id: 1, name: 'Alice' },
          { id: 2, name: 'Bob' },
        ],
      })
      const next = deepFreeze({ items: [] as any[] })

      const registry = setupRegistry(prev, (s) => {
        s.items[0].name
        s.items[1].name
      })

      diffAndUpdateSignals(prev, next, '', registry)

      // All entities pruned
      expect(registry.has('items.{id:1}.name')).toBe(false)
      expect(registry.has('items.{id:2}.name')).toBe(false)
    })

    it('handles duplicate IDs gracefully', () => {
      const prev = deepFreeze({
        items: [
          { id: 1, name: 'Alice' },
          { id: 1, name: 'Also Alice' }, // duplicate ID
        ],
      })
      const next = deepFreeze({
        items: [
          { id: 1, name: 'Alice' },
          { id: 1, name: 'Still Alice' },
        ],
      })

      const registry = setupRegistry(prev, (s) => {
        s.items[0].name
        s.items[1].name
      })

      // Should not throw — just works with last-wins semantics
      expect(() =>
        diffAndUpdateSignals(prev, next, '', registry),
      ).not.toThrow()
    })

    it('handles entity with id=0', () => {
      const prev = deepFreeze({
        items: [
          { id: 0, name: 'Zero' },
          { id: 1, name: 'One' },
        ],
      })
      const next = deepFreeze({
        items: [
          { id: 0, name: 'Zero Updated' },
          { id: 1, name: 'One' },
        ],
      })

      const registry = setupRegistry(prev, (s) => {
        s.items[0].name
        s.items[1].name
      })

      diffAndUpdateSignals(prev, next, '', registry)

      expect(registry.getOrCreate('items.{id:0}.name', 'Zero Updated').get()).toBe(
        'Zero Updated',
      )
      expect(registry.getOrCreate('items.{id:1}.name', 'One').get()).toBe('One')
    })

    it('handles entity with empty string id', () => {
      const prev = deepFreeze({
        items: [{ id: '', name: 'Empty' }],
      })
      const next = deepFreeze({
        items: [{ id: '', name: 'Updated' }],
      })

      const registry = setupRegistry(prev, (s) => {
        s.items[0].name
      })

      diffAndUpdateSignals(prev, next, '', registry)

      expect(registry.getOrCreate('items.{id:}.name', 'Updated').get()).toBe(
        'Updated',
      )
    })

    it('handles mixed keyed and non-keyed arrays in same state', () => {
      const prev = deepFreeze({
        users: [{ id: 1, name: 'Alice' }],
        tags: ['react', 'redux'],
      })
      const next = deepFreeze({
        users: [{ id: 1, name: 'Alicia' }],
        tags: ['react', 'signals'],
      })

      const registry = setupRegistry(prev, (s) => {
        s.users[0].name
        s.tags[0]
        s.tags[1]
      })

      diffAndUpdateSignals(prev, next, '', registry)

      // Users: identity-based
      expect(registry.getOrCreate('users.{id:1}.name', 'Alicia').get()).toBe(
        'Alicia',
      )
      // Tags: index-based (primitive array)
      expect(registry.getOrCreate('tags.1', 'signals').get()).toBe('signals')
    })

    it('handles deeply nested entity arrays', () => {
      const prev = deepFreeze({
        data: {
          nested: {
            items: [
              { id: 'a', val: 1 },
              { id: 'b', val: 2 },
            ],
          },
        },
      })
      const next = deepFreeze({
        data: {
          nested: {
            items: [
              { id: 'a', val: 1 },
              { id: 'b', val: 99 },
            ],
          },
        },
      })

      const registry = setupRegistry(prev, (s) => {
        s.data.nested.items[0].val
        s.data.nested.items[1].val
      })

      diffAndUpdateSignals(prev, next, '', registry)

      expect(
        registry
          .getOrCreate('data.nested.items.{id:a}.val', 1)
          .get(),
      ).toBe(1)
      expect(
        registry
          .getOrCreate('data.nested.items.{id:b}.val', 99)
          .get(),
      ).toBe(99)
    })

    it('handles entities with nested objects', () => {
      const prev = deepFreeze({
        items: [
          { id: 1, profile: { name: 'Alice', age: 30 } },
          { id: 2, profile: { name: 'Bob', age: 25 } },
        ],
      })
      const next = deepFreeze({
        items: [
          { id: 1, profile: { name: 'Alice', age: 31 } }, // age changed
          { id: 2, profile: { name: 'Bob', age: 25 } },
        ],
      })

      const registry = setupRegistry(prev, (s) => {
        s.items[0].profile.age
        s.items[1].profile.age
      })

      diffAndUpdateSignals(prev, next, '', registry)

      expect(
        registry.getOrCreate('items.{id:1}.profile.age', 31).get(),
      ).toBe(31)
      expect(
        registry.getOrCreate('items.{id:2}.profile.age', 25).get(),
      ).toBe(25)
    })
  })

  describe('reactive propagation with identity tracking', () => {
    it('triggers computed only for changed entity', () => {
      const prev = deepFreeze({
        items: [
          { id: 1, name: 'Alice' },
          { id: 2, name: 'Bob' },
        ],
      })
      const next = deepFreeze({
        items: [
          { id: 1, name: 'Alice' },
          { id: 2, name: 'Bobby' },
        ],
      })

      const registry = setupRegistry(prev, (s) => {
        s.items[0].name
        s.items[1].name
      })

      const sig1 = registry.getOrCreate('items.{id:1}.name', 'Alice')
      const sig2 = registry.getOrCreate('items.{id:2}.name', 'Bob')

      let computed1Runs = 0
      let computed2Runs = 0

      const c1 = alienEngine.computed(() => {
        computed1Runs++
        return sig1.get()
      })
      const c2 = alienEngine.computed(() => {
        computed2Runs++
        return sig2.get()
      })

      // Initial read
      c1.get()
      c2.get()
      const initialRuns1 = computed1Runs
      const initialRuns2 = computed2Runs

      reconcileState(prev, next, registry, alienEngine)

      c1.get()
      c2.get()

      // Only entity 2 changed — only computed2 should re-run
      expect(computed1Runs).toBe(initialRuns1) // no re-run
      expect(computed2Runs).toBe(initialRuns2 + 1) // re-ran
      expect(c2.get()).toBe('Bobby')
    })

    it('does not trigger computed for reorder-only change', () => {
      const e1 = deepFreeze({ id: 1, name: 'Alice' })
      const e2 = deepFreeze({ id: 2, name: 'Bob' })
      const prev = deepFreeze({ items: [e1, e2] })
      const next = deepFreeze({ items: [e2, e1] }) // swapped

      const registry = setupRegistry(prev, (s) => {
        s.items[0].name
        s.items[1].name
      })

      const sig1 = registry.getOrCreate('items.{id:1}.name', 'Alice')
      const sig2 = registry.getOrCreate('items.{id:2}.name', 'Bob')

      let runs = 0
      const derived = alienEngine.computed(() => {
        runs++
        return `${sig1.get()}-${sig2.get()}`
      })

      derived.get()
      const initialRuns = runs

      reconcileState(prev, next, registry, alienEngine)

      derived.get()
      // No content changed, just reorder with shared refs → zero signal updates → no re-run
      expect(runs).toBe(initialRuns)
    })
  })

  describe('multi-dispatch sequences', () => {
    it('handles add → update → remove sequence', () => {
      const state0 = deepFreeze({
        items: [
          { id: 1, name: 'Alice' },
          { id: 2, name: 'Bob' },
        ],
      })
      const state1 = deepFreeze({
        items: [
          { id: 1, name: 'Alice' },
          { id: 2, name: 'Bob' },
          { id: 3, name: 'Carol' },
        ],
      })
      const state2 = deepFreeze({
        items: [
          { id: 1, name: 'Alicia' },
          { id: 2, name: 'Bob' },
          { id: 3, name: 'Carol' },
        ],
      })
      const state3 = deepFreeze({
        items: [
          { id: 2, name: 'Bob' },
          { id: 3, name: 'Carol' },
        ],
      })

      const registry = setupRegistry(state0, (s) => {
        s.items[0].name // tracks {id:1}.name
        s.items[1].name // tracks {id:2}.name
      })

      expect(registry.has('items.{id:1}.name')).toBe(true)
      expect(registry.has('items.{id:2}.name')).toBe(true)

      // Dispatch 1: add entity 3
      diffAndUpdateSignals(state0, state1, '', registry)
      // @@keys updated but entity 3 not tracked (never accessed via proxy)

      // Dispatch 2: update entity 1's name
      diffAndUpdateSignals(state1, state2, '', registry)
      expect(registry.getOrCreate('items.{id:1}.name', 'Alicia').get()).toBe(
        'Alicia',
      )

      // Dispatch 3: remove entity 1
      diffAndUpdateSignals(state2, state3, '', registry)
      expect(registry.has('items.{id:1}.name')).toBe(false)
      expect(registry.has('items.{id:2}.name')).toBe(true)
    })

    it('handles repeated reorders', () => {
      const e1 = deepFreeze({ id: 1, v: 'a' })
      const e2 = deepFreeze({ id: 2, v: 'b' })
      const e3 = deepFreeze({ id: 3, v: 'c' })

      const s0 = deepFreeze({ items: [e1, e2, e3] })
      const s1 = deepFreeze({ items: [e3, e1, e2] })
      const s2 = deepFreeze({ items: [e2, e3, e1] })
      const s3 = deepFreeze({ items: [e1, e2, e3] }) // back to original

      const registry = setupRegistry(s0, (s) => {
        s.items[0].v
        s.items[1].v
        s.items[2].v
      })

      const sig1 = registry.getOrCreate('items.{id:1}.v', 'a')
      const sig2 = registry.getOrCreate('items.{id:2}.v', 'b')
      const sig3 = registry.getOrCreate('items.{id:3}.v', 'c')

      const init1 = sig1.get()
      const init2 = sig2.get()
      const init3 = sig3.get()

      diffAndUpdateSignals(s0, s1, '', registry)
      diffAndUpdateSignals(s1, s2, '', registry)
      diffAndUpdateSignals(s2, s3, '', registry)

      // After multiple reorders with shared refs, signals unchanged
      expect(sig1.get()).toBe(init1)
      expect(sig2.get()).toBe(init2)
      expect(sig3.get()).toBe(init3)
    })
  })
})
