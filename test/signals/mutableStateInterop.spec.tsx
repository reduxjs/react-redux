/**
 * Behavior-pinning tests for non-idiomatic store patterns reported from the
 * Slack field trial (2026-08) and the original 2023 Slack perf call:
 *
 * 1. Reducers that mutate state in place ("mutable slices" with clever
 *    tricks to make Redux behave). The diff relies on referential
 *    inequality, so these tests pin exactly which mutations go silently
 *    stale, which recover, and when.
 * 2. Non-plain values (Map, class instances) in state. These are tracked
 *    by reference only.
 * 3. Selectors that mutate state (e.g. calling .sort() directly on a state
 *    array). The tracking proxy rejects the write; these tests pin the
 *    error the user actually sees.
 * 4. Batched store notifications (Slack batches subscriber notification
 *    via rAF). Several dispatches followed by one notification must diff
 *    cumulatively and render once.
 *
 * These tests document CURRENT behavior, including known staleness
 * hazards. If we add a dev-mode "slice is not diffable / appears mutated"
 * warning later, these are the scenarios it must cover.
 */
import * as rtl from '@testing-library/react'
import React from 'react'
import type { Reducer, Store } from 'redux'
import { legacy_createStore as createStore } from 'redux'
import { describe, expect, it, vi } from 'vitest'
import {
  createPathSignalRegistry,
  createTrackingProxy,
  SignalProvider,
  useSignalSelector,
} from '../../src/signals'
import { alienEngine } from '../../src/signals/engine'

describe('in-place mutation (mutable slices)', () => {
  interface MutState {
    slice: { data: { value: number }; label: string }
    other: { count: number }
  }

  type MutAction =
    | { type: 'mutateInPlace' }
    | { type: 'mutateChildCloneSliceRoot' }
    | { type: 'honestSliceChange' }
    | { type: 'honestOtherChange' }
    | { type: 'init' }

  const makeMutableStore = () => {
    const initial: MutState = {
      slice: { data: { value: 1 }, label: 'a' },
      other: { count: 0 },
    }
    const reducer: Reducer<MutState, MutAction> = (state = initial, action) => {
      switch (action.type) {
        case 'mutateInPlace':
          // Mutates a nested value and returns the SAME root reference.
          state.slice.data.value += 1
          return state
        case 'mutateChildCloneSliceRoot':
          // Mutates the child object, then clones the slice root — the
          // "clever tricks" shape: root and slice refs change, but the
          // mutated child is the same object in prev and next.
          state.slice.data.value += 1
          return { ...state, slice: { ...state.slice } }
        case 'honestSliceChange':
          return {
            ...state,
            slice: {
              ...state.slice,
              data: { value: state.slice.data.value + 1 },
            },
          }
        case 'honestOtherChange':
          return { ...state, other: { count: state.other.count + 1 } }
        default:
          return state
      }
    }
    return createStore(reducer)
  }

  const renderValueReader = (store: Store<MutState, MutAction>) => {
    let renders = 0
    function ValueReader() {
      renders++
      const value = useSignalSelector((s: MutState) => s.slice.data.value)
      return <div data-testid="value">{value}</div>
    }
    const utils = rtl.render(
      <SignalProvider store={store}>
        <ValueReader />
      </SignalProvider>,
    )
    return { ...utils, getRenders: () => renders }
  }

  it('same-ref root mutation: no signals fire, the component goes silently stale', () => {
    const store = makeMutableStore()
    const { getByTestId, getRenders } = renderValueReader(store)
    expect(getByTestId('value').textContent).toBe('1')
    const rendersAfterMount = getRenders()

    rtl.act(() => {
      store.dispatch({ type: 'mutateInPlace' })
    })

    // The store has the new value, but prev === next made the diff skip
    // everything: no re-render, stale UI.
    expect(store.getState().slice.data.value).toBe(2)
    expect(getByTestId('value').textContent).toBe('1')
    expect(getRenders()).toBe(rendersAfterMount)
  })

  it('a later honest change to the same path recovers with the correct value', () => {
    const store = makeMutableStore()
    const { getByTestId } = renderValueReader(store)

    rtl.act(() => {
      store.dispatch({ type: 'mutateInPlace' }) // -> 2, silently stale
    })
    expect(getByTestId('value').textContent).toBe('1')

    rtl.act(() => {
      store.dispatch({ type: 'honestSliceChange' }) // -> 3, new refs
    })
    // The provider's prev-state snapshot was mutated along with the store
    // (same object graph), so the diff compares 2 vs 3 and fires normally.
    expect(getByTestId('value').textContent).toBe('3')
  })

  it('an unrelated dispatch never catches a same-ref mutation', () => {
    const store = makeMutableStore()
    const { getByTestId } = renderValueReader(store)

    rtl.act(() => {
      store.dispatch({ type: 'mutateInPlace' })
    })
    rtl.act(() => {
      store.dispatch({ type: 'honestOtherChange' })
    })
    // The mutation happened to the shared prev/next object graph, so no
    // later diff can observe it: still stale.
    expect(store.getState().slice.data.value).toBe(2)
    expect(getByTestId('value').textContent).toBe('1')
  })

  it('mutate-child-clone-root: a NOT-yet-promoted hook recovers via coarse promotion', () => {
    const store = makeMutableStore()
    const { getByTestId } = renderValueReader(store)
    expect(getByTestId('value').textContent).toBe('1')

    // First dispatch after mount: the slice root ref changed, so the
    // changed-root-keys wake the coarse subscriber, which promotes and
    // runs the selector fresh against the new state — it sees the
    // mutated value even though no deep signal fired.
    rtl.act(() => {
      store.dispatch({ type: 'mutateChildCloneSliceRoot' })
    })
    expect(getByTestId('value').textContent).toBe('2')
  })

  it('mutate-child-clone-root: an already-promoted hook goes silently stale', () => {
    const store = makeMutableStore()
    const { getByTestId } = renderValueReader(store)

    // Promote the hook out of the coarse tier with an honest change first.
    rtl.act(() => {
      store.dispatch({ type: 'honestSliceChange' }) // -> 2
    })
    expect(getByTestId('value').textContent).toBe('2')

    rtl.act(() => {
      store.dispatch({ type: 'mutateChildCloneSliceRoot' }) // -> 3
    })
    // The slice root ref changed so the diff descends, but the mutated
    // child is the same object in prev and next: the leaf signal never
    // fires and the promoted hook is stale.
    expect(store.getState().slice.data.value).toBe(3)
    expect(getByTestId('value').textContent).toBe('2')
  })
})

