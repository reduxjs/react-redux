/**
 * What the path signal registry holds onto across mount/unmount churn.
 *
 * `proxyCache` is a WeakMap, so its contents cannot be observed from a
 * test. Everything else is counted by `registry.debugStats()`.
 *
 * Imports come from source modules rather than `src/index`, so these
 * tests are unaffected by the local benchmark override in
 * `src/exports.ts`.
 */
import * as rtl from '@testing-library/react'
import React from 'react'
import { createStore } from 'redux'
import type { Store } from 'redux'
import { beforeEach, describe, expect, it } from 'vitest'
import { useSignalContext } from '../../src/signals/context'
import type {
  PathSignalRegistry,
  RegistryStats,
} from '../../src/signals/pathSignalRegistry'
import { SignalProvider } from '../../src/signals/SignalProvider'
import { useSignalSelector } from '../../src/signals/useSignalSelector'

interface Slice {
  value: number
  nested: { n: number }
}

interface Item {
  id: number
  done: boolean
  text: string
}

interface AppState {
  slices: Record<string, Slice>
  dyn: Record<string, { v: number }>
  items: Item[]
  other: { flag: boolean }
}

type Action =
  | { type: 'bump'; key: string }
  | { type: 'toggleOther' }
  | { type: 'addDyn'; id: string }
  | { type: 'removeDyn'; id: string }
  | { type: 'toggleItem'; id: number }
  | { type: 'pushItem' }
  | { type: 'popItem' }

const SLICE_COUNT = 20

function makeInitialState(): AppState {
  const slices: Record<string, Slice> = {}
  for (let i = 0; i < SLICE_COUNT; i++) {
    slices[`s${i}`] = { value: i, nested: { n: i * 10 } }
  }
  const items: Item[] = Array.from({ length: 10 }, (_, i) => ({
    id: i,
    done: i % 2 === 0,
    text: `item ${i}`,
  }))
  return { slices, dyn: {}, items, other: { flag: false } }
}

function reducer(state: AppState = makeInitialState(), action: Action): AppState {
  switch (action.type) {
    case 'bump': {
      const prev = state.slices[action.key]
      return {
        ...state,
        slices: {
          ...state.slices,
          [action.key]: {
            value: prev.value + 1,
            nested: { n: prev.nested.n + 1 },
          },
        },
      }
    }
    case 'toggleOther':
      return { ...state, other: { flag: !state.other.flag } }
    case 'addDyn':
      return { ...state, dyn: { ...state.dyn, [action.id]: { v: 1 } } }
    case 'removeDyn': {
      const next = { ...state.dyn }
      delete next[action.id]
      return { ...state, dyn: next }
    }
    case 'toggleItem':
      return {
        ...state,
        items: state.items.map((item) =>
          item.id === action.id ? { ...item, done: !item.done } : item,
        ),
      }
    case 'pushItem': {
      const id = state.items.length
      return {
        ...state,
        items: [...state.items, { id, done: false, text: `item ${id}` }],
      }
    }
    case 'popItem':
      return { ...state, items: state.items.slice(0, -1) }
    default:
      return state
  }
}

function makeStore(): Store<AppState, Action> {
  return createStore(reducer)
}

let captured: PathSignalRegistry | null = null

function CaptureRegistry() {
  captured = useSignalContext<AppState>().registry
  return null
}

function requireRegistry(): PathSignalRegistry {
  if (captured === null) {
    throw new Error('registry was not captured')
  }
  return captured
}

function Watcher({ index }: { index: number }) {
  const n = useSignalSelector((s: AppState) => s.slices[`s${index}`].nested.n)
  return <div data-testid={`w${index}`}>{n}</div>
}

function DynWatcher({ id }: { id: string }) {
  const v = useSignalSelector((s: AppState) => s.dyn[id]?.v ?? -1)
  return <div data-testid={`d${id}`}>{v}</div>
}

function ListWatcher() {
  const doneCount = useSignalSelector(
    (s: AppState) => s.items.filter((item) => item.done).length,
  )
  return <div data-testid="list">{doneCount}</div>
}

function Tree({
  store,
  count,
  dynIds = [],
  withList = false,
}: {
  store: Store<AppState, Action>
  count: number
  dynIds?: string[]
  withList?: boolean
}) {
  return (
    <SignalProvider store={store}>
      <CaptureRegistry />
      {Array.from({ length: count }, (_, i) => (
        <Watcher key={i} index={i} />
      ))}
      {dynIds.map((id) => (
        <DynWatcher key={id} id={id} />
      ))}
      {withList ? <ListWatcher /> : null}
    </SignalProvider>
  )
}

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

beforeEach(() => {
  captured = null
})

