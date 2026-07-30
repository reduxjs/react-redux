/**
 * Zombie children and selector error semantics.
 *
 * React mounts bottom-up, so children subscribe before parents. When a
 * dispatch removes an entity that a still-mounted child selects, the
 * child's selector re-runs against the new state and may throw (the
 * classic "zombie child" problem — same tradeoff stock useSelector
 * accepted when it gave up connect's top-down subscription cascade).
 *
 * Required semantics (matching stock useSelector under React's
 * useSyncExternalStore):
 * - A throwing selector must NOT crash `store.dispatch`.
 * - Other components' subscriptions must still be notified.
 * - If a parent re-render unmounts the throwing component, the error
 *   dissolves — the UI just moves on.
 * - If the component stays mounted, the error surfaces during render,
 *   where an error boundary owns it.
 *
 * Also covers the prune-signal bug this scenario exposed: prune()
 * previously wrote a signal's own value back to it, which never fires
 * for non-numeric primitives under alien-signals' `!==` equality —
 * leaving selectors that only read string/boolean leaves of a removed
 * entity permanently stale.
 */
import { configureStore, createSlice } from '@reduxjs/toolkit'
import * as rtl from '@testing-library/react'
import * as React from 'react'
import { alienEngine } from '../../src/signals/engine'
import { createPathSignalRegistry } from '../../src/signals/pathSignalRegistry'
import { SignalProvider } from '../../src/signals/SignalProvider'
import { useSignalSelector } from '../../src/signals/useSignalSelector'

interface Item {
  id: number
  name: string
  starred: boolean
}

const slice = createSlice({
  name: 'items',
  initialState: {
    list: [
      { id: 1, name: 'one', starred: false },
      { id: 2, name: 'two', starred: true },
    ] as Item[],
  },
  reducers: {
    removeSecond(state) {
      state.list = state.list.filter((i) => i.id !== 2)
    },
    restoreSecond(state) {
      state.list.push({ id: 2, name: 'two', starred: true })
    },
  },
})

const makeStore = () => configureStore({ reducer: { items: slice.reducer } })
type RootState = ReturnType<ReturnType<typeof makeStore>['getState']>

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  render() {
    if (this.state.error) {
      return <div data-testid="boundary">{this.state.error.message}</div>
    }
    return this.props.children
  }
}

describe('prune fires non-numeric primitive leaf signals', () => {
  it.each([
    ['string', 'two'],
    ['boolean', true],
    ['null', null],
  ])('a computed depending on a pruned %s leaf re-runs', (_kind, value) => {
    const registry = createPathSignalRegistry(alienEngine)
    registry.getOrCreate('items.child', value)

    let runs = 0
    const c = alienEngine.computed(() => {
      runs++
      return registry.has('items.child')
        ? registry.getOrCreate('items.child', value).get()
        : 'pruned'
    })
    expect(c.get()).toBe(value)
    expect(runs).toBe(1)

    registry.prune('items')

    expect(c.get()).toBe('pruned')
    expect(runs).toBe(2)
  })

  it('a selector reading only a string leaf of a removed entity re-renders', () => {
    const store = makeStore()

    function Watcher() {
      // Reads ONLY items.list.{id:2}.name — a string leaf signal.
      // Before the prune fix this stayed 'two' forever after removal.
      const name = useSignalSelector(
        (s: RootState) => s.items.list[1]?.name ?? 'gone',
      )
      return <div data-testid="watcher">{name}</div>
    }

    rtl.render(
      <SignalProvider store={store}>
        <Watcher />
      </SignalProvider>,
    )
    expect(rtl.screen.getByTestId('watcher').textContent).toBe('two')

    rtl.act(() => {
      store.dispatch(slice.actions.removeSecond())
    })
    expect(rtl.screen.getByTestId('watcher').textContent).toBe('gone')
  })
})

describe('zombie children', () => {
  it('dispatch survives and the zombie child unmounts cleanly', () => {
    const store = makeStore()

    function Child({ id }: { id: number }) {
      // Classic zombie pattern: assumes the item exists.
      const name = useSignalSelector(
        (s: RootState) => s.items.list.find((i) => i.id === id)!.name,
      )
      return <div data-testid={`child-${id}`}>{name}</div>
    }

    function Parent() {
      const ids = useSignalSelector((s: RootState) =>
        s.items.list.map((i) => i.id),
      )
      return (
        <>
          {ids.map((id) => (
            <Child key={id} id={id} />
          ))}
        </>
      )
    }

    rtl.render(
      <SignalProvider store={store}>
        <ErrorBoundary>
          <Parent />
        </ErrorBoundary>
      </SignalProvider>,
    )
    expect(rtl.screen.getByTestId('child-2').textContent).toBe('two')

    // Must not throw out of dispatch.
    rtl.act(() => {
      store.dispatch(slice.actions.removeSecond())
    })

    // Parent re-rendered and unmounted the zombie; the error dissolved
    // without reaching the boundary.
    expect(rtl.screen.queryByTestId('child-2')).toBeNull()
    expect(rtl.screen.getByTestId('child-1').textContent).toBe('one')
    expect(rtl.screen.queryByTestId('boundary')).toBeNull()
  })

  it('a throwing selector on a component that stays mounted reaches an error boundary', () => {
    const store = makeStore()
    const consoleSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {})

    function StubbornWatcher() {
      // Not conditionally rendered by any parent — stays mounted after
      // the entity is removed, so the selector throw must surface.
      const name = useSignalSelector(
        (s: RootState) => s.items.list.find((i) => i.id === 2)!.name,
      )
      return <div data-testid="stubborn">{name}</div>
    }

    rtl.render(
      <SignalProvider store={store}>
        <ErrorBoundary>
          <StubbornWatcher />
        </ErrorBoundary>
      </SignalProvider>,
    )
    expect(rtl.screen.getByTestId('stubborn').textContent).toBe('two')

    // Dispatch itself must survive; the error lands in the boundary.
    rtl.act(() => {
      store.dispatch(slice.actions.removeSecond())
    })

    expect(rtl.screen.queryByTestId('stubborn')).toBeNull()
    expect(rtl.screen.getByTestId('boundary').textContent).toMatch(
      /Cannot read properties of undefined/,
    )
    consoleSpy.mockRestore()
  })

  it('other components are still notified when one selector throws', () => {
    const store = makeStore()
    const consoleSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {})

    function StubbornWatcher() {
      const name = useSignalSelector(
        (s: RootState) => s.items.list.find((i) => i.id === 2)!.name,
      )
      return <div data-testid="stubborn">{name}</div>
    }

    function CountWatcher() {
      const count = useSignalSelector((s: RootState) => s.items.list.length)
      return <div data-testid="count">{count}</div>
    }

    // StubbornWatcher mounts FIRST so its effect flushes before
    // CountWatcher's during reconcile — the throw must not stop the
    // rest of the flush.
    rtl.render(
      <SignalProvider store={store}>
        <ErrorBoundary>
          <StubbornWatcher />
        </ErrorBoundary>
        <CountWatcher />
      </SignalProvider>,
    )
    expect(rtl.screen.getByTestId('count').textContent).toBe('2')

    rtl.act(() => {
      store.dispatch(slice.actions.removeSecond())
    })

    expect(rtl.screen.getByTestId('count').textContent).toBe('1')
    expect(rtl.screen.getByTestId('boundary')).toBeDefined()
    consoleSpy.mockRestore()
  })
})