describe('non-plain values in state (Map, class instances)', () => {
  interface LookupState {
    lookup: Map<string, string>
    other: { count: number }
  }
  type LookupAction =
    | { type: 'replaceMap'; value: string }
    | { type: 'mutateMap'; value: string }
    | { type: 'bumpOther' }
    | { type: 'init' }

  const makeLookupStore = () => {
    const initial: LookupState = {
      lookup: new Map([['a', 'one']]),
      other: { count: 0 },
    }
    const reducer: Reducer<LookupState, LookupAction> = (
      state = initial,
      action,
    ) => {
      switch (action.type) {
        case 'replaceMap':
          return { ...state, lookup: new Map([['a', action.value]]) }
        case 'mutateMap':
          state.lookup.set('a', action.value)
          return { ...state, other: { ...state.other } }
        case 'bumpOther':
          return { ...state, other: { count: state.other.count + 1 } }
        default:
          return state
      }
    }
    return createStore(reducer)
  }

  const renderMapReader = (store: Store<LookupState, LookupAction>) => {
    let selectorCalls = 0
    let renders = 0
    const selectA = (s: LookupState) => {
      selectorCalls++
      return s.lookup.get('a')
    }
    function MapReader() {
      renders++
      const value = useSignalSelector(selectA)
      return <div data-testid="value">{value}</div>
    }
    const utils = rtl.render(
      <SignalProvider store={store}>
        <MapReader />
      </SignalProvider>,
    )
    return {
      ...utils,
      getSelectorCalls: () => selectorCalls,
      getRenders: () => renders,
    }
  }

  it('replacing a Map re-renders the reader exactly once', () => {
    const store = makeLookupStore()
    const { getByTestId, getRenders } = renderMapReader(store)
    expect(getByTestId('value').textContent).toBe('one')
    const rendersAfterMount = getRenders()

    rtl.act(() => {
      store.dispatch({ type: 'replaceMap', value: 'two' })
    })
    // The Map is tracked by reference: a ref swap fires its leaf signal.
    expect(getByTestId('value').textContent).toBe('two')
    expect(getRenders()).toBe(rendersAfterMount + 1)
  })

  it('mutating a Map in place goes silently stale', () => {
    const store = makeLookupStore()
    const { getByTestId } = renderMapReader(store)

    // Promote first so the deep graph exists before the mutation.
    rtl.act(() => {
      store.dispatch({ type: 'replaceMap', value: 'two' })
    })
    expect(getByTestId('value').textContent).toBe('two')

    rtl.act(() => {
      store.dispatch({ type: 'mutateMap', value: 'three' })
    })
    // Same Map reference: the diff treats it as an unchanged leaf.
    expect(store.getState().lookup.get('a')).toBe('three')
    expect(getByTestId('value').textContent).toBe('two')
  })

  it('ref-level gating stays precise: unrelated dispatches do not re-run a Map reader', () => {
    const store = makeLookupStore()
    const { getSelectorCalls, getRenders } = renderMapReader(store)

    // Promote out of the coarse tier.
    rtl.act(() => {
      store.dispatch({ type: 'replaceMap', value: 'two' })
    })
    const callsAfterPromotion = getSelectorCalls()
    const rendersAfterPromotion = getRenders()

    rtl.act(() => {
      store.dispatch({ type: 'bumpOther' })
    })
    // The Map's ref signal did not change: no selector run, no render.
    expect(getSelectorCalls()).toBe(callsAfterPromotion)
    expect(getRenders()).toBe(rendersAfterPromotion)
  })

  it('class instances are tracked by reference: replacement fires, equal-content replacement re-runs without re-rendering', () => {
    class Session {
      constructor(public userName: string) {}
    }
    interface SessionState {
      session: Session
    }
    type SessionAction = { type: 'setSession'; name: string } | { type: 'init' }
    const reducer: Reducer<SessionState, SessionAction> = (
      state = { session: new Session('alice') },
      action,
    ) =>
      action.type === 'setSession'
        ? { session: new Session(action.name) }
        : state
    const store = createStore(reducer)

    let renders = 0
    const selectName = (s: SessionState) => s.session.userName
    function NameReader() {
      renders++
      const name = useSignalSelector(selectName)
      return <div data-testid="name">{name}</div>
    }
    const { getByTestId } = rtl.render(
      <SignalProvider store={store}>
        <NameReader />
      </SignalProvider>,
    )
    expect(getByTestId('name').textContent).toBe('alice')

    rtl.act(() => {
      store.dispatch({ type: 'setSession', name: 'bob' })
    })
    expect(getByTestId('name').textContent).toBe('bob')
    const rendersAfterChange = renders

    // New instance, same derived value: the ref signal fires and the
    // selector recomputes, but the equal result stops the render.
    rtl.act(() => {
      store.dispatch({ type: 'setSession', name: 'bob' })
    })
    expect(getByTestId('name').textContent).toBe('bob')
    expect(renders).toBe(rendersAfterChange)
  })
})