describe('registry lifecycle: coarse tier only (never promoted)', () => {
  it('registers one coarse subscriber per hook and nothing else', () => {
    const store = makeStore()
    const { unmount } = rtl.render(<Tree store={store} count={SLICE_COUNT} />)

    expect(requireRegistry().debugStats()).toEqual({
      ...EMPTY_STATS,
      segmentSubs: SLICE_COUNT,
    })

    unmount()
  })

  it('releases every coarse subscriber on unmount', () => {
    const store = makeStore()
    const { unmount } = rtl.render(<Tree store={store} count={SLICE_COUNT} />)
    const registry = requireRegistry()

    expect(registry.debugStats().segmentSubs).toBe(SLICE_COUNT)

    unmount()

    expect(registry.debugStats()).toEqual(EMPTY_STATS)
  })

  it('keeps hooks coarse when dispatches never touch their root key', () => {
    const store = makeStore()
    const { unmount } = rtl.render(<Tree store={store} count={SLICE_COUNT} />)
    const registry = requireRegistry()

    for (let i = 0; i < 5; i++) {
      rtl.act(() => {
        store.dispatch({ type: 'toggleOther' })
      })
    }

    expect(registry.debugStats()).toEqual({
      ...EMPTY_STATS,
      segmentSubs: SLICE_COUNT,
    })

    unmount()

    expect(registry.debugStats()).toEqual(EMPTY_STATS)
  })
})

describe('registry lifecycle: after promotion to the deep graph', () => {
  it('builds path signals on the first dispatch that hits a tracked root key', () => {
    const store = makeStore()
    const { unmount } = rtl.render(<Tree store={store} count={SLICE_COUNT} />)
    const registry = requireRegistry()

    expect(registry.debugStats().signals).toBe(0)

    rtl.act(() => {
      store.dispatch({ type: 'bump', key: 's0' })
    })

    const promoted = registry.debugStats()
    expect(promoted.signals).toBeGreaterThan(0)
    expect(promoted.childIndex).toBeGreaterThan(0)
    expect(promoted.segmentSubs).toBe(0)

    unmount()
  })

  it('retains path signals after unmount — the registry is scoped to state shape, not to components', () => {
    const store = makeStore()
    const { unmount } = rtl.render(<Tree store={store} count={SLICE_COUNT} />)
    const registry = requireRegistry()

    rtl.act(() => {
      store.dispatch({ type: 'bump', key: 's0' })
    })
    const mounted = registry.debugStats()

    unmount()
    const afterUnmount = registry.debugStats()

    expect(afterUnmount.segmentSubs).toBe(0)
    expect(afterUnmount.signals).toBe(mounted.signals)
    expect(afterUnmount.prefixCounts).toBe(mounted.prefixCounts)
    expect(afterUnmount.childIndex).toBe(mounted.childIndex)
  })
})

describe('repeated mount/unmount churn', () => {
  it('does not grow across cycles that reuse the same store and selectors', () => {
    const store = makeStore()
    const stats: RegistryStats[] = []
    let registry: PathSignalRegistry | null = null

    for (let cycle = 0; cycle < 5; cycle++) {
      const { unmount } = rtl.render(<Tree store={store} count={SLICE_COUNT} />)
      registry = requireRegistry()
      rtl.act(() => {
        store.dispatch({ type: 'bump', key: 's0' })
      })
      unmount()
      stats.push(registry.debugStats())
    }

    expect(registry).not.toBeNull()
    for (const snapshot of stats) {
      expect(snapshot).toEqual(stats[0])
    }
    expect(stats[0].segmentSubs).toBe(0)
  })

  it('does not grow when each cycle mounts a different subset of components', () => {
    const store = makeStore()
    const counts = [SLICE_COUNT, 5, SLICE_COUNT, 1, SLICE_COUNT]
    const seen: RegistryStats[] = []
    let registry: PathSignalRegistry | null = null

    for (const count of counts) {
      const { unmount } = rtl.render(<Tree store={store} count={count} />)
      registry = requireRegistry()
      rtl.act(() => {
        store.dispatch({ type: 'bump', key: 's0' })
      })
      unmount()
      seen.push(registry!.debugStats())
    }

    const peak = seen[0]
    for (const snapshot of seen) {
      expect(snapshot.signals).toBeLessThanOrEqual(peak.signals)
      expect(snapshot.childIndex).toBeLessThanOrEqual(peak.childIndex)
      expect(snapshot.prefixCounts).toBeLessThanOrEqual(peak.prefixCounts)
      expect(snapshot.segmentSubs).toBe(0)
    }
  })

  it('releases coarse subscribers on every cycle even without promotion', () => {
    const store = makeStore()

    for (let cycle = 0; cycle < 5; cycle++) {
      const { unmount } = rtl.render(<Tree store={store} count={SLICE_COUNT} />)
      const registry = requireRegistry()
      expect(registry.debugStats().segmentSubs).toBe(SLICE_COUNT)
      unmount()
      expect(registry.debugStats().segmentSubs).toBe(0)
    }
  })
})

