import { describe, it, expect, vi } from 'vitest'
import {
  createLeafTracker,
  createTrackingProxy,
} from '../../../src/signals/trackingProxy'
import { getProxyPath, unwrap } from '../../../src/signals/proxyIdentity'
import { reconcileState } from '../../../src/signals/diff'
import { alienEngine } from '../../../src/signals/engine'
import type { PathSignalRegistry } from '../../../src/signals/pathSignalRegistry'
import { createRegistry, setupRegistry } from '../helpers/registry'
import { deepFreeze } from '../helpers/state'

describe('createTrackingProxy', () => {
  // ─── Basic property access ───

  it('returns primitive values from the underlying object', () => {
    const state = { name: 'Alice', age: 30 }
    const registry = createRegistry()
    const proxy = createTrackingProxy(state, '', registry)

    expect(proxy.name).toBe('Alice')
    expect(proxy.age).toBe(30)
  })

  it('creates signals for accessed primitive paths', () => {
    const state = { name: 'Alice', age: 30 }
    const registry = createRegistry()
    const proxy = createTrackingProxy(state, '', registry)

    expect(registry.has('name')).toBe(false)
    proxy.name
    expect(registry.has('name')).toBe(true)

    expect(registry.has('age')).toBe(false)
    proxy.age
    expect(registry.has('age')).toBe(true)
  })

  it('rejects property definitions and prototype changes on state', () => {
    const state = { user: { name: 'Alice' }, items: [1, 2] }
    const registry = createRegistry()
    const proxy = createTrackingProxy(state, '', registry)

    expect(() => Object.defineProperty(proxy, 'extra', { value: 1 })).toThrow(
      /define property 'extra'/,
    )
    expect(() =>
      Object.defineProperty(proxy.user, 'name', { value: 'Bob' }),
    ).toThrow(/define property 'name'/)
    expect(() => Object.setPrototypeOf(proxy.user, null)).toThrow(
      /change the prototype of/,
    )
    expect(() => Object.setPrototypeOf(proxy.items, null)).toThrow(
      /change the prototype of/,
    )
    expect(state.user.name).toBe('Alice')
    expect('extra' in state).toBe(false)
    expect(Object.getPrototypeOf(state.user)).toBe(Object.prototype)
    expect(Object.getPrototypeOf(state.items)).toBe(Array.prototype)
  })

  it('does not create signals for unaccessed paths', () => {
    const state = { name: 'Alice', age: 30, email: 'alice@example.com' }
    const registry = createRegistry()
    const proxy = createTrackingProxy(state, '', registry)

    proxy.name // access only name
    expect(registry.has('name')).toBe(true)
    expect(registry.has('age')).toBe(false)
    expect(registry.has('email')).toBe(false)
  })

  // ─── Nested objects ───

  it('returns a tracking proxy for nested objects (not raw value)', () => {
    const state = { user: { name: 'Alice' } }
    const registry = createRegistry()
    const proxy = createTrackingProxy(state, '', registry)

    const userProxy = proxy.user
    // Should be a proxy, not the raw object
    expect(userProxy).not.toBe(state.user)
    // But should have the same values
    expect(userProxy.name).toBe('Alice')
  })

  it('creates signals for nested property paths', () => {
    const state = { user: { name: 'Alice', address: { city: 'NYC' } } }
    const registry = createRegistry()
    const proxy = createTrackingProxy(state, '', registry)

    proxy.user.address.city

    // Intermediate objects use ensurePrefix (no signal), leaves use getOrCreate
    expect(registry.hasPrefix('user')).toBe(true)
    expect(registry.hasPrefix('user.address')).toBe(true)
    expect(registry.has('user.address.city')).toBe(true) // leaf — has signal
    // Did not access user.name
    expect(registry.has('user.name')).toBe(false)
  })

  it('caches child proxies within same evaluation', () => {
    const state = { user: { name: 'Alice' } }
    const registry = createRegistry()
    const proxy = createTrackingProxy(state, '', registry)

    const first = proxy.user
    const second = proxy.user
    expect(first).toBe(second) // same proxy instance
  })

  // ─── Array support ───

  it('returns tracking proxies for array elements', () => {
    const state = { todos: [{ id: 1, text: 'Test' }] }
    const registry = createRegistry()
    const proxy = createTrackingProxy(state, '', registry)

    const todo = proxy.todos[0]
    expect(todo.text).toBe('Test')
    expect(registry.hasPrefix('todos')).toBe(true) // intermediate
    // Identity-based path: element has 'id' field, so uses {id:1} instead of 0
    expect(registry.hasPrefix('todos.{id:1}')).toBe(true) // intermediate (identity path)
    expect(registry.has('todos.{id:1}.text')).toBe(true) // leaf (identity path)
  })

  it('tracks array length access', () => {
    const state = { items: [1, 2, 3] }
    const registry = createRegistry()
    const proxy = createTrackingProxy(state, '', registry)

    expect(proxy.items.length).toBe(3)
    expect(registry.has('items.length')).toBe(true)
  })

  // ─── Frozen objects (ES Proxy invariant compliance) ───

  it('works with Object.freeze() state', () => {
    const state = Object.freeze({
      user: Object.freeze({ name: 'Alice', age: 30 }),
      filter: 'all' as const,
    })
    const registry = createRegistry()
    const proxy = createTrackingProxy(state, '', registry)

    expect(proxy.filter).toBe('all')
    expect(proxy.user.name).toBe('Alice')
    expect(proxy.user.age).toBe(30)
    expect(registry.has('filter')).toBe(true)
    expect(registry.has('user.name')).toBe(true)
  })

  it('works with deeply frozen state (Immer-style)', () => {
    const state = Object.freeze({
      todos: Object.freeze([
        Object.freeze({ id: 1, text: 'Test', completed: false }),
        Object.freeze({ id: 2, text: 'Another', completed: true }),
      ]),
      counters: Object.freeze({
        counter1: Object.freeze({ value: 0 }),
      }),
    })
    const registry = createRegistry()
    const proxy = createTrackingProxy(state, '', registry)

    expect(proxy.todos[0].text).toBe('Test')
    expect(proxy.todos[1].completed).toBe(true)
    expect(proxy.counters.counter1.value).toBe(0)
  })

  // ─── ownKeys / iteration tracking ───

  it('tracks ownKeys access via @@keys signal', () => {
    const state = { a: 1, b: 2, c: 3 }
    const registry = createRegistry()
    const proxy = createTrackingProxy(state, '', registry)

    Object.keys(proxy)
    expect(registry.has('@@keys')).toBe(true)
  })

  it('tracks nested ownKeys with correct path', () => {
    const state = { user: { name: 'Alice', age: 30 } }
    const registry = createRegistry()
    const proxy = createTrackingProxy(state, '', registry)

    Object.keys(proxy.user)
    expect(registry.has('user.@@keys')).toBe(true)
  })

  it('supports for...in enumeration', () => {
    const state = { a: 1, b: 2 }
    const registry = createRegistry()
    const proxy = createTrackingProxy(state, '', registry)

    const keys: string[] = []
    for (const key in proxy) {
      keys.push(key)
    }
    expect(keys).toEqual(['a', 'b'])
    expect(registry.has('@@keys')).toBe(true)
  })

  it('supports Object.entries on proxy', () => {
    const state = Object.freeze({ x: 10, y: 20 })
    const registry = createRegistry()
    const proxy = createTrackingProxy(state, '', registry)

    const entries = Object.entries(proxy)
    expect(entries).toEqual([
      ['x', 10],
      ['y', 20],
    ])
  })

  it('supports array .map() through proxy', () => {
    const state = Object.freeze({
      items: Object.freeze([
        Object.freeze({ id: 1, name: 'A' }),
        Object.freeze({ id: 2, name: 'B' }),
      ]),
    })
    const registry = createRegistry()
    const proxy = createTrackingProxy(state, '', registry)

    const names = proxy.items.map(
      (item: { id: number; name: string }) => item.name,
    )
    expect(names).toEqual(['A', 'B'])
  })

  it('supports array .filter() through proxy', () => {
    const state = Object.freeze({
      items: Object.freeze([
        Object.freeze({ id: 1, active: true }),
        Object.freeze({ id: 2, active: false }),
        Object.freeze({ id: 3, active: true }),
      ]),
    })
    const registry = createRegistry()
    const proxy = createTrackingProxy(state, '', registry)

    const active = proxy.items.filter(
      (item: { id: number; active: boolean }) => item.active,
    )
    expect(active).toHaveLength(2)
  })

  // ─── Symbol properties ───

  it('passes through symbol properties without creating signals', () => {
    const sym = Symbol('test')
    const state = { [sym]: 'secret', name: 'Alice' }
    const registry = createRegistry()
    const proxy = createTrackingProxy(state, '', registry)

    expect(proxy[sym]).toBe('secret')
    // Symbol access should not create any signals
    expect(registry.size()).toBe(0)
  })

  it('supports Symbol.iterator for arrays', () => {
    const state = Object.freeze({ items: Object.freeze([1, 2, 3]) })
    const registry = createRegistry()
    const proxy = createTrackingProxy(state, '', registry)

    const spread = [...proxy.items]
    expect(spread).toEqual([1, 2, 3])
  })

  // ─── has trap ───

  it('tracks "in" operator checks', () => {
    const state = { name: 'Alice', age: 30 }
    const registry = createRegistry()
    const proxy = createTrackingProxy(state, '', registry)

    expect('name' in proxy).toBe(true)
    expect('missing' in proxy).toBe(false)

    // Both checked paths should have signals
    expect(registry.has('name')).toBe(true)
    expect(registry.has('missing')).toBe(true)
  })

  // ─── Null handling ───

  it('treats null values as primitives (not objects)', () => {
    const state = { value: null as null | string }
    const registry = createRegistry()
    const proxy = createTrackingProxy(state, '', registry)

    expect(proxy.value).toBe(null)
    expect(registry.has('value')).toBe(true)
  })

  // ─── Path segments (nested proxy creation) ───

  it('builds correct path keys for deeply nested access', () => {
    const state = {
      a: { b: { c: { d: 42 } } },
    }
    const registry = createRegistry()
    const proxy = createTrackingProxy(state, '', registry)

    expect(proxy.a.b.c.d).toBe(42)
    expect(registry.hasPrefix('a')).toBe(true) // intermediate
    expect(registry.hasPrefix('a.b')).toBe(true) // intermediate
    expect(registry.hasPrefix('a.b.c')).toBe(true) // intermediate
    expect(registry.has('a.b.c.d')).toBe(true) // leaf
  })

  // ─── Nesting path behavior ───

  it('only creates signals along the accessed path, not siblings', () => {
    const state = {
      users: {
        alice: { name: 'Alice', age: 30 },
        bob: { name: 'Bob', age: 25 },
      },
      settings: { theme: 'dark' },
    }
    const registry = createRegistry()
    const proxy = createTrackingProxy(state, '', registry)

    // Access only alice's name
    proxy.users.alice.name

    expect(registry.hasPrefix('users')).toBe(true) // intermediate
    expect(registry.hasPrefix('users.alice')).toBe(true) // intermediate
    expect(registry.has('users.alice.name')).toBe(true) // leaf
    // Siblings NOT accessed
    expect(registry.has('users.alice.age')).toBe(false)
    expect(registry.hasPrefix('users.bob')).toBe(false)
    expect(registry.has('users.bob.name')).toBe(false)
    expect(registry.hasPrefix('settings')).toBe(false)
    expect(registry.has('settings.theme')).toBe(false)
  })

  it('creates leaf signals with actual values, intermediate objects are prefix-only', () => {
    const state = { a: { b: { c: 42 } } }
    const registry = createRegistry()
    const proxy = createTrackingProxy(state, '', registry)

    proxy.a.b.c

    // Intermediate objects (a, a.b) only have prefix registrations, no signals
    expect(registry.has('a')).toBe(false)
    expect(registry.has('a.b')).toBe(false)
    expect(registry.hasPrefix('a')).toBe(true)
    expect(registry.hasPrefix('a.b')).toBe(true)

    // Leaf has a signal with the actual value
    expect(registry.has('a.b.c')).toBe(true)
    const sigABC = registry.getOrCreate('a.b.c', 42)
    expect(sigABC.get()).toBe(42)
  })

  it('handles mixed nested types: objects, arrays, and primitives', () => {
    const state = Object.freeze({
      entities: Object.freeze({
        users: Object.freeze([
          Object.freeze({ id: 1, tags: Object.freeze(['admin', 'active']) }),
        ]),
      }),
      count: 5,
    })
    const registry = createRegistry()
    const proxy = createTrackingProxy(state, '', registry)

    // Traverse: entities → users → [0] → tags → [0]
    const tag = proxy.entities.users[0].tags[0]
    expect(tag).toBe('admin')

    expect(registry.hasPrefix('entities')).toBe(true) // intermediate
    expect(registry.hasPrefix('entities.users')).toBe(true) // intermediate
    // Identity-based: users array has objects with 'id', uses {id:1}
    expect(registry.hasPrefix('entities.users.{id:1}')).toBe(true) // intermediate (identity path)
    expect(registry.hasPrefix('entities.users.{id:1}.tags')).toBe(true) // intermediate
    // tags is a primitive array — coarse signal on the array itself
    expect(registry.has('entities.users.{id:1}.tags')).toBe(true)
    expect(registry.has('entities.users.{id:1}.tags.0')).toBe(false)
    // Not accessed
    expect(registry.has('entities.users.{id:1}.id')).toBe(false)
    expect(registry.has('entities.users.{id:1}.tags.1')).toBe(false)
    expect(registry.hasPrefix('count')).toBe(false)
  })

  it('handles multiple access paths creating independent signal trees', () => {
    const state = {
      a: { x: 1, y: 2 },
      b: { x: 10, y: 20 },
    }
    const registry = createRegistry()
    const proxy = createTrackingProxy(state, '', registry)

    proxy.a.x
    proxy.b.y

    // Each branch creates its own path signals
    expect(registry.hasPrefix('a')).toBe(true) // intermediate
    expect(registry.has('a.x')).toBe(true) // leaf
    expect(registry.has('a.y')).toBe(false) // not accessed
    expect(registry.hasPrefix('b')).toBe(true) // intermediate
    expect(registry.has('b.y')).toBe(true) // leaf
    expect(registry.has('b.x')).toBe(false) // not accessed
  })

  it('array index paths use numeric string keys', () => {
    const state = { items: ['zero', 'one', 'two'] }
    const registry = createRegistry()
    const proxy = createTrackingProxy(state, '', registry)

    proxy.items[0]
    proxy.items[2]

    // Primitive array elements use a single coarse signal on the array
    // itself instead of per-index signals (mount cost optimization).
    expect(registry.has('items')).toBe(true)
    expect(registry.has('items.0')).toBe(false)
    expect(registry.has('items.2')).toBe(false)
  })

  it('nested iteration creates @@keys at each level', () => {
    const state = {
      data: {
        nested: { a: 1, b: 2 },
      },
    }
    const registry = createRegistry()
    const proxy = createTrackingProxy(state, '', registry)

    // Iterate top-level keys
    Object.keys(proxy)
    // Iterate nested keys
    Object.keys(proxy.data.nested)

    expect(registry.has('@@keys')).toBe(true)
    expect(registry.has('data.nested.@@keys')).toBe(true)
    // data.@@keys was NOT iterated
    expect(registry.has('data.@@keys')).toBe(false)
  })

  it('accessing the same nested object via different parent proxies shares signals', () => {
    const state = { user: { profile: { name: 'Alice' } } }
    const registry = createRegistry()

    // Two separate root proxies but same registry
    const proxy1 = createTrackingProxy(state, '', registry)
    const proxy2 = createTrackingProxy(state, '', registry)

    proxy1.user.profile.name
    proxy2.user.profile.name

    // Only the leaf creates a signal; user and user.profile are prefix-only
    expect(registry.size()).toBe(1) // user.profile.name (leaf)
  })

  it('child proxies from different root proxies track same signal paths', () => {
    const state = Object.freeze({
      counter: Object.freeze({ value: 0 }),
      label: 'test',
    })
    const registry = createRegistry()
    const scope = alienEngine.createScope()

    let comp1Calls = 0
    let comp2Calls = 0

    // Two computeds that access the same path via different proxy instances
    const c1 = scope.run(() =>
      alienEngine.computed(() => {
        comp1Calls++
        const proxy = createTrackingProxy(state, '', registry)
        return proxy.counter.value
      }),
    )
    const c2 = scope.run(() =>
      alienEngine.computed(() => {
        comp2Calls++
        const proxy = createTrackingProxy(state, '', registry)
        return proxy.counter.value
      }),
    )

    c1.get()
    c2.get()
    expect(comp1Calls).toBe(1)
    expect(comp2Calls).toBe(1)

    // Update counter.value → BOTH computeds should re-evaluate
    registry.update('counter.value', 1)
    c1.get()
    c2.get()
    expect(comp1Calls).toBe(2)
    expect(comp2Calls).toBe(2)

    // Update label → NEITHER should re-evaluate (not tracked)
    registry.update('label', 'changed')
    c1.get()
    c2.get()
    expect(comp1Calls).toBe(2)
    expect(comp2Calls).toBe(2)

    scope.stop()
  })

  it('version counter bumps propagate to computeds returning objects (with explicit terminal dep)', () => {
    const state = Object.freeze({
      nested: Object.freeze({ deep: Object.freeze({ value: 42 }) }),
    })
    const registry = createRegistry()
    const scope = alienEngine.createScope()

    let calls = 0
    const c = scope.run(() =>
      alienEngine.computed(() => {
        calls++
        const proxy = createTrackingProxy(state, '', registry)
        const result = proxy.nested.deep
        // Simulate what useSignalSelector does: detect proxy result
        // and explicitly read the object's signal for terminal dependency
        const proxyPath = getProxyPath(result)
        if (proxyPath !== undefined) {
          registry.getOrCreate(proxyPath, result).get()
        }
        return result
      }),
    )

    c.get()
    expect(calls).toBe(1)

    // Bumping the version counter for 'nested.deep' should trigger re-eval
    registry.update('nested.deep', {})
    c.get()
    expect(calls).toBe(2)

    // Bumping a child signal should NOT trigger (we read 'nested.deep', not 'nested.deep.value')
    registry.update('nested.deep.value', 99)
    c.get()
    expect(calls).toBe(2)

    scope.stop()
  })

  it('intermediate object traversal does not create signal dependency', () => {
    const state = Object.freeze({
      nested: Object.freeze({ deep: Object.freeze({ value: 42 }) }),
    })
    const registry = createRegistry()
    const scope = alienEngine.createScope()

    let calls = 0
    const c = scope.run(() =>
      alienEngine.computed(() => {
        calls++
        const proxy = createTrackingProxy(state, '', registry)
        // Read through intermediate objects to a leaf
        return proxy.nested.deep.value
      }),
    )

    c.get()
    expect(calls).toBe(1)

    // Bumping intermediate 'nested' should NOT trigger (no .get() was called on it)
    registry.update('nested', {})
    c.get()
    expect(calls).toBe(1)

    // Bumping the leaf signal should trigger
    registry.update('nested.deep.value', 99)
    c.get()
    expect(calls).toBe(2)

    scope.stop()
  })

  it('parent object signal does not fire when only a child leaf changes', () => {
    const state = Object.freeze({
      parent: Object.freeze({ child: Object.freeze({ leaf: 'hello' }) }),
    })
    const registry = createRegistry()
    const scope = alienEngine.createScope()

    let parentCalls = 0
    let leafCalls = 0

    // One computed reads the parent object
    const parentComp = scope.run(() =>
      alienEngine.computed(() => {
        parentCalls++
        const proxy = createTrackingProxy(state, '', registry)
        return proxy.parent
      }),
    )

    // Another computed reads the leaf
    const leafComp = scope.run(() =>
      alienEngine.computed(() => {
        leafCalls++
        const proxy = createTrackingProxy(state, '', registry)
        return proxy.parent.child.leaf
      }),
    )

    parentComp.get()
    leafComp.get()
    expect(parentCalls).toBe(1)
    expect(leafCalls).toBe(1)

    // Update only the leaf signal — parent signal untouched
    registry.update('parent.child.leaf', 'world')
    parentComp.get()
    leafComp.get()
    expect(parentCalls).toBe(1) // NOT re-evaluated
    expect(leafCalls).toBe(2) // re-evaluated

    scope.stop()
  })

  it('handles pathSegments offset for pre-scoped proxies', () => {
    const nested = { x: 1, y: 2 }
    const registry = createRegistry()
    // Create proxy with a base path — simulates a proxy for a nested subtree
    const proxy = createTrackingProxy(nested, 'root.sub', registry)

    proxy.x

    expect(registry.has('root.sub.x')).toBe(true)
    expect(registry.has('x')).toBe(false) // NOT at root level
  })

  // ─── Reactive integration ───

  it('establishes signal dependencies for computed tracking', () => {
    const state = Object.freeze({
      todos: Object.freeze([Object.freeze({ id: 1, text: 'Test' })]),
      filter: 'all' as const,
    })
    const registry = createRegistry()

    // Simulate what a computed selector would do
    const scope = alienEngine.createScope()
    let callCount = 0

    const c = scope.run(() => {
      return alienEngine.computed(() => {
        callCount++
        const proxy = createTrackingProxy(state, '', registry)
        return proxy.filter
      })
    })

    // Initial evaluation
    expect(c.get()).toBe('all')
    expect(callCount).toBe(1)

    // Update an unrelated signal → computed should NOT re-evaluate
    // (only 'filter' signal was read, not 'todos')
    if (registry.has('todos')) {
      registry.update('todos', state.todos)
    }
    expect(c.get()).toBe('all')
    expect(callCount).toBe(1)

    // Update the 'filter' signal → computed should re-evaluate on next read
    registry.update('filter', 'completed')
    c.get() // pull to trigger re-evaluation
    expect(callCount).toBe(2)

    scope.stop()
  })

  it('tracks different dependencies for different computeds', () => {
    const state = Object.freeze({
      todos: Object.freeze([Object.freeze({ id: 1, text: 'Test' })]),
      counter: 0,
    })
    const registry = createRegistry()
    const scope = alienEngine.createScope()

    let todoCalls = 0
    let counterCalls = 0

    const todoComputed = scope.run(() =>
      alienEngine.computed(() => {
        todoCalls++
        const proxy = createTrackingProxy(state, '', registry)
        const result = proxy.todos
        // Simulate terminal dependency for object result
        const proxyPath = getProxyPath(result)
        if (proxyPath !== undefined) {
          registry.getOrCreate(proxyPath, result).get()
        }
        return result
      }),
    )

    const counterComputed = scope.run(() =>
      alienEngine.computed(() => {
        counterCalls++
        const proxy = createTrackingProxy(state, '', registry)
        return proxy.counter
      }),
    )

    // Initial evaluation
    todoComputed.get()
    counterComputed.get()
    expect(todoCalls).toBe(1)
    expect(counterCalls).toBe(1)

    // Update counter → only counterComputed should re-evaluate
    alienEngine.batch(() => {
      registry.update('counter', 1)
    })
    counterComputed.get()
    todoComputed.get()
    expect(counterCalls).toBe(2)
    expect(todoCalls).toBe(1) // NOT called again

    // Update todos → only todoComputed should re-evaluate
    alienEngine.batch(() => {
      registry.update('todos', [])
    })
    todoComputed.get()
    counterComputed.get()
    expect(todoCalls).toBe(2)
    expect(counterCalls).toBe(2) // NOT called again

    scope.stop()
  })
})