describe('selectors that mutate state', () => {
  const buildProxy = () => {
    const registry = createPathSignalRegistry(alienEngine)
    const state = {
      items: [3, 1, 2],
      user: { name: 'alice' },
    }
    return createTrackingProxy(state, '', registry, registry.proxyCache)
  }

  it('calling .sort() on a state array throws a TypeError', () => {
    const proxy = buildProxy()
    // Array.prototype.sort writes back through the proxy's set trap,
    // which rejects mutation. This raw TypeError is the current
    // first-contact experience (it's what the Slack trial hit).
    expect(() => proxy.items.sort()).toThrow(TypeError)
    expect(() => proxy.items.sort()).toThrow(/'set' on proxy/)
  })

  it('calling .push() on a state array throws a TypeError', () => {
    const proxy = buildProxy()
    expect(() => proxy.items.push(4)).toThrow(/'set' on proxy/)
  })

  it('assigning a property throws a TypeError', () => {
    const proxy = buildProxy()
    expect(() => {
      proxy.user.name = 'bob'
    }).toThrow(/'set' on proxy/)
  })

  it('deleting a property throws a TypeError', () => {
    const proxy = buildProxy()
    expect(() => {
      // @ts-expect-error -- deleting a required property on purpose
      delete proxy.user.name
    }).toThrow(/'deleteProperty' on proxy/)
  })

  it('Object.assign onto state throws a TypeError', () => {
    const proxy = buildProxy()
    expect(() => Object.assign(proxy.user, { name: 'bob' })).toThrow(
      /'set' on proxy/,
    )
  })

  it('a sorting selector mutates real state at mount (coarse probe), then throws on promotion', () => {
    interface ItemsState {
      items: number[]
    }
    type ItemsAction = { type: 'setItems'; items: number[] } | { type: 'init' }
    const reducer: Reducer<ItemsState, ItemsAction> = (
      state = { items: [3, 1, 2] },
      action,
    ) => (action.type === 'setItems' ? { items: action.items } : state)
    const store = createStore(reducer)

    class Boundary extends React.Component<
      { children: React.ReactNode },
      { message: string | null }
    > {
      state = { message: null as string | null }
      static getDerivedStateFromError(err: Error) {
        return { message: err.message }
      }
      render() {
        return this.state.message ? (
          <div data-testid="boundary">{this.state.message}</div>
        ) : (
          this.props.children
        )
      }
    }

    function SortedItems() {
      const sorted = useSignalSelector((s: ItemsState) => s.items.sort())
      return <div data-testid="items">{sorted.join(',')}</div>
    }

    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const { getByTestId } = rtl.render(
        <SignalProvider store={store}>
          <Boundary>
            <SortedItems />
          </Boundary>
        </SignalProvider>,
      )
      // At mount the hook is in the coarse tier: the probe proxy only
      // wraps the top level, so `s.items` is the RAW array and sort()
      // silently mutates real store state. No error — corrupted state.
      expect(getByTestId('items').textContent).toBe('1,2,3')
      expect(store.getState().items).toEqual([1, 2, 3])

      // A dispatch touching the segment promotes the hook to the deep
      // tracking proxy, whose set trap rejects the write.
      rtl.act(() => {
        store.dispatch({ type: 'setItems', items: [9, 7, 8] })
      })
      expect(getByTestId('boundary').textContent).toMatch(/'set' on proxy/)
    } finally {
      spy.mockRestore()
    }
  })
})

