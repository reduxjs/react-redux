import { describe, it, expect } from 'vitest'
import { alienEngine } from '../../../src/signals/engine'
import { createTrackingProxy } from '../../../src/signals/trackingProxy'
import { diffAndUpdateSignals, reconcileState } from '../../../src/signals/diff'
import { createRegistry, setupRegistry } from '../helpers/registry'
import { deepFreeze } from '../helpers/state'

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
      const countSig = registry.getOrCreate('count', 0)
      const initialTodosVersion = todosSig.get()
      const initialText = todoTextSig.get()

      diffAndUpdateSignals(prev, next, '', registry)

      // todos subtree is shared — signals should NOT be updated
      expect(todosSig.get()).toBe(initialTodosVersion)
      expect(todoTextSig.get()).toBe(initialText)
      // count should be updated
      expect(countSig.get()).toBe(1)
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

      const nameSig = registry.getOrCreate('name', 'Alice')
      const ageSig = registry.getOrCreate('age', 30)

      diffAndUpdateSignals(prev, next, '', registry)

      expect(nameSig.get()).toBe('Bob')
      expect(ageSig.get()).toBe(30) // unchanged
    })

    it('handles number changes', () => {
      const prev = { value: 0 }
      const next = { value: 42 }
      const registry = setupRegistry(prev, (s) => s.value)

      const valueSig = registry.getOrCreate('value', 0)

      diffAndUpdateSignals(prev, next, '', registry)

      expect(valueSig.get()).toBe(42)
    })

    it('handles boolean changes', () => {
      const prev = { active: true }
      const next = { active: false }
      const registry = setupRegistry(prev, (s) => s.active)

      const activeSig = registry.getOrCreate('active', true)

      diffAndUpdateSignals(prev, next, '', registry)

      expect(activeSig.get()).toBe(false)
    })

    it('handles null ↔ value changes', () => {
      const prev = { data: null as string | null }
      const next = { data: 'loaded' }
      const registry = setupRegistry(prev, (s) => s.data)

      const dataSig = registry.getOrCreate('data', null)

      diffAndUpdateSignals(prev, next, '', registry)

      expect(dataSig.get()).toBe('loaded')
    })

    it('handles undefined ↔ value changes', () => {
      const prev = { data: undefined as string | undefined }
      const next = { data: 'loaded' }
      const registry = setupRegistry(prev, (s) => s.data)

      const dataSig = registry.getOrCreate('data', undefined)

      diffAndUpdateSignals(prev, next, '', registry)

      expect(dataSig.get()).toBe('loaded')
    })
  })

  describe('object changes', () => {
    it('bumps version counter for changed objects', () => {
      const prev = { user: { name: 'Alice' } }
      const next = { user: { name: 'Bob' } }

      const registry = setupRegistry(prev, (s) => s.user.name)

      const userSig = registry.getOrCreate('user', prev.user)
      const nameSig = registry.getOrCreate('user.name', 'Alice')
      const initialVersion = userSig.get() as number

      diffAndUpdateSignals(prev, next, '', registry)

      expect(userSig.get()).toBe(initialVersion + 1)
      expect(nameSig.get()).toBe('Bob')
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

      const leafSig = registry.getOrCreate('a.b.c.d', 'original')

      diffAndUpdateSignals(prev, next, '', registry)

      // Leaf signal should be updated
      expect(leafSig.get()).toBe('changed')
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

      // Identity-based paths: elements have 'id' field
      const completedSig = registry.getOrCreate('todos.{id:1}.completed', false)
      const otherCompletedSig = registry.getOrCreate(
        'todos.{id:2}.completed',
        false,
      )

      diffAndUpdateSignals(prev, next, '', registry)

      expect(completedSig.get()).toBe(true)
      expect(otherCompletedSig.get()).toBe(false) // unchanged
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

      const registry = createRegistry()
      // Manually track some paths
      const proxy = createTrackingProxy({ items: prev }, '', registry)
      proxy.items.length // triggers @@keys and items tracking

      const keysSig = registry.getOrCreate('items.@@keys', prev.length)
      const initialKeysVersion = keysSig.get()

      diffAndUpdateSignals({ items: prev }, { items: next }, '', registry)

      // @@keys updated for length change
      expect(keysSig.get()).not.toBe(initialKeysVersion)
    })

    it('handles empty array to non-empty', () => {
      const prev = { items: [] as number[] }
      const next = { items: [1, 2, 3] }

      const registry = setupRegistry(prev, (s) => {
        s.items.length
      })

      const keysSig = registry.getOrCreate('items.@@keys', 0)
      const itemsSig = registry.getOrCreate('items', prev.items)
      const initialKeysVersion = keysSig.get()
      const initialItemsVersion = itemsSig.get()

      diffAndUpdateSignals(prev, next, '', registry)

      // @@keys should be updated and items version-bumped
      expect(keysSig.get()).not.toBe(initialKeysVersion)
      expect(itemsSig.get()).not.toBe(initialItemsVersion)
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

    it('does not trigger computed that depends on unchanged path', () => {
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
      const registry = createRegistry()

      expect(() => diffAndUpdateSignals(prev, next, '', registry)).not.toThrow()
      // Nothing was tracked, so nothing should be created
      expect(registry.size()).toBe(0)
    })

    it('handles root-level primitive comparison', () => {
      // Edge case: comparing primitives at root level
      const registry = createRegistry()
      const rootSig = registry.getOrCreate('root', 'old')

      expect(() =>
        diffAndUpdateSignals('old', 'new', 'root', registry),
      ).not.toThrow()
      // A tracked signal at the offset path gets the new primitive value
      expect(rootSig.get()).toBe('new')
    })

    it('handles nested path offset correctly', () => {
      const prev = { value: 10 }
      const next = { value: 20 }

      const registry = createRegistry()
      const valueSig = registry.getOrCreate('nested.obj.value', 10)

      // Diff starting from a path offset
      diffAndUpdateSignals(prev, next, 'nested.obj', registry)

      expect(valueSig.get()).toBe(20)
    })
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

  describe('consecutive diffs', () => {
    it('matches moved elements by key on the first diff after proxy access', () => {
      const prev = deepFreeze({
        items: [
          { id: 1, name: 'Alice' },
          { id: 2, name: 'Bob' },
        ],
      })
      const next = deepFreeze({
        items: [
          { id: 2, name: 'Bobby' },
          { id: 1, name: 'Alice' },
        ],
      })

      const registry = setupRegistry(prev, (s) => {
        s.items[0].name
        s.items[1].name
      })
      const alice = registry.getOrCreate('items.{id:1}.name', 'Alice')
      const bob = registry.getOrCreate('items.{id:2}.name', 'Bob')

      diffAndUpdateSignals(prev, next, '', registry)

      expect(alice.get()).toBe('Alice')
      expect(bob.get()).toBe('Bobby')
    })

    it('matches against the latest state after append, update and removal', () => {
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

      diffAndUpdateSignals(state1, state2, '', registry)
      expect(registry.getOrCreate('items.{id:2}.name', 'Bobby').get()).toBe(
        'Bobby',
      )

      diffAndUpdateSignals(state2, state3, '', registry)
      expect(registry.has('items.{id:1}.name')).toBe(true)
      expect(registry.has('items.{id:2}.name')).toBe(false)
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
      expect(() => diffAndUpdateSignals(prev, next, '', registry)).not.toThrow()
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

      expect(
        registry.getOrCreate('items.{id:0}.name', 'Zero Updated').get(),
      ).toBe('Zero Updated')
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
        registry.getOrCreate('data.nested.items.{id:a}.val', 1).get(),
      ).toBe(1)
      expect(
        registry.getOrCreate('data.nested.items.{id:b}.val', 99).get(),
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

      expect(registry.getOrCreate('items.{id:1}.profile.age', 31).get()).toBe(
        31,
      )
      expect(registry.getOrCreate('items.{id:2}.profile.age', 25).get()).toBe(
        25,
      )
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

describe('NaN leaf values', () => {
  it('does not re-run a computed when an untouched NaN leaf is re-diffed', () => {
    // The diff's skip checks use Object.is semantics for NaN (self-inequal
    // values on both sides are treated as equal), so an untouched NaN leaf
    // no longer re-fires its signal on every dispatch that touches the
    // parent object.
    const prev = { metrics: { ratio: NaN, count: 1 } }
    const next = { metrics: { ratio: NaN, count: 2 } }

    const registry = createRegistry()
    const proxy = createTrackingProxy(prev, '', registry)

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

describe('same-length keyed array replacement (remove + add)', () => {
  // diffArrayByKey's general path tracks seen keys unconditionally, so a
  // same-length replacement (remove one entity, add another) prunes the
  // removed entity's signals even though the array length is unchanged.

  it('prunes signals for an entity removed in a same-length replacement', () => {
    const shared = { id: 1, text: 'first' }
    const prev = { items: [shared, { id: 2, text: 'second' }] }
    const next = { items: [shared, { id: 9, text: 'ninth' }] }

    const registry = createRegistry()
    const proxy = createTrackingProxy(prev, '', registry)
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

    const registry = createRegistry()
    const proxy = createTrackingProxy(prev, '', registry)
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

    const registry = createRegistry()
    const proxy = createTrackingProxy(prev, '', registry)
    expect(proxy.items[1].text).toBe('second')

    const removeSig = registry.trackStructure('items', 'remove')
    const before = removeSig.get()

    reconcileState(prev, next, registry, alienEngine)

    expect(removeSig.get()).not.toBe(before)
  })
})
