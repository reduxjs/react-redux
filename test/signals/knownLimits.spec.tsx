/**
 * Known limits of the signal hooks, one describe per limit, in the order
 * docs/api/useSignalSelector.md lists them ("Hard constraints", then
 * "Gotchas"). `it.fails` marks a test that asserts the behavior we want;
 * a plain `it` pins the current behavior of a limit that is by design.
 * Sweep policy shortfalls live in the table in
 * internals/sweepPolicy/sweepPolicy.spec.ts.
 */
import React from 'react'
import * as rtl from '@testing-library/react'
import {
  configureStore,
  createSlice,
  type PayloadAction,
} from '@reduxjs/toolkit'
import { Provider, useSelector } from 'react-redux'
import { legacy_createStore as createStore } from 'redux'
import { beforeEach, describe, it, expect, vi } from 'vitest'
import {
  SignalProvider,
  unwrap,
  useSignalSelector,
} from '../../src/signals/index'
import { noStabilityCheck } from './helpers/env'
import { promoteToDeepTier, renderSignalSelector } from './helpers/react'
import { createRegistry } from './helpers/registry'
import { alienEngine } from '../../src/signals/engine'
import {
  createLeafTracker,
  createTrackingProxy,
} from '../../src/signals/trackingProxy'
import { reconcileState } from '../../src/signals/diff'
import { getProxyPath } from '../../src/signals/proxyIdentity'
import { untrackResult } from '../../src/signals/untrack'

const isTrackingProxy = (v: unknown) =>
  v !== null && typeof v === 'object' && getProxyPath(v) !== undefined

describe('the root state must be a plain object', () => {
  it('a Map root throws on mount instead of falling back untracked', () => {
    // The tracking proxy's shell breaks Map method receivers, so mount
    // throws "Method Map.prototype.get called on incompatible receiver".
    // The hook never probes a non-plain root: it goes straight to the
    // eager build and fails there, not inside the probe proxy.
    const store = createStore(
      (state: Map<string, number> = new Map([['v', 0]]), action) =>
        action.type === 'bump'
          ? new Map([['v', (state.get('v') ?? 0) + 1]])
          : state,
    )

    const selectV = (s: Map<string, number>) => s.get('v')

    function Watcher() {
      const value = useSignalSelector(selectV, noStabilityCheck)
      return <div data-testid="value">{value}</div>
    }

    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      expect(() => {
        rtl.render(
          <SignalProvider store={store}>
            <Watcher />
          </SignalProvider>,
        )
      }).toThrow(/incompatible receiver/)
    } finally {
      spy.mockRestore()
    }
  })
})

describe('state => state never updates', () => {
  const filterSlice = createSlice({
    name: 'filter',
    initialState: 'all' as 'all' | 'active' | 'completed',
    reducers: {
      set(_state, action: PayloadAction<'all' | 'active' | 'completed'>) {
        return action.payload
      },
    },
  })

  function createTestStore() {
    return configureStore({ reducer: { filter: filterSlice.reducer } })
  }

  type TestState = ReturnType<ReturnType<typeof createTestStore>['getState']>

  let store: ReturnType<typeof createTestStore>

  beforeEach(() => {
    store = createTestStore()
  })

  // The root proxy's path is '' and the diff never updates the '' path,
  // so `s => s` establishes no firing dependency.
  it.fails('state => state re-renders on dispatch', () => {
    function WholeState() {
      const state = useSignalSelector((s: TestState) => s)
      return <div data-testid="filter">{state.filter}</div>
    }

    const { getByTestId } = rtl.render(
      <SignalProvider store={store}>
        <WholeState />
      </SignalProvider>,
    )

    expect(getByTestId('filter').textContent).toBe('all')

    rtl.act(() => {
      store.dispatch(filterSlice.actions.set('active'))
    })

    expect(getByTestId('filter').textContent).toBe('active')
  })
})

