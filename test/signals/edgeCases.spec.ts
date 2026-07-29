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
  // The proxy shell is Object.create(proto) with no internal slots.
  // Prototype methods that need internal slots ([[DateValue]], [[MapData]],
  // [[SetData]]) are returned raw and invoked with `this` = proxy → TypeError.
  // Desired fix: treat non-plain objects as opaque leaves (return unproxied).

  it.fails('supports calling Date methods on a state Date', () => {
    const createdAt = new Date(2020, 0, 1)
    const state = { createdAt }
    const registry = createPathSignalRegistry(alienEngine)
    const proxy = createTrackingProxy(state, '', registry, registry.proxyCache)

    expect(proxy.createdAt.getTime()).toBe(createdAt.getTime())
  })

  it.fails('supports calling Map methods on a state Map', () => {
    const state = { lookup: new Map([['a', 1]]) }
    const registry = createPathSignalRegistry(alienEngine)
    const proxy = createTrackingProxy(state, '', registry, registry.proxyCache)

    expect(proxy.lookup.get('a')).toBe(1)
  })

  it.fails('supports calling Set methods on a state Set', () => {
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

  it('documented limitation: class instance children are not diffed (reference-only tracking)', () => {
    class User {
      constructor(public name: string) {}
    }
    const prev = { user: new User('Alice') }
    const next = { user: new User('Bob') }

    const registry = createPathSignalRegistry(alienEngine)
    const proxy = createTrackingProxy(prev, '', registry, registry.proxyCache)
    // Establishes a signal at 'user.name' with value 'Alice'
    expect(proxy.user.name).toBe('Alice')

    reconcileState(prev, next, registry, alienEngine)

    // diff treats non-plain objects as leaves: it bumps the 'user' path but
    // never recurses, so 'user.name' silently keeps the stale value.
    // Documented guidance: keep state to plain objects and arrays.
    const nameSig = registry.getOrCreate('user.name', 'unused')
    expect(nameSig.get()).toBe('Alice')
  })
})

describe('edge cases: identity key values', () => {
  it.fails('numeric and string key values produce distinct identity paths', () => {
    // {id: 1} and {id: "1"} currently both build "items.{id:1}" —
    // entities collide in signal path space.
    expect(buildIdentityPath('items', 'id', 1)).not.toBe(
      buildIdentityPath('items', 'id', '1'),
    )
  })

  it.fails('key values containing dots do not corrupt the prefix index', () => {
    // Emails and composite keys as ids are common. All prefix bookkeeping
    // splits on '.', so "users.{id:a@b.com}.name" produces garbage
    // ancestor entries like "users.{id:a@b".
    const state = { users: [{ id: 'a@b.com', name: 'Alice' }] }
    const registry = createPathSignalRegistry(alienEngine)
    const proxy = createTrackingProxy(state, '', registry, registry.proxyCache)

    expect(proxy.users[0].name).toBe('Alice')
    expect(registry.hasPrefix('users.{id:a@b')).toBe(false)
  })

  it('removing an entity whose id contains dots still prunes its child signals', () => {
    // Verified: prune survives dotted ids. Child paths link to their parent
    // via lastIndexOf('.'), which lands on the separator AFTER the identity
    // segment ("users.{id:a@b.com}" + ".name"), so the child index is
    // correct for children. Only the identity segment's own ancestor walk
    // is corrupted (garbage prefix entries — see previous test). The dotted
    // id bug is memory/bookkeeping pollution, not broken pruning.
    const prev = { users: [{ id: 'a@b.com', name: 'Alice' }] }
    const next = { users: [] as { id: string; name: string }[] }

    const registry = createPathSignalRegistry(alienEngine)
    const proxy = createTrackingProxy(prev, '', registry, registry.proxyCache)
    expect(proxy.users[0].name).toBe('Alice')
    expect(registry.has('users.{id:a@b.com}.name')).toBe(true)

    reconcileState(prev, next, registry, alienEngine)

    expect(registry.has('users.{id:a@b.com}.name')).toBe(false)
  })
})

describe('edge cases: same-length keyed array replacement (remove + add)', () => {
  // diffArrayByKey's general path only builds `seenPrevKeys` when
  // next.length < prev.length. A same-length replacement (remove one entity,
  // add another) never prunes the removed entity's signals — components
  // subscribed to it go permanently stale.

  it.fails('prunes signals for an entity removed in a same-length replacement', () => {
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

  it.fails('temp-id → server-id swap prunes the temp entity signals', () => {
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
  // The proxyCache is keyed by target object identity only. When the same
  // raw object is reachable at two paths (state.selected = state.items[0]),
  // whichever path is proxied first wins — reads through the second path
  // register signals under the FIRST path.

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
  // Cached proxies close over the leafTracker of the evaluation that
  // CREATED them. The proxyCache is registry-wide, so a second component's
  // reads through a cached proxy record into the first component's tracker.
  // The second component then misses identity-change (ref swap) deps.

  it.fails('a second evaluation records leaf accesses into its own tracker', () => {
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
  it.fails('prune clears array identity metadata (entityMap retention)', () => {
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
  it.fails('does not re-run a computed when an untouched NaN leaf is re-diffed', () => {
    // CONFIRMED BUG: prev[key] === next[key] is false for NaN, so the diff
    // descends and calls update(path, NaN) on every dispatch that touches
    // the parent. alien-signals uses !== equality, so setting NaN over NaN
    // re-fires the signal — the selector re-runs on every such dispatch.
    // Fix: use Object.is semantics in the diff's skip check (and/or the
    // signal update).
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
