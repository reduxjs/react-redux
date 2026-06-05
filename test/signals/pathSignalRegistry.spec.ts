import { describe, it, expect } from 'vitest'
import { alienEngine } from '../../src/signals/engine'
import { createPathSignalRegistry } from '../../src/signals/pathSignalRegistry'

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

      const c = alienEngine.computed(() => (sig1.get() as number) + (sig2.get() as number))
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
})