describe('Map, Set, Date and class instances are tracked by reference', () => {
  it('reads inside a class instance register no signals, only replacing it re-runs', () => {
    class User {
      constructor(public name: string) {}
    }
    const alice = new User('Alice')
    const prev = { user: alice }
    const next = { user: new User('Bob') }

    const registry = createRegistry()
    const proxy = createTrackingProxy(prev, '', registry)

    // The instance comes back raw — no proxy shell, no child signals.
    expect(proxy.user).toBe(alice)
    expect(proxy.user.name).toBe('Alice')
    expect(registry.has('user.name')).toBe(false)
    expect(registry.has('user')).toBe(true)

    // Replacing the instance bumps the reference signal at 'user'.
    // Mutating the instance in place would not be detected, so the docs
    // say to keep state to plain objects and arrays.
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

describe('proxies and identity', () => {
  type Item = { id: number }

  const makeStore = () => {
    const current: Item = { id: 2 }
    const slice = createSlice({
      name: 'data',
      initialState: {
        items: [{ id: 1 }, current] as Item[],
        current,
        tick: 0,
      },
      reducers: {
        tick: (state) => {
          state.tick += 1
        },
      },
      extraReducers: (builder) => {
        builder.addCase('replaceCurrent', (state) => {
          state.current = { id: state.current.id }
        })
      },
    })
    const store = configureStore({ reducer: { data: slice.reducer } })
    return { store, tick: slice.actions.tick }
  }

  type RootState = ReturnType<ReturnType<typeof makeStore>['store']['getState']>

  function renderInBothTiers<R>(selector: (s: RootState) => R) {
    const { store, tick } = makeStore()
    const seen = renderSignalSelector(store, selector)
    const probeTier = seen.current
    promoteToDeepTier(store, tick())
    const deepTier = seen.current
    return { probeTier, deepTier }
  }

  it('does not re-run for an identity change of an object whose field was also read', () => {
    const { store, tick } = makeStore()
    const saved = store.getState().data.current
    let result: boolean | undefined
    function Comp() {
      result = useSignalSelector(
        (s: RootState) =>
          s.data.current.id > 0 && unwrap(s.data.current) === saved,
      )
      return null
    }
    rtl.render(
      <SignalProvider store={store}>
        <Comp />
      </SignalProvider>,
    )
    rtl.act(() => {
      store.dispatch(tick())
    })
    expect(result).toBe(true)
    rtl.act(() => {
      store.dispatch({ type: 'replaceCurrent' })
    })
    // The state object changed identity but the selector only depends on
    // `current.id`, so the result stays stale.
    expect(store.getState().data.current).not.toBe(saved)
    expect(result).toBe(true)
  })

  it('does not match inside a scan callback without unwrap after promotion', () => {
    const result = renderInBothTiers(
      (s) => s.data.items.find((i) => i === s.data.current)?.id,
    )
    expect(result).toEqual({ probeTier: 2, deepTier: undefined })
  })
})

describe('frozen derived containers keep their proxies', () => {
  function setup() {
    const registry = createRegistry()
    const state = { a: { x: 1 } }
    Object.freeze(state.a)
    Object.freeze(state)
    const proxy = createTrackingProxy(state, '', registry)
    return { state, proxy }
  }

  it('untrackResult leaves proxies inside a frozen derived container', () => {
    const { proxy } = setup()
    const frozen = Object.freeze({ child: proxy.a })
    const result = untrackResult(frozen)
    // Can't repair in place — proxies survive. Frozen raw state subtrees
    // are skipped for the same check, which is the common (safe) case.
    expect(isTrackingProxy(result.child)).toBe(true)
  })
})

describe('memoized selectors whose cache never reads state', () => {
  interface RootState {
    counter: { value: number }
  }

  const makeStore = () =>
    configureStore({
      reducer: {
        counter: (
          state: { value: number } = { value: 0 },
          action: { type: string },
        ) => (action.type === 'increment' ? { value: state.value + 1 } : state),
      },
    })

  const incrementTimes = (store: ReturnType<typeof makeStore>, n: number) => {
    for (let i = 0; i < n; i++) {
      rtl.act(() => {
        store.dispatch({ type: 'increment' })
      })
    }
  }

  it('a cache hit that never reads state keeps returning the stale result', () => {
    // Same result in both implementations — stock useSelector returns the
    // stale cached object too. Pinned so the behavior is deliberate.
    const store = makeStore()
    let cached: { doubled: number } | undefined
    const selectOnce = (s: RootState) => {
      if (cached === undefined) cached = { doubled: s.counter.value * 2 }
      return cached
    }

    function A() {
      return <div data-testid="a">{useSelector(selectOnce).doubled}</div>
    }
    const { getByTestId } = rtl.render(
      <Provider store={store}>
        <A />
      </Provider>,
    )
    incrementTimes(store, 2)
    expect(getByTestId('a').textContent).toBe('0')
  })
})

describe('aliased state objects (same object at two paths)', () => {
  // A deliberate tradeoff: the proxy cache is keyed by target object
  // identity only. When the same raw object is reachable at two paths
  // (state.selected = state.items[0]), whichever path is proxied first
  // wins, and reads through the second path register signals under the
  // first path. Per-path proxies would fix the attribution but break
  // `state.selected === state.items[0]` identity checks, which the system
  // guarantees. The leaf-object tracker keeps correctness: the alias path
  // gets a version-signal dependency, so replacement still re-runs the
  // selector (see next test).

  it.fails('reads through a second path register signals under that path', () => {
    const item = { id: 1, name: 'a' }
    const state = { items: [item], selected: item }

    const registry = createRegistry()
    const proxy = createTrackingProxy(state, '', registry)

    // Traverse via items first — item's proxy is cached with path "items.{id:1}"
    expect(proxy.items[0].name).toBe('a')
    // Now read the same object via selected — cache hit returns the
    // items-path proxy, so this registers "items.{id:1}.name" again
    // instead of "selected.name".
    expect(proxy.selected.name).toBe('a')

    expect(registry.has('selected.name')).toBe(true)
  })

  it('leaf-object tracking still records the aliased path itself', () => {
    // The alias path IS recorded as a leaf object access (the child reads
    // go under the wrong path, but 'selected' itself lands in the tracker
    // untraversed). The hook then subscribes to the 'selected' version
    // signal, so *replacement* of the aliased ref still re-runs the
    // selector — precision is lost, correctness mostly survives.
    const item = { id: 1, name: 'a' }
    const state = { items: [item], selected: item }

    const registry = createRegistry()
    const tracker = createLeafTracker()
    registry.evaluation.tracker = tracker
    const proxy = createTrackingProxy(state, '', registry)

    expect(proxy.items[0].name).toBe('a')
    expect(proxy.selected.name).toBe('a')

    expect(tracker.accessedObjects.has('selected')).toBe(true)
    expect(tracker.traversedPaths.has('selected')).toBe(false)
  })
})