describe('unwrap', () => {
  it('returns the raw target from a tracking proxy', () => {
    const state = { name: 'Alice', nested: { x: 1 } }
    const registry = createRegistry()
    const proxy = createTrackingProxy(state, '', registry)

    expect(unwrap(proxy)).toBe(state)
  })

  it('returns nested raw target from a child proxy', () => {
    const state = { nested: { x: 1 } }
    const registry = createRegistry()
    const proxy = createTrackingProxy(state, '', registry)

    const childProxy = proxy.nested
    expect(childProxy).not.toBe(state.nested) // is a proxy
    expect(unwrap(childProxy)).toBe(state.nested) // unwraps to raw
  })

  it('returns the value unchanged for non-proxy objects', () => {
    const obj = { a: 1 }
    expect(unwrap(obj)).toBe(obj)
  })

  it('returns primitives unchanged', () => {
    expect(unwrap(42)).toBe(42)
    expect(unwrap('hello')).toBe('hello')
    expect(unwrap(true)).toBe(true)
    expect(unwrap(null)).toBe(null)
    expect(unwrap(undefined)).toBe(undefined)
  })

  it('enables identity comparison between unwrapped proxy and raw value', () => {
    const item = { id: 1, name: 'first' }
    const state = { items: [item], current: item }
    const registry = createRegistry()
    const proxy = createTrackingProxy(state, '', registry)

    // Without unwrap: proxy !== raw
    const proxiedCurrent = proxy.current
    expect(proxiedCurrent === item).toBe(false)

    // With unwrap: raw === raw
    expect(unwrap(proxiedCurrent) === item).toBe(true)
  })

  it('indexOf/includes auto-unwrap proxy arguments', () => {
    const state = {
      items: [
        { id: 1, name: 'a' },
        { id: 2, name: 'b' },
        { id: 3, name: 'c' },
      ],
    }
    const registry = createRegistry()
    const proxy = createTrackingProxy(state, '', registry)

    // Access an item through the proxy — get back a proxy wrapper
    const proxiedItem = proxy.items[1]
    expect(proxiedItem).not.toBe(state.items[1]) // it's a proxy

    // indexOf/includes auto-unwrap proxy args internally, so these just work
    expect(proxy.items.indexOf(proxiedItem)).toBe(1)
    expect(proxy.items.includes(proxiedItem)).toBe(true)

    // Also works with manually unwrapped value
    expect(proxy.items.indexOf(unwrap(proxiedItem))).toBe(1)
  })

  it('find() callback needs unwrap for identity comparison', () => {
    const state = {
      items: [
        { id: 1, name: 'a' },
        { id: 2, name: 'b' },
        { id: 3, name: 'c' },
      ],
    }
    const registry = createRegistry()
    const proxy = createTrackingProxy(state, '', registry)

    // Get a proxy-wrapped item
    const proxiedItem = proxy.items[1]
    const rawItem = unwrap(proxiedItem)

    // find callback receives a scan recorder proxy; unwrap it for
    // identity comparison against raw state values
    const found = proxy.items.find(
      (item: { id: number; name: string }) => unwrap(item) === rawItem,
    )

    // find() returns the raw element with an identity dependency; reads on
    // it are not tracked individually
    expect(found).toBe(state.items[1])
    expect(found!.name).toBe('b')
    expect(registry.has('items.{id:2}')).toBe(true)
    expect(registry.has('items.{id:2}.name')).toBe(false)
  })
})

