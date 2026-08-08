/**
 * Edge case audit tests (unit level: proxy / registry / diff).
 *
 * Tests marked `it.fails` assert the DESIRED behavior for confirmed bugs —
 * they pass while the bug exists and will flip to failing once the bug is
 * fixed (at which point remove the `.fails` marker).
 *
 * Tests named "documented limitation: ..." assert CURRENT behavior that we
 * accept and document rather than fix.
 *
 * See dev-plans research doc: 2026-07-28-edge-case-audit.md
 */
import { describe, it, expect } from 'vitest'
import { alienEngine } from '../../src/signals/engine'
import { createPathSignalRegistry } from '../../src/signals/pathSignalRegistry'
import {
  createTrackingProxy,
  type LeafObjectTracker,
} from '../../src/signals/trackingProxy'
import { reconcileState } from '../../src/signals/diff'
import { buildIdentityPath } from '../../src/signals/arrayKeys'

function createTracker(): LeafObjectTracker {
  return { accessedObjects: new Map(), traversedPaths: new Set() }
}

describe('edge cases: non-plain objects in state', () => {
  // Non-plain objects (Date, Map, Set, class instances) are opaque leaves:
  // the proxy returns them raw (no shell, so internal-slot methods work)
  // and tracks them by reference via a version signal at their path.

  it('supports calling Date methods on a state Date', () => {
    const createdAt = new Date(2020, 0, 1)
    const state = { createdAt }
    const registry = createPathSignalRegistry(alienEngine)
    const proxy = createTrackingProxy(state, '', registry, registry.proxyCache)

    expect(proxy.createdAt.getTime()).toBe(createdAt.getTime())
  })

  it('supports calling Map methods on a state Map', () => {
    const state = { lookup: new Map([['a', 1]]) }
    const registry = createPathSignalRegistry(alienEngine)
    const proxy = createTrackingProxy(state, '', registry, registry.proxyCache)

    expect(proxy.lookup.get('a')).toBe(1)
  })

  it('supports calling Set methods on a state Set', () => {
    const state = { tags: new Set(['x']) }
    const registry = createPathSignalRegistry(alienEngine)
    const proxy = createTrackingProxy(state, '', registry, registry.proxyCache)

    expect(proxy.tags.has('x')).toBe(true)
  })

  it('instanceof checks work through the proxy (getPrototypeOf trap)', () => {
    const state = { createdAt: new Date(2020, 0, 1) }
    const registry = createPathSignalRegistry(alienEngine)
    const proxy = createTrackingProxy(state, '', registry, registry.proxyCache)

    expect(proxy.createdAt instanceof Date).toBe(true)
  })

  it('reads Map.size through the proxy (getter invoked on the real target)', () => {
    const state = { lookup: new Map([['a', 1]]) }
    const registry = createPathSignalRegistry(alienEngine)
    const proxy = createTrackingProxy(state, '', registry, registry.proxyCache)

    expect(proxy.lookup.size).toBe(1)
  })

  it('documented limitation: class instances are opaque leaves tracked by reference', () => {
    class User {
      constructor(public name: string) {}
    }
    const alice = new User('Alice')
    const prev = { user: alice }
    const next = { user: new User('Bob') }

    const registry = createPathSignalRegistry(alienEngine)
    const proxy = createTrackingProxy(prev, '', registry, registry.proxyCache)

    // The instance comes back raw — no proxy shell, no child signals.
    expect(proxy.user).toBe(alice)
    expect(proxy.user.name).toBe('Alice')
    expect(registry.has('user.name')).toBe(false)
    expect(registry.has('user')).toBe(true)

    // Replacing the instance bumps the reference signal at 'user'.
    // Mutating the instance in place would NOT be detected — documented
    // guidance: keep state to plain objects and arrays.
    let runs = 0
    const computed = alienEngine.computed(() => {
      runs++
      const p = createTrackingProxy(next, '', registry, registry.proxyCache)
      return p.user.name
    })
    expect(computed.get()).toBe('Bob')
    expect(runs).toBe(1)

    reconcileState(prev, next, registry, alienEngine)
    expect(computed.get()).toBe('Bob')
    expect(runs).toBe(2)
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
    const proxy = createTrackingProxy(state, '', registry, registry.proxyCache)

    expect(proxy.users[0].name).toBe('Alice')
    expect(registry.hasPrefix('users.{id:a@b')).toBe(false)
  })

  it('removing an entity whose id contains dots still prunes its child signals', () => {
    const prev = { users: [{ id: 'a@b.com', name: 'Alice' }] }
    const next = { users: [] as { id: string; name: string }[] }
    const identityPath = buildIdentityPath('users', 'id', 'a@b.com')
    expect(identityPath).toBe('users.{id:a%40b%2Ecom}')

    const registry = createPathSignalRegistry(alienEngine)
    const proxy = createTrackingProxy(prev, '', registry, registry.proxyCache)
    expect(proxy.users[0].name).toBe('Alice')
    expect(registry.has(`${identityPath}.name`)).toBe(true)

    reconcileState(prev, next, registry, alienEngine)

    expect(registry.has(`${identityPath}.name`)).toBe(false)
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
      const p = createTrackingProxy(current, '', registry, registry.proxyCache)
      return p['a.b']
    })
    let nestedRuns = 0
    const nested = alienEngine.computed(() => {
      nestedRuns++
      const p = createTrackingProxy(current, '', registry, registry.proxyCache)
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
      const p = createTrackingProxy(
        runs === 1 ? prev : next,
        '',
        registry,
        registry.proxyCache,
      )
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
    const proxy = createTrackingProxy(prev, '', registry, registry.proxyCache)

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
      const p = createTrackingProxy(current, '', registry, registry.proxyCache)
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
    const proxy = createTrackingProxy(state, '', registry, registry.proxyCache)

    expect(proxy.items[0].name).toBe('real')
    expect(proxy.lookup['{id:1}']).toBe('literal')
    expect(registry.has('lookup.%7Bid:1%7D')).toBe(true)
    expect(registry.has('lookup.{id:1}')).toBe(false)
  })

  it('column signals encode scanned property names', () => {
    const state = { rows: [{ id: 1, 'a.b': 'x' }] }
    const registry = createPathSignalRegistry(alienEngine)
    const proxy = createTrackingProxy(state, '', registry, registry.proxyCache)

    const found = proxy.rows.find((r) => r['a.b'] === 'x')
    expect(found).toBeDefined()
    expect(registry.has('rows.{*}.a%2Eb')).toBe(true)
    expect(registry.has('rows.{*}.a.b')).toBe(false)
  })
})

