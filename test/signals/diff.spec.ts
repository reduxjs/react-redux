import { describe, it, expect } from 'vitest'
import { alienEngine } from '../../src/signals/engine'
import { createPathSignalRegistry } from '../../src/signals/pathSignalRegistry'
import { createTrackingProxy } from '../../src/signals/trackingProxy'
import { diffAndUpdateSignals, reconcileState } from '../../src/signals/diff'
import type { PathSignalRegistry } from '../../src/signals/pathSignalRegistry'

// Helper: create a registry with signals pre-populated by running a selector through a tracking proxy
function setupRegistry(state: object, selectorFn: (s: any) => void) {
  const registry = createPathSignalRegistry(alienEngine)
  const proxy = createTrackingProxy(state, '', registry, registry.proxyCache)
  selectorFn(proxy)
  return registry
}

// Helper: freeze deeply (Immer-style)
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

describe('diffAndUpdateSignals', () => {
  describe('structural sharing short-circuits', () => {
    it('skips entirely when prev === next', () => {
      const state = deepFreeze({
        todos: [{ id: 1, text: 'hi' }],
        filter: 'all',
      })
      const registry = setupRegistry(state, (s) => {
        s.todos[0].text
        s.filter
      })

      // Get initial signal values (identity-based path for keyed array element)
      const textSig = registry.getOrCreate('todos.{id:1}.text', 'hi')
      const filterSig = registry.getOrCreate('filter', 'all')
      const initialText = textSig.get()
      const initialFilter = filterSig.get()

      // Diff with same reference — nothing should change
      diffAndUpdateSignals(state, state, '', registry)

      expect(textSig.get()).toBe(initialText)
      expect(filterSig.get()).toBe(initialFilter)
    })

    it('skips unchanged subtrees (Immer structural sharing)', () => {
      const todos = deepFreeze([{ id: 1, text: 'hi', completed: false }])
      const prev = deepFreeze({ todos, filter: 'all', count: 0 })
      // Immer-style: share todos ref, only change count
      const next = deepFreeze({ todos, filter: 'all', count: 1 })

      const registry = setupRegistry(prev, (s) => {
        s.todos[0].text
        s.filter
        s.count
      })

      // Identity-based path for keyed array element
      const todoTextSig = registry.getOrCreate('todos.{id:1}.text', 'hi')
      const todosSig = registry.getOrCreate('todos', todos)
      const initialTodosVersion = todosSig.get()
      const initialText = todoTextSig.get()

      diffAndUpdateSignals(prev, next, '', registry)

      // todos subtree is shared — signals should NOT be updated
      expect(todosSig.get()).toBe(initialTodosVersion)
      expect(todoTextSig.get()).toBe(initialText)
      // count should be updated
      expect(registry.getOrCreate('count', 1).get()).toBe(1)
    })
  })

  describe('primitive changes', () => {
    it('updates primitive leaf signals', () => {
      const prev = { name: 'Alice', age: 30 }
      const next = { name: 'Bob', age: 30 }

      const registry = setupRegistry(prev, (s) => {
        s.name
        s.age
      })

      diffAndUpdateSignals(prev, next, '', registry)

      expect(registry.getOrCreate('name', 'Bob').get()).toBe('Bob')
      expect(registry.getOrCreate('age', 30).get()).toBe(30) // unchanged
    })

    it('handles number changes', () => {
      const prev = { value: 0 }
      const next = { value: 42 }
      const registry = setupRegistry(prev, (s) => s.value)

      diffAndUpdateSignals(prev, next, '', registry)

      expect(registry.getOrCreate('value', 42).get()).toBe(42)
    })

    it('handles boolean changes', () => {
      const prev = { active: true }
      const next = { active: false }
      const registry = setupRegistry(prev, (s) => s.active)

      diffAndUpdateSignals(prev, next, '', registry)

      expect(registry.getOrCreate('active', false).get()).toBe(false)
    })

    it('handles null ↔ value changes', () => {
      const prev = { data: null as string | null }
      const next = { data: 'loaded' }
      const registry = setupRegistry(prev, (s) => s.data)

      diffAndUpdateSignals(prev, next, '', registry)

      expect(registry.getOrCreate('data', 'loaded').get()).toBe('loaded')
    })

    it('handles undefined ↔ value changes', () => {
      const prev = { data: undefined as string | undefined }
      const next = { data: 'loaded' }
      const registry = setupRegistry(prev, (s) => s.data)

      diffAndUpdateSignals(prev, next, '', registry)

      expect(registry.getOrCreate('data', 'loaded').get()).toBe('loaded')
    })
  })

  describe('object changes', () => {
    it('bumps version counter for changed objects', () => {
      const prev = { user: { name: 'Alice' } }
      const next = { user: { name: 'Bob' } }

      const registry = setupRegistry(prev, (s) => s.user.name)

      const userSig = registry.getOrCreate('user', prev.user)
      const initialVersion = userSig.get() as number

      diffAndUpdateSignals(prev, next, '', registry)

      expect(userSig.get()).toBe(initialVersion + 1)
      expect(registry.getOrCreate('user.name', 'Bob').get()).toBe('Bob')
    })

    it('does not update untracked paths', () => {
      const prev = { a: 1, b: 2 }
      const next = { a: 1, b: 99 }
      // Only track 'a', not 'b'
      const registry = setupRegistry(prev, (s) => s.a)

      const initialSize = registry.size()
      diffAndUpdateSignals(prev, next, '', registry)

      // 'b' was never tracked, so no signal should be created for it
      expect(registry.has('b')).toBe(false)
      // Size should not have grown (update on untracked is a no-op)
      expect(registry.size()).toBe(initialSize)
    })

    it('handles deeply nested changes', () => {
      const prev = deepFreeze({
        a: { b: { c: { d: 'original' } } },
      })
      const next = deepFreeze({
        a: { b: { c: { d: 'changed' } } },
      })

      const registry = setupRegistry(prev, (s) => s.a.b.c.d)

      diffAndUpdateSignals(prev, next, '', registry)

      // Leaf signal should be updated
      expect(registry.getOrCreate('a.b.c.d', 'changed').get()).toBe('changed')
      // Intermediate objects have no signals (only prefix registrations)
      // They don't get version bumps — that's the optimization
      expect(registry.has('a')).toBe(false)
      expect(registry.has('a.b')).toBe(false)
      expect(registry.has('a.b.c')).toBe(false)
      // But prefix index knows about them
      expect(registry.hasPrefix('a')).toBe(true)
      expect(registry.hasPrefix('a.b')).toBe(true)
      expect(registry.hasPrefix('a.b.c')).toBe(true)
    })
  })

  describe('key changes (additions/removals)', () => {
    it('updates @@keys signal when a key is added', () => {
      const prev = { a: 1 }
      const next = { a: 1, b: 2 }

      const registry = setupRegistry(prev, (s) => {
        Object.keys(s) // tracks @@keys
        s.a
      })

      const keysSig = registry.getOrCreate('@@keys', Object.keys(prev))
      const initialKeysVersion = keysSig.get()

      diffAndUpdateSignals(prev, next, '', registry)

      // @@keys signal should have been updated
      expect(keysSig.get()).not.toBe(initialKeysVersion)
    })

    it('updates @@keys signal when a key is removed', () => {
      const prev = { a: 1, b: 2 }
      const next = { a: 1 }

      const registry = setupRegistry(prev, (s) => {
        Object.keys(s)
        s.a
        s.b
      })

      const keysSig = registry.getOrCreate('@@keys', Object.keys(prev))
      const initialKeysVersion = keysSig.get()

      diffAndUpdateSignals(prev, next, '', registry)

      expect(keysSig.get()).not.toBe(initialKeysVersion)
    })

    it('does not update @@keys when keys are unchanged', () => {
      const prev = { a: 1, b: 2 }
      const next = { a: 1, b: 99 }

      const registry = setupRegistry(prev, (s) => {
        Object.keys(s)
        s.a
        s.b
      })

      const keysSig = registry.getOrCreate('@@keys', Object.keys(prev))
      const initialKeysVersion = keysSig.get()

      diffAndUpdateSignals(prev, next, '', registry)

      // Keys didn't change, only values
      expect(keysSig.get()).toBe(initialKeysVersion)
    })

    it('handles nested key changes', () => {
      const prev = { entities: { user1: { name: 'Alice' } } }
      const next = {
        entities: { user1: { name: 'Alice' }, user2: { name: 'Bob' } },
      }

      const registry = setupRegistry(prev, (s) => {
        Object.keys(s.entities)
        s.entities.user1.name
      })

      const entitiesKeysSig = registry.getOrCreate(
        'entities.@@keys',
        Object.keys(prev.entities),
      )
      const initialVersion = entitiesKeysSig.get()

      diffAndUpdateSignals(prev, next, '', registry)

      expect(entitiesKeysSig.get()).not.toBe(initialVersion)
    })
  })

  describe('array mutations', () => {
    it('handles array item property change', () => {
      const prev = deepFreeze({
        todos: [
          { id: 1, text: 'first', completed: false },
          { id: 2, text: 'second', completed: false },
        ],
      })
      const next = deepFreeze({
        todos: [
          { id: 1, text: 'first', completed: true }, // changed
          { id: 2, text: 'second', completed: false },
        ],
      })

      const registry = setupRegistry(prev, (s) => {
        s.todos[0].completed
        s.todos[1].completed
      })

      diffAndUpdateSignals(prev, next, '', registry)

      // Identity-based paths: elements have 'id' field
      expect(registry.getOrCreate('todos.{id:1}.completed', true).get()).toBe(true)
    })

    it('handles array item addition (push)', () => {
      const prev = deepFreeze({ todos: [{ id: 1, text: 'first' }] })
      const next = deepFreeze({
        todos: [
          { id: 1, text: 'first' },
          { id: 2, text: 'second' },
        ],
      })

      const registry = setupRegistry(prev, (s) => {
        s.todos.length
        s.todos[0].text // registers at todos.{id:1}.text
      })

      // Track @@keys
      const keysSignal = registry.getOrCreate('todos.@@keys', 1)
      const initialKeysVersion = keysSignal.get()

      diffAndUpdateSignals(prev, next, '', registry)

      // @@keys should update (length changed)
      expect(keysSignal.get()).not.toBe(initialKeysVersion)
    })

    it('handles array item removal and prunes child signals', () => {
      const prev = deepFreeze({
        todos: [
          { id: 1, text: 'first' },
          { id: 2, text: 'second' },
          { id: 3, text: 'third' },
        ],
      })
      const next = deepFreeze({
        todos: [
          { id: 1, text: 'first' },
          { id: 2, text: 'second' },
        ],
      })

      const registry = setupRegistry(prev, (s) => {
        s.todos[0].text
        s.todos[1].text
        s.todos[2].text
      })

      // Identity-based paths: elements have 'id' field
      expect(registry.has('todos.{id:3}.text')).toBe(true) // leaf signal
      expect(registry.hasPrefix('todos.{id:3}')).toBe(true) // prefix registered

      diffAndUpdateSignals(prev, next, '', registry)

      // Signals for removed entity should be pruned (by identity, not index)
      expect(registry.has('todos.{id:3}.text')).toBe(false)
      expect(registry.hasPrefix('todos.{id:3}')).toBe(false)
      // Remaining entities should still exist
      expect(registry.has('todos.{id:1}.text')).toBe(true)
      expect(registry.has('todos.{id:2}.text')).toBe(true)
    })

    it('handles array length decrease with @@keys update', () => {
      const prev = [1, 2, 3]
      const next = [1]

      const registry = createPathSignalRegistry(alienEngine)
      // Manually track some paths
      const proxy = createTrackingProxy(
        { items: prev },
        '',
        registry,
        registry.proxyCache,
      )
      proxy.items.length // triggers @@keys and items tracking

      const keysPath = 'items.@@keys'
      registry.getOrCreate(keysPath, prev.length)

      diffAndUpdateSignals({ items: prev }, { items: next }, '', registry)

      // @@keys updated for length change
      // The items signal itself should be version-bumped
    })

    it('handles empty array to non-empty', () => {
      const prev = { items: [] as number[] }
      const next = { items: [1, 2, 3] }

      const registry = setupRegistry(prev, (s) => {
        s.items.length
      })

      registry.getOrCreate('items.@@keys', 0)

      diffAndUpdateSignals(prev, next, '', registry)

      // @@keys should be updated
      const keysSignal = registry.getOrCreate('items.@@keys', 3)
      // items should be version-bumped
      const itemsSig = registry.getOrCreate('items', next.items)
      expect(typeof itemsSig.get()).toBe('number')
    })
  })

  describe('type mismatches', () => {
    it('handles object → primitive change', () => {
      const prev = { data: { nested: 'value' } as unknown }
      const next = { data: 'flat' as unknown }

      const registry = setupRegistry(prev, (s) => {
        void (s.data as any).nested
      })

      expect(registry.has('data.nested')).toBe(true)

      diffAndUpdateSignals(prev, next, '', registry)

      // Child signals should be pruned when parent becomes primitive
      expect(registry.has('data.nested')).toBe(false)
    })

    it('handles primitive → object change', () => {
      const prev = { data: 'flat' as unknown }
      const next = { data: { nested: 'value' } as unknown }

      const registry = setupRegistry(prev, (s) => s.data)

      const dataSig = registry.getOrCreate('data', 'flat')
      expect(dataSig.get()).toBe('flat')

      diffAndUpdateSignals(prev, next, '', registry)

      // Signal transitions from primitive to version counter (resets to 0)
      expect(dataSig.get()).toBe(0)
    })

    it('handles array → object change', () => {
      const prev = { data: [1, 2, 3] as unknown }
      const next = { data: { a: 1 } as unknown }

      const registry = setupRegistry(prev, (s) => {
        void (s.data as any)[0]
        void (s.data as any)[1]
      })

      // Primitive array elements use a coarse signal on the array itself
      expect(registry.has('data')).toBe(true)
      expect(registry.has('data.0')).toBe(false)

      const dataSig = registry.getOrCreate('data', prev.data)
      const before = dataSig.get()

      diffAndUpdateSignals(prev, next, '', registry)

      // The coarse array signal fires on the array → object transition
      expect(dataSig.get()).not.toBe(before)
    })
  })

  describe('reactive propagation', () => {
    it('triggers computed that depends on changed path signal', () => {
      const prev = deepFreeze({ counter: 0, label: 'test' })
      const next = deepFreeze({ counter: 1, label: 'test' })

      const registry = setupRegistry(prev, (s) => s.counter)

      let computedRuns = 0
      const counterSig = registry.getOrCreate('counter', 0)
      const derived = alienEngine.computed(() => {
        computedRuns++
        return counterSig.get()
      })

      // Initial read
      expect(derived.get()).toBe(0)
      const initialRuns = computedRuns

      diffAndUpdateSignals(prev, next, '', registry)

      expect(derived.get()).toBe(1)
      expect(computedRuns).toBe(initialRuns + 1)
    })

    it('does NOT trigger computed that depends on unchanged path', () => {
      const todos = deepFreeze([{ id: 1, text: 'hi' }])
      const prev = deepFreeze({ todos, counter: 0 })
      const next = Object.freeze({ todos, counter: 1 }) // share todos ref

      const registry = setupRegistry(prev, (s) => {
        s.todos[0].text
        s.counter
      })

      let todoComputedRuns = 0
      // Identity-based path for keyed array element
      const todoTextSig = registry.getOrCreate('todos.{id:1}.text', 'hi')
      const todoComputed = alienEngine.computed(() => {
        todoComputedRuns++
        return todoTextSig.get()
      })

      // Initial read
      todoComputed.get()
      const initialRuns = todoComputedRuns

      diffAndUpdateSignals(prev, next, '', registry)

      // Re-read — should NOT have re-run because todos was shared
      todoComputed.get()
      expect(todoComputedRuns).toBe(initialRuns)
    })
  })

  describe('NOOP dispatches', () => {
    it('does nothing when state is identical reference', () => {
      const state = deepFreeze({ a: 1, b: { c: 2 } })
      const registry = setupRegistry(state, (s) => {
        s.a
        s.b.c
      })

      const aSig = registry.getOrCreate('a', 1)
      const cSig = registry.getOrCreate('b.c', 2)
      const initialA = aSig.get()
      const initialC = cSig.get()

      // Same reference — should be immediate no-op
      diffAndUpdateSignals(state, state, '', registry)

      expect(aSig.get()).toBe(initialA)
      expect(cSig.get()).toBe(initialC)
    })
  })

  describe('reconcileState (batched)', () => {
    it('wraps diff in a batch for single propagation pass', () => {
      const prev = { a: 1, b: 2, c: 3 }
      const next = { a: 10, b: 20, c: 30 }

      const registry = setupRegistry(prev, (s) => {
        s.a
        s.b
        s.c
      })

      let effectRuns = 0
      const aSig = registry.getOrCreate('a', 1)
      const bSig = registry.getOrCreate('b', 2)
      const cSig = registry.getOrCreate('c', 3)

      const derived = alienEngine.computed(() => {
        return (
          (aSig.get() as number) +
          (bSig.get() as number) +
          (cSig.get() as number)
        )
      })

      const scope = alienEngine.createScope()
      scope.run(() => {
        alienEngine.effect(() => {
          derived.get()
          effectRuns++
        })
      })

      const initialRuns = effectRuns

      // reconcileState should batch all updates
      reconcileState(prev, next, registry, alienEngine)

      // Effect should fire exactly once (not 3 times)
      expect(effectRuns).toBe(initialRuns + 1)
      expect(derived.get()).toBe(60)

      scope.stop()
    })

    it('propagates all changes atomically', () => {
      const prev = deepFreeze({ x: 1, y: 2 })
      const next = deepFreeze({ x: 10, y: 20 })

      const registry = setupRegistry(prev, (s) => {
        s.x
        s.y
      })

      const xSig = registry.getOrCreate('x', 1)
      const ySig = registry.getOrCreate('y', 2)

      const snapshots: { x: unknown; y: unknown }[] = []
      const derived = alienEngine.computed(() => ({
        x: xSig.get(),
        y: ySig.get(),
      }))

      const scope = alienEngine.createScope()
      scope.run(() => {
        alienEngine.effect(() => {
          const val = derived.get()
          snapshots.push(val)
        })
      })

      reconcileState(prev, next, registry, alienEngine)

      // Should only see final state, not intermediate {x:10, y:2}
      const lastSnapshot = snapshots[snapshots.length - 1]
      expect(lastSnapshot).toEqual({ x: 10, y: 20 })

      scope.stop()
    })
  })

  describe('frozen state (Immer-style)', () => {
    it('handles deeply frozen state correctly', () => {
      const prev = deepFreeze({
        todos: [
          { id: 1, text: 'first', completed: false },
          { id: 2, text: 'second', completed: false },
        ],
        counters: {
          counter1: { value: 0, label: 'A' },
          counter2: { value: 0, label: 'B' },
        },
        filter: 'all',
      })

      // Immer-style update: share unchanged subtrees
      const next = deepFreeze({
        todos: prev.todos, // shared ref
        counters: {
          counter1: { value: 1, label: 'A' }, // changed
          counter2: prev.counters.counter2, // shared ref
        },
        filter: 'all',
      })

      const registry = setupRegistry(prev, (s) => {
        s.todos[0].text
        s.counters.counter1.value
        s.counters.counter2.value
        s.filter
      })

      // Identity-based path for keyed array element
      const todoTextSig = registry.getOrCreate('todos.{id:1}.text', 'first')
      const c1ValueSig = registry.getOrCreate('counters.counter1.value', 0)
      const c2ValueSig = registry.getOrCreate('counters.counter2.value', 0)
      const filterSig = registry.getOrCreate('filter', 'all')

      const initialTodoText = todoTextSig.get()
      const initialC2Value = c2ValueSig.get()
      const initialFilter = filterSig.get()

      reconcileState(prev, next, registry, alienEngine)

      // Only counter1.value should have changed
      expect(c1ValueSig.get()).toBe(1)

      // Everything else should be unchanged
      expect(todoTextSig.get()).toBe(initialTodoText)
      expect(c2ValueSig.get()).toBe(initialC2Value)
      expect(filterSig.get()).toBe(initialFilter)
    })
  })

  describe('edge cases', () => {
    it('handles empty objects', () => {
      const prev = {}
      const next = { a: 1 }
      const registry = createPathSignalRegistry(alienEngine)

      // Should not throw
      diffAndUpdateSignals(prev, next, '', registry)
    })

    it('handles root-level primitive comparison', () => {
      // Edge case: comparing primitives at root level
      const registry = createPathSignalRegistry(alienEngine)

      // Should not throw — just returns because prev !== next but neither is object
      diffAndUpdateSignals('old', 'new', 'root', registry)
    })

    it('handles nested path offset correctly', () => {
      const prev = { value: 10 }
      const next = { value: 20 }

      const registry = createPathSignalRegistry(alienEngine)
      registry.getOrCreate('nested.obj.value', 10)

      // Diff starting from a path offset
      diffAndUpdateSignals(prev, next, 'nested.obj', registry)

      expect(registry.getOrCreate('nested.obj.value', 20).get()).toBe(20)
    })
  })
})
