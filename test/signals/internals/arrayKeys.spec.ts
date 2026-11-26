import { describe, it, expect } from 'vitest'
import {
  findKeyField,
  buildIdentityPath,
  getKeyValue,
} from '../../../src/signals/arrayKeys'
import { alienEngine } from '../../../src/signals/engine'
import { createPathSignalRegistry } from '../../../src/signals/pathSignalRegistry'
import { createTrackingProxy } from '../../../src/signals/trackingProxy'
import { reconcileState } from '../../../src/signals/diff'

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

describe('edge cases: object keys with reserved path characters', () => {
  // Object property keys are encoded with the same %-escaping as identity
  // key values. Without encoding, state like { 'a.b': 1, a: { b: 2 } }
  // maps both locations to the path string "a.b" — updates clobber each
  // other's signal and one side goes permanently stale.

  it('a dotted key and a nested path do not share a signal', () => {
    const prev = { 'a.b': 1, a: { b: 2 } }
    const registry = createPathSignalRegistry(alienEngine)
    let current: typeof prev = prev

    let dottedRuns = 0
    const dotted = alienEngine.computed(() => {
      dottedRuns++
      const p = createTrackingProxy(current, '', registry)
      return p['a.b']
    })
    let nestedRuns = 0
    const nested = alienEngine.computed(() => {
      nestedRuns++
      const p = createTrackingProxy(current, '', registry)
      return p.a.b
    })
    expect(dotted.get()).toBe(1)
    expect(nested.get()).toBe(2)

    // Change ONLY the nested a.b — the dotted key's computed must not
    // re-run, and its value must survive.
    const next = { 'a.b': 1, a: { b: 99 } }
    current = next
    reconcileState(prev, next, registry, alienEngine)
    expect(nested.get()).toBe(99)
    expect(nestedRuns).toBe(2)
    expect(dotted.get()).toBe(1)
    expect(dottedRuns).toBe(1)

    // Now change ONLY the dotted key — this was the permanently-stale
    // case before encoding (the signal already held 99, so the real
    // change no-opped).
    const final = { 'a.b': 42, a: { b: 99 } }
    current = final
    reconcileState(next, final, registry, alienEngine)
    expect(dotted.get()).toBe(42)
    expect(dottedRuns).toBe(2)
    expect(nested.get()).toBe(99)
    expect(nestedRuns).toBe(2)
  })

  it('RTK Query style cache keys with dots and quotes stay reactive', () => {
    const key = 'getUser("a.b@c.com")'
    const prev = { queries: { [key]: { status: 'pending' } } }
    const next = { queries: { [key]: { status: 'fulfilled' } } }

    const registry = createPathSignalRegistry(alienEngine)
    let runs = 0
    const computed = alienEngine.computed(() => {
      runs++
      const p = createTrackingProxy(runs === 1 ? prev : next, '', registry)
      return p.queries[key].status
    })
    expect(computed.get()).toBe('pending')

    reconcileState(prev, next, registry, alienEngine)
    expect(computed.get()).toBe('fulfilled')
    expect(runs).toBe(2)
  })

  it('a state key literally named "@@keys" does not collide with the keys meta signal', () => {
    const prev = { obj: { '@@keys': 'v1', x: 1 } }
    const registry = createPathSignalRegistry(alienEngine)
    const proxy = createTrackingProxy(prev, '', registry)

    expect(proxy.obj['@@keys']).toBe('v1')
    // The literal key's signal lives at the encoded path.
    expect(registry.has('obj.%40%40keys')).toBe(true)
    expect(registry.has('obj.@@keys')).toBe(false)

    // Iterating keys registers the meta signal at the raw path.
    expect(Object.keys(proxy.obj)).toEqual(['@@keys', 'x'])
    expect(registry.has('obj.@@keys')).toBe(true)

    // Updating the literal '@@keys' property fires its own signal, and
    // the key set is unchanged, so the meta signal must not fire.
    let current = prev
    let literalRuns = 0
    const literal = alienEngine.computed(() => {
      literalRuns++
      const p = createTrackingProxy(current, '', registry)
      return p.obj['@@keys']
    })
    expect(literal.get()).toBe('v1')

    const next = { obj: { '@@keys': 'v2', x: 1 } }
    current = next
    reconcileState(prev, next, registry, alienEngine)
    expect(literal.get()).toBe('v2')
    expect(literalRuns).toBe(2)
  })

  it('a state key shaped like an identity segment does not collide with identity paths', () => {
    const state = {
      items: [{ id: 1, name: 'real' }],
      lookup: { '{id:1}': 'literal' },
    }
    const registry = createPathSignalRegistry(alienEngine)
    const proxy = createTrackingProxy(state, '', registry)

    expect(proxy.items[0].name).toBe('real')
    expect(proxy.lookup['{id:1}']).toBe('literal')
    expect(registry.has('lookup.%7Bid:1%7D')).toBe(true)
    expect(registry.has('lookup.{id:1}')).toBe(false)
  })

  it('column signals encode scanned property names', () => {
    const state = { rows: [{ id: 1, 'a.b': 'x' }] }
    const registry = createPathSignalRegistry(alienEngine)
    const proxy = createTrackingProxy(state, '', registry)

    const found = proxy.rows.find((r) => r['a.b'] === 'x')
    expect(found).toBeDefined()
    expect(registry.has('rows.{*}.a%2Eb')).toBe(true)
    expect(registry.has('rows.{*}.a.b')).toBe(false)
  })
})