describe('edge cases: same-length keyed array replacement (remove + add)', () => {
  // diffArrayByKey's general path tracks seen keys unconditionally, so a
  // same-length replacement (remove one entity, add another) prunes the
  // removed entity's signals even though the array length is unchanged.

  it('prunes signals for an entity removed in a same-length replacement', () => {
    const shared = { id: 1, text: 'first' }
    const prev = { items: [shared, { id: 2, text: 'second' }] }
    const next = { items: [shared, { id: 9, text: 'ninth' }] }

    const registry = createPathSignalRegistry(alienEngine)
    const proxy = createTrackingProxy(prev, '', registry, registry.proxyCache)
    expect(proxy.items[0].text).toBe('first')
    expect(proxy.items[1].text).toBe('second')
    expect(registry.has('items.{id:2}.text')).toBe(true)

    reconcileState(prev, next, registry, alienEngine)

    expect(registry.has('items.{id:2}.text')).toBe(false)
  })

  it('temp-id → server-id swap prunes the temp entity signals', () => {
    // Optimistic update pattern: entity created with a temp id, server
    // responds with the real id. Same array length, key value changes.
    const prev = { items: [{ id: 'temp-1', text: 'draft' }] }
    const next = { items: [{ id: 42, text: 'draft' }] }

    const registry = createPathSignalRegistry(alienEngine)
    const proxy = createTrackingProxy(prev, '', registry, registry.proxyCache)
    expect(proxy.items[0].text).toBe('draft')
    expect(registry.has('items.{id:temp-1}.text')).toBe(true)

    reconcileState(prev, next, registry, alienEngine)

    expect(registry.has('items.{id:temp-1}.text')).toBe(false)
  })

  it('fires the structural remove signal for a same-length replacement', () => {
    // The structural classification is computed independently of the prune
    // bookkeeping, so scans (filter/find/...) DO see the removal.
    const shared = { id: 1, text: 'first' }
    const prev = { items: [shared, { id: 2, text: 'second' }] }
    const next = { items: [shared, { id: 9, text: 'ninth' }] }

    const registry = createPathSignalRegistry(alienEngine)
    const proxy = createTrackingProxy(prev, '', registry, registry.proxyCache)
    expect(proxy.items[1].text).toBe('second')

    const removeSig = registry.trackStructure('items', 'remove')
    const before = removeSig.get()

    reconcileState(prev, next, registry, alienEngine)

    expect(removeSig.get()).not.toBe(before)
  })
})