describe('unmount during a dispatch', () => {
  it('releases the coarse subscriber when a component unmounts from a store listener', () => {
    const store = makeStore()
    const { unmount } = rtl.render(<Tree store={store} count={SLICE_COUNT} />)
    const registry = requireRegistry()

    const stopListening = store.subscribe(() => {
      unmount()
    })

    rtl.act(() => {
      store.dispatch({ type: 'bump', key: 's0' })
    })
    stopListening()

    expect(registry.debugStats().segmentSubs).toBe(0)
  })

  it('survives a dispatch that lands while a subtree is being removed', () => {
    const store = makeStore()
    const { rerender, unmount } = rtl.render(
      <Tree store={store} count={SLICE_COUNT} />,
    )
    const registry = requireRegistry()

    rtl.act(() => {
      store.dispatch({ type: 'bump', key: 's0' })
    })

    rtl.act(() => {
      rerender(<Tree store={store} count={0} />)
      store.dispatch({ type: 'bump', key: 's1' })
    })

    expect(registry.debugStats().segmentSubs).toBe(0)

    rtl.act(() => {
      store.dispatch({ type: 'bump', key: 's2' })
    })

    unmount()
    expect(registry.debugStats().segmentSubs).toBe(0)
  })
})

describe('array metadata', () => {
  it('retains array metadata after unmount but does not grow across cycles', () => {
    const store = makeStore()
    const seen: RegistryStats[] = []
    let registry: PathSignalRegistry | null = null

    for (let cycle = 0; cycle < 4; cycle++) {
      const { unmount } = rtl.render(
        <Tree store={store} count={0} withList />,
      )
      registry = requireRegistry()
      rtl.act(() => {
        store.dispatch({ type: 'toggleItem', id: 1 })
      })
      if (cycle === 0) {
        const promoted = registry.debugStats()
        expect(promoted.arrayMetas).toBeGreaterThan(0)
        expect(promoted.columnsByArray).toBeGreaterThan(0)
      }
      unmount()
      seen.push(registry.debugStats())
    }

    for (const snapshot of seen) {
      expect(snapshot.signals).toBeLessThanOrEqual(seen[0].signals)
      expect(snapshot.prefixCounts).toBeLessThanOrEqual(seen[0].prefixCounts)
      expect(snapshot.arrayMetas).toBe(seen[0].arrayMetas)
      expect(snapshot.columnsByArray).toBe(seen[0].columnsByArray)
      expect(snapshot.structuresByArray).toBe(seen[0].structuresByArray)
      expect(snapshot.segmentSubs).toBe(0)
    }
    expect(seen[seen.length - 1]).toEqual(seen[1])
  })

  it('does not accumulate array metadata across grow/shrink cycles', () => {
    const store = makeStore()
    const { unmount } = rtl.render(<Tree store={store} count={0} withList />)
    const registry = requireRegistry()
    const seen: RegistryStats[] = []

    for (let cycle = 0; cycle < 5; cycle++) {
      rtl.act(() => {
        store.dispatch({ type: 'pushItem' })
      })
      rtl.act(() => {
        store.dispatch({ type: 'popItem' })
      })
      seen.push(registry.debugStats())
    }

    for (const snapshot of seen) {
      expect(snapshot).toEqual(seen[0])
    }

    unmount()
  })
})

describe('state keys that disappear', () => {
  it('prunes signals for paths removed from state', () => {
    const store = makeStore()
    const { unmount } = rtl.render(
      <Tree store={store} count={1} dynIds={['x', 'y']} />,
    )
    const registry = requireRegistry()

    rtl.act(() => {
      store.dispatch({ type: 'addDyn', id: 'x' })
    })
    rtl.act(() => {
      store.dispatch({ type: 'addDyn', id: 'y' })
    })
    const withDyn = registry.debugStats()
    expect(registry.debugPaths()).toContain('dyn.x.v')

    rtl.act(() => {
      store.dispatch({ type: 'removeDyn', id: 'x' })
    })
    rtl.act(() => {
      store.dispatch({ type: 'removeDyn', id: 'y' })
    })

    const afterRemoval = registry.debugStats()
    expect(afterRemoval.signals).toBeLessThan(withDyn.signals)
    expect(registry.debugPaths()).not.toContain('dyn.x.v')
    expect(registry.debugPaths()).not.toContain('dyn.y.v')

    unmount()
  })

  it('does not accumulate across add/remove cycles of the same keys', () => {
    const store = makeStore()
    const { unmount } = rtl.render(
      <Tree store={store} count={1} dynIds={['x']} />,
    )
    const registry = requireRegistry()
    const seen: number[] = []

    for (let cycle = 0; cycle < 5; cycle++) {
      rtl.act(() => {
        store.dispatch({ type: 'addDyn', id: 'x' })
      })
      rtl.act(() => {
        store.dispatch({ type: 'removeDyn', id: 'x' })
      })
      seen.push(registry.debugStats().signals)
    }

    for (const count of seen) {
      expect(count).toBe(seen[0])
    }

    unmount()
  })
})
