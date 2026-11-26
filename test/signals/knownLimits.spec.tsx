/**
 * Known limits of the signal hooks, one describe per limit, in the order
 * docs/api/useSignalSelector.md lists them ("Hard constraints", then
 * "Gotchas"). Sweep policy shortfalls live in the table in
 * internals/sweepPolicy/sweepPolicy.spec.ts.
 */
import { describe, it, expect } from 'vitest'
import { alienEngine } from '../../src/signals/engine'
import { createPathSignalRegistry } from '../../src/signals/pathSignalRegistry'
import {
  createLeafTracker,
  createTrackingProxy,
} from '../../src/signals/trackingProxy'
import { reconcileState } from '../../src/signals/diff'

describe('class instances are tracked by reference', () => {
  it('documented limitation: class instances are opaque leaves tracked by reference', () => {
    class User {
      constructor(public name: string) {}
    }
    const alice = new User('Alice')
    const prev = { user: alice }
    const next = { user: new User('Bob') }

    const registry = createPathSignalRegistry(alienEngine)
    const proxy = createTrackingProxy(prev, '', registry)

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
      const p = createTrackingProxy(next, '', registry)
      return p.user.name
    })
    expect(computed.get()).toBe('Bob')
    expect(runs).toBe(1)

    reconcileState(prev, next, registry, alienEngine)
    expect(computed.get()).toBe('Bob')
    expect(runs).toBe(2)
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
    const proxy = createTrackingProxy(state, '', registry)

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
    const tracker = createLeafTracker()
    registry.evaluation.tracker = tracker
    const proxy = createTrackingProxy(state, '', registry)

    expect(proxy.items[0].name).toBe('a')
    expect(proxy.selected.name).toBe('a')

    expect(tracker.accessedObjects.has('selected')).toBe(true)
    expect(tracker.traversedPaths.has('selected')).toBe(false)
  })
})
