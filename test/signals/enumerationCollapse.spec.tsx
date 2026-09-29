import React from 'react'
import { describe, it, expect } from 'vitest'
import * as rtl from '@testing-library/react'
import { configureStore, createSlice } from '@reduxjs/toolkit'
import { Provider, useSelector, shallowEqual } from 'react-redux'
import { alienEngine } from '../../src/signals/engine'
import { createPathSignalRegistry } from '../../src/signals/pathSignalRegistry'
import type { PathSignalRegistry } from '../../src/signals/pathSignalRegistry'
import {
  createLeafTracker,
  createTrackingProxy,
  finalizeDependencies,
  getProxyPath,
} from '../../src/signals/trackingProxy'
import { reconcileState } from '../../src/signals/diff'
import { keysMetaPath } from '../../src/signals/arrayKeys'
import { useSignalContext } from '../../src/signals/context'

const IS_SIGNALS = process.env.TEST_IMPL === 'signals'

// Enumerating a plain object and then reading every own value (spread,
// Object.values/entries, JSON.stringify, shallowEqual, for...in) depends on
// exactly what the object's identity depends on under immutable updates.
// The tracking proxy defers those reads and collapses a complete
// enumeration onto the object's version signal instead of one signal per
// key plus the keys-meta signal. Incomplete enumerations replay the
// deferred reads so precision is unchanged.

interface Address {
  city: string
  zip: string
}

interface User {
  name: string
  age: number
  address: Address
  joined: Date
}

interface Item {
  id: number
  text: string
  done: boolean
}

interface State {
  user: User
  other: User
  counter: number
  items: Item[]
}

function makeState(): State {
  return {
    user: {
      name: 'Alice',
      age: 30,
      address: { city: 'Springfield', zip: '11111' },
      joined: new Date(2020, 0, 1),
    },
    other: {
      name: 'Bob',
      age: 41,
      address: { city: 'Shelbyville', zip: '22222' },
      joined: new Date(2021, 0, 1),
    },
    counter: 0,
    items: [
      { id: 1, text: 'a', done: false },
      { id: 2, text: 'b', done: true },
    ],
  }
}

function makeRegistry(): PathSignalRegistry {
  return createPathSignalRegistry(alienEngine)
}

function mount<R>(
  getState: () => State,
  selector: (state: State) => R,
  registry: PathSignalRegistry,
) {
  let evals = 0
  const scope = alienEngine.createScope()
  const computed = scope.run(() =>
    alienEngine.computed(() => {
      evals++
      const leafTracker = createLeafTracker()
      const proxy = createTrackingProxy(
        getState(),
        '',
        registry,
        registry.proxyCache,
        leafTracker,
      )
      const result = selector(proxy as State)
      const proxyPath = getProxyPath(result)
      if (proxyPath !== undefined) registry.getOrCreate(proxyPath, result).get()
      finalizeDependencies(leafTracker, registry)
      return result
    }),
  )
  return { computed, evals: () => evals, stop: () => scope.stop() }
}

function harness<R>(selector: (state: State) => R) {
  let state = makeState()
  const registry = makeRegistry()
  const m = mount(() => state, selector, registry)
  const dispatch = (recipe: (prev: State) => State) => {
    const prev = state
    state = recipe(prev)
    reconcileState(prev, state, registry, alienEngine)
    return m.computed.get()
  }
  return { registry, dispatch, ...m }
}

const setUserName = (name: string) => (s: State) => ({
  ...s,
  user: { ...s.user, name },
})
const setUserCity = (city: string) => (s: State) => ({
  ...s,
  user: { ...s.user, address: { ...s.user.address, city } },
})
const setOtherName = (name: string) => (s: State) => ({
  ...s,
  other: { ...s.other, name },
})
const bumpCounter = (s: State) => ({ ...s, counter: s.counter + 1 })
const addUserKey = (s: State) => ({
  ...s,
  user: { ...s.user, nickname: 'Al' } as User,
})