describe('edge cases: aliased references (same object at two paths)', () => {
  // DOCUMENTED LIMITATION (deliberate tradeoff): the proxyCache is keyed by
  // target object identity only. When the same raw object is reachable at
  // two paths (state.selected = state.items[0]), whichever path is proxied
  // first wins — reads through the second path register signals under the
  // FIRST path. Per-path proxies would fix the attribution but break
  // `state.selected === state.items[0]` identity checks, which the system
  // guarantees. The leaf-object tracker keeps correctness: the alias path
  // gets a version-signal dependency, so replacement still re-runs the
  // selector (see next test).

  it.fails('reads through a second path register signals under that path', () => {
    const item = { id: 1, name: 'a' }
    const state = { items: [item], selected: item }

    const registry = createPathSignalRegistry(alienEngine)
    const proxy = createTrackingProxy(state, '', registry, registry.proxyCache)

    // Traverse via items first — item's proxy is cached with path "items.{id:1}"
    expect(proxy.items[0].name).toBe('a')
    // Now read the same object via selected — cache hit returns the
    // items-path proxy, so this registers "items.{id:1}.name" again
    // instead of "selected.name".
    expect(proxy.selected.name).toBe('a')

    expect(registry.has('selected.name')).toBe(true)
  })

  it('leaf-object tracking still records the aliased path itself (coarse rescue)', () => {
    // The alias path IS recorded as a leaf object access (the child reads
    // go under the wrong path, but 'selected' itself lands in the tracker
    // untraversed). The hook then subscribes to the 'selected' version
    // signal, so *replacement* of the aliased ref still re-runs the
    // selector — precision is lost, correctness mostly survives.
    const item = { id: 1, name: 'a' }
    const state = { items: [item], selected: item }

    const registry = createPathSignalRegistry(alienEngine)
    const tracker = createTracker()
    const proxy = createTrackingProxy(
      state,
      '',
      registry,
      registry.proxyCache,
      tracker,
    )

    expect(proxy.items[0].name).toBe('a')
    expect(proxy.selected.name).toBe('a')

    expect(tracker.accessedObjects.has('selected')).toBe(true)
    expect(tracker.traversedPaths.has('selected')).toBe(false)
  })
})

describe('edge cases: leafTracker capture through the shared proxy cache', () => {
  // The active leafTracker lives in registry.leafTrackerHolder and is
  // swapped in at the start of each evaluation, so cached proxies created
  // by an earlier evaluation record into the CURRENT evaluation's tracker.

  it('a second evaluation records leaf accesses into its own tracker', () => {
    const state = { settings: { theme: 'dark' } }
    const registry = createPathSignalRegistry(alienEngine)

    // Evaluation A creates and caches all the proxies
    const trackerA = createTracker()
    const proxyA = createTrackingProxy(
      state,
      '',
      registry,
      registry.proxyCache,
      trackerA,
    )
    expect(proxyA.settings.theme).toBe('dark')

    // Evaluation B gets cache hits — every trap still records into trackerA
    const trackerB = createTracker()
    const proxyB = createTrackingProxy(
      state,
      '',
      registry,
      registry.proxyCache,
      trackerB,
    )
    // Leaf (identity-only) access by evaluation B
    void proxyB.settings

    expect(trackerB.accessedObjects.has('settings')).toBe(true)
  })
})

