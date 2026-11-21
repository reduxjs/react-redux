/**
 * `index in array` checks through the tracking proxy must re-run when the
 * array shrinks or grows past that index, for keyed arrays (whose element
 * signals live at identity paths, not index paths) as well as unkeyed ones.
 */
import { configureStore, createSlice } from '@reduxjs/toolkit'
import * as rtl from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { SignalProvider, useSignalSelector } from '../../src/signals'

type Item = { id: number; label: string }

const makeItems = (n: number): Item[] =>
  Array.from({ length: n }, (_, i) => ({ id: i + 1, label: `item ${i + 1}` }))

const makeStore = (items: unknown[]) => {
  const slice = createSlice({
    name: 'data',
    initialState: { items, tick: 0 },
    reducers: {
      tick: (state) => {
        state.tick += 1
      },
      truncate: (state, action: { payload: number }) => {
        state.items.length = action.payload
      },
      append: (state, action: { payload: unknown }) => {
        state.items.push(action.payload)
      },
    },
  })
  const store = configureStore({ reducer: { data: slice.reducer } })
  return { store, actions: slice.actions }
}

type RootState = { data: { items: unknown[]; tick: number } }

afterEach(() => {
  rtl.cleanup()
})

function renderPromoted(items: unknown[], selector: (s: RootState) => unknown) {
  const { store, actions } = makeStore(items)
  const seen: { current: unknown } = { current: undefined }
  function Comp() {
    seen.current = useSignalSelector(selector)
    return null
  }
  rtl.render(
    <SignalProvider store={store}>
      <Comp />
    </SignalProvider>,
  )
  // Two dispatches in the selector's segment promote it past the probe tier.
  rtl.act(() => {
    store.dispatch(actions.tick())
  })
  rtl.act(() => {
    store.dispatch(actions.tick())
  })
  return { store, actions, seen }
}

const firstIdAndHasThree = (s: RootState) =>
  `${(s.data.items[0] as Item).id}:${3 in s.data.items}`

describe('index in array', () => {
  it('re-runs when a keyed array shrinks below the index', () => {
    const { store, actions, seen } = renderPromoted(
      makeItems(5),
      firstIdAndHasThree,
    )
    expect(seen.current).toBe('1:true')
    rtl.act(() => {
      store.dispatch(actions.truncate(3))
    })
    expect(seen.current).toBe('1:false')
  })

  it('re-runs when a keyed array grows past the index', () => {
    const { store, actions, seen } = renderPromoted(
      makeItems(3),
      firstIdAndHasThree,
    )
    expect(seen.current).toBe('1:false')
    rtl.act(() => {
      store.dispatch(actions.append({ id: 4, label: 'item 4' }))
    })
    expect(seen.current).toBe('1:true')
  })

  it('re-runs when an unkeyed array shrinks below the index', () => {
    const { store, actions, seen } = renderPromoted(
      [[1], [2], [3], [4], [5]],
      (s) => `${(s.data.items[0] as number[])[0]}:${3 in s.data.items}`,
    )
    expect(seen.current).toBe('1:true')
    rtl.act(() => {
      store.dispatch(actions.truncate(3))
    })
    expect(seen.current).toBe('1:false')
  })
})