// ─── Repeated-read memo ───
// Within one evaluation, re-reading the same primitive prop on the same
// proxy returns the memoized value without touching the registry. The memo
// must NOT survive into the next evaluation, or the dependency would be
// silently dropped when alien-signals re-records deps.

describe('repeated-read memo', () => {
  function mountComputed<T>(registry: PathSignalRegistry, body: () => T) {
    const scope = alienEngine.createScope()
    let evals = 0
    const c = scope.run(() =>
      alienEngine.computed(() => {
        evals++
        return body()
      }),
    )
    return { c, scope, getEvals: () => evals }
  }

  it('serves repeated reads of a primitive from the memo without extra registry lookups', () => {
    const state = Object.freeze({ user: Object.freeze({ id: 7 }) })
    const registry = createRegistry()
    const getOrCreate = vi.spyOn(registry, 'getOrCreate')
    const proxy = createTrackingProxy(state, '', registry)

    const user = proxy.user
    const before = getOrCreate.mock.calls.length
    for (let i = 0; i < 10; i++) {
      expect(user.id).toBe(7)
    }
    // One lookup for the first read, none for the nine memo hits
    expect(getOrCreate.mock.calls.length).toBe(before + 1)
  })

  it('re-links the dependency on the next evaluation even when the read is repeated', () => {
    let state = { user: { id: 7 }, other: 0 }
    const registry = createRegistry()
    const { c, scope, getEvals } = mountComputed(registry, () => {
      const proxy = createTrackingProxy(state, '', registry)
      // Read `user.id` twice: the second read hits the memo in this evaluation
      return proxy.user.id + proxy.user.id + proxy.other
    })

    expect(c.get()).toBe(14)
    expect(getEvals()).toBe(1)

    // Change only `other`: the computed re-runs and reuses the same `user`
    // child proxy (cached by target identity). alien-signals re-records
    // deps on every run, so if the memo outlived the first evaluation the
    // `user.id` read would be served without touching its signal and the
    // dependency would be dropped here.
    let next = { ...state, other: 1 }
    reconcileState(state, next, registry, alienEngine)
    state = next
    expect(c.get()).toBe(15)
    expect(getEvals()).toBe(2)

    // A `user.id` change must still be observed
    next = { ...state, user: { id: 8 } }
    reconcileState(state, next, registry, alienEngine)
    state = next
    expect(c.get()).toBe(17)
    expect(getEvals()).toBe(3)

    scope.stop()
  })

  it('does not leak a memoized read across two computeds sharing a cached child proxy', () => {
    let state = { user: { id: 7, name: 'a' } }
    const registry = createRegistry()
    const a = mountComputed(registry, () => {
      const proxy = createTrackingProxy(state, '', registry)
      return proxy.user.id
    })
    const b = mountComputed(registry, () => {
      const proxy = createTrackingProxy(state, '', registry)
      // Same cached `user` proxy, same prop, different evaluation: B must
      // register its own dependency rather than reuse A's memo hit
      return proxy.user.id
    })

    expect(a.c.get()).toBe(7)
    expect(b.c.get()).toBe(7)

    const next = { user: { id: 8, name: 'a' } }
    reconcileState(state, next, registry, alienEngine)
    state = next

    expect(a.c.get()).toBe(8)
    expect(b.c.get()).toBe(8)
    expect(a.getEvals()).toBe(2)
    expect(b.getEvals()).toBe(2)

    a.scope.stop()
    b.scope.stop()
  })

  it('warns once per path in dev when a primitive is re-read 100+ times in one evaluation', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const state = Object.freeze({
        post: Object.freeze({ id: 3 }),
        comments: Object.freeze(
          Array.from({ length: 150 }, (_, i) =>
            Object.freeze({ postId: i % 5 }),
          ),
        ),
      })
      const registry = createRegistry()
      const proxy = createTrackingProxy(state, '', registry)

      // Loop shape from a Reselect result function: `post` is a proxied
      // input, `comments` is raw
      const post = proxy.post
      const count = state.comments.filter((c) => c.postId === post.id).length
      expect(count).toBe(30)

      expect(warn).toHaveBeenCalledTimes(1)
      expect(warn.mock.calls[0][0]).toMatch(/read 'post\.id' 100\+ times/)

      // Same path again in a fresh evaluation: no second warning
      const proxy2 = createTrackingProxy(state, '', registry)
      const post2 = proxy2.post
      state.comments.filter((c) => c.postId === post2.id)
      expect(warn).toHaveBeenCalledTimes(1)
    } finally {
      warn.mockRestore()
    }
  })

  it('does not warn for reads below the threshold or for alternating props', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const state = Object.freeze({ user: Object.freeze({ id: 1, role: 'x' }) })
      const registry = createRegistry()
      const proxy = createTrackingProxy(state, '', registry)
      const user = proxy.user

      for (let i = 0; i < 99; i++) user.id
      for (let i = 0; i < 200; i++) {
        user.id
        user.role
      }
      expect(warn).not.toHaveBeenCalled()
    } finally {
      warn.mockRestore()
    }
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

  it('detects the key field on first element access', () => {
    const state = deepFreeze({
      items: [{ id: 1, name: 'Alice' }],
    })
    const registry = createRegistry()
    const proxy = createTrackingProxy(state, '', registry)

    // Before access — no record
    expect(registry.getArrayRecord('items')).toBeUndefined()

    // Access an element
    ;(proxy as any).items[0].name

    expect(registry.getArrayRecord('items')?.keyField).toBe('id')
  })

  it('reuses the array record on subsequent accesses', () => {
    const state = deepFreeze({
      items: [
        { id: 1, name: 'Alice' },
        { id: 2, name: 'Bob' },
      ],
    })
    const registry = createRegistry()
    const proxy = createTrackingProxy(state, '', registry)

    ;(proxy as any).items[0].name
    const record1 = registry.getArrayRecord('items')

    ;(proxy as any).items[1].name
    const record2 = registry.getArrayRecord('items')

    // Same record object — not recreated
    expect(record1).toBeDefined()
    expect(record1).toBe(record2)
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

describe('common selector patterns (smoke)', () => {
  it('JSON.stringify over a proxied subtree matches the raw state', () => {
    const state = {
      settings: { theme: 'dark', flags: { beta: true }, list: [1, 2, 3] },
    }
    const registry = createRegistry()
    const proxy = createTrackingProxy(state, '', registry)

    expect(JSON.stringify(proxy.settings)).toBe(JSON.stringify(state.settings))
  })

  it('Object.values / Object.entries work through the proxy', () => {
    const state = { counts: { a: 1, b: 2 } }
    const registry = createRegistry()
    const proxy = createTrackingProxy(state, '', registry)

    expect(Object.values(proxy.counts)).toEqual([1, 2])
    expect(Object.entries(proxy.counts)).toEqual([
      ['a', 1],
      ['b', 2],
    ])
  })

  it('destructuring a proxied object reads tracked values', () => {
    const state = { settings: { theme: 'dark', fontSize: 12 } }
    const registry = createRegistry()
    const proxy = createTrackingProxy(state, '', registry)

    const { theme, fontSize } = proxy.settings
    expect(theme).toBe('dark')
    expect(fontSize).toBe(12)
    expect(registry.has('settings.theme')).toBe(true)
    expect(registry.has('settings.fontSize')).toBe(true)
  })

  it('reading a missing index of a primitive array subscribes coarsely and returns undefined', () => {
    const state = { ids: [1, 2, 3] }
    const registry = createRegistry()
    const proxy = createTrackingProxy(state, '', registry)

    expect(proxy.ids[5]).toBeUndefined()
    // Coarse array signal, not a per-index signal
    expect(registry.has('ids')).toBe(true)
    expect(registry.has('ids.5')).toBe(false)
  })
})

describe('leafTracker capture through the shared proxy cache', () => {
  // The active leaf tracker lives in registry.evaluation.tracker and is
  // swapped in for each evaluation, so cached proxies created by an
  // earlier evaluation record into the CURRENT evaluation's tracker.

  it('a second evaluation records leaf accesses into its own tracker', () => {
    const state = { settings: { theme: 'dark' } }
    const registry = createRegistry()

    // Evaluation A creates and caches all the proxies
    const trackerA = createLeafTracker()
    registry.evaluation.tracker = trackerA
    const proxyA = createTrackingProxy(state, '', registry)
    expect(proxyA.settings.theme).toBe('dark')

    // Evaluation B gets cache hits on proxies evaluation A created
    const trackerB = createLeafTracker()
    registry.evaluation.tracker = trackerB
    const proxyB = createTrackingProxy(state, '', registry)
    // Leaf (identity-only) access by evaluation B
    void proxyB.settings

    expect(trackerB.accessedObjects.has('settings')).toBe(true)
  })
})

describe('non-plain objects in state', () => {
  // Non-plain objects (Date, Map, Set, class instances) are opaque leaves:
  // the proxy returns them raw (no shell, so internal-slot methods work)
  // and tracks them by reference via a version signal at their path.

  it('supports calling Date methods on a state Date', () => {
    const createdAt = new Date(2020, 0, 1)
    const state = { createdAt }
    const registry = createRegistry()
    const proxy = createTrackingProxy(state, '', registry)

    expect(proxy.createdAt.getTime()).toBe(createdAt.getTime())
  })

  it('supports calling Map methods on a state Map', () => {
    const state = { lookup: new Map([['a', 1]]) }
    const registry = createRegistry()
    const proxy = createTrackingProxy(state, '', registry)

    expect(proxy.lookup.get('a')).toBe(1)
  })

  it('supports calling Set methods on a state Set', () => {
    const state = { tags: new Set(['x']) }
    const registry = createRegistry()
    const proxy = createTrackingProxy(state, '', registry)

    expect(proxy.tags.has('x')).toBe(true)
  })

  it('instanceof checks work through the proxy (getPrototypeOf trap)', () => {
    const state = { createdAt: new Date(2020, 0, 1) }
    const registry = createRegistry()
    const proxy = createTrackingProxy(state, '', registry)

    expect(proxy.createdAt instanceof Date).toBe(true)
  })

  it('reads Map.size through the proxy (getter invoked on the real target)', () => {
    const state = { lookup: new Map([['a', 1]]) }
    const registry = createRegistry()
    const proxy = createTrackingProxy(state, '', registry)

    expect(proxy.lookup.size).toBe(1)
  })
})