describe('enumeration collapse (unit)', () => {
  describe('complete enumerations collapse onto the object version signal', () => {
    const cases: Array<[string, (s: State) => unknown]> = [
      ['spread', (s) => ({ ...s.user })],
      ['spread with extra field', (s) => ({ ...s.user, extra: 1 })],
      ['Object.values', (s) => Object.values(s.user)],
      ['Object.entries', (s) => Object.entries(s.user)],
      ['Object.assign', (s) => Object.assign({}, s.user)],
      ['JSON.stringify', (s) => JSON.stringify(s.user)],
      [
        'for...in reading each key',
        (s) => {
          const out: Record<string, unknown> = {}
          for (const k in s.user) out[k] = s.user[k as keyof User]
          return out
        },
      ],
      [
        'Object.keys().map(k => obj[k])',
        (s) => Object.keys(s.user).map((k) => s.user[k as keyof User]),
      ],
    ]

    for (const [label, selector] of cases) {
      it(`${label}: one signal for the object, none for its keys`, () => {
        const h = harness(selector)
        h.computed.get()
        expect(h.evals()).toBe(1)

        const paths = h.registry.debugPaths()
        expect(paths).toContain('user')
        expect(paths).not.toContain(keysMetaPath('user'))
        expect(paths).not.toContain('user.name')
        expect(paths).not.toContain('user.age')
        expect(paths).not.toContain('user.address')
        expect(paths).not.toContain(keysMetaPath('user.address'))
        expect(paths).not.toContain('user.address.city')
        h.stop()
      })

      it(`${label}: re-runs on any change to the object, not on siblings`, () => {
        const h = harness(selector)
        h.computed.get()

        h.dispatch(bumpCounter)
        expect(h.evals()).toBe(1)
        h.dispatch(setOtherName('Robert'))
        expect(h.evals()).toBe(1)

        h.dispatch(setUserName('Alicia'))
        expect(h.evals()).toBe(2)
        h.dispatch(setUserCity('Ogdenville'))
        expect(h.evals()).toBe(3)
        h.dispatch(addUserKey)
        expect(h.evals()).toBe(4)
        h.stop()
      })
    }
  })

  it('spread result reflects the new values after re-run', () => {
    const h = harness((s) => ({ ...s.user }))
    expect(h.computed.get().name).toBe('Alice')
    // No prefix registered for the child object: the diff stops at `user`
    // and fires its version signal.
    expect(h.registry.hasPrefix('user.address')).toBe(false)
    const next = h.dispatch(setUserName('Alicia'))
    expect(next.name).toBe('Alicia')
    expect(next.address.city).toBe('Springfield')
    h.stop()
  })

  it('non-plain child (Date) counts toward completeness', () => {
    const h = harness((s) => ({ ...s.user }))
    h.computed.get()
    const paths = h.registry.debugPaths()
    expect(paths).toContain('user')
    expect(paths).not.toContain(keysMetaPath('user'))
    // The Date reference read stays immediate (harmless duplicate).
    expect(paths).toContain('user.joined')

    h.dispatch((s) => ({
      ...s,
      user: { ...s.user, joined: new Date(2022, 5, 5) },
    }))
    expect(h.evals()).toBe(2)
    h.stop()
  })

  it('empty object spread collapses and fires when a key is added', () => {
    let state = { ...makeState(), user: {} as User }
    const registry = makeRegistry()
    const m = mount(
      () => state,
      (s) => ({ ...s.user }),
      registry,
    )
    m.computed.get()
    expect(registry.debugPaths()).toContain('user')
    expect(registry.debugPaths()).not.toContain(keysMetaPath('user'))

    const prev = state
    state = { ...state, user: { name: 'Zed' } as User }
    reconcileState(prev, state, registry, alienEngine)
    expect(m.computed.get()).toEqual({ name: 'Zed' })
    expect(m.evals()).toBe(2)
    m.stop()
  })

  describe('incomplete enumerations replay the deferred reads', () => {
    it('Object.keys().length: keys-meta signal only', () => {
      const h = harness((s) => Object.keys(s.user).length)
      expect(h.computed.get()).toBe(4)

      const paths = h.registry.debugPaths()
      expect(paths).toContain(keysMetaPath('user'))
      expect(paths).not.toContain('user.name')
      expect(paths).not.toContain('user')

      h.dispatch(setUserName('Alicia'))
      expect(h.evals()).toBe(1)
      h.dispatch(setUserCity('Ogdenville'))
      expect(h.evals()).toBe(1)
      expect(h.dispatch(addUserKey)).toBe(5)
      expect(h.evals()).toBe(2)
      h.stop()
    })

    it('reading a subset of keys: keys-meta plus only the leaves read', () => {
      const h = harness((s) =>
        Object.keys(s.user)
          .filter((k) => k !== 'age' && k !== 'address' && k !== 'joined')
          .map((k) => s.user[k as keyof User]),
      )
      expect(h.computed.get()).toEqual(['Alice'])

      const paths = h.registry.debugPaths()
      expect(paths).toContain(keysMetaPath('user'))
      expect(paths).toContain('user.name')
      expect(paths).not.toContain('user.age')
      expect(paths).not.toContain('user')

      h.dispatch((s) => ({ ...s, user: { ...s.user, age: 31 } }))
      expect(h.evals()).toBe(1)
      h.dispatch(setUserCity('Ogdenville'))
      expect(h.evals()).toBe(1)
      h.dispatch(setUserName('Alicia'))
      expect(h.evals()).toBe(2)
      h.dispatch(addUserKey)
      expect(h.evals()).toBe(3)
      h.stop()
    })

    it('subset including an object child: child is a leaf-object identity dep', () => {
      const h = harness((s) =>
        Object.keys(s.user)
          .filter((k) => k === 'address')
          .map((k) => s.user[k as keyof User]),
      )
      h.computed.get()

      const paths = h.registry.debugPaths()
      expect(paths).toContain(keysMetaPath('user'))
      expect(paths).toContain('user.address')
      expect(paths).not.toContain('user.address.city')
      expect(paths).not.toContain('user')

      h.dispatch(setUserName('Alicia'))
      expect(h.evals()).toBe(1)
      h.dispatch(setUserCity('Ogdenville'))
      expect(h.evals()).toBe(2)
      h.stop()
    })

    it('subset including an object child that is then traversed: precise leaf dep', () => {
      const h = harness((s) =>
        Object.keys(s.user)
          .filter((k) => k === 'address')
          .map((k) => (s.user[k as keyof User] as Address).city),
      )
      expect(h.computed.get()).toEqual(['Springfield'])

      const paths = h.registry.debugPaths()
      expect(paths).toContain('user.address.city')
      expect(paths).not.toContain('user.address')

      h.dispatch((s) => ({
        ...s,
        user: { ...s.user, address: { ...s.user.address, zip: '99999' } },
      }))
      expect(h.evals()).toBe(1)
      h.dispatch(setUserCity('Ogdenville'))
      expect(h.evals()).toBe(2)
      h.stop()
    })
  })

  describe('mixed access in one evaluation', () => {
    it('spread plus a deeper read: collapse is a superset, deep read still tracked', () => {
      const h = harness((s) => ({ ...s.user, city: s.user.address.city }))
      h.computed.get()

      const paths = h.registry.debugPaths()
      expect(paths).toContain('user')
      expect(paths).toContain('user.address.city')
      expect(paths).not.toContain('user.name')

      h.dispatch(setUserName('Alicia'))
      expect(h.evals()).toBe(2)
      h.dispatch(setUserCity('Ogdenville'))
      expect(h.evals()).toBe(3)
      h.dispatch(bumpCounter)
      expect(h.evals()).toBe(3)
      h.stop()
    })

    it('a plain field read before the spread still collapses', () => {
      const h = harness((s) => {
        const n = s.user.name
        return { n, ...s.user }
      })
      h.computed.get()
      // The direct read registered `user.name` immediately; the repeat
      // read during the spread still counts toward completeness.
      const paths = h.registry.debugPaths()
      expect(paths).toContain('user')
      expect(paths).toContain('user.name')
      expect(paths).not.toContain('user.age')
      expect(paths).not.toContain(keysMetaPath('user'))
      h.dispatch(setUserName('Alicia'))
      expect(h.evals()).toBe(2)
      h.dispatch(setUserCity('Ogdenville'))
      expect(h.evals()).toBe(3)
      h.stop()
    })

    it('keys().length then spread of the same object collapses (complete overall)', () => {
      const h = harness((s) => ({
        count: Object.keys(s.user).length,
        ...s.user,
      }))
      h.computed.get()
      const paths = h.registry.debugPaths()
      expect(paths).toContain('user')
      expect(paths).not.toContain(keysMetaPath('user'))
      h.dispatch(addUserKey)
      expect(h.evals()).toBe(2)
      h.stop()
    })

    it('shallowEqual that returns early stays precise (incomplete enumeration)', () => {
      // shallowEqual enumerates both objects but stops at the first key
      // that differs (`name`), so neither enumeration is complete.
      const h = harness((s) => shallowEqual(s.user, s.other))
      expect(h.computed.get()).toBe(false)

      const paths = h.registry.debugPaths()
      expect(paths).toContain(keysMetaPath('user'))
      expect(paths).toContain(keysMetaPath('other'))
      expect(paths).toContain('user.name')
      expect(paths).toContain('other.name')
      expect(paths).not.toContain('user')
      expect(paths).not.toContain('other')
      expect(paths).not.toContain('other.age')

      h.dispatch(bumpCounter)
      expect(h.evals()).toBe(1)
      h.dispatch((s) => ({ ...s, other: { ...s.other, age: 42 } }))
      expect(h.evals()).toBe(1)
      h.dispatch(setOtherName('Robert'))
      expect(h.evals()).toBe(2)
      h.stop()
    })

    it('shallowEqual over equal-shaped objects collapses both', () => {
      let state = makeState()
      state = {
        ...state,
        other: { ...state.other, address: { ...state.user.address } },
      }
      const registry = makeRegistry()
      const m = mount(
        () => state,
        (s) => shallowEqual(s.user.address, s.other.address),
        registry,
      )
      expect(m.computed.get()).toBe(true)
      const paths = registry.debugPaths()
      expect(paths).toContain('user.address')
      expect(paths).toContain('other.address')
      expect(paths).not.toContain('user.address.city')
      expect(paths).not.toContain(keysMetaPath('user.address'))
      m.stop()
    })

    it('nested enumeration under a collapsed parent adds no signals', () => {
      // JSON.stringify enumerates `user` and then `user.address`. (Its
      // `toJSON` probe on each object is an ordinary missing-key read and
      // still registers a leaf for it; that is unrelated to enumeration.)
      const h = harness((s) => JSON.stringify(s.user))
      h.computed.get()
      const paths = h.registry.debugPaths()
      expect(paths).toContain('user')
      expect(paths).not.toContain('user.address')
      expect(paths).not.toContain(keysMetaPath('user.address'))
      expect(paths).not.toContain('user.address.city')
      h.stop()
    })

    it('child enumerated before its parent is still covered by the parent', () => {
      const h = harness((s) => {
        const n = Object.keys(s.user.address).length
        return { ...s.user, n }
      })
      h.computed.get()
      const paths = h.registry.debugPaths()
      expect(paths).toContain('user')
      expect(paths).not.toContain(keysMetaPath('user.address'))
      expect(paths).not.toContain('user.address')

      h.dispatch(bumpCounter)
      expect(h.evals()).toBe(1)
      h.dispatch((s) => ({
        ...s,
        user: {
          ...s.user,
          address: { ...s.user.address, country: 'US' } as Address,
        },
      }))
      expect(h.evals()).toBe(2)
      h.stop()
    })
  })

  describe('exclusions', () => {
    it('root spread keeps the immediate keys-meta read and per-key leaves', () => {
      const h = harness((s) => ({ ...s }))
      h.computed.get()

      const paths = h.registry.debugPaths()
      expect(paths).toContain(keysMetaPath(''))
      expect(paths).toContain('counter')
      expect(paths).toContain('user')
      expect(paths).not.toContain('')

      h.dispatch(bumpCounter)
      expect(h.evals()).toBe(2)
      h.dispatch(setUserName('Alicia'))
      expect(h.evals()).toBe(3)
      h.stop()
    })

    it('array spread keeps existing array tracking', () => {
      const h = harness((s) => [...s.items])
      expect(h.computed.get()).toHaveLength(2)

      h.dispatch(bumpCounter)
      expect(h.evals()).toBe(1)
      h.dispatch((s) => ({
        ...s,
        items: [...s.items, { id: 3, text: 'c', done: false }],
      }))
      expect(h.evals()).toBe(2)
      h.dispatch((s) => ({
        ...s,
        items: s.items.map((i) => (i.id === 1 ? { ...i, done: true } : i)),
      }))
      expect(h.evals()).toBe(3)
      h.stop()
    })

    it('spreading array elements inside map collapses onto element identity', () => {
      const h = harness((s) => s.items.map((i) => ({ ...i })))
      expect(h.computed.get()).toEqual(makeState().items)

      const paths = h.registry.debugPaths()
      expect(paths.some((p) => p.endsWith('.text'))).toBe(false)
      expect(paths.some((p) => p.endsWith('.done'))).toBe(false)

      h.dispatch(bumpCounter)
      expect(h.evals()).toBe(1)
      const next = h.dispatch((s) => ({
        ...s,
        items: s.items.map((i) => (i.id === 2 ? { ...i, text: 'B' } : i)),
      }))
      expect(h.evals()).toBe(2)
      expect(next[1].text).toBe('B')
      h.stop()
    })
  })

  describe('across evaluations', () => {
    it('switching from spread to a single field drops the object dep', () => {
      let mode: 'spread' | 'name' = 'spread'
      const h = harness((s) =>
        mode === 'spread' ? { ...s.user } : s.user.name,
      )
      h.computed.get()
      expect(h.registry.debugPaths()).toContain('user')

      mode = 'name'
      h.dispatch(setUserName('Alicia'))
      expect(h.evals()).toBe(2)
      expect(h.registry.debugPaths()).toContain('user.name')
      // Identity signal for `user` has no subscribers left and is released.
      expect(h.registry.debugPaths()).not.toContain('user')

      h.dispatch(setUserCity('Ogdenville'))
      expect(h.evals()).toBe(2)
      h.dispatch(setUserName('Alison'))
      expect(h.evals()).toBe(3)
      h.stop()
    })

    it('switching from a single field to spread picks up the object dep', () => {
      let mode: 'spread' | 'name' = 'name'
      const h = harness((s) =>
        mode === 'spread' ? { ...s.user } : s.user.name,
      )
      h.computed.get()

      mode = 'spread'
      h.dispatch(setUserName('Alicia'))
      expect(h.evals()).toBe(2)
      expect(h.registry.debugPaths()).toContain('user')
      expect(h.registry.debugPaths()).not.toContain('user.name')

      h.dispatch(setUserCity('Ogdenville'))
      expect(h.evals()).toBe(3)
      h.stop()
    })
  })
})

