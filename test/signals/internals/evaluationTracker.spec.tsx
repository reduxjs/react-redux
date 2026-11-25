import * as rtl from '@testing-library/react'
import React from 'react'
import { createStore } from 'redux'
import { describe, expect, it } from 'vitest'
import { useSignalContext } from '../../../src/signals/context'
import type { PathSignalRegistry } from '../../../src/signals/pathSignalRegistry'
import { SignalProvider } from '../../../src/signals/SignalProvider'
import type { LeafObjectTracker } from '../../../src/signals/trackingProxy'
import { useSignalSelector } from '../../../src/signals/useSignalSelector'

interface State {
  n: number
  x: { y: number; z: { w: number } }
}

function reducer(
  state: State = { n: 0, x: { y: 1, z: { w: 2 } } },
  action: { type: string },
): State {
  return action.type === 'tick' ? { ...state, n: state.n + 1 } : state
}

describe('evaluation tracker lifecycle', () => {
  it('reads through a proxy kept past its evaluation do not record into the finished tracker', () => {
    const store = createStore(reducer)
    let registry: PathSignalRegistry | null = null
    let kept: State['x'] | null = null
    let seen: LeafObjectTracker | undefined

    function CaptureRegistry() {
      registry = useSignalContext<State>().registry
      return null
    }

    function Reader() {
      const n = useSignalSelector((s: State) => {
        kept = s.x
        seen = registry?.evaluation.tracker ?? undefined
        return s.n
      })
      return <div data-testid="n">{n}</div>
    }

    const { getByTestId } = rtl.render(
      <SignalProvider store={store}>
        <CaptureRegistry />
        <Reader />
      </SignalProvider>,
    )

    // Promote the selector past the coarse probe tier so it runs through
    // tracking proxies.
    rtl.act(() => {
      store.dispatch({ type: 'tick' })
    })
    rtl.act(() => {
      store.dispatch({ type: 'tick' })
    })
    expect(getByTestId('n').textContent).toBe('2')

    const tracker = seen
    expect(tracker).toBeDefined()
    const accessed = new Map(tracker!.accessedObjects)
    const traversed = new Set(tracker!.traversedPaths)

    expect(kept!.y).toBe(1)
    expect(kept!.z.w).toBe(2)
    void Object.keys(kept!)

    expect(tracker!.traversedPaths).toEqual(traversed)
    expect(tracker!.accessedObjects).toEqual(accessed)
    expect(tracker!.enumerated.size).toBe(0)
    expect(registry!.evaluation.tracker).toBeNull()
  })
})