describe('edge cases: identity key values', () => {
  it('numeric and string key values produce distinct identity paths', () => {
    // {id: 1} builds "items.{id:1}" while {id: "1"} builds 'items.{id:"1"}' —
    // numeric-looking string keys are quoted to avoid colliding.
    expect(buildIdentityPath('items', 'id', 1)).not.toBe(
      buildIdentityPath('items', 'id', '1'),
    )
  })

  it('literal quotes in key values stay distinct from the quoted numeric form', () => {
    // string '"1"' must not render identically to string '1' (which gets
    // quote-wrapped as {id:"1"}). Literal quotes are escaped as %22.
    expect(buildIdentityPath('items', 'id', '"1"')).not.toBe(
      buildIdentityPath('items', 'id', '1'),
    )
    expect(buildIdentityPath('items', 'id', '"1"')).toBe('items.{id:%221%22}')
  })

  it('key values containing dots do not corrupt the prefix index', () => {
    // Emails and composite keys as ids are common. Prefix bookkeeping
    // splits on '.', so dots (and %, {, }, ", @) in key values are
    // percent-escaped: "users.{id:a%40b%2Ecom}.name".
    const state = { users: [{ id: 'a@b.com', name: 'Alice' }] }
    const registry = createPathSignalRegistry(alienEngine)
    const proxy = createTrackingProxy(state, '', registry)

    expect(proxy.users[0].name).toBe('Alice')
    expect(registry.hasPrefix('users.{id:a@b')).toBe(false)
  })

  it('removing an entity whose id contains dots still prunes its child signals', () => {
    const prev = { users: [{ id: 'a@b.com', name: 'Alice' }] }
    const next = { users: [] as { id: string; name: string }[] }
    const identityPath = buildIdentityPath('users', 'id', 'a@b.com')
    expect(identityPath).toBe('users.{id:a%40b%2Ecom}')

    const registry = createPathSignalRegistry(alienEngine)
    const proxy = createTrackingProxy(prev, '', registry)
    expect(proxy.users[0].name).toBe('Alice')
    expect(registry.has(`${identityPath}.name`)).toBe(true)

    reconcileState(prev, next, registry, alienEngine)

    expect(registry.has(`${identityPath}.name`)).toBe(false)
  })
})