describe('batched store notifications (rAF-style)', () => {
  interface CounterState {
    counter: { count: number }
    other: { flag: boolean }
  }
  type CounterAction = { type: 'increment' } | { type: 'init' }

  it('several dispatches followed by one notification diff cumulatively and render once', () => {
    const reducer: Reducer<CounterState, CounterAction> = (
      state = { counter: { count: 0 }, other: { flag: false } },
      action,
    ) =>
      action.type === 'increment'
        ? { ...state, counter: { count: state.counter.count + 1 } }
        : state

    const inner = createStore(reducer)
    // Slack batches subscriber notification behind rAF. Model that with a
    // store wrapper whose subscribe defers listener calls until flush().
    let listeners: Array<() => void> = []
    const store = {
      ...inner,
      subscribe(listener: () => void) {
        listeners.push(listener)
        return () => {
          listeners = listeners.filter((l) => l !== listener)
        }
      },
    } as Store<CounterState, CounterAction>
    const flush = () => listeners.forEach((l) => l())

    let renders = 0
    function Counter() {
      renders++
      const count = useSignalSelector((s: CounterState) => s.counter.count)
      return <div data-testid="count">{count}</div>
    }
    const { getByTestId } = rtl.render(
      <SignalProvider store={store}>
        <Counter />
      </SignalProvider>,
    )
    expect(getByTestId('count').textContent).toBe('0')
    const rendersAfterMount = renders

    rtl.act(() => {
      store.dispatch({ type: 'increment' })
      store.dispatch({ type: 'increment' })
      store.dispatch({ type: 'increment' })
    })
    // No notification yet: nothing rendered.
    expect(getByTestId('count').textContent).toBe('0')
    expect(renders).toBe(rendersAfterMount)

    rtl.act(() => {
      flush()
    })
    // One notification diffs 0 -> 3 in a single pass: exactly one render.
    expect(getByTestId('count').textContent).toBe('3')
    expect(renders).toBe(rendersAfterMount + 1)
  })
})