describe('edge cases: registry lifecycle', () => {
  it('prune clears array identity metadata (entityMap retention)', () => {
    const state = { items: [{ id: 1, v: 1 }] }
    const registry = createPathSignalRegistry(alienEngine)
    const proxy = createTrackingProxy(state, '', registry, registry.proxyCache)

    // Element access detects the key field and creates ArrayMeta
    expect(proxy.items[0].v).toBe(1)
    expect(registry.getArrayMeta('items')).toBeDefined()

    registry.prune('items')

    // The entityMap holds strong refs to old entities — after a reset
    // action prunes the slice, the metadata should be released too.
    expect(registry.getArrayMeta('items')).toBeUndefined()
  })
})

describe('edge cases: NaN leaf values', () => {
  it('does not re-run a computed when an untouched NaN leaf is re-diffed', () => {
    // The diff's skip checks use Object.is semantics for NaN (self-inequal
    // values on both sides are treated as equal), so an untouched NaN leaf
    // no longer re-fires its signal on every dispatch that touches the
    // parent object.
    const prev = { metrics: { ratio: NaN, count: 1 } }
    const next = { metrics: { ratio: NaN, count: 2 } }

    const registry = createPathSignalRegistry(alienEngine)
    const proxy = createTrackingProxy(prev, '', registry, registry.proxyCache)

    let runs = 0
    const c = alienEngine.computed(() => {
      runs++
      return proxy.metrics.ratio
    })
    expect(Number.isNaN(c.get() as number)).toBe(true)
    expect(runs).toBe(1)

    reconcileState(prev, next, registry, alienEngine)

    c.get()
    expect(runs).toBe(1)
  })
})

describe('edge cases: common selector patterns (smoke)', () => {
  it('JSON.stringify over a proxied subtree matches the raw state', () => {
    const state = {
      settings: { theme: 'dark', flags: { beta: true }, list: [1, 2, 3] },
    }
    const registry = createPathSignalRegistry(alienEngine)
    const proxy = createTrackingProxy(state, '', registry, registry.proxyCache)

    expect(JSON.stringify(proxy.settings)).toBe(JSON.stringify(state.settings))
  })

  it('Object.values / Object.entries work through the proxy', () => {
    const state = { counts: { a: 1, b: 2 } }
    const registry = createPathSignalRegistry(alienEngine)
    const proxy = createTrackingProxy(state, '', registry, registry.proxyCache)

    expect(Object.values(proxy.counts)).toEqual([1, 2])
    expect(Object.entries(proxy.counts)).toEqual([
      ['a', 1],
      ['b', 2],
    ])
  })

  it('destructuring a proxied object reads tracked values', () => {
    const state = { settings: { theme: 'dark', fontSize: 12 } }
    const registry = createPathSignalRegistry(alienEngine)
    const proxy = createTrackingProxy(state, '', registry, registry.proxyCache)

    const { theme, fontSize } = proxy.settings
    expect(theme).toBe('dark')
    expect(fontSize).toBe(12)
    expect(registry.has('settings.theme')).toBe(true)
    expect(registry.has('settings.fontSize')).toBe(true)
  })

  it('reading a missing index of a primitive array subscribes coarsely and returns undefined', () => {
    const state = { ids: [1, 2, 3] }
    const registry = createPathSignalRegistry(alienEngine)
    const proxy = createTrackingProxy(state, '', registry, registry.proxyCache)

    expect(proxy.ids[5]).toBeUndefined()
    // Coarse array signal, not a per-index signal
    expect(registry.has('ids')).toBe(true)
    expect(registry.has('ids.5')).toBe(false)
  })
})