// ─── Hook-level behavior (both TEST_IMPL modes) ───

const slice = createSlice({
  name: 'root',
  initialState: makeState(),
  reducers: {
    renameUser(s, a: { payload: string }) {
      s.user.name = a.payload
    },
    renameOther(s, a: { payload: string }) {
      s.other.name = a.payload
    },
    increment(s) {
      s.counter++
    },
  },
})

function makeStore() {
  return configureStore({ reducer: slice.reducer })
}

describe('enumeration collapse (hook)', () => {
  it('spread selector with shallowEqual: renders only when the object changes', () => {
    const store = makeStore()
    const renders = { user: 0 }
    let registry: PathSignalRegistry | undefined

    function CaptureRegistry() {
      registry = useSignalContext().registry
      return null
    }

    function UserCard() {
      renders.user++
      const user = useSelector((s: State) => ({ ...s.user }), shallowEqual)
      return <div data-testid="name">{user.name}</div>
    }

    rtl.render(
      <Provider store={store}>
        {IS_SIGNALS ? <CaptureRegistry /> : null}
        <UserCard />
      </Provider>,
    )
    expect(rtl.screen.getByTestId('name').textContent).toBe('Alice')
    expect(renders.user).toBe(1)

    rtl.act(() => {
      store.dispatch(slice.actions.increment())
      store.dispatch(slice.actions.renameOther('Robert'))
    })
    expect(renders.user).toBe(1)

    rtl.act(() => {
      store.dispatch(slice.actions.renameUser('Alicia'))
    })
    expect(rtl.screen.getByTestId('name').textContent).toBe('Alicia')
    expect(renders.user).toBe(2)

    if (IS_SIGNALS) {
      const paths = registry!.debugPaths()
      expect(paths).toContain('user')
      expect(paths).not.toContain('user.name')
      expect(paths).not.toContain(keysMetaPath('user'))
    }
  })
})
