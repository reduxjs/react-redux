import { describe, it, expect } from 'vitest'
import { alienEngine } from '../../src/signals/engine'
import { createPathSignalRegistry } from '../../src/signals/pathSignalRegistry'
import type { RegistryStats } from '../../src/signals/pathSignalRegistry'
import type { ReactiveSignal } from '../../src/signals/types'

const EMPTY_STATS: RegistryStats = {
  signals: 0,
  prefixCounts: 0,
  prefixOnlyPaths: 0,
  childIndex: 0,
  arrayMetas: 0,
  columnsByArray: 0,
  structuresByArray: 0,
  segmentSubs: 0,
}

/** Subscribe an effect to a signal; stopping the scope drops the last
 *  subscriber, which makes the signal call back into registry.release. */
function watch(sig: ReactiveSignal<unknown>) {
  const scope = alienEngine.createScope()
  scope.run(() => {
    alienEngine.effect(() => {
      sig.get()
    })
  })
  return scope
}

describe('PathSignalRegistry', () => {
  function createRegistry() {
    return createPathSignalRegistry(alienEngine)
  }

  describe('getOrCreate', () => {
    it('creates a signal for a primitive value', () => {
      const registry = createRegistry()
      const sig = registry.getOrCreate('filter', 'all')
      expect(sig.get()).toBe('all')
      expect(registry.size()).toBe(1)
    })

    it('returns existing signal on second access', () => {
      const registry = createRegistry()
      const sig1 = registry.getOrCreate('filter', 'all')
      const sig2 = registry.getOrCreate('filter', 'all')
      expect(sig1).toBe(sig2)
      expect(registry.size()).toBe(1)
    })

    it('creates version counter (0) for object values', () => {
      const registry = createRegistry()
      const obj = Object.freeze({ id: 1, text: 'hello' })
      const sig = registry.getOrCreate('todos.0', obj)
      expect(sig.get()).toBe(0) // version counter, not the object
    })

    it('creates version counter (0) for array values', () => {
      const registry = createRegistry()
      const arr = Object.freeze([1, 2, 3])
      const sig = registry.getOrCreate('todos', arr)
      expect(sig.get()).toBe(0) // version counter
    })

    it('stores null as a primitive (not version counter)', () => {
      const registry = createRegistry()
      const sig = registry.getOrCreate('value', null)
      expect(sig.get()).toBe(null)
    })

    it('creates independent signals for different paths', () => {
      const registry = createRegistry()
      registry.getOrCreate('a', 1)
      registry.getOrCreate('b', 2)
      registry.getOrCreate('c.d', 3)
      expect(registry.size()).toBe(3)
    })
  })

  describe('update', () => {
    it('updates primitive signal to new value', () => {
      const registry = createRegistry()
      const sig = registry.getOrCreate('filter', 'all')
      registry.update('filter', 'active')
      expect(sig.get()).toBe('active')
    })

    it('bumps version counter for object values', () => {
      const registry = createRegistry()
      const sig = registry.getOrCreate('todos.0', { id: 1 })
      expect(sig.get()).toBe(0)

      registry.update('todos.0', { id: 1, text: 'changed' })
      expect(sig.get()).toBe(1)

      registry.update('todos.0', { id: 1, text: 'again' })
      expect(sig.get()).toBe(2)
    })

    it('bumps version counter for array values', () => {
      const registry = createRegistry()
      const sig = registry.getOrCreate('todos', [])
      expect(sig.get()).toBe(0)

      registry.update('todos', [{ id: 1 }])
      expect(sig.get()).toBe(1)
    })

    it('does nothing for untracked paths', () => {
      const registry = createRegistry()
      // No signal created for 'unknown' — should not throw
      registry.update('unknown', 'value')
      expect(registry.size()).toBe(0)
    })

    it('triggers reactive updates through signal engine', () => {
      const registry = createRegistry()
      const sig = registry.getOrCreate('count', 0)

      let effectSeen = -1
      const scope = alienEngine.createScope()
      scope.run(() => {
        alienEngine.effect(() => {
          effectSeen = sig.get() as number
        })
      })
      expect(effectSeen).toBe(0)

      registry.update('count', 5)
      expect(effectSeen).toBe(5)

      scope.stop()
    })

    it('batched updates trigger single propagation', () => {
      const registry = createRegistry()
      const sig1 = registry.getOrCreate('a', 0)
      const sig2 = registry.getOrCreate('b', 0)

      const c = alienEngine.computed(
        () => (sig1.get() as number) + (sig2.get() as number),
      )
      let effectCount = 0
      const scope = alienEngine.createScope()
      scope.run(() => {
        alienEngine.effect(() => {
          c.get()
          effectCount++
        })
      })
      effectCount = 0

      alienEngine.batch(() => {
        registry.update('a', 1)
        registry.update('b', 1)
      })

      expect(effectCount).toBe(1)
      expect(c.get()).toBe(2)

      scope.stop()
    })
  })

  describe('prune', () => {
    it('removes the exact path', () => {
      const registry = createRegistry()
      registry.getOrCreate('todos.0', { id: 1 })
      expect(registry.size()).toBe(1)

      registry.prune('todos.0')
      expect(registry.size()).toBe(0)
    })

    it('removes all child paths', () => {
      const registry = createRegistry()
      registry.getOrCreate('todos', [])
      registry.getOrCreate('todos.0', { id: 1 })
      registry.getOrCreate('todos.0.text', 'hello')
      registry.getOrCreate('todos.0.completed', false)
      registry.getOrCreate('todos.1', { id: 2 })
      registry.getOrCreate('todos.1.text', 'world')
      expect(registry.size()).toBe(6)

      registry.prune('todos.0')
      expect(registry.size()).toBe(3) // todos, todos.1, todos.1.text remain
      expect(registry.has('todos')).toBe(true)
      expect(registry.has('todos.0')).toBe(false)
      expect(registry.has('todos.0.text')).toBe(false)
      expect(registry.has('todos.0.completed')).toBe(false)
      expect(registry.has('todos.1')).toBe(true)
    })

    it('does not remove sibling paths with similar prefix', () => {
      const registry = createRegistry()
      registry.getOrCreate('todo', 'a')
      registry.getOrCreate('todos', [])
      registry.getOrCreate('todos.0', { id: 1 })

      registry.prune('todo')
      expect(registry.size()).toBe(2) // todos and todos.0 remain
      expect(registry.has('todo')).toBe(false)
      expect(registry.has('todos')).toBe(true)
      expect(registry.has('todos.0')).toBe(true)
    })

    it('prunes entire subtree', () => {
      const registry = createRegistry()
      registry.getOrCreate('a', 1)
      registry.getOrCreate('b', 2)
      registry.getOrCreate('b.c', 3)
      registry.getOrCreate('b.c.d', 4)
      registry.getOrCreate('b.e', 5)

      registry.prune('b')
      expect(registry.size()).toBe(1) // only 'a' remains
      expect(registry.has('a')).toBe(true)
    })
  })

  describe('has', () => {
    it('returns false for non-existent path', () => {
      const registry = createRegistry()
      expect(registry.has('nonexistent')).toBe(false)
    })

    it('returns true after getOrCreate', () => {
      const registry = createRegistry()
      registry.getOrCreate('path', 42)
      expect(registry.has('path')).toBe(true)
    })

    it('returns false after prune', () => {
      const registry = createRegistry()
      registry.getOrCreate('path', 42)
      registry.prune('path')
      expect(registry.has('path')).toBe(false)
    })
  })

  describe('ensurePrefix / hasPrefix', () => {
    it('hasPrefix is true for a signal path and every ancestor', () => {
      const registry = createRegistry()
      registry.getOrCreate('a.b.c', 1)
      expect(registry.hasPrefix('a.b.c')).toBe(true)
      expect(registry.hasPrefix('a.b')).toBe(true)
      expect(registry.hasPrefix('a')).toBe(true)
      expect(registry.hasPrefix('a.b.c.d')).toBe(false)
      expect(registry.hasPrefix('x')).toBe(false)
    })

    it('ensurePrefix registers a prefix without creating a signal', () => {
      const registry = createRegistry()
      registry.ensurePrefix('a.b')
      expect(registry.hasPrefix('a.b')).toBe(true)
      expect(registry.hasPrefix('a')).toBe(true)
      expect(registry.has('a.b')).toBe(false)
      expect(registry.size()).toBe(0)
    })

    it('ensurePrefix is idempotent: prune fully clears double registration', () => {
      const registry = createRegistry()
      registry.ensurePrefix('a.b')
      registry.ensurePrefix('a.b')
      registry.prune('a.b')
      expect(registry.hasPrefix('a.b')).toBe(false)
      expect(registry.hasPrefix('a')).toBe(false)
      expect(registry.debugStats()).toEqual(EMPTY_STATS)
    })

    it('getOrCreate after ensurePrefix does not double-count prefixes', () => {
      const registry = createRegistry()
      registry.ensurePrefix('a.b')
      registry.getOrCreate('a.b', { x: 1 })
      registry.prune('a.b')
      // One prune must fully clear the accounting; a leftover prefix
      // count here would mean the path was counted twice.
      expect(registry.hasPrefix('a.b')).toBe(false)
      expect(registry.hasPrefix('a')).toBe(false)
      expect(registry.debugStats()).toEqual(EMPTY_STATS)
    })
  })

  describe('pruneChildren', () => {
    it('removes descendants but keeps the path itself', () => {
      const registry = createRegistry()
      const parentSig = registry.getOrCreate('obj', { a: 1, b: { c: 2 } })
      registry.getOrCreate('obj.a', 1)
      registry.getOrCreate('obj.b', { c: 2 })
      registry.getOrCreate('obj.b.c', 2)

      registry.pruneChildren('obj')

      expect(registry.has('obj')).toBe(true)
      expect(registry.has('obj.a')).toBe(false)
      expect(registry.has('obj.b')).toBe(false)
      expect(registry.has('obj.b.c')).toBe(false)
      // The parent signal survives untouched (still version 0).
      expect(parentSig.get()).toBe(0)
    })

    it('fires the pruned child signals so dependents re-run', () => {
      const registry = createRegistry()
      registry.getOrCreate('obj', {})
      const childSig = registry.getOrCreate('obj.name', 'x')

      let runs = 0
      const c = alienEngine.computed(() => {
        runs++
        return registry.has('obj.name')
          ? registry.getOrCreate('obj.name', 'x').get()
          : 'gone'
      })
      expect(c.get()).toBe('x')
      expect(runs).toBe(1)

      registry.pruneChildren('obj')
      expect(c.get()).toBe('gone')
      expect(runs).toBe(2)

      void childSig
    })

    it('is a no-op for a path with no children', () => {
      const registry = createRegistry()
      registry.getOrCreate('leaf', 1)
      registry.pruneChildren('leaf')
      expect(registry.has('leaf')).toBe(true)
      expect(registry.size()).toBe(1)
    })
  })

  describe('release (unwatched callback) and flushReleases', () => {
    it('dropping the last subscriber removes the signal and its prefixes', () => {
      const registry = createRegistry()
      const sig = registry.getOrCreate('a.b.c', 1)
      const scope = watch(sig)
      expect(registry.has('a.b.c')).toBe(true)

      scope.stop()

      expect(registry.has('a.b.c')).toBe(false)
      // hasPrefix flushes pending releases before answering.
      expect(registry.hasPrefix('a.b.c')).toBe(false)
      expect(registry.hasPrefix('a')).toBe(false)
      expect(registry.debugStats()).toEqual(EMPTY_STATS)
    })

    it('a never-watched signal stays registered', () => {
      const registry = createRegistry()
      registry.getOrCreate('a', 1)
      expect(registry.debugStats().signals).toBe(1)
    })

    it('releasing a parent keeps a still-watched child alive, then the child unlinks everything', () => {
      const registry = createRegistry()
      const parent = registry.getOrCreate('a.b', { c: 1 })
      const child = registry.getOrCreate('a.b.c', 1)
      const parentScope = watch(parent)
      const childScope = watch(child)

      parentScope.stop()
      expect(registry.has('a.b')).toBe(false)
      expect(registry.has('a.b.c')).toBe(true)
      // The child still holds the shared prefixes up.
      expect(registry.hasPrefix('a.b')).toBe(true)
      expect(registry.hasPrefix('a')).toBe(true)

      childScope.stop()
      expect(registry.hasPrefix('a')).toBe(false)
      expect(registry.debugStats()).toEqual(EMPTY_STATS)
    })

    it('a subtree of releases clears prefix-only ancestors too', () => {
      const registry = createRegistry()
      registry.ensurePrefix('todos')
      const s0 = registry.getOrCreate('todos.0.text', 'a')
      const s1 = registry.getOrCreate('todos.1.text', 'b')
      const scope0 = watch(s0)
      const scope1 = watch(s1)

      scope0.stop()
      scope1.stop()

      // The ensurePrefix registration has no signal, so no unwatched
      // callback will ever fire for it — flushReleases must clear it
      // once the last signal below it is gone.
      expect(registry.hasPrefix('todos')).toBe(false)
      expect(registry.debugStats()).toEqual(EMPTY_STATS)
    })

    it('a signal resurrected before the flush is not evicted', () => {
      const registry = createRegistry()
      const first = registry.getOrCreate('a.b', 1)
      const scope = watch(first)
      scope.stop()
      // Release already ran (signal is gone from the map)…
      expect(registry.has('a.b')).toBe(false)

      // …but the deferred flush has not. Recreating the path now must
      // survive that flush.
      const second = registry.getOrCreate('a.b', 2)
      expect(registry.has('a.b')).toBe(true)
      expect(registry.hasPrefix('a')).toBe(true)
      expect(second.get()).toBe(2)
      expect(second).not.toBe(first)
    })

    it('release ignores a stale node after prune + recreate', () => {
      const registry = createRegistry()
      const stale = registry.getOrCreate('x', 1)
      registry.prune('x')
      const live = registry.getOrCreate('x', 2)

      // Simulate the stale node's late unwatched callback.
      registry.release('x', stale)

      expect(registry.has('x')).toBe(true)
      expect(registry.getOrCreate('x', 0)).toBe(live)
    })
  })

  describe('array metadata', () => {
    it('setArrayMeta / getArrayMeta round-trips and prune clears it', () => {
      const registry = createRegistry()
      const meta = { keyField: 'id', entityMap: new Map() }
      registry.setArrayMeta('todos', meta)
      expect(registry.getArrayMeta('todos')).toBe(meta)
      expect(registry.getArrayMeta('other')).toBeUndefined()

      registry.getOrCreate('todos', [])
      registry.prune('todos')
      expect(registry.getArrayMeta('todos')).toBeUndefined()
    })
  })

  describe('column signals', () => {
    it('trackColumn registers the prop and creates one signal per column', () => {
      const registry = createRegistry()
      const sig1 = registry.trackColumn('todos', 'text')
      const sig2 = registry.trackColumn('todos', 'text')
      expect(sig1).toBe(sig2)
      expect(registry.getTrackedColumns('todos')).toEqual(new Set(['text']))
      expect(registry.getTrackedColumns('other')).toBeUndefined()
    })

    it('bumpColumn increments the column signal version', () => {
      const registry = createRegistry()
      const sig = registry.trackColumn('todos', 'text')
      expect(sig.get()).toBe(0)
      registry.bumpColumn('todos', 'text')
      expect(sig.get()).toBe(1)
    })

    it('bumpColumn for an untracked column is a no-op', () => {
      const registry = createRegistry()
      registry.bumpColumn('todos', 'text')
      expect(registry.size()).toBe(0)
    })

    it('releasing a column signal drops the prop from the tracked set', () => {
      const registry = createRegistry()
      const sig = registry.trackColumn('todos', 'text')
      const scope = watch(sig)
      expect(registry.getTrackedColumns('todos')).toEqual(new Set(['text']))

      scope.stop()

      // Without this cleanup diffArray would keep shallow-comparing a
      // column nobody reads.
      expect(registry.getTrackedColumns('todos')).toBeUndefined()
      expect(registry.debugStats()).toEqual(EMPTY_STATS)
    })

    it('releasing one column leaves other tracked columns intact', () => {
      const registry = createRegistry()
      const textSig = registry.trackColumn('todos', 'text')
      registry.trackColumn('todos', 'done')
      const scope = watch(textSig)

      scope.stop()

      expect(registry.getTrackedColumns('todos')).toEqual(new Set(['done']))
    })

    it('release matches encoded column paths back to raw props', () => {
      const registry = createRegistry()
      // A prop containing '.' gets percent-encoded in the path key but
      // stays raw in the tracked set; release has to bridge the two.
      const sig = registry.trackColumn('todos', 'a.b')
      const scope = watch(sig)
      expect(registry.getTrackedColumns('todos')).toEqual(new Set(['a.b']))

      scope.stop()

      expect(registry.getTrackedColumns('todos')).toBeUndefined()
    })

    it('prune(arrayPath) removes column signals and tracking', () => {
      const registry = createRegistry()
      registry.getOrCreate('todos', [])
      registry.trackColumn('todos', 'text')

      registry.prune('todos')

      expect(registry.getTrackedColumns('todos')).toBeUndefined()
      expect(registry.debugStats()).toEqual(EMPTY_STATS)
    })
  })

  describe('structural signals', () => {
    it('trackStructure registers the kind and creates one signal per kind', () => {
      const registry = createRegistry()
      const sig1 = registry.trackStructure('todos', 'append')
      const sig2 = registry.trackStructure('todos', 'append')
      expect(sig1).toBe(sig2)
      expect(registry.getTrackedStructures('todos')).toEqual(
        new Set(['append']),
      )
    })

    it('bumpStructure fires only the matching kind', () => {
      const registry = createRegistry()
      const appendSig = registry.trackStructure('todos', 'append')
      const removeSig = registry.trackStructure('todos', 'remove')

      registry.bumpStructure('todos', 'append')

      expect(appendSig.get()).toBe(1)
      expect(removeSig.get()).toBe(0)
    })

    it('bumpStructure for an untracked kind is a no-op', () => {
      const registry = createRegistry()
      registry.bumpStructure('todos', 'append')
      expect(registry.size()).toBe(0)
    })

    it('releasing a structural signal drops the kind from the tracked set', () => {
      const registry = createRegistry()
      const appendSig = registry.trackStructure('todos', 'append')
      registry.trackStructure('todos', 'remove')
      const scope = watch(appendSig)

      scope.stop()

      expect(registry.getTrackedStructures('todos')).toEqual(
        new Set(['remove']),
      )
    })

    it('releasing the last structural signal clears the array entry', () => {
      const registry = createRegistry()
      const sig = registry.trackStructure('todos', 'insertOrReorder')
      const scope = watch(sig)

      scope.stop()

      expect(registry.getTrackedStructures('todos')).toBeUndefined()
      expect(registry.debugStats()).toEqual(EMPTY_STATS)
    })
  })

  describe('debugStats', () => {
    it('reports counts for every internal structure', () => {
      const registry = createRegistry()
      registry.getOrCreate('a.b', 1)
      registry.ensurePrefix('c')
      registry.setArrayMeta('todos', { keyField: 'id', entityMap: new Map() })
      registry.trackColumn('todos', 'text')
      registry.trackStructure('todos', 'append')

      expect(registry.debugStats()).toEqual({
        // a.b + column signal + structure signal
        signals: 3,
        // a, a.b, c, todos, todos.{*}, todos.{*}.text, todos.@@append
        prefixCounts: 7,
        // c and todos.{*}
        prefixOnlyPaths: 2,
        // a→a.b, todos→(children), todos.{*}→(column)
        childIndex: 3,
        arrayMetas: 1,
        columnsByArray: 1,
        structuresByArray: 1,
        segmentSubs: 0,
      })
    })
  })
})
